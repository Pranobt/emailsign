/**
 * Admin dashboard + assignment extension for task tracker Apps Script.
 *
 * Required routing patches in existing doPost/doGet:
 * const adminRoute = routeAdminAction_(action, body);
 * if (adminRoute) return adminRoute;
 *
 * Supported actions:
 * - validateAdminAccess (admin)
 * - getAdminDashboard (admin)
 * - assignTasks (admin)
 * - getAssignments (user identity)
 */

const ADMIN_DIRECTORY = {
  // "Pranob Thachanthara": {
  //   code: "ADMIN-PT-9001",
  //   role: "Super Admin",
  //   allowedDepartments: ["All"]
  // }
};

const ADMIN_CONFIG = {
  ASSIGNMENTS_SHEET: "ASSIGNMENTS",
  ASSIGNMENTS_HEADERS: [
    "assignedAt",
    "workDate",
    "department",
    "employeeName",
    "assignedBy",
    "taskId",
    "title",
    "priority",
    "status",
    "payloadJson"
  ]
};

function routeAdminAction_(action, body) {
  if (action === "validateAdminAccess") return handleValidateAdminAccess_(body);
  if (action === "getAdminDashboard") return handleGetAdminDashboard_(body);
  if (action === "assignTasks") return handleAssignTasks_(body);
  if (action === "getAssignments") return handleGetAssignments_(body);
  return null;
}

function handleValidateAdminAccess_(body) {
  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  return json_({
    ok: true,
    admin: admin,
    role: auth.record.role || "Admin",
    allowedDepartments: normalizeAllowedDepartments_(auth.record.allowedDepartments)
  });
}

function handleAssignTasks_(body) {
  initializeTrackerSheets();
  initializeAssignmentsSheet_();

  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  const workDate = toIsoDate_(body.workDate);
  const department = String(body.department || "").trim();
  const employeeName = String(body.employeeName || "").trim();

  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  if (!department || !employeeName) return json_({ ok: false, message: "department and employeeName are required." });

  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  if (allowedDepartments.indexOf("All") === -1 && allowedDepartments.indexOf(department) === -1) {
    return json_({ ok: false, message: "Not allowed to assign tasks for this department." });
  }

  const userCode = (((USER_DIRECTORY || {})[department]) || {})[employeeName];
  if (!userCode) return json_({ ok: false, message: "Invalid department/employee combination." });

  const tasks = ensureArray_(body.tasks);
  const clean = tasks.map(function(t) {
    return {
      taskId: String(t.taskId || Utilities.getUuid()).trim(),
      title: String(t.title || "").trim(),
      priority: normalizePriority_(t.priority)
    };
  }).filter(function(t) {
    return t.title.length > 0;
  });

  if (!clean.length) return json_({ ok: false, message: "At least one task title is required." });

  const sh = getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET);
  const assignedAt = new Date().toISOString();

  clean.forEach(function(t) {
    const payload = {
      assignedAt: assignedAt,
      workDate: workDate,
      department: department,
      employeeName: employeeName,
      assignedBy: admin,
      taskId: t.taskId,
      title: t.title,
      priority: t.priority,
      status: "Assigned"
    };

    sh.appendRow([
      assignedAt,
      workDate,
      department,
      employeeName,
      admin,
      t.taskId,
      t.title,
      t.priority,
      "Assigned",
      JSON.stringify(payload)
    ]);
  });

  return json_({
    ok: true,
    assignedCount: clean.length,
    workDate: workDate,
    department: department,
    employeeName: employeeName
  });
}

