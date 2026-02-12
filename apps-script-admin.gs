/**
 * Admin dashboard extension for the existing task tracker Apps Script.
 * Paste this into your Apps Script project, then:
 * 1) Add ADMIN_DIRECTORY entries.
 * 2) Add the routing lines shown in routeAdminAction_ into doPost/doGet.
 */

const ADMIN_DIRECTORY = {
  // Example:
  // "Pranob Thachanthara": {
  //   code: "ADMIN-PT-9001",
  //   role: "Super Admin",
  //   allowedDepartments: ["All"]
  // }
};

function routeAdminAction_(action, body) {
  if (action === "validateAdminAccess") return handleValidateAdminAccess_(body);
  if (action === "getAdminDashboard") return handleGetAdminDashboard_(body);
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

function handleGetAdminDashboard_(body) {
  initializeTrackerSheets();

  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  const workDate = normalizeDateISO_(String(body.workDate || ""));
  const filterDept = String(body.department || "All").trim() || "All";
  const filterEmployee = String(body.employeeName || "All").trim() || "All";
  const stage = String(body.stage || "All").trim() || "All";

  const employees = getAllEmployees_();
  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  const scopedEmployees = employees.filter(function(e) {
    if (allowedDepartments.length && allowedDepartments.indexOf("All") === -1 && allowedDepartments.indexOf(e.department) === -1) return false;
    if (filterDept !== "All" && e.department !== filterDept) return false;
    if (filterEmployee !== "All" && e.employeeName !== filterEmployee) return false;
    return true;
  });

  const employeeKeySet = {};
  scopedEmployees.forEach(function(e) { employeeKeySet[employeeKey_(e.department, e.employeeName)] = true; });

  const sodRows = readRowsAsObjects_(getSheet_(CONFIG.SHEETS.SOD));
  const eodRows = readRowsAsObjects_(getSheet_(CONFIG.SHEETS.EOD));

  const sodByEmployeeDate = {};
  const eodByEmployeeDate = {};
  const eodTimeline = [];

  sodRows.forEach(function(row) {
    const normalized = normalizeSubmissionRow_(row, "SOD");
    if (!normalized.ok) return;
    const key = employeeKey_(normalized.department, normalized.employeeName);
    if (!employeeKeySet[key]) return;
    const mapKey = key + "|" + normalized.workDate;
    const prev = sodByEmployeeDate[mapKey];
    if (!prev || isLaterSubmission_(normalized, prev)) sodByEmployeeDate[mapKey] = normalized;
  });

  eodRows.forEach(function(row) {
    const normalized = normalizeSubmissionRow_(row, "EOD");
    if (!normalized.ok) return;
    const key = employeeKey_(normalized.department, normalized.employeeName);
    if (!employeeKeySet[key]) return;
    const mapKey = key + "|" + normalized.workDate;
    const prev = eodByEmployeeDate[mapKey];
    if (!prev || isLaterSubmission_(normalized, prev)) eodByEmployeeDate[mapKey] = normalized;
    if (normalized.workDate <= workDate) eodTimeline.push(normalized);
  });

  eodTimeline.sort(function(a, b) {
    if (a.workDate !== b.workDate) return a.workDate < b.workDate ? -1 : 1;
    return String(a.submittedAt) < String(b.submittedAt) ? -1 : 1;
  });

  const carryState = buildCarryState_(eodTimeline);
  const carryRows = buildCarryoverRows_(carryState, workDate, stage);

  const employeeRows = scopedEmployees.map(function(e) {
    const key = employeeKey_(e.department, e.employeeName);
    const sod = sodByEmployeeDate[key + "|" + workDate] || null;
    const eod = eodByEmployeeDate[key + "|" + workDate] || null;
    const carryCount = countCarryByEmployee_(carryRows, e.department, e.employeeName);
    const planned = sod ? Number(sod.taskCount || 0) : 0;
    const updated = eod ? Number(eod.taskCount || 0) : 0;

    const row = {
      employeeName: e.employeeName,
      department: e.department,
      sodStatus: sod ? "Submitted" : "Missing",
      eodStatus: eod ? "Submitted" : (sod ? "Missing" : "N/A"),
      plannedTasks: planned,
      updatedTasks: updated,
      openCarryover: carryCount,
      lastSubmissionAt: latestSubmissionAt_(sod, eod)
    };
    return row;
  }).filter(function(row) {
    if (stage === "SOD") return row.plannedTasks > 0;
    if (stage === "EOD") return row.updatedTasks > 0;
    if (stage === "Carryover") return row.openCarryover > 0;
    return true;
  });

  const deptRows = buildDepartmentSummary_(employeeRows, eodByEmployeeDate, workDate, stage);
  const kpis = buildKpis_(employeeRows, eodByEmployeeDate, workDate, carryRows);

  const departmentOptions = uniqueSorted_(scopedEmployees.map(function(e) { return e.department; }));
  const employeeOptions = uniqueSorted_(scopedEmployees
    .filter(function(e) { return filterDept === "All" || e.department === filterDept; })
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
        workDate: workDate,
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
  if (expectedCode !== String(code)) return { ok: false, message: "Invalid admin code." };
  return { ok: true, record: rec };
}

function normalizeAllowedDepartments_(value) {
  if (!Array.isArray(value) || !value.length) return ["All"];
  return value.map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
}

function normalizeSubmissionRow_(row, stageName) {
  const department = String(row.department || "").trim();
  const employeeName = String(row.employeeName || "").trim();
  const workDate = normalizeDateISO_(String(row.workDate || ""));
  const submittedAt = String(row.submittedAt || "");
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
    stage: stageName,
    taskCount: isFinite(taskCount) ? taskCount : 0,
    totalSpentMinutes: isFinite(totalSpentMinutes) ? totalSpentMinutes : 0,
    payload: payload
  };
}

function isLaterSubmission_(a, b) {
  const at = String(a.submittedAt || "");
  const bt = String(b.submittedAt || "");
  return at > bt;
}

function employeeKey_(department, employeeName) {
  return String(department || "") + "|" + String(employeeName || "");
}

function normalizeDateISO_(input) {
  var v = String(input || "").trim();
  if (!v) return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return v;
  var dt = new Date(v);
  if (isNaN(dt.getTime())) return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), "yyyy-MM-dd");
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
      const comp = Number(u.completionPercent);
      if (!isFinite(comp)) return;
      const k = taskId ? ("id:" + taskId) : ("title:" + title.toLowerCase());
      const prev = state[empKey][k];

      if (comp >= 100) {
        delete state[empKey][k];
        return;
      }

      state[empKey][k] = {
        department: entry.department,
        employeeName: entry.employeeName,
        taskId: taskId,
        title: title,
        completionPercent: Math.round(comp),
        carryStartDate: prev ? prev.carryStartDate : entry.workDate,
        lastUpdatedDate: entry.workDate,
        lastSubmittedAt: entry.submittedAt
      };
    });
  });
  return state;
}