function handleGetAssignments_(body) {
  initializeTrackerSheets();
  initializeAssignmentsSheet_();

  const department = String(body.department || "").trim();
  const employeeName = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);

  if (!isValidUser_(department, employeeName, accessCode)) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });

  const rows = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET));
  const tasks = rows.filter(function(r) {
    const rowWorkDate = toIsoDate_(r.workDate);
    return rowWorkDate === workDate
      && sameText_(r.department, department)
      && sameText_(r.employeeName, employeeName)
      && sameText_(r.status, "Assigned");
  }).map(function(r) {
    return {
      taskId: String(r.taskId || Utilities.getUuid()).trim(),
      title: String(r.title || "").trim(),
      priority: normalizePriority_(r.priority),
      assignedBy: String(r.assignedBy || "").trim(),
      assignedAt: String(r.assignedAt || "").trim(),
      source: "admin-assigned"
    };
  }).filter(function(t) {
    return t.title.length > 0;
  });

  return json_({ ok: true, tasks: tasks, sourceWorkDate: workDate });
}

function handleGetAdminDashboard_(body) {
  initializeTrackerSheets();
  initializeAssignmentsSheet_();

  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  const rangePreset = String(body.rangePreset || "today").trim();
  const anchorDate = toIsoDate_(body.workDate) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const range = getRangeWindow_(rangePreset, anchorDate);

  const filterDept = String(body.department || "All").trim() || "All";
  const filterEmployee = String(body.employeeName || "All").trim() || "All";
  const stage = String(body.stage || "All").trim() || "All";

  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  const allEmployees = getAllEmployees_();
  const scopedEmployees = allEmployees.filter(function(e) {
    if (allowedDepartments.indexOf("All") === -1 && allowedDepartments.indexOf(e.department) === -1) return false;
    if (filterDept !== "All" && e.department !== filterDept) return false;
    if (filterEmployee !== "All" && e.employeeName !== filterEmployee) return false;
    return true;
  });

  const employeeSet = {};
  scopedEmployees.forEach(function(e) { employeeSet[employeeKey_(e.department, e.employeeName)] = true; });

  const sodRows = readRowsAsObjects_(getSheet_(CONFIG.SHEETS.SOD));
  const eodRows = readRowsAsObjects_(getSheet_(CONFIG.SHEETS.EOD));
  const assignRows = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET));

  const sodLatestByDay = {};
  const eodLatestByDay = {};
  const eodTimeline = [];

  sodRows.forEach(function(row) {
    const n = normalizeSubmissionRow_(row);
    if (!n.ok) return;
    const key = employeeKey_(n.department, n.employeeName);
    if (!employeeSet[key]) return;

    if (n.workDate >= range.fromDate && n.workDate <= range.toDate) {
      const dayKey = key + "|" + n.workDate;
      const prev = sodLatestByDay[dayKey];
      if (!prev || isLaterSubmission_(n, prev)) sodLatestByDay[dayKey] = n;
    }
  });

  eodRows.forEach(function(row) {
    const n = normalizeSubmissionRow_(row);
    if (!n.ok) return;
    const key = employeeKey_(n.department, n.employeeName);
    if (!employeeSet[key]) return;

    if (n.workDate >= range.fromDate && n.workDate <= range.toDate) {
      const dayKey = key + "|" + n.workDate;
      const prev = eodLatestByDay[dayKey];
      if (!prev || isLaterSubmission_(n, prev)) eodLatestByDay[dayKey] = n;
    }
    if (n.workDate <= range.toDate) {
      eodTimeline.push(n);
    }
  });

  eodTimeline.sort(function(a, b) {
    if (a.workDate !== b.workDate) return a.workDate < b.workDate ? -1 : 1;
    return String(a.submittedAt) < String(b.submittedAt) ? -1 : 1;
  });

  const carryState = buildCarryState_(eodTimeline);
  const carryRows = buildCarryoverRows_(carryState, range.toDate, stage);

  const assignedByEmp = {};
  assignRows.forEach(function(r) {
    const workDate = toIsoDate_(r.workDate);
    if (!workDate) return;
    if (workDate < range.fromDate || workDate > range.toDate) return;
    if (!sameText_(r.status, "Assigned")) return;

    const dep = String(r.department || "").trim();
    const emp = String(r.employeeName || "").trim();
    const key = employeeKey_(dep, emp);
    if (!employeeSet[key]) return;
    assignedByEmp[key] = Number(assignedByEmp[key] || 0) + 1;
  });

  const employeeRows = scopedEmployees.map(function(e) {
    const key = employeeKey_(e.department, e.employeeName);
    let sodSubmittedDays = 0;
    let eodSubmittedDays = 0;
    let eodMissingDays = 0;
    let plannedTasks = 0;
    let tasksSubmitted = 0;
    let lastSubmissionAt = "";

    range.days.forEach(function(day) {
      const sod = sodLatestByDay[key + "|" + day] || null;
      const eod = eodLatestByDay[key + "|" + day] || null;

      if (sod) {
        sodSubmittedDays += 1;
        plannedTasks += Number(sod.taskCount || 0);
        if (String(sod.submittedAt || "") > lastSubmissionAt) lastSubmissionAt = String(sod.submittedAt || "");
      }

      if (eod) {
        eodSubmittedDays += 1;
        tasksSubmitted += Number(eod.taskCount || 0);
        if (String(eod.submittedAt || "") > lastSubmissionAt) lastSubmissionAt = String(eod.submittedAt || "");
      }

      if (sod && !eod) {
        eodMissingDays += 1;
      }
    });

    const openCarryover = countCarryByEmployee_(carryRows, e.department, e.employeeName);

    return {
      employeeName: e.employeeName,
      department: e.department,
      sodSubmittedDays: sodSubmittedDays,
      eodSubmittedDays: eodSubmittedDays,
      eodMissingDays: eodMissingDays,
      plannedTasks: plannedTasks,
      tasksSubmitted: tasksSubmitted,
      assignedTasks: Number(assignedByEmp[key] || 0),
      openCarryover: openCarryover,
      lastSubmissionAt: lastSubmissionAt
    };
  }).filter(function(row) {
    if (stage === "SOD") return row.sodSubmittedDays > 0;
    if (stage === "EOD") return row.eodSubmittedDays > 0;
    if (stage === "Carryover") return row.openCarryover > 0;
    return true;
  });

  const deptRows = buildDepartmentSummary_(employeeRows);
  const kpis = buildKpis_(employeeRows, eodLatestByDay, range, carryRows);

  const departmentOptions = uniqueSorted_(allEmployees
    .filter(function(e) {
      return allowedDepartments.indexOf("All") > -1 || allowedDepartments.indexOf(e.department) > -1;
    })
    .map(function(e) { return e.department; }));

  const employeeOptions = uniqueSorted_(allEmployees
    .filter(function(e) {
      if (allowedDepartments.indexOf("All") === -1 && allowedDepartments.indexOf(e.department) === -1) return false;
      if (filterDept !== "All" && e.department !== filterDept) return false;
      return true;
    })
    .map(function(e) { return e.employeeName; }));

  return json_({
    ok: true,
    kpis: kpis,
    departmentSummary: deptRows,
    employeeCompliance: employeeRows,
    carryoverAging: carryRows,
    meta: {
      generatedAt: new Date().toISOString(),
      filters: {
        rangePreset: range.preset,
        workDate: anchorDate,
        fromDate: range.fromDate,
        toDate: range.toDate,
        department: filterDept,
        employeeName: filterEmployee,
        stage: stage
      },
      departmentOptions: departmentOptions,
      employeeOptions: employeeOptions
    }
  });
}

function validateAdmin_(admin, code) {
  if (!admin || !code) return { ok: false, message: "Missing admin credentials." };
  const rec = ADMIN_DIRECTORY[admin];
  if (!rec) return { ok: false, message: "Admin not found." };
  const expectedCode = String(rec.code || "");
  if (expectedCode !== String(code || "")) return { ok: false, message: "Invalid admin code." };
  return { ok: true, record: rec };
}

function normalizeAllowedDepartments_(value) {
  if (!Array.isArray(value) || !value.length) return ["All"];
  return value.map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
}

function initializeAssignmentsSheet_() {
  ensureSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET, ADMIN_CONFIG.ASSIGNMENTS_HEADERS);
}

function normalizeSubmissionRow_(row) {
  const department = String(row.department || "").trim();
  const employeeName = String(row.employeeName || "").trim();
  const workDate = toIsoDate_(row.workDate);
  const submittedAt = String(row.submittedAt || "").trim();
  const taskCount = Number(row.taskCount || 0);
  const totalSpentMinutes = Number(row.totalSpentMinutes || 0);

  if (!department || !employeeName || !workDate) return { ok: false };

  var payload = {};
  try {
    payload = JSON.parse(String(row.payloadJson || "{}"));
  } catch (err) {
    payload = {};
  }

  return {
    ok: true,
    department: department,
    employeeName: employeeName,
    workDate: workDate,
    submittedAt: submittedAt,
    taskCount: isFinite(taskCount) ? taskCount : 0,
    totalSpentMinutes: isFinite(totalSpentMinutes) ? totalSpentMinutes : 0,
    payload: payload
  };
}