function buildCarryoverRows_(carryState, workDate, stage) {
  if (stage === "SOD" || stage === "EOD") return [];
  const rows = [];
  Object.keys(carryState).forEach(function(empKey) {
    const taskMap = carryState[empKey] || {};
    Object.keys(taskMap).forEach(function(taskKey) {
      const t = taskMap[taskKey];
      const ageDays = daysDiff_(t.carryStartDate, workDate);
      rows.push({
        employeeName: t.employeeName,
        department: t.department,
        title: t.title,
        completionPercent: Number(t.completionPercent || 0),
        ageDays: ageDays < 0 ? 0 : ageDays,
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

function latestSubmissionAt_(sod, eod) {
  const s = sod ? String(sod.submittedAt || "") : "";
  const e = eod ? String(eod.submittedAt || "") : "";
  if (!s && !e) return "";
  return s > e ? s : e;
}

function buildDepartmentSummary_(employeeRows, eodByEmployeeDate, workDate, stage) {
  const byDept = {};

  employeeRows.forEach(function(row) {
    if (!byDept[row.department]) {
      byDept[row.department] = {
        department: row.department,
        employeeCount: 0,
        sodSubmittedCount: 0,
        eodSubmittedCount: 0,
        eodMissingCount: 0,
        carryoverOpenCount: 0,
        _completionSum: 0,
        _completionWeight: 0
      };
    }
    const d = byDept[row.department];
    d.employeeCount += 1;
    if (String(row.sodStatus).toLowerCase() === "submitted") d.sodSubmittedCount += 1;
    if (String(row.eodStatus).toLowerCase() === "submitted") d.eodSubmittedCount += 1;
    if (String(row.eodStatus).toLowerCase() === "missing") d.eodMissingCount += 1;
    d.carryoverOpenCount += Number(row.openCarryover || 0);

    const eodRow = eodByEmployeeDate[employeeKey_(row.department, row.employeeName) + "|" + workDate];
    if (eodRow && eodRow.payload) {
      const updates = ensureArray_(eodRow.payload.updates);
      updates.forEach(function(u) {
        const c = Number(u.completionPercent);
        if (!isFinite(c)) return;
        d._completionSum += c;
        d._completionWeight += 1;
      });
    }
  });

  return Object.keys(byDept).sort().map(function(dept) {
    const d = byDept[dept];
    const avg = d._completionWeight ? (d._completionSum / d._completionWeight) : 0;
    return {
      department: d.department,
      employeeCount: d.employeeCount,
      sodSubmittedCount: d.sodSubmittedCount,
      eodSubmittedCount: d.eodSubmittedCount,
      eodMissingCount: d.eodMissingCount,
      carryoverOpenCount: d.carryoverOpenCount,
      avgCompletionPercent: Math.round(avg * 10) / 10
    };
  }).filter(function(row) {
    if (stage === "SOD") return row.sodSubmittedCount > 0;
    if (stage === "EOD") return row.eodSubmittedCount > 0;
    if (stage === "Carryover") return row.carryoverOpenCount > 0;
    return true;
  });
}

function buildKpis_(employeeRows, eodByEmployeeDate, workDate, carryRows) {
  let plannedTasks = 0;
  let eodSubmittedCount = 0;
  let eodMissingCount = 0;
  let completionSum = 0;
  let completionWeight = 0;
  let totalMinutes = 0;

  employeeRows.forEach(function(row) {
    plannedTasks += Number(row.plannedTasks || 0);
    if (String(row.eodStatus).toLowerCase() === "submitted") eodSubmittedCount += 1;
    if (String(row.eodStatus).toLowerCase() === "missing") eodMissingCount += 1;
    const eod = eodByEmployeeDate[employeeKey_(row.department, row.employeeName) + "|" + workDate];
    if (eod) {
      totalMinutes += Number(eod.totalSpentMinutes || 0);
      const updates = ensureArray_(eod.payload && eod.payload.updates);
      updates.forEach(function(u) {
        const c = Number(u.completionPercent);
        if (!isFinite(c)) return;
        completionSum += c;
        completionWeight += 1;
      });
    }
  });

  return {
    plannedTasks: plannedTasks,
    eodSubmittedCount: eodSubmittedCount,
    eodMissingCount: eodMissingCount,
    incompleteCarryoverCount: Array.isArray(carryRows) ? carryRows.length : 0,
    completionRate: completionWeight ? (completionSum / completionWeight) : 0,
    totalLoggedHours: (totalMinutes / 60)
  };
}

function daysDiff_(fromISO, toISO) {
  const f = new Date(fromISO + "T00:00:00");
  const t = new Date(toISO + "T00:00:00");
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return 0;
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

/**
 * ROUTING PATCH (copy into existing doPost):
 * const adminRoute = routeAdminAction_(action, body);
 * if (adminRoute) return adminRoute;
 *
 * ROUTING PATCH (copy into existing doGet action switch):
 * else if (action === "validateAdminAccess" || action === "getAdminDashboard") out = routeAdminAction_(action, body);
 */