function getAllEmployees_() {
  const out = [];
  Object.keys(USER_DIRECTORY || {}).forEach(function(dept) {
    const users = USER_DIRECTORY[dept] || {};
    Object.keys(users).forEach(function(name) {
      out.push({ department: dept, employeeName: name });
    });
  });
  return out;
}

function employeeKey_(department, employeeName) {
  return String(department || "") + "|" + String(employeeName || "");
}

function isLaterSubmission_(a, b) {
  const at = String(a.submittedAt || "");
  const bt = String(b.submittedAt || "");
  return at > bt;
}

function getRangeWindow_(preset, anchorDate) {
  const p = String(preset || "today").trim();
  const anchor = parseIsoDate_(anchorDate);
  const a = anchor || new Date();

  const range = { preset: p, fromDate: "", toDate: "", days: [] };
  let from = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  let to = new Date(a.getFullYear(), a.getMonth(), a.getDate());

  if (p === "last7") {
    from.setDate(from.getDate() - 6);
  } else if (p === "current_month") {
    from = new Date(a.getFullYear(), a.getMonth(), 1);
    to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  } else if (p === "last_month") {
    from = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    to = new Date(a.getFullYear(), a.getMonth(), 0);
  } else if (p === "custom_day") {
    // from/to remain anchor date
    range.preset = "custom_day";
  } else {
    range.preset = "today";
  }

  range.fromDate = formatIsoDate_(from);
  range.toDate = formatIsoDate_(to);
  range.days = buildDayRange_(range.fromDate, range.toDate);
  return range;
}

function parseIsoDate_(iso) {
  var s = String(iso || "").trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(dt.getTime()) ? null : dt;
}

function formatIsoDate_(dt) {
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function buildDayRange_(fromISO, toISO) {
  const from = parseIsoDate_(fromISO);
  const to = parseIsoDate_(toISO);
  if (!from || !to || from > to) return [];
  const out = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (d <= to) {
    out.push(formatIsoDate_(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function buildCarryState_(eodTimeline) {
  const state = {};

  eodTimeline.forEach(function(entry) {
    const updates = ensureArray_(entry.payload && entry.payload.updates);
    const empKey = employeeKey_(entry.department, entry.employeeName);
    if (!state[empKey]) state[empKey] = {};

    updates.forEach(function(u) {
      const title = String(u.title || "").trim();
      if (!title) return;

      const taskId = String(u.taskId || "").trim();
      const completion = Number(u.completionPercent);
      if (!isFinite(completion)) return;

      const key = taskId ? ("id:" + taskId) : ("title:" + title.toLowerCase());
      const prev = state[empKey][key];

      if (completion >= 100) {
        delete state[empKey][key];
        return;
      }

      state[empKey][key] = {
        employeeName: entry.employeeName,
        department: entry.department,
        taskId: taskId,
        title: title,
        completionPercent: Math.round(completion),
        carryStartDate: prev ? prev.carryStartDate : entry.workDate,
        lastUpdatedDate: entry.workDate
      };
    });
  });

  return state;
}

function buildCarryoverRows_(carryState, asOfDate, stage) {
  if (stage === "SOD" || stage === "EOD") return [];

  const rows = [];
  Object.keys(carryState).forEach(function(empKey) {
    const tasks = carryState[empKey] || {};
    Object.keys(tasks).forEach(function(k) {
      const t = tasks[k];
      rows.push({
        employeeName: t.employeeName,
        department: t.department,
        title: t.title,
        completionPercent: Number(t.completionPercent || 0),
        ageDays: Math.max(0, daysDiff_(t.carryStartDate, asOfDate)),
        lastUpdatedDate: t.lastUpdatedDate
      });
    });
  });

  rows.sort(function(a, b) {
    if (a.ageDays !== b.ageDays) return b.ageDays - a.ageDays;
    if (a.department !== b.department) return a.department < b.department ? -1 : 1;
    return a.employeeName < b.employeeName ? -1 : 1;
  });
  return rows;
}

function countCarryByEmployee_(carryRows, department, employeeName) {
  return carryRows.filter(function(r) {
    return r.department === department && r.employeeName === employeeName;
  }).length;
}

function buildDepartmentSummary_(employeeRows) {
  const byDept = {};
  employeeRows.forEach(function(r) {
    if (!byDept[r.department]) {
      byDept[r.department] = {
        department: r.department,
        employeeCount: 0,
        sodSubmittedDays: 0,
        eodSubmittedDays: 0,
        eodMissingDays: 0,
        plannedTasks: 0,
        tasksSubmitted: 0,
        assignedTasks: 0,
        carryoverOpenCount: 0
      };
    }
    const d = byDept[r.department];
    d.employeeCount += 1;
    d.sodSubmittedDays += Number(r.sodSubmittedDays || 0);
    d.eodSubmittedDays += Number(r.eodSubmittedDays || 0);
    d.eodMissingDays += Number(r.eodMissingDays || 0);
    d.plannedTasks += Number(r.plannedTasks || 0);
    d.tasksSubmitted += Number(r.tasksSubmitted || 0);
    d.assignedTasks += Number(r.assignedTasks || 0);
    d.carryoverOpenCount += Number(r.openCarryover || 0);
  });

  return Object.keys(byDept).sort().map(function(k) {
    return byDept[k];
  });
}

function buildKpis_(employeeRows, eodLatestByDay, range, carryRows) {
  let plannedTasks = 0;
  let tasksSubmittedCount = 0;
  let eodMissingCount = 0;
  let eodEntries = 0;
  let totalMinutes = 0;
  let completionSum = 0;
  let completionWeight = 0;

  employeeRows.forEach(function(r) {
    plannedTasks += Number(r.plannedTasks || 0);
    tasksSubmittedCount += Number(r.tasksSubmitted || 0);
    if (Number(r.eodMissingDays || 0) > 0) eodMissingCount += 1;
  });

  Object.keys(eodLatestByDay).forEach(function(dayKey) {
    const eod = eodLatestByDay[dayKey];
    if (!eod) return;
    eodEntries += 1;
    totalMinutes += Number(eod.totalSpentMinutes || 0);
    const updates = ensureArray_(eod.payload && eod.payload.updates);
    updates.forEach(function(u) {
      const c = Number(u.completionPercent);
      if (!isFinite(c)) return;
      completionSum += c;
      completionWeight += 1;
    });
  });

  return {
    plannedTasks: plannedTasks,
    tasksSubmittedCount: tasksSubmittedCount,
    eodSubmittedCount: eodEntries,
    eodMissingCount: eodMissingCount,
    incompleteCarryoverCount: Array.isArray(carryRows) ? carryRows.length : 0,
    completionRate: completionWeight ? (completionSum / completionWeight) : 0,
    totalLoggedHours: (totalMinutes / 60),
    periodDays: (range.days || []).length
  };
}

function daysDiff_(fromISO, toISO) {
  const f = parseIsoDate_(fromISO);
  const t = parseIsoDate_(toISO);
  if (!f || !t) return 0;
  return Math.floor((t.getTime() - f.getTime()) / 86400000);
}

function uniqueSorted_(arr) {
  const map = {};
  (arr || []).forEach(function(v) {
    const key = String(v || "").trim();
    if (key) map[key] = true;
  });
  return Object.keys(map).sort();
}
