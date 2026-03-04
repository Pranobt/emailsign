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
 * - getRecurringTasks (user identity)
 * - syncRecurringTasks (user identity)
 * - completeRecurringTasks (user identity)
 */


const ADMIN_DIRECTORY = {
  "Pranob Thachanthara": {
    code: "ADMIN-PT-9001",
    role: "Super Admin",
    allowedDepartments: ["All"]
  },
  "Nehal Mota": {
    code: "ADMIN-NM-3136",
    role: "Super Admin",
    allowedDepartments: ["All"]
  },
  "Kainaz Tata": {
    code: "ADMIN-KT-2401",
    role: "Admin",
    allowedDepartments: ["Human Resources", "HR"]
  },
  "Neha Sanghrajka": {
    code: "ADMIN-NS-4471",
    role: "Super Admin",
    allowedDepartments: ["All"]
  },
  "Pravin Mayekar": {
    code: "ADMIN-PM-2749",
    role: "Admin",
    allowedDepartments: ["Operations"]
  },
  "Naveen Singh": {
    code: "ADMIN-NS-1842",
    role: "Admin",
    allowedDepartments: ["Information Technology"]
  }
};

const ADMIN_CONFIG = {
  ASSIGNMENTS_SHEET: "ASSIGNMENTS",
  ADMIN_DYNAMIC_SHEET: "ADMIN_DIRECTORY_DYNAMIC",
  RECURRING_SHEET: "RECURRING_TASKS",
  PLANNER_TASKS_SHEET: "PLANNER_TASKS",
  PLANNER_CONSUMED_SHEET: "PLANNER_CONSUMED_TITLES",
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
  ],
  RECURRING_HEADERS: [
    "changedAt",
    "department",
    "employeeName",
    "taskId",
    "title",
    "priority",
    "frequency",
    "startDate",
    "recurrenceWeekday",
    "recurrenceDayOfMonth",
    "status",
    "payloadJson"
  ],
  PLANNER_TASKS_HEADERS: [
    "changedAt",
    "department",
    "employeeName",
    "taskId",
    "title",
    "titleKey",
    "priority",
    "plannedHours",
    "plannedMinutes",
    "status",
    "workDateRef",
    "payloadJson"
  ],
  PLANNER_CONSUMED_HEADERS: [
    "changedAt",
    "department",
    "employeeName",
    "titleKey",
    "sourceTaskId",
    "consumedOn",
    "payloadJson"
  ],
  ADMIN_DYNAMIC_HEADERS: [
    "changedAt",
    "adminName",
    "code",
    "role",
    "allowedDepartmentsJson",
    "changedBy",
    "source"
  ],
  SUPABASE_ADMIN_ENABLED_PROPERTY: "SUPABASE_ADMIN_ENABLED",
  SUPABASE_ADMIN_EVENTS_TABLE_PROPERTY: "SUPABASE_ADMIN_EVENTS_TABLE",
  SUPABASE_ADMIN_EVENTS_TABLE_DEFAULT: "task_admin_events"
};

function routeAdminAction_(action, body) {
  if (action === "validateAdminAccess") return handleValidateAdminAccess_(body);
  if (action === "getUserDirectory") return handleGetUserDirectory_(body);
  if (action === "createUser") return handleCreateUser_(body);
  if (action === "getAdminDashboard") return handleGetAdminDashboard_(body);
  if (action === "assignTasks") return handleAssignTasks_(body);
  if (action === "getAssignments") return handleGetAssignments_(body);
  if (action === "getRecurringTasks") return handleGetRecurringTasks_(body);
  if (action === "getSubmittedDayDetails") return handleGetSubmittedDayDetails_(body);
  if (action === "syncRecurringTasks") return handleSyncRecurringTasks_(body);
  if (action === "completeRecurringTasks") return handleCompleteRecurringTasks_(body);
  if (action === "getPlannerTasks") return handleGetPlannerTasks_(body);
  if (action === "addPlannerTasks") return handleAddPlannerTasks_(body);
  if (action === "movePlannerToSOD") return handleMovePlannerToSOD_(body);
  if (action === "returnPlannerTasks") return handleReturnPlannerTasks_(body);
  if (action === "markPlannerConsumed") return handleMarkPlannerConsumed_(body);
  if (action === "updatePlannerTask") return handleUpdatePlannerTask_(body);
  if (action === "deletePlannerTask") return handleDeletePlannerTask_(body);
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

function handleGetUserDirectory_(body) {
  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  const directory = getUserDirectoryMap_();
  const emailDirectory = getUserEmailMap_();
  const out = {};
  const outEmails = {};
  Object.keys(directory || {}).forEach(function(dept) {
    if (!isDepartmentAllowedForAdmin_(allowedDepartments, dept)) return;
    const users = directory[dept] || {};
    const names = Object.keys(users).sort();
    if (!names.length) return;
    out[dept] = {};
    outEmails[dept] = {};
    names.forEach(function(name) {
      out[dept][name] = String(users[name] || "");
      outEmails[dept][name] = String((emailDirectory[dept] && emailDirectory[dept][name]) || defaultEmailFromName_(name) || "");
    });
  });

  return json_({ ok: true, directory: out, emailDirectory: outEmails });
}

function handleCreateUser_(body) {
  initializeUserDirectorySheet_();

  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  const requestedDepartment = String(body.department || "").trim();
  const requestedEmployeeName = String(body.employeeName || body.name || "").trim();
  const providedAccessCode = String(body.accessCode || body.userCode || "").trim();
  const providedEmail = String(body.email || "").trim();
  const requestedRole = String(body.role || "User").trim();
  const baseTaskUrl = String(body.taskPageUrl || "").trim();
  const baseAdminUrl = String(body.adminPageUrl || "").trim();
  if (!requestedDepartment || !requestedEmployeeName) {
    return json_({ ok: false, message: "department and employeeName are required." });
  }

  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  if (!isDepartmentAllowedForAdmin_(allowedDepartments, requestedDepartment)) {
    return json_({ ok: false, message: "Not allowed to create users for this department." });
  }

  const directory = getUserDirectoryMap_();
  const department = resolveDepartmentKey_(directory, requestedDepartment) || requestedDepartment;
  const users = directory[department] || {};
  const existingName = Object.keys(users).find(function(n) {
    return sameTextLocal_(n, requestedEmployeeName);
  }) || "";
  const employeeName = existingName || requestedEmployeeName;
  const role = normalizeCreatedRole_(requestedRole);
  const isAdminRole = role === "Admin" || role === "Super Admin";
  const existingUserCode = !isAdminRole && existingName ? String(users[existingName] || "").trim() : "";
  const accessCode = isAdminRole
    ? (providedAccessCode || generateAdminAccessCode_(employeeName, getAdminDirectory_()))
    : (existingUserCode || generateAccessCode_(department, employeeName, directory));
  const email = providedEmail || defaultEmailFromName_(employeeName);

  const changedAt = new Date().toISOString();
  if (isAdminRole) {
    initializeDynamicAdminSheet_();
    var adminAllowed = role === "Super Admin" ? ["All"] : [department];
    getSheet_(ADMIN_CONFIG.ADMIN_DYNAMIC_SHEET).appendRow([
      changedAt,
      employeeName,
      accessCode,
      role,
      JSON.stringify(adminAllowed),
      admin,
      "admin-create-user"
    ]);
  } else {
    const sh = getSheet_(CONFIG.SHEETS.USER_DIRECTORY);
    sh.appendRow([
      changedAt,
      department,
      employeeName,
      accessCode,
      email,
      admin,
      "admin-create-user"
    ]);
  }

  var link = "";
  if (!isAdminRole && baseTaskUrl) {
    var query = [
      "dept=" + encodeURIComponent(department),
      "name=" + encodeURIComponent(employeeName),
      "code=" + encodeURIComponent(accessCode)
    ].join("&");
    link = baseTaskUrl + (baseTaskUrl.indexOf("?") > -1 ? "&" : "?") + query;
  } else if (isAdminRole && baseAdminUrl) {
    var adminQuery = [
      "admin=" + encodeURIComponent(employeeName),
      "code=" + encodeURIComponent(accessCode)
    ].join("&");
    link = baseAdminUrl + (baseAdminUrl.indexOf("?") > -1 ? "&" : "?") + adminQuery;
  }

  return json_({
    ok: true,
    role: role,
    department: department,
    employeeName: employeeName,
    accessCode: accessCode,
    email: email,
    link: link
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
  const requestedDepartment = String(body.department || "").trim();
  const requestedEmployeeName = String(body.employeeName || "").trim();

  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  if (!requestedDepartment || !requestedEmployeeName) {
    return json_({ ok: false, message: "department and employeeName are required." });
  }

  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  if (!isDepartmentAllowedForAdmin_(allowedDepartments, requestedDepartment)) {
    return json_({ ok: false, message: "Not allowed to assign tasks for this department." });
  }

  const resolvedAssignee = resolveUserForAssignment_(requestedDepartment, requestedEmployeeName);
  if (!resolvedAssignee.ok) return json_({ ok: false, message: "Invalid department/employee combination." });
  const department = resolvedAssignee.department;
  const employeeName = resolvedAssignee.employeeName;

  const tasks = ensureArray_(body.tasks);
  const defaultDeadlineDays = normalizeAssignmentDeadlineDays_(body.deadlineDays);
  const clean = tasks.map(function(t) {
    const providedDeadlineDate = toIsoDate_(t && t.deadlineDate);
    const fallbackDeadlineDays = normalizeAssignmentDeadlineDays_(
      t && t.deadlineDays != null ? t.deadlineDays : defaultDeadlineDays
    );
    const deadlineDate = providedDeadlineDate || addDaysToIsoDate_(workDate, fallbackDeadlineDays);
    const derivedDiff = daysDiff_(workDate, deadlineDate);
    const deadlineDays = derivedDiff >= 0 ? derivedDiff : fallbackDeadlineDays;
    return {
      taskId: String(t.taskId || Utilities.getUuid()).trim(),
      title: String(t.title || "").trim(),
      priority: normalizePriority_(t.priority),
      deadlineDays: deadlineDays,
      deadlineDate: deadlineDate
    };
  }).filter(function(t) {
    return t.title.length > 0;
  });

  if (!clean.length) return json_({ ok: false, message: "At least one task title is required." });

  const duplicateAssign = withAdminAssignLock_(function() {
    return isRecentDuplicateAssignmentRequest_({
      admin: admin,
      department: department,
      employeeName: employeeName,
      workDate: workDate,
      tasks: clean
    });
  });
  if (duplicateAssign) {
    return json_({
      ok: true,
      duplicateIgnored: true,
      assignedCount: 0,
      workDate: workDate,
      department: department,
      employeeName: employeeName
    });
  }

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
      deadlineDays: t.deadlineDays,
      deadlineDate: t.deadlineDate,
      assignedToEmail: getCliqEmailFromName_(employeeName, department),
      fromEmail: getCliqEmailFromName_(admin),
      status: "Assigned"
    };
    const row = {
      assignedAt: assignedAt,
      workDate: workDate,
      department: department,
      employeeName: employeeName,
      assignedBy: admin,
      taskId: t.taskId,
      title: t.title,
      priority: t.priority,
      status: "Assigned",
      payloadJson: JSON.stringify(payload)
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
      row.payloadJson
    ]);
    mirrorAdminEventToSupabaseSafe_("assignment", row);
  });

  return json_({
    ok: true,
    assignedCount: clean.length,
    workDate: workDate,
    department: department,
    employeeName: employeeName
  });
}

function withAdminAssignLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function isRecentDuplicateAssignmentRequest_(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const key = [
    "assign",
    String(p.admin || "").trim().toLowerCase(),
    String(p.department || "").trim().toLowerCase(),
    String(p.employeeName || "").trim().toLowerCase(),
    String(p.workDate || "").trim()
  ].join("|");

  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(key);
  const now = Date.now();
  const windowMs = 3 * 60 * 1000;
  const incomingFingerprint = buildAssignmentRequestFingerprint_(p);

  if (raw) {
    try {
      const prev = JSON.parse(raw);
      const prevTs = Number(prev && prev.ts || 0);
      const prevFingerprint = String(prev && prev.fingerprint || "");
      if (prevTs > 0 && (now - prevTs) <= windowMs && prevFingerprint === incomingFingerprint) {
        return true;
      }
    } catch (err) {
      // Ignore malformed stored state and overwrite below.
    }
  }

  props.setProperty(key, JSON.stringify({
    ts: now,
    fingerprint: incomingFingerprint
  }));
  return false;
}

function buildAssignmentRequestFingerprint_(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const cleanTasks = ensureArray_(p.tasks).map(function(t) {
    return {
      taskId: String(t && t.taskId || "").trim(),
      title: String(t && t.title || "").trim(),
      priority: normalizePriority_(t && t.priority),
      deadlineDays: Number(t && t.deadlineDays || 0),
      deadlineDate: toIsoDate_(t && t.deadlineDate)
    };
  }).filter(function(t) {
    return t.title.length > 0;
  }).sort(function(a, b) {
    const ak = [a.taskId, a.title, a.priority, a.deadlineDays, a.deadlineDate].join("|");
    const bk = [b.taskId, b.title, b.priority, b.deadlineDays, b.deadlineDate].join("|");
    return ak < bk ? -1 : (ak > bk ? 1 : 0);
  });

  return JSON.stringify({
    admin: String(p.admin || "").trim(),
    department: String(p.department || "").trim(),
    employeeName: String(p.employeeName || "").trim(),
    workDate: String(p.workDate || "").trim(),
    tasks: cleanTasks
  });
}

function handleGetAssignments_(body) {
  initializeTrackerSheets();
  initializeAssignmentsSheet_();

  const departmentInput = String(body.department || "").trim();
  const employeeNameInput = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);

  const identity = resolveUserIdentity_(departmentInput, employeeNameInput, accessCode);
  if (!identity.ok) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  const department = identity.department;
  const employeeName = identity.employeeName;

  const assignRows = getAssignmentRowsForUser_(department, employeeName, workDate);
  const eodRows = getSubmissionRowsForUserUpToDate_("EOD", department, employeeName, workDate);

  const openByKey = {};
  const latestProgressByKey = {};
  const isLaterEntry_ = function(a, b) {
    if (!b) return true;
    if (a.workDate !== b.workDate) return a.workDate > b.workDate;
    return String(a.submittedAt || "") > String(b.submittedAt || "");
  };
  assignRows.forEach(function(r) {
    const rowWorkDate = toIsoDate_(r.workDate);
    if (!rowWorkDate || rowWorkDate > workDate) return;
    if (!sameText_(r.department, department)) return;
    if (!sameText_(r.employeeName, employeeName)) return;
    if (!sameText_(r.status, "Assigned")) return;

    const taskId = String(r.taskId || "").trim();
    const title = String(r.title || "").trim();
    if (!title) return;
    const payload = parseJsonObject_(r.payloadJson);

    const key = taskId ? ("id:" + taskId) : ("title:" + title.toLowerCase());
    const prev = openByKey[key];
    const prevWorkDate = prev ? String(prev.workDate || "") : "";
    const prevAssignedAt = prev ? String(prev.assignedAt || "") : "";
    const assignedAt = String(r.assignedAt || "").trim();

    if (!prev || rowWorkDate > prevWorkDate || (rowWorkDate === prevWorkDate && assignedAt > prevAssignedAt)) {
      openByKey[key] = {
        taskId: taskId || Utilities.getUuid(),
        title: title,
        priority: normalizePriority_(r.priority),
        assignedBy: firstNameOnly_(r.assignedBy),
        assignedAt: assignedAt,
        deadlineDays: Number(
          payload.deadlineDays != null
            ? payload.deadlineDays
            : r.deadlineDays
        ) || 1,
        deadlineDate: String(
          payload.deadlineDate != null
            ? payload.deadlineDate
            : (r.deadlineDate || "")
        ).trim(),
        workDate: rowWorkDate
      };
    }
  });

  eodRows.forEach(function(row) {
    const n = normalizeSubmissionRow_(row);
    if (!n.ok) return;
    if (n.workDate > workDate) return;
    if (!sameText_(n.department, department)) return;
    if (!sameText_(n.employeeName, employeeName)) return;

    const updates = ensureArray_(n.payload && n.payload.updates);
    updates.forEach(function(u) {
      const completion = Number(u.completionPercent);
      if (!isFinite(completion)) return;

      const taskId = String(u.taskId || "").trim();
      const title = String(u.title || "").trim();
      if (!taskId && !title) return;

      const idKey = taskId ? ("id:" + taskId) : "";
      const titleKey = title ? ("title:" + title.toLowerCase()) : "";
      if (completion >= 100) {
        if (idKey && openByKey[idKey]) delete openByKey[idKey];
        if (titleKey && openByKey[titleKey]) delete openByKey[titleKey];
        return;
      }

      const entry = {
        workDate: n.workDate,
        submittedAt: n.submittedAt,
        completion: completion,
        note: String(u.note || "").trim()
      };
      if (idKey) {
        const prevById = latestProgressByKey[idKey];
        if (isLaterEntry_(entry, prevById)) latestProgressByKey[idKey] = entry;
      }
      if (titleKey) {
        const prevByTitle = latestProgressByKey[titleKey];
        if (isLaterEntry_(entry, prevByTitle)) latestProgressByKey[titleKey] = entry;
      }
    });
  });

  const tasks = Object.keys(openByKey).map(function(k) {
    const t = openByKey[k];
    const idKey = t.taskId ? ("id:" + String(t.taskId).trim()) : "";
    const titleKey = t.title ? ("title:" + String(t.title).trim().toLowerCase()) : "";
    const progress = (idKey && latestProgressByKey[idKey]) ? latestProgressByKey[idKey] : (titleKey ? latestProgressByKey[titleKey] : null);
    return {
      taskId: String(t.taskId || Utilities.getUuid()).trim(),
      title: String(t.title || "").trim(),
      priority: normalizePriority_(t.priority),
      assignedBy: firstNameOnly_(t.assignedBy),
      assignedAt: String(t.assignedAt || "").trim(),
      deadlineDays: Number(t.deadlineDays || 1) || 1,
      deadlineDate: String(t.deadlineDate || "").trim(),
      lastCompletion: progress ? Number(progress.completion || 0) : null,
      lastNote: progress ? String(progress.note || "").trim() : "",
      source: "admin-assigned"
    };
  }).filter(function(t) {
    return t.title.length > 0;
  });

  return json_({ ok: true, tasks: tasks, sourceWorkDate: workDate });
}

function handleGetRecurringTasks_(body) {
  initializeTrackerSheets();
  initializeRecurringSheet_();

  const departmentInput = String(body.department || "").trim();
  const employeeNameInput = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);

  const identity = resolveUserIdentity_(departmentInput, employeeNameInput, accessCode);
  if (!identity.ok) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  const department = identity.department;
  const employeeName = identity.employeeName;

  const recurringRows = getRecurringRowsForUser_(department, employeeName);
  const eodRows = getSubmissionRowsForUserUpToDate_("EOD", department, employeeName, workDate);
  const activeByKey = {};
  const latestProgressByKey = {};

  recurringRows.forEach(function(r) {
    if (!sameText_(r.department, department)) return;
    if (!sameText_(r.employeeName, employeeName)) return;

    let payload = {};
    try {
      payload = JSON.parse(String(r.payloadJson || "{}"));
    } catch (err) {
      payload = {};
    }

    const status = String(r.status || payload.status || "").trim() || "Active";
    const changedAt = String(r.changedAt || payload.changedAt || "").trim();
    const title = String(r.title || payload.title || "").trim();
    const taskId = String(r.taskId || payload.taskId || "").trim();
    if (!title && !taskId) return;

    const key = taskId ? ("id:" + taskId) : ("title:" + title.toLowerCase());
    const prev = activeByKey[key];
    const prevChangedAt = prev ? String(prev.changedAt || "") : "";
    if (prev && changedAt && prevChangedAt && changedAt <= prevChangedAt) return;

    if (sameText_(status, "Inactive")) {
      activeByKey[key] = { removed: true, changedAt: changedAt };
      return;
    }

    const frequency = normalizeRecurringFrequency_(r.frequency || payload.frequency);
    if (!frequency) return;
    const startDate = toIsoDate_(r.startDate || payload.startDate) || workDate;
    const recurrenceWeekday = resolveRecurringWeekday_(frequency, r.recurrenceWeekday, payload.recurrenceWeekday, startDate);
    const recurrenceDayOfMonth = resolveRecurringDayOfMonth_(frequency, r.recurrenceDayOfMonth, payload.recurrenceDayOfMonth, startDate);

      activeByKey[key] = {
        removed: false,
        changedAt: changedAt,
        taskId: taskId || Utilities.getUuid(),
        title: title,
        priority: normalizePriority_(r.priority || payload.priority),
        frequency: frequency,
        startDate: startDate,
        recurrenceWeekday: recurrenceWeekday,
        recurrenceDayOfMonth: recurrenceDayOfMonth,
        plannedHours: Number(payload.plannedHours || 0),
        plannedMinutes: Number(payload.plannedMinutes || 0)
      };
    });

  eodRows.forEach(function(row) {
    const n = normalizeSubmissionRow_(row);
    if (!n.ok) return;
    if (n.workDate > workDate) return;
    if (!sameText_(n.department, department)) return;
    if (!sameText_(n.employeeName, employeeName)) return;

    const updates = ensureArray_(n.payload && n.payload.updates);
    updates.forEach(function(u) {
      const completion = Number(u.completionPercent);
      if (!isFinite(completion)) return;
      const taskId = String(u.taskId || "").trim();
      const title = String(u.title || "").trim();
      if (!taskId && !title) return;

      const entry = {
        workDate: n.workDate,
        submittedAt: n.submittedAt,
        completion: completion,
        note: String(u.note || "").trim()
      };
      const idKey = taskId ? ("id:" + taskId) : "";
      const titleKey = title ? ("title:" + title.toLowerCase()) : "";

      if (idKey) {
        const prevById = latestProgressByKey[idKey];
        if (!prevById || isLaterRecurringEntry_(entry, prevById)) latestProgressByKey[idKey] = entry;
      }
      if (titleKey) {
        const prevByTitle = latestProgressByKey[titleKey];
        if (!prevByTitle || isLaterRecurringEntry_(entry, prevByTitle)) latestProgressByKey[titleKey] = entry;
      }
    });
  });

  const tasks = Object.keys(activeByKey).map(function(k) {
    const t = activeByKey[k];
    if (!t || t.removed) return null;
    if (!isRecurringDueOnDate_(t.frequency, t.startDate, workDate, t.recurrenceWeekday, t.recurrenceDayOfMonth)) return null;
    const idKey = t.taskId ? ("id:" + String(t.taskId).trim()) : "";
    const titleKey = t.title ? ("title:" + String(t.title).trim().toLowerCase()) : "";
    const progress = (idKey && latestProgressByKey[idKey]) ? latestProgressByKey[idKey] : (titleKey ? latestProgressByKey[titleKey] : null);
    return {
      taskId: String(t.taskId || Utilities.getUuid()).trim(),
      title: String(t.title || "").trim(),
      priority: normalizePriority_(t.priority),
      frequency: t.frequency,
      startDate: t.startDate,
      recurrenceWeekday: t.recurrenceWeekday,
      recurrenceDayOfMonth: t.recurrenceDayOfMonth,
      plannedHours: Number(t.plannedHours || 0),
      plannedMinutes: Number(t.plannedMinutes || 0),
      source: "recurring",
      lastCompletion: progress ? Number(progress.completion || 0) : null,
      lastNote: progress ? String(progress.note || "").trim() : ""
    };
  }).filter(function(t) {
    return t && t.title.length > 0;
  });

  return json_({ ok: true, tasks: tasks, sourceWorkDate: workDate });
}

function handleGetSubmittedDayDetails_(body) {
  initializeTrackerSheets();

  const departmentInput = String(body.department || "").trim();
  const employeeNameInput = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);

  const identity = resolveUserIdentity_(departmentInput, employeeNameInput, accessCode);
  if (!identity.ok) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  const department = identity.department;
  const employeeName = identity.employeeName;

  const latestSod = findLatestSubmissionForUserDate_("SOD", department, employeeName, workDate);
  const latestEod = findLatestSubmissionForUserDate_("EOD", department, employeeName, workDate);

  const sodPayload = latestSod && latestSod.payload ? latestSod.payload : {};
  const eodPayload = latestEod && latestEod.payload ? latestEod.payload : {};

  const sodRawTasks = ensureArray_(sodPayload.tasks).length
    ? ensureArray_(sodPayload.tasks)
    : ensureArray_(sodPayload.updates);

  const eodRawUpdates = ensureArray_(eodPayload.updates).length
    ? ensureArray_(eodPayload.updates)
    : (ensureArray_(eodPayload.tasks).length ? ensureArray_(eodPayload.tasks) : ensureArray_(eodPayload.completedTasks));

  const sodTasks = sodRawTasks
    .map(function(t) {
      return {
        taskId: String(t.taskId || t.id || "").trim(),
        title: String(t.title || t.task || t.name || "").trim(),
        priority: normalizePriority_(t.priority),
        frequency: normalizeRecurringFrequency_(t.frequency),
        recurrenceWeekday: normalizeRecurringWeekday_(t.recurrenceWeekday),
        recurrenceDayOfMonth: normalizeRecurringDayOfMonth_(t.recurrenceDayOfMonth),
        plannedHours: Number(t.plannedHours || 0),
        plannedMinutes: Number(t.plannedMinutes || 0)
      };
    })
    .filter(function(t) {
      return t.title.length > 0;
    });

  const eodUpdates = eodRawUpdates
    .map(function(u) {
      return {
        taskId: String(u.taskId || u.id || "").trim(),
        title: String(u.title || u.task || u.name || "").trim(),
        priority: normalizePriority_(u.priority),
        completionPercent: Number(
          (u.completionPercent != null ? u.completionPercent : (u.completion != null ? u.completion : u.progress))
          || 0
        ),
        spentHours: Number((u.spentHours != null ? u.spentHours : u.hours) || 0),
        spentMinutes: Number((u.spentMinutes != null ? u.spentMinutes : u.minutes) || 0),
        note: String(u.note || u.comment || "").trim(),
        isExtra: Boolean(u.isExtra || u.extra)
      };
    })
    .filter(function(u) {
      return u.title.length > 0 || u.taskId.length > 0;
    });

  return json_({
    ok: true,
    workDate: workDate,
    hasSod: !!latestSod,
    hasEod: !!latestEod,
    sodTasks: sodTasks,
    eodUpdates: eodUpdates
  });
}

function findLatestSubmissionForUserDate_(stage, department, employeeName, workDate) {
  const targetStage = String(stage || "").toUpperCase() === "EOD" ? "EOD" : "SOD";
  let latest = null;

  if (isAdminEventsSupabaseEnabled_() && typeof fetchSubmissionRowsFromSupabase_ === "function") {
    try {
      const rows = fetchSubmissionRowsFromSupabase_(targetStage, department, employeeName, { workDateEq: workDate, limit: 50 });
      rows.forEach(function(row) {
        const n = normalizeSubmissionRow_(row);
        if (!n.ok) return;
        if (n.workDate !== workDate) return;
        if (!latest || isLaterSubmission_(n, latest)) latest = n;
      });
      if (latest) return latest;
    } catch (err) {
      // Fall back to Sheets if Supabase read fails.
    }
  }

  const sheet = getSheet_(targetStage === "EOD" ? CONFIG.SHEETS.EOD : CONFIG.SHEETS.SOD);
  const rows = readRowsAsObjects_(sheet);
  rows.forEach(function(row) {
    const n = normalizeSubmissionRow_(row);
    if (!n.ok) return;
    if (!sameText_(n.department, department)) return;
    if (!sameText_(n.employeeName, employeeName)) return;
    if (n.workDate !== workDate) return;
    if (!latest || isLaterSubmission_(n, latest)) latest = n;
  });
  return latest;
}

function handleSyncRecurringTasks_(body) {
  initializeTrackerSheets();
  initializeRecurringSheet_();

  const departmentInput = String(body.department || "").trim();
  const employeeNameInput = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);
  const tasks = ensureArray_(body.tasks);

  const identity = resolveUserIdentity_(departmentInput, employeeNameInput, accessCode);
  if (!identity.ok) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  const department = identity.department;
  const employeeName = identity.employeeName;

  const sh = getSheet_(ADMIN_CONFIG.RECURRING_SHEET);
  const changedAt = new Date().toISOString();
  let upsertedCount = 0;

  tasks.forEach(function(t) {
    const title = String(t.title || "").trim();
    const frequency = normalizeRecurringFrequency_(t.frequency);
    if (!title || !frequency) return;

    const startDate = toIsoDate_(t.startDate) || workDate;
    const recurrenceWeekday = resolveRecurringWeekday_(frequency, t.recurrenceWeekday, null, startDate);
    const recurrenceDayOfMonth = resolveRecurringDayOfMonth_(frequency, t.recurrenceDayOfMonth, null, startDate);
    const taskId = String(t.taskId || Utilities.getUuid()).trim();
    const row = {
      changedAt: changedAt,
      department: department,
      employeeName: employeeName,
      taskId: taskId,
      title: title,
      priority: normalizePriority_(t.priority),
      frequency: frequency,
      startDate: startDate,
      recurrenceWeekday: recurrenceWeekday,
      recurrenceDayOfMonth: recurrenceDayOfMonth,
      status: "Active",
      payloadJson: JSON.stringify({
        taskId: taskId,
        title: title,
        priority: normalizePriority_(t.priority),
        frequency: frequency,
        startDate: startDate,
        recurrenceWeekday: recurrenceWeekday,
        recurrenceDayOfMonth: recurrenceDayOfMonth,
        plannedHours: Number(t.plannedHours || 0),
        plannedMinutes: Number(t.plannedMinutes || 0),
        changedAt: changedAt
      })
    };
    sh.appendRow([
      row.changedAt,
      row.department,
      row.employeeName,
      row.taskId,
      row.title,
      row.priority,
      row.frequency,
      row.startDate,
      row.recurrenceWeekday,
      row.recurrenceDayOfMonth,
      row.status,
      row.payloadJson
    ]);
    mirrorAdminEventToSupabaseSafe_("recurring", row);
    upsertedCount += 1;
  });

  return json_({ ok: true, upsertedCount: upsertedCount, sourceWorkDate: workDate });
}

function handleCompleteRecurringTasks_(body) {
  initializeTrackerSheets();
  initializeRecurringSheet_();

  const departmentInput = String(body.department || "").trim();
  const employeeNameInput = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);
  const taskIds = ensureArray_(body.taskIds).map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
  const titles = ensureArray_(body.titles).map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });

  const identity = resolveUserIdentity_(departmentInput, employeeNameInput, accessCode);
  if (!identity.ok) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });
  const department = identity.department;
  const employeeName = identity.employeeName;

  if (!taskIds.length && !titles.length) {
    return json_({ ok: true, deactivatedCount: 0, sourceWorkDate: workDate });
  }

  const sh = getSheet_(ADMIN_CONFIG.RECURRING_SHEET);
  const changedAt = new Date().toISOString();
  let deactivatedCount = 0;

  taskIds.forEach(function(taskId) {
    const row = {
      changedAt: changedAt,
      department: department,
      employeeName: employeeName,
      taskId: taskId,
      title: "",
      priority: "Medium",
      frequency: "",
      startDate: workDate,
      recurrenceWeekday: "",
      recurrenceDayOfMonth: "",
      status: "Inactive",
      payloadJson: JSON.stringify({ taskId: taskId, status: "Inactive", endedOn: workDate, changedAt: changedAt })
    };
    sh.appendRow([
      changedAt,
      department,
      employeeName,
      taskId,
      "",
      "Medium",
      "",
      workDate,
      "",
      "",
      "Inactive",
      row.payloadJson
    ]);
    mirrorAdminEventToSupabaseSafe_("recurring", row);
    deactivatedCount += 1;
  });

  titles.forEach(function(title) {
    const row = {
      changedAt: changedAt,
      department: department,
      employeeName: employeeName,
      taskId: "",
      title: title,
      priority: "Medium",
      frequency: "",
      startDate: workDate,
      recurrenceWeekday: "",
      recurrenceDayOfMonth: "",
      status: "Inactive",
      payloadJson: JSON.stringify({ title: title, status: "Inactive", endedOn: workDate, changedAt: changedAt })
    };
    sh.appendRow([
      changedAt,
      department,
      employeeName,
      "",
      title,
      "Medium",
      "",
      workDate,
      "",
      "",
      "Inactive",
      row.payloadJson
    ]);
    mirrorAdminEventToSupabaseSafe_("recurring", row);
    deactivatedCount += 1;
  });

  return json_({ ok: true, deactivatedCount: deactivatedCount, sourceWorkDate: workDate });
}

function handleGetPlannerTasks_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });

  const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
  const completedByKey = getLatestEodCompletionByTaskKeyForUserDate_(
    identity.department,
    identity.employeeName,
    identity.workDate
  );
  const tasks = Object.keys(latestByTaskId).map(function(taskId) {
    const t = latestByTaskId[taskId];
    if (!t || !sameTextLocal_(t.status, "Open")) return null;
    return {
      taskId: String(t.taskId || "").trim(),
      title: String(t.title || "").trim(),
      priority: normalizePriority_(t.priority),
      plannedHours: Number(t.plannedHours || 0),
      plannedMinutes: Number(t.plannedMinutes || 0),
      status: "Open"
    };
  }).filter(function(t) {
    return t && t.taskId && t.title;
  });
  const inSodTasks = Object.keys(latestByTaskId).map(function(taskId) {
    const t = latestByTaskId[taskId];
    if (!t || !sameTextLocal_(t.status, "InSOD")) return null;
    if (identity.workDate && toIsoDate_(t.workDateRef) !== identity.workDate) return null;
    const taskIdText = String(t.taskId || "").trim();
    const titleText = String(t.title || "").trim();
    if (!taskIdText || !titleText) return null;
    const idKey = "id:" + taskIdText;
    const titleKey = "title:" + titleText.toLowerCase();
    const completion = completedByKey[idKey] != null
      ? Number(completedByKey[idKey])
      : (completedByKey[titleKey] != null ? Number(completedByKey[titleKey]) : null);
    if (isFinite(completion) && completion >= 100) return null;
    return {
      taskId: taskIdText,
      title: titleText,
      priority: normalizePriority_(t.priority),
      plannedHours: Number(t.plannedHours || 0),
      plannedMinutes: Number(t.plannedMinutes || 0),
      status: "InSOD",
      source: "planner"
    };
  }).filter(function(t) {
    return t && t.taskId && t.title;
  });

  const consumedTitleKeys = Object.keys(getPlannerConsumedTitleKeyMap_(identity.department, identity.employeeName));
  return json_({
    ok: true,
    tasks: tasks,
    inSodTasks: inSodTasks,
    consumedTitleKeys: consumedTitleKeys
  });
}

function handleAddPlannerTasks_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });

  const incomingTasks = ensureArray_(body.tasks);
  if (!incomingTasks.length) {
    return json_({ ok: true, addedCount: 0, skippedLockedTitles: [], skippedExistingTitles: [] });
  }

  return withPlannerLock_(function() {
    const consumedTitleKeyMap = getPlannerConsumedTitleKeyMap_(identity.department, identity.employeeName);
    const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const activeTitleKeyMap = {};
    Object.keys(latestByTaskId).forEach(function(taskId) {
      const t = latestByTaskId[taskId];
      if (!t) return;
      if (!sameTextLocal_(t.status, "Open") && !sameTextLocal_(t.status, "InSOD")) return;
      const key = normalizePlannerTitleKey_(t.title);
      if (key) activeTitleKeyMap[key] = true;
    });

    const sh = getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET);
    const changedAt = new Date().toISOString();
    const skippedLockedTitles = [];
    const skippedExistingTitles = [];
    let addedCount = 0;

    incomingTasks.forEach(function(raw) {
      const title = String(raw && raw.title || "").trim();
      if (!title) return;
      const titleKey = normalizePlannerTitleKey_(title);
      if (!titleKey) return;

      if (consumedTitleKeyMap[titleKey]) {
        skippedLockedTitles.push(title);
        return;
      }
      if (activeTitleKeyMap[titleKey]) {
        skippedExistingTitles.push(title);
        return;
      }

      const plannedHours = Math.max(0, Math.floor(Number(raw && raw.plannedHours || 0)));
      const plannedMinutes = Math.max(0, Math.floor(Number(raw && raw.plannedMinutes || 0)));
      const taskId = String(raw && raw.taskId || Utilities.getUuid()).trim() || Utilities.getUuid();
      const payload = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: normalizePriority_(raw && raw.priority),
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "Open",
        workDateRef: ""
      };

      const row = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: payload.priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "Open",
        workDateRef: "",
        payloadJson: JSON.stringify(payload)
      };
      sh.appendRow([
        changedAt,
        identity.department,
        identity.employeeName,
        taskId,
        title,
        titleKey,
        payload.priority,
        plannedHours,
        plannedMinutes,
        "Open",
        "",
        row.payloadJson
      ]);
      mirrorAdminEventToSupabaseSafe_("planner_task", row);
      activeTitleKeyMap[titleKey] = true;
      addedCount += 1;
    });

    return json_({
      ok: true,
      addedCount: addedCount,
      skippedLockedTitles: uniqueSorted_(skippedLockedTitles),
      skippedExistingTitles: uniqueSorted_(skippedExistingTitles)
    });
  });
}

function handleMovePlannerToSOD_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });
  if (!identity.workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });

  const taskIds = ensureArray_(body.taskIds).map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
  if (!taskIds.length) return json_({ ok: true, movedTasks: [] });

  return withPlannerLock_(function() {
    const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const sh = getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET);
    const changedAt = new Date().toISOString();
    const movedTasks = [];

    taskIds.forEach(function(taskId) {
      const t = latestByTaskId[taskId];
      if (!t || !sameTextLocal_(t.status, "Open")) return;
      const title = String(t.title || "").trim();
      if (!title) return;
      const titleKey = normalizePlannerTitleKey_(title);
      const priority = normalizePriority_(t.priority);
      const plannedHours = Math.max(0, Math.floor(Number(t.plannedHours || 0)));
      const plannedMinutes = Math.max(0, Math.floor(Number(t.plannedMinutes || 0)));
      const payload = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "InSOD",
        workDateRef: identity.workDate
      };
      const row = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "InSOD",
        workDateRef: identity.workDate,
        payloadJson: JSON.stringify(payload)
      };
      sh.appendRow([
        changedAt,
        identity.department,
        identity.employeeName,
        taskId,
        title,
        titleKey,
        priority,
        plannedHours,
        plannedMinutes,
        "InSOD",
        identity.workDate,
        row.payloadJson
      ]);
      mirrorAdminEventToSupabaseSafe_("planner_task", row);
      movedTasks.push({
        taskId: taskId,
        title: title,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        source: "planner"
      });
    });

    return json_({ ok: true, movedTasks: movedTasks });
  });
}

function handleReturnPlannerTasks_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });
  if (!identity.workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });

  const taskIds = ensureArray_(body.taskIds).map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
  if (!taskIds.length) return json_({ ok: true, returnedCount: 0 });
  if (isSodSubmittedForUserDate_(identity.department, identity.employeeName, identity.workDate)) {
    return json_({ ok: false, message: "Cannot return planner tasks after SOD submit." });
  }

  return withPlannerLock_(function() {
    const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const sh = getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET);
    const changedAt = new Date().toISOString();
    let returnedCount = 0;

    taskIds.forEach(function(taskId) {
      const t = latestByTaskId[taskId];
      if (!t || !sameTextLocal_(t.status, "InSOD")) return;
      const title = String(t.title || "").trim();
      if (!title) return;
      const titleKey = normalizePlannerTitleKey_(title);
      const priority = normalizePriority_(t.priority);
      const plannedHours = Math.max(0, Math.floor(Number(t.plannedHours || 0)));
      const plannedMinutes = Math.max(0, Math.floor(Number(t.plannedMinutes || 0)));
      const payload = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "Open",
        workDateRef: ""
      };
      const row = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "Open",
        workDateRef: "",
        payloadJson: JSON.stringify(payload)
      };
      sh.appendRow([
        changedAt,
        identity.department,
        identity.employeeName,
        taskId,
        title,
        titleKey,
        priority,
        plannedHours,
        plannedMinutes,
        "Open",
        "",
        row.payloadJson
      ]);
      mirrorAdminEventToSupabaseSafe_("planner_task", row);
      returnedCount += 1;
    });

    return json_({ ok: true, returnedCount: returnedCount });
  });
}

function handleMarkPlannerConsumed_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });
  if (!identity.workDate) return json_({ ok: false, message: "workDate is required (YYYY-MM-DD)." });

  const taskIds = ensureArray_(body.taskIds).map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
  if (!taskIds.length) return json_({ ok: true, consumedCount: 0 });

  return withPlannerLock_(function() {
    const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const consumedTitleKeyMap = getPlannerConsumedTitleKeyMap_(identity.department, identity.employeeName);
    const plannerSheet = getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET);
    const consumedSheet = getSheet_(ADMIN_CONFIG.PLANNER_CONSUMED_SHEET);
    const changedAt = new Date().toISOString();
    let consumedCount = 0;

    taskIds.forEach(function(taskId) {
      const t = latestByTaskId[taskId];
      if (!t || !sameTextLocal_(t.status, "InSOD")) return;
      const title = String(t.title || "").trim();
      if (!title) return;
      const titleKey = normalizePlannerTitleKey_(title);
      const priority = normalizePriority_(t.priority);
      const plannedHours = Math.max(0, Math.floor(Number(t.plannedHours || 0)));
      const plannedMinutes = Math.max(0, Math.floor(Number(t.plannedMinutes || 0)));
      const payload = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "Consumed",
        workDateRef: identity.workDate,
        consumedOn: identity.workDate
      };
      const plannerRow = {
        changedAt: changedAt,
        department: identity.department,
        employeeName: identity.employeeName,
        taskId: taskId,
        title: title,
        titleKey: titleKey,
        priority: priority,
        plannedHours: plannedHours,
        plannedMinutes: plannedMinutes,
        status: "Consumed",
        workDateRef: identity.workDate,
        payloadJson: JSON.stringify(payload)
      };
      plannerSheet.appendRow([
        changedAt,
        identity.department,
        identity.employeeName,
        taskId,
        title,
        titleKey,
        priority,
        plannedHours,
        plannedMinutes,
        "Consumed",
        identity.workDate,
        plannerRow.payloadJson
      ]);
      mirrorAdminEventToSupabaseSafe_("planner_task", plannerRow);

      if (!consumedTitleKeyMap[titleKey]) {
        const consumedPayload = {
          changedAt: changedAt,
          department: identity.department,
          employeeName: identity.employeeName,
          titleKey: titleKey,
          sourceTaskId: taskId,
          consumedOn: identity.workDate
        };
        const consumedRow = {
          changedAt: changedAt,
          department: identity.department,
          employeeName: identity.employeeName,
          titleKey: titleKey,
          sourceTaskId: taskId,
          consumedOn: identity.workDate,
          payloadJson: JSON.stringify(consumedPayload)
        };
        consumedSheet.appendRow([
          changedAt,
          identity.department,
          identity.employeeName,
          titleKey,
          taskId,
          identity.workDate,
          consumedRow.payloadJson
        ]);
        mirrorAdminEventToSupabaseSafe_("planner_consumed", consumedRow);
        consumedTitleKeyMap[titleKey] = true;
      }
      consumedCount += 1;
    });

    return json_({ ok: true, consumedCount: consumedCount });
  });
}

function handleUpdatePlannerTask_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });

  const taskId = String(body.taskId || "").trim();
  const nextTitle = String(body.title || "").trim();
  if (!taskId) return json_({ ok: false, message: "taskId is required." });
  if (!nextTitle) return json_({ ok: false, message: "title is required." });

  return withPlannerLock_(function() {
    const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const current = latestByTaskId[taskId];
    if (!current || !sameTextLocal_(current.status, "Open")) {
      return json_({ ok: false, message: "Only open planner tasks can be edited." });
    }

    const consumedTitleKeyMap = getPlannerConsumedTitleKeyMap_(identity.department, identity.employeeName);
    const titleKey = normalizePlannerTitleKey_(nextTitle);
    if (consumedTitleKeyMap[titleKey] && titleKey !== normalizePlannerTitleKey_(current.title)) {
      return json_({ ok: false, message: "This task was already consumed and cannot be re-added." });
    }

    const latest = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const hasDuplicateOpen = Object.keys(latest).some(function(id) {
      if (id === taskId) return false;
      const t = latest[id];
      if (!t || !sameTextLocal_(t.status, "Open")) return false;
      return normalizePlannerTitleKey_(t.title) === titleKey;
    });
    if (hasDuplicateOpen) {
      return json_({ ok: false, message: "Task already exists in planner backlog." });
    }

    const priority = normalizePriority_(body.priority || current.priority);
    const plannedHours = Math.max(0, Math.floor(Number(body.plannedHours != null ? body.plannedHours : current.plannedHours || 0)));
    const plannedMinutes = Math.max(0, Math.floor(Number(body.plannedMinutes != null ? body.plannedMinutes : current.plannedMinutes || 0)));
    const changedAt = new Date().toISOString();
    const payload = {
      changedAt: changedAt,
      department: identity.department,
      employeeName: identity.employeeName,
      taskId: taskId,
      title: nextTitle,
      titleKey: titleKey,
      priority: priority,
      plannedHours: plannedHours,
      plannedMinutes: plannedMinutes,
      status: "Open",
      workDateRef: ""
    };
    const row = {
      changedAt: changedAt,
      department: identity.department,
      employeeName: identity.employeeName,
      taskId: taskId,
      title: nextTitle,
      titleKey: titleKey,
      priority: priority,
      plannedHours: plannedHours,
      plannedMinutes: plannedMinutes,
      status: "Open",
      workDateRef: "",
      payloadJson: JSON.stringify(payload)
    };
    getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET).appendRow([
      changedAt,
      identity.department,
      identity.employeeName,
      taskId,
      nextTitle,
      titleKey,
      priority,
      plannedHours,
      plannedMinutes,
      "Open",
      "",
      row.payloadJson
    ]);
    mirrorAdminEventToSupabaseSafe_("planner_task", row);
    return json_({ ok: true });
  });
}

function handleDeletePlannerTask_(body) {
  initializeTrackerSheets();
  initializePlannerSheets_();

  const identity = resolvePlannerIdentity_(body);
  if (!identity.ok) return json_({ ok: false, message: "Invalid user identity." });

  const taskId = String(body.taskId || "").trim();
  if (!taskId) return json_({ ok: false, message: "taskId is required." });

  return withPlannerLock_(function() {
    const latestByTaskId = getLatestPlannerTaskStateByTaskId_(identity.department, identity.employeeName);
    const current = latestByTaskId[taskId];
    if (!current || !sameTextLocal_(current.status, "Open")) {
      return json_({ ok: false, message: "Only open planner tasks can be removed." });
    }
    const changedAt = new Date().toISOString();
    const title = String(current.title || "").trim();
    const payload = {
      changedAt: changedAt,
      department: identity.department,
      employeeName: identity.employeeName,
      taskId: taskId,
      title: title,
      titleKey: normalizePlannerTitleKey_(title),
      priority: normalizePriority_(current.priority),
      plannedHours: Math.max(0, Math.floor(Number(current.plannedHours || 0))),
      plannedMinutes: Math.max(0, Math.floor(Number(current.plannedMinutes || 0))),
      status: "Deleted",
      workDateRef: ""
    };
    const row = {
      changedAt: changedAt,
      department: identity.department,
      employeeName: identity.employeeName,
      taskId: taskId,
      title: title,
      titleKey: payload.titleKey,
      priority: payload.priority,
      plannedHours: payload.plannedHours,
      plannedMinutes: payload.plannedMinutes,
      status: "Deleted",
      workDateRef: "",
      payloadJson: JSON.stringify(payload)
    };
    getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET).appendRow([
      changedAt,
      identity.department,
      identity.employeeName,
      taskId,
      title,
      payload.titleKey,
      payload.priority,
      payload.plannedHours,
      payload.plannedMinutes,
      "Deleted",
      "",
      row.payloadJson
    ]);
    mirrorAdminEventToSupabaseSafe_("planner_task", row);
    return json_({ ok: true });
  });
}

function handleGetAdminDashboard_(body) {
  initializeTrackerSheets();
  initializeAssignmentsSheet_();

  const admin = String(body.admin || "").trim();
  const code = String(body.code || "").trim();
  const auth = validateAdmin_(admin, code);
  if (!auth.ok) return json_({ ok: false, message: auth.message || "Unauthorized" });

  const rangePreset = String(body.rangePreset || "last7").trim();
  const anchorDate = toIsoDate_(body.workDate) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const range = getRangeWindow_(rangePreset, anchorDate);

  const filterDept = String(body.department || "All").trim() || "All";
  const filterEmployee = String(body.employeeName || "All").trim() || "All";
  const stage = String(body.stage || "All").trim() || "All";
  const filterDeptCanonical = filterDept === "All" ? "" : canonicalDepartmentName_(filterDept);

  const allowedDepartments = normalizeAllowedDepartments_(auth.record.allowedDepartments);
  const allEmployees = getAllEmployees_();
  const scopedEmployees = allEmployees.filter(function(e) {
    if (!isDepartmentAllowedForAdmin_(allowedDepartments, e.department)) return false;
    if (filterDeptCanonical && canonicalDepartmentName_(e.department) !== filterDeptCanonical) return false;
    if (filterEmployee !== "All" && e.employeeName !== filterEmployee) return false;
    return true;
  });

  const employeeSet = {};
  scopedEmployees.forEach(function(e) { employeeSet[employeeKey_(e.department, e.employeeName)] = true; });
  const leaveByEmployeeDate = buildLeaveByEmployeeDateMap_(scopedEmployees, range.toDate);

  const sodRows = getDashboardSubmissionRows_("SOD", range.fromDate, range.toDate);
  const eodRows = getDashboardSubmissionRows_("EOD", "", range.toDate);
  const assignRows = getDashboardAssignmentRows_(range.fromDate, range.toDate);

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
  const carryRows = buildCarryoverRows_(carryState, range.toDate, stage, leaveByEmployeeDate);

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
  const completedTasks = buildCompletedTasksRows_(eodTimeline, range, leaveByEmployeeDate);

  const departmentOptions = uniqueSorted_(allEmployees
    .filter(function(e) {
      return isDepartmentAllowedForAdmin_(allowedDepartments, e.department);
    })
    .map(function(e) { return e.department; }));

  const employeeOptions = uniqueSorted_(allEmployees
    .filter(function(e) {
      if (!isDepartmentAllowedForAdmin_(allowedDepartments, e.department)) return false;
      if (filterDeptCanonical && canonicalDepartmentName_(e.department) !== filterDeptCanonical) return false;
      return true;
    })
    .map(function(e) { return e.employeeName; }));

  return json_({
    ok: true,
    kpis: kpis,
    departmentSummary: deptRows,
    employeeCompliance: employeeRows,
    carryoverAging: carryRows,
    completedTasks: completedTasks,
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
  const directory = getAdminDirectory_();
  const rec = directory[admin];
  if (!rec) return { ok: false, message: "Admin not found." };
  const expectedCode = String(rec.code || "");
  if (expectedCode !== String(code || "")) return { ok: false, message: "Invalid admin code." };
  return { ok: true, record: rec };
}

function normalizeAllowedDepartments_(value) {
  if (!Array.isArray(value) || !value.length) return ["All"];
  return value.map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
}

function parseAllowedDepartments_(value) {
  if (Array.isArray(value)) return normalizeAllowedDepartments_(value);
  const raw = String(value || "").trim();
  if (!raw) return ["All"];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeAllowedDepartments_(parsed);
  } catch (err) {}
  const list = raw.split(",").map(function(v) { return String(v || "").trim(); }).filter(function(v) { return v.length > 0; });
  return normalizeAllowedDepartments_(list);
}

function normalizeCreatedRole_(value) {
  const role = String(value || "User").trim().toLowerCase();
  if (role === "super admin" || role === "super_admin" || role === "superadmin") return "Super Admin";
  if (role === "admin") return "Admin";
  return "User";
}

function isDepartmentAllowedForAdmin_(allowedDepartments, requestedDepartment) {
  const list = Array.isArray(allowedDepartments) ? allowedDepartments : [];
  if (list.indexOf("All") > -1) return true;
  const requestedCanonical = canonicalDepartmentName_(requestedDepartment);
  return list.some(function(dep) {
    return canonicalDepartmentName_(dep) === requestedCanonical;
  });
}

function initializeAssignmentsSheet_() {
  ensureSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET, ADMIN_CONFIG.ASSIGNMENTS_HEADERS);
}

function initializeRecurringSheet_() {
  ensureSheet_(ADMIN_CONFIG.RECURRING_SHEET, ADMIN_CONFIG.RECURRING_HEADERS);
  const sh = getSheet_(ADMIN_CONFIG.RECURRING_SHEET);
  const width = Math.max(1, sh.getLastColumn());
  const headerRow = sh.getRange(1, 1, 1, width).getValues()[0].map(function(v) { return String(v || "").trim(); });

  const ensureBeforeStatus_ = function(name) {
    if (headerRow.indexOf(name) > -1) return;
    const statusIndex = headerRow.indexOf("status");
    const insertAt = statusIndex > -1 ? (statusIndex + 1) : (headerRow.length + 1);
    sh.insertColumnBefore(insertAt);
    sh.getRange(1, insertAt).setValue(name);
    headerRow.splice(insertAt - 1, 0, name);
  };

  ensureBeforeStatus_("recurrenceWeekday");
  ensureBeforeStatus_("recurrenceDayOfMonth");
}

function initializePlannerSheets_() {
  ensureSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET, ADMIN_CONFIG.PLANNER_TASKS_HEADERS);
  ensureSheet_(ADMIN_CONFIG.PLANNER_CONSUMED_SHEET, ADMIN_CONFIG.PLANNER_CONSUMED_HEADERS);
}

function initializeDynamicAdminSheet_() {
  ensureSheet_(ADMIN_CONFIG.ADMIN_DYNAMIC_SHEET, ADMIN_CONFIG.ADMIN_DYNAMIC_HEADERS);
}

function getAdminEventsSupabaseTable_() {
  const props = PropertiesService.getScriptProperties();
  const name = String(props.getProperty(ADMIN_CONFIG.SUPABASE_ADMIN_EVENTS_TABLE_PROPERTY) || "").trim();
  return name || ADMIN_CONFIG.SUPABASE_ADMIN_EVENTS_TABLE_DEFAULT;
}

function isAdminEventsSupabaseEnabled_() {
  if (!(typeof isSupabaseEnabled_ === "function") || !isSupabaseEnabled_()) return false;
  const props = PropertiesService.getScriptProperties();
  const raw = String(props.getProperty(ADMIN_CONFIG.SUPABASE_ADMIN_ENABLED_PROPERTY) || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function adminEventPayloadObject_(row) {
  if (!row || typeof row !== "object") return {};
  if (row.payloadJson && typeof row.payloadJson === "string") {
    try { return JSON.parse(row.payloadJson); } catch (err) { return {}; }
  }
  if (row.payloadJson && typeof row.payloadJson === "object") return row.payloadJson;
  return {};
}

function adminEventKey_(eventType, row) {
  const payloadObj = adminEventPayloadObject_(row);
  const seed = [
    String(eventType || ""),
    String(row && row.changedAt || row && row.assignedAt || ""),
    String(row && row.workDate || row && row.workDateRef || row && row.consumedOn || ""),
    String(row && row.department || ""),
    String(row && row.employeeName || ""),
    String(row && row.taskId || row && row.sourceTaskId || ""),
    String(row && row.title || row && row.titleKey || ""),
    String(row && row.status || ""),
    JSON.stringify(payloadObj)
  ].join("|");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  return "adm-" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function toSupabaseAdminEventRow_(eventType, row) {
  const payloadObj = adminEventPayloadObject_(row);
  const changedAt = String(row && (row.changedAt || row.assignedAt) || new Date().toISOString());
  const workDate = toIsoDate_(row && (row.workDate || row.workDateRef || row.consumedOn) || "");
  return {
    event_key: adminEventKey_(eventType, row),
    event_type: String(eventType || "").trim(),
    changed_at: changedAt,
    work_date: workDate || null,
    department: String(row && row.department || payloadObj.department || "").trim(),
    employee_name: String(row && row.employeeName || payloadObj.employeeName || "").trim(),
    task_id: String(row && (row.taskId || row.sourceTaskId) || payloadObj.taskId || "").trim() || null,
    title: String(row && row.title || payloadObj.title || "").trim() || null,
    status: String(row && row.status || payloadObj.status || "").trim() || null,
    payload_json: payloadObj && typeof payloadObj === "object" ? payloadObj : {}
  };
}

function mirrorAdminEventToSupabaseSafe_(eventType, row) {
  if (!isAdminEventsSupabaseEnabled_()) return;
  try {
    const payload = [toSupabaseAdminEventRow_(eventType, row)];
    const table = getAdminEventsSupabaseTable_();
    supabaseRequest_("POST", "/rest/v1/" + encodeURIComponent(table), payload, null);
  } catch (err) {
    // Keep Sheets as source-of-truth fallback for admin modules.
  }
}

function mapSupabaseAdminEventToSheetRow_(eventType, raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const payload = (r.payload_json && typeof r.payload_json === "object") ? r.payload_json : {};
  if (eventType === "assignment") {
    return {
      assignedAt: String(payload.assignedAt || r.changed_at || "").trim(),
      workDate: String(payload.workDate || r.work_date || "").trim(),
      department: String(payload.department || r.department || "").trim(),
      employeeName: String(payload.employeeName || r.employee_name || "").trim(),
      assignedBy: String(payload.assignedBy || "").trim(),
      taskId: String(payload.taskId || r.task_id || "").trim(),
      title: String(payload.title || r.title || "").trim(),
      priority: String(payload.priority || "").trim(),
      status: String(payload.status || r.status || "").trim(),
      payloadJson: JSON.stringify(payload)
    };
  }
  if (eventType === "recurring") {
    return {
      changedAt: String(payload.changedAt || r.changed_at || "").trim(),
      department: String(payload.department || r.department || "").trim(),
      employeeName: String(payload.employeeName || r.employee_name || "").trim(),
      taskId: String(payload.taskId || r.task_id || "").trim(),
      title: String(payload.title || r.title || "").trim(),
      priority: String(payload.priority || "").trim(),
      frequency: String(payload.frequency || "").trim(),
      startDate: String(payload.startDate || r.work_date || "").trim(),
      recurrenceWeekday: payload.recurrenceWeekday,
      recurrenceDayOfMonth: payload.recurrenceDayOfMonth,
      status: String(payload.status || r.status || "").trim(),
      payloadJson: JSON.stringify(payload)
    };
  }
  if (eventType === "planner_task") {
    return {
      changedAt: String(payload.changedAt || r.changed_at || "").trim(),
      department: String(payload.department || r.department || "").trim(),
      employeeName: String(payload.employeeName || r.employee_name || "").trim(),
      taskId: String(payload.taskId || r.task_id || "").trim(),
      title: String(payload.title || r.title || "").trim(),
      titleKey: String(payload.titleKey || "").trim(),
      priority: String(payload.priority || "").trim(),
      plannedHours: Number(payload.plannedHours || 0),
      plannedMinutes: Number(payload.plannedMinutes || 0),
      status: String(payload.status || r.status || "").trim(),
      workDateRef: String(payload.workDateRef || r.work_date || "").trim(),
      payloadJson: JSON.stringify(payload)
    };
  }
  if (eventType === "planner_consumed") {
    return {
      changedAt: String(payload.changedAt || r.changed_at || "").trim(),
      department: String(payload.department || r.department || "").trim(),
      employeeName: String(payload.employeeName || r.employee_name || "").trim(),
      titleKey: String(payload.titleKey || "").trim(),
      sourceTaskId: String(payload.sourceTaskId || r.task_id || "").trim(),
      consumedOn: String(payload.consumedOn || r.work_date || "").trim(),
      payloadJson: JSON.stringify(payload)
    };
  }
  return {};
}

function fetchAdminEventRowsFromSupabase_(eventType, department, employeeName, opts) {
  if (!isAdminEventsSupabaseEnabled_()) return [];
  const table = getAdminEventsSupabaseTable_();
  const params = {
    select: "changed_at,work_date,department,employee_name,task_id,title,status,payload_json",
    event_type: "eq." + String(eventType || "").trim(),
    department: "eq." + String(department || "").trim(),
    employee_name: "eq." + String(employeeName || "").trim(),
    order: "changed_at.asc",
    limit: String(Number((opts && opts.limit) || 5000))
  };
  if (opts && opts.workDateGte && opts.workDateLte) {
    params.and = "(work_date.gte." + String(opts.workDateGte || "").trim() + ",work_date.lte." + String(opts.workDateLte || "").trim() + ")";
  } else if (opts && opts.workDateLte) {
    params.work_date = "lte." + String(opts.workDateLte || "").trim();
  } else if (opts && opts.workDateGte) {
    params.work_date = "gte." + String(opts.workDateGte || "").trim();
  }
  if (opts && opts.workDateEq) params.work_date = "eq." + String(opts.workDateEq || "").trim();
  const rows = supabaseRequest_("GET", "/rest/v1/" + encodeURIComponent(table), null, params);
  return (Array.isArray(rows) ? rows : []).map(function(r) {
    return mapSupabaseAdminEventToSheetRow_(eventType, r);
  });
}

function fetchAdminEventRowsForDashboardFromSupabase_(eventType, fromDate, toDate, limit) {
  if (!isAdminEventsSupabaseEnabled_()) return [];
  const table = getAdminEventsSupabaseTable_();
  const params = {
    select: "changed_at,work_date,department,employee_name,task_id,title,status,payload_json",
    event_type: "eq." + String(eventType || "").trim(),
    order: "changed_at.asc",
    limit: String(Number(limit || 25000))
  };
  const from = toIsoDate_(fromDate);
  const to = toIsoDate_(toDate);
  if (from && to) {
    params.and = "(work_date.gte." + from + ",work_date.lte." + to + ")";
  } else if (to) {
    params.work_date = "lte." + to;
  } else if (from) {
    params.work_date = "gte." + from;
  }
  const rows = supabaseRequest_("GET", "/rest/v1/" + encodeURIComponent(table), null, params);
  return (Array.isArray(rows) ? rows : []).map(function(r) {
    return mapSupabaseAdminEventToSheetRow_(eventType, r);
  });
}

function fetchSubmissionRowsForDashboardFromSupabase_(stage, fromDate, toDate, limit) {
  if (!(typeof isSupabaseEnabled_ === "function") || !isSupabaseEnabled_()) return [];
  const cfg = getSupabaseConfig_();
  const params = {
    select: "submitted_at,work_date,department,employee_name,access_code,stage,task_count,total_spent_minutes,payload_json",
    stage: "eq." + String(stage || "").trim().toUpperCase(),
    order: "submitted_at.asc",
    limit: String(Number(limit || 30000))
  };
  const from = toIsoDate_(fromDate);
  const to = toIsoDate_(toDate);
  if (from && to) {
    params.and = "(work_date.gte." + from + ",work_date.lte." + to + ")";
  } else if (to) {
    params.work_date = "lte." + to;
  } else if (from) {
    params.work_date = "gte." + from;
  }
  const rows = supabaseRequest_("GET", "/rest/v1/" + encodeURIComponent(cfg.table), null, params);
  return (Array.isArray(rows) ? rows : []).map(function(r) {
    return {
      submittedAt: String(r && r.submitted_at || ""),
      workDate: String(r && r.work_date || ""),
      department: String(r && r.department || ""),
      employeeName: String(r && r.employee_name || ""),
      accessCode: String(r && r.access_code || ""),
      stage: String(r && r.stage || ""),
      taskCount: Number(r && r.task_count || 0),
      totalSpentMinutes: Number(r && r.total_spent_minutes || 0),
      payloadJson: JSON.stringify(r && r.payload_json ? r.payload_json : {})
    };
  });
}

function getDashboardSubmissionRows_(stage, fromDate, toDate) {
  if (isAdminEventsSupabaseEnabled_()) {
    try {
      return fetchSubmissionRowsForDashboardFromSupabase_(stage, fromDate, toDate, 30000);
    } catch (err) {}
  }
  const shName = String(stage || "").toUpperCase() === "EOD" ? CONFIG.SHEETS.EOD : CONFIG.SHEETS.SOD;
  return readRowsAsObjects_(getSheet_(shName));
}

function getDashboardAssignmentRows_(fromDate, toDate) {
  if (isAdminEventsSupabaseEnabled_()) {
    try {
      return fetchAdminEventRowsForDashboardFromSupabase_("assignment", fromDate, toDate, 20000);
    } catch (err) {}
  }
  return readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET));
}

function getAssignmentRowsForUser_(department, employeeName, workDate) {
  try {
    return fetchAdminEventRowsFromSupabase_("assignment", department, employeeName, { workDateLte: workDate, limit: 6000 });
  } catch (err) {}
  return readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET));
}

function getRecurringRowsForUser_(department, employeeName) {
  try {
    return fetchAdminEventRowsFromSupabase_("recurring", department, employeeName, { limit: 6000 });
  } catch (err) {}
  return readRowsAsObjects_(getSheet_(ADMIN_CONFIG.RECURRING_SHEET));
}

function getPlannerTaskRowsForUser_(department, employeeName) {
  try {
    return fetchAdminEventRowsFromSupabase_("planner_task", department, employeeName, { limit: 8000 });
  } catch (err) {}
  return readRowsAsObjects_(getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET));
}

function getPlannerConsumedRowsForUser_(department, employeeName) {
  try {
    return fetchAdminEventRowsFromSupabase_("planner_consumed", department, employeeName, { limit: 4000 });
  } catch (err) {}
  return readRowsAsObjects_(getSheet_(ADMIN_CONFIG.PLANNER_CONSUMED_SHEET));
}

function getSubmissionRowsForUserUpToDate_(stage, department, employeeName, workDate) {
  const stageKey = String(stage || "").trim().toUpperCase() === "EOD" ? "EOD" : "SOD";
  if (isAdminEventsSupabaseEnabled_() && typeof fetchSubmissionRowsFromSupabase_ === "function") {
    try {
      return fetchSubmissionRowsFromSupabase_(stageKey, department, employeeName, { workDateLte: workDate, limit: 4000 });
    } catch (err) {}
  }
  const shName = stageKey === "EOD" ? CONFIG.SHEETS.EOD : CONFIG.SHEETS.SOD;
  return readRowsAsObjects_(getSheet_(shName));
}

function getAdminDirectory_() {
  const merged = {};
  Object.keys(ADMIN_DIRECTORY || {}).forEach(function(name) {
    const rec = ADMIN_DIRECTORY[name] || {};
    merged[name] = {
      code: String(rec.code || ""),
      role: String(rec.role || "Admin"),
      allowedDepartments: normalizeAllowedDepartments_(rec.allowedDepartments)
    };
  });

  let rows = [];
  try {
    rows = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ADMIN_DYNAMIC_SHEET));
  } catch (err) {
    rows = [];
  }
  rows.forEach(function(row) {
    const adminName = String(row.adminName || "").trim();
    const code = String(row.code || "").trim();
    const role = normalizeCreatedRole_(row.role);
    const allowed = parseAllowedDepartments_(row.allowedDepartmentsJson);
    if (!adminName || !code) return;
    merged[adminName] = {
      code: code,
      role: role,
      allowedDepartments: allowed
    };
  });

  return merged;
}

function withPlannerLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function resolvePlannerIdentity_(body) {
  const department = String(body.department || "").trim();
  const employeeName = String(body.employeeName || "").trim();
  const accessCode = String(body.accessCode || body.code || "").trim();
  const workDate = toIsoDate_(body.workDate);
  const identity = resolveUserIdentity_(department, employeeName, accessCode);
  if (!identity.ok) return { ok: false };
  return {
    ok: true,
    department: identity.department,
    employeeName: identity.employeeName,
    accessCode: identity.accessCode,
    workDate: workDate
  };
}

function normalizePlannerTitleKey_(title) {
  return String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getLatestPlannerTaskStateByTaskId_(department, employeeName) {
  const rows = getPlannerTaskRowsForUser_(department, employeeName);
  const out = {};
  rows.forEach(function(r) {
    if (!sameText_(r.department, department)) return;
    if (!sameText_(r.employeeName, employeeName)) return;
    const taskId = String(r.taskId || "").trim();
    if (!taskId) return;
    const title = String(r.title || "").trim();
    const titleKey = String(r.titleKey || normalizePlannerTitleKey_(title)).trim();
    const changedAt = String(r.changedAt || "").trim();
    const status = String(r.status || "").trim() || "Open";
    const priority = normalizePriority_(r.priority);
    const plannedHours = Number(r.plannedHours || 0);
    const plannedMinutes = Number(r.plannedMinutes || 0);
    const workDateRef = toIsoDate_(r.workDateRef);
    const next = {
      taskId: taskId,
      title: title,
      titleKey: titleKey,
      changedAt: changedAt,
      status: status,
      priority: priority,
      plannedHours: isFinite(plannedHours) ? plannedHours : 0,
      plannedMinutes: isFinite(plannedMinutes) ? plannedMinutes : 0,
      workDateRef: workDateRef
    };
    const prev = out[taskId];
    if (!prev || String(next.changedAt || "") >= String(prev.changedAt || "")) {
      out[taskId] = next;
    }
  });
  return out;
}

function getLatestEodCompletionByTaskKeyForUserDate_(department, employeeName, workDate) {
  const dateKey = toIsoDate_(workDate);
  const out = {};
  if (!dateKey) return out;

  const rows = getSubmissionRowsForUserUpToDate_("EOD", department, employeeName, dateKey);
  var latest = null;
  rows.forEach(function(row) {
    const n = normalizeSubmissionRow_(row);
    if (!n.ok) return;
    if (!sameText_(n.department, department)) return;
    if (!sameText_(n.employeeName, employeeName)) return;
    if (n.workDate !== dateKey) return;
    if (!latest || isLaterSubmission_(n, latest)) latest = n;
  });
  if (!latest) return out;

  const updates = ensureArray_(latest.payload && latest.payload.updates);
  updates.forEach(function(u) {
    const taskId = String(u && u.taskId || "").trim();
    const title = String(u && u.title || "").trim();
    if (!taskId && !title) return;
    var completion = Number(u && u.completionPercent);
    if (!isFinite(completion)) completion = Number(u && u.completion);
    if (!isFinite(completion)) completion = Number(u && u.progress);
    if (!isFinite(completion)) return;
    if (taskId) out["id:" + taskId] = completion;
    if (title) out["title:" + title.toLowerCase()] = completion;
  });
  return out;
}

function getPlannerConsumedTitleKeyMap_(department, employeeName) {
  const rows = getPlannerConsumedRowsForUser_(department, employeeName);
  const out = {};
  rows.forEach(function(r) {
    if (!sameText_(r.department, department)) return;
    if (!sameText_(r.employeeName, employeeName)) return;
    const titleKey = String(r.titleKey || "").trim();
    if (!titleKey) return;
    out[titleKey] = true;
  });
  return out;
}

function isSodSubmittedForUserDate_(department, employeeName, workDate) {
  const dateKey = toIsoDate_(workDate);
  if (!dateKey) return false;
  const rows = getSubmissionRowsForUserUpToDate_("SOD", department, employeeName, dateKey);
  for (var i = rows.length - 1; i >= 0; i--) {
    const r = rows[i] || {};
    if (!sameText_(r.department, department)) continue;
    if (!sameText_(r.employeeName, employeeName)) continue;
    if (toIsoDate_(r.workDate) !== dateKey) continue;
    return true;
  }
  return false;
}

function migrateAdminSheetsToSupabase_() {
  initializeAssignmentsSheet_();
  initializeRecurringSheet_();
  initializePlannerSheets_();
  if (!isAdminEventsSupabaseEnabled_()) {
    throw new Error("Admin Supabase migration is disabled. Set SUPABASE_ENABLED=true, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_ADMIN_ENABLED=true.");
  }

  const all = [];
  readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET)).forEach(function(r) {
    const row = {
      assignedAt: String(r.assignedAt || "").trim(),
      workDate: toIsoDate_(r.workDate),
      department: String(r.department || "").trim(),
      employeeName: String(r.employeeName || "").trim(),
      assignedBy: String(r.assignedBy || "").trim(),
      taskId: String(r.taskId || "").trim(),
      title: String(r.title || "").trim(),
      priority: normalizePriority_(r.priority),
      status: String(r.status || "").trim(),
      payloadJson: String(r.payloadJson || "{}")
    };
    all.push(toSupabaseAdminEventRow_("assignment", row));
  });
  readRowsAsObjects_(getSheet_(ADMIN_CONFIG.RECURRING_SHEET)).forEach(function(r) {
    const row = {
      changedAt: String(r.changedAt || "").trim(),
      department: String(r.department || "").trim(),
      employeeName: String(r.employeeName || "").trim(),
      taskId: String(r.taskId || "").trim(),
      title: String(r.title || "").trim(),
      priority: normalizePriority_(r.priority),
      frequency: normalizeRecurringFrequency_(r.frequency),
      startDate: toIsoDate_(r.startDate),
      recurrenceWeekday: r.recurrenceWeekday,
      recurrenceDayOfMonth: r.recurrenceDayOfMonth,
      status: String(r.status || "").trim(),
      payloadJson: String(r.payloadJson || "{}")
    };
    all.push(toSupabaseAdminEventRow_("recurring", row));
  });
  readRowsAsObjects_(getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET)).forEach(function(r) {
    const row = {
      changedAt: String(r.changedAt || "").trim(),
      department: String(r.department || "").trim(),
      employeeName: String(r.employeeName || "").trim(),
      taskId: String(r.taskId || "").trim(),
      title: String(r.title || "").trim(),
      titleKey: String(r.titleKey || "").trim(),
      priority: normalizePriority_(r.priority),
      plannedHours: Number(r.plannedHours || 0),
      plannedMinutes: Number(r.plannedMinutes || 0),
      status: String(r.status || "").trim(),
      workDateRef: toIsoDate_(r.workDateRef),
      payloadJson: String(r.payloadJson || "{}")
    };
    all.push(toSupabaseAdminEventRow_("planner_task", row));
  });
  readRowsAsObjects_(getSheet_(ADMIN_CONFIG.PLANNER_CONSUMED_SHEET)).forEach(function(r) {
    const row = {
      changedAt: String(r.changedAt || "").trim(),
      department: String(r.department || "").trim(),
      employeeName: String(r.employeeName || "").trim(),
      titleKey: String(r.titleKey || "").trim(),
      sourceTaskId: String(r.sourceTaskId || "").trim(),
      consumedOn: toIsoDate_(r.consumedOn),
      payloadJson: String(r.payloadJson || "{}")
    };
    all.push(toSupabaseAdminEventRow_("planner_consumed", row));
  });

  if (!all.length) return { ok: true, inserted: 0 };
  const table = getAdminEventsSupabaseTable_();
  let inserted = 0;
  const batchSize = 250;
  for (let i = 0; i < all.length; i += batchSize) {
    const chunk = all.slice(i, i + batchSize);
    const endpoint = getSupabaseConfig_().url
      + "/rest/v1/" + encodeURIComponent(table)
      + "?on_conflict=" + encodeURIComponent("event_key");
    const res = UrlFetchApp.fetch(endpoint, {
      method: "post",
      muteHttpExceptions: true,
      headers: {
        apikey: getSupabaseConfig_().serviceRoleKey,
        Authorization: "Bearer " + getSupabaseConfig_().serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      payload: JSON.stringify(chunk)
    });
    const code = Number(res.getResponseCode() || 0);
    if (code < 200 || code >= 300) {
      throw new Error("Admin migration failed batch " + i + " (" + code + "): " + String(res.getContentText() || ""));
    }
    inserted += chunk.length;
  }
  return { ok: true, inserted: inserted };
}

function runAdminSheetsMigrationToSupabase() {
  return migrateAdminSheetsToSupabase_();
}

function normalizeRecurringFrequency_(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "daily") return "Daily";
  if (v === "weekly") return "Weekly";
  if (v === "monthly") return "Monthly";
  return "";
}

function normalizeRecurringWeekday_(value) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  const day = Math.floor(n);
  return day >= 0 && day <= 6 ? day : null;
}

function normalizeRecurringDayOfMonth_(value) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  const day = Math.floor(n);
  return day >= 1 && day <= 31 ? day : null;
}

function resolveRecurringWeekday_(frequency, primaryValue, secondaryValue, startDateISO) {
  const freq = normalizeRecurringFrequency_(frequency);
  if (freq !== "Weekly") return null;
  const primary = normalizeRecurringWeekday_(primaryValue);
  if (primary !== null) return primary;
  const secondary = normalizeRecurringWeekday_(secondaryValue);
  if (secondary !== null) return secondary;
  const start = parseIsoDate_(startDateISO);
  return start ? start.getDay() : null;
}

function resolveRecurringDayOfMonth_(frequency, primaryValue, secondaryValue, startDateISO) {
  const freq = normalizeRecurringFrequency_(frequency);
  if (freq !== "Monthly") return null;
  const primary = normalizeRecurringDayOfMonth_(primaryValue);
  if (primary !== null) return primary;
  const secondary = normalizeRecurringDayOfMonth_(secondaryValue);
  if (secondary !== null) return secondary;
  const start = parseIsoDate_(startDateISO);
  return start ? start.getDate() : null;
}

function isLaterRecurringEntry_(a, b) {
  if (!b) return true;
  if (String(a.workDate || "") !== String(b.workDate || "")) return String(a.workDate || "") > String(b.workDate || "");
  return String(a.submittedAt || "") > String(b.submittedAt || "");
}

function isRecurringDueOnDate_(frequency, startDateISO, workDateISO, recurrenceWeekday, recurrenceDayOfMonth) {
  const freq = normalizeRecurringFrequency_(frequency);
  const start = parseIsoDate_(startDateISO);
  const work = parseIsoDate_(workDateISO);
  if (!freq || !start || !work || work < start) return false;

  if (freq === "Daily") return true;
  if (freq === "Weekly") {
    const targetWeekday = resolveRecurringWeekday_(freq, recurrenceWeekday, null, startDateISO);
    if (targetWeekday === null) return false;
    return work.getDay() === targetWeekday;
  }
  if (freq === "Monthly") {
    const configuredDay = resolveRecurringDayOfMonth_(freq, recurrenceDayOfMonth, null, startDateISO);
    if (configuredDay === null) return false;
    const wd = work.getDate();
    const lastWorkDayOfMonth = new Date(work.getFullYear(), work.getMonth() + 1, 0).getDate();
    const dueDay = Math.min(configuredDay, lastWorkDayOfMonth);
    return wd === dueDay;
  }
  return false;
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
  const directory = getUserDirectoryMap_();
  Object.keys(directory || {}).forEach(function(dept) {
    const users = directory[dept] || {};
    Object.keys(users).forEach(function(name) {
      out.push({ department: dept, employeeName: name });
    });
  });
  return out;
}

function resolveUserCode_(department, employeeName) {
  const deptInput = String(department || "").trim();
  const empInput = String(employeeName || "").trim();
  if (!deptInput || !empInput) return "";

  const directory = getUserDirectoryMap_();
  const deptKey = resolveDepartmentKey_(directory, deptInput);
  if (!deptKey) return "";

  const users = directory[deptKey] || {};
  if (users[empInput]) return users[empInput];

  const nameKey = Object.keys(users).find(function(n) {
    return sameTextLocal_(n, empInput);
  });
  return nameKey ? String(users[nameKey] || "") : "";
}

function resolveUserForAssignment_(department, employeeName) {
  const deptInput = String(department || "").trim();
  const empInput = String(employeeName || "").trim();
  if (!deptInput || !empInput) return { ok: false };

  const directory = getUserDirectoryMap_();
  const deptKey = resolveDepartmentKey_(directory, deptInput);

  if (deptKey) {
    const users = directory[deptKey] || {};
    let nameKey = Object.prototype.hasOwnProperty.call(users, empInput) ? empInput : "";
    if (!nameKey) {
      nameKey = Object.keys(users).find(function(n) {
        return sameTextLocal_(n, empInput);
      }) || "";
    }
    if (nameKey) {
      return {
        ok: true,
        department: deptKey,
        employeeName: nameKey,
        accessCode: String(users[nameKey] || "")
      };
    }
  }

  const matches = [];
  Object.keys(directory).forEach(function(dep) {
    const users = directory[dep] || {};
    Object.keys(users).forEach(function(name) {
      if (!sameTextLocal_(name, empInput)) return;
      matches.push({
        department: dep,
        employeeName: name,
        accessCode: String(users[name] || "")
      });
    });
  });
  if (matches.length === 1) {
    return Object.assign({ ok: true }, matches[0]);
  }
  return { ok: false };
}

function resolveUserIdentity_(department, employeeName, accessCode) {
  const deptInput = String(department || "").trim();
  const empInput = String(employeeName || "").trim();
  const codeInput = String(accessCode || "").trim();
  if (!deptInput || !empInput || !codeInput) return { ok: false };

  const directory = getUserDirectoryMap_();
  const deptKey = resolveDepartmentKey_(directory, deptInput);
  if (!deptKey) return { ok: false };

  const users = directory[deptKey] || {};
  let nameKey = Object.prototype.hasOwnProperty.call(users, empInput) ? empInput : "";
  if (!nameKey) {
    nameKey = Object.keys(users).find(function(n) {
      return sameTextLocal_(n, empInput);
    }) || "";
  }
  if (!nameKey) return { ok: false };

  const expectedCode = String(users[nameKey] || "").trim();
  if (!expectedCode || !accessCodeMatches_(codeInput, expectedCode)) return { ok: false };
  return { ok: true, department: deptKey, employeeName: nameKey, accessCode: expectedCode };
}

function resolveDepartmentKey_(directory, department) {
  const deptInput = String(department || "").trim();
  if (!deptInput) return "";

  if (Object.prototype.hasOwnProperty.call(directory, deptInput)) return deptInput;

  const exactCaseInsensitive = Object.keys(directory).find(function(d) {
    return sameTextLocal_(d, deptInput);
  });
  if (exactCaseInsensitive) return exactCaseInsensitive;

  const targetCanonical = canonicalDepartmentName_(deptInput);
  if (!targetCanonical) return "";

  return Object.keys(directory).find(function(d) {
    return canonicalDepartmentName_(d) === targetCanonical;
  }) || "";
}

function canonicalDepartmentName_(value) {
  const key = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return "";
  if (key === "hr" || key === "humanresources") return "humanresources";
  if (key === "it" || key === "informationtechnology") return "informationtechnology";
  if (key === "op" || key === "operations") return "operations";
  if (key === "rs" || key === "research") return "research";
  if (key === "eq" || key === "equity") return "equity";
  if (key === "dr" || key === "directreportees") return "directreportees";
  if (key === "mk" || key === "marketing") return "marketing";
  return key;
}

function sameTextLocal_(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function accessCodeMatches_(providedCode, storedCode) {
  const provided = String(providedCode || "").trim();
  const stored = String(storedCode || "").trim();
  if (!provided || !stored) return false;
  if (provided === stored) return true;

  const decodedStored = decodeBase64TextSafe_(stored);
  if (decodedStored && decodedStored === provided) return true;

  const decodedProvided = decodeBase64TextSafe_(provided);
  if (decodedProvided && decodedProvided === stored) return true;

  return Boolean(decodedStored && decodedProvided && decodedStored === decodedProvided);
}

function departmentCodePrefix_(department) {
  const canonical = canonicalDepartmentName_(department);
  if (canonical === "informationtechnology") return "IT";
  if (canonical === "humanresources") return "HR";
  if (canonical === "operations") return "OP";
  if (canonical === "research") return "RS";
  if (canonical === "equity") return "EQ";
  if (canonical === "directreportees") return "DR";
  if (canonical === "marketing") return "MK";

  const raw = String(department || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!raw) return "US";
  return raw.slice(0, 3);
}

function employeeInitials_(employeeName) {
  const parts = String(employeeName || "")
    .trim()
    .split(/\s+/)
    .filter(function(p) { return p.length > 0; });
  if (!parts.length) return "XX";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase().padEnd(2, "X");
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function generateAccessCode_(department, employeeName, directory) {
  const existingCodes = {};
  const map = directory && typeof directory === "object" ? directory : {};
  Object.keys(map).forEach(function(dep) {
    const users = map[dep] || {};
    Object.keys(users).forEach(function(name) {
      const code = String(users[name] || "").trim();
      if (code) existingCodes[code] = true;
    });
  });

  const prefix = departmentCodePrefix_(department);
  const initials = employeeInitials_(employeeName);
  for (var i = 0; i < 200; i++) {
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const candidate = prefix + "-" + initials + "-" + digits;
    if (!existingCodes[candidate]) return candidate;
  }
  return prefix + "-" + initials + "-" + String(new Date().getTime()).slice(-4);
}

function generateAdminAccessCode_(adminName, adminDirectory) {
  const existing = {};
  const map = adminDirectory && typeof adminDirectory === "object" ? adminDirectory : {};
  Object.keys(map).forEach(function(name) {
    const rec = map[name] || {};
    const code = String(rec.code || "").trim();
    if (code) existing[code] = true;
  });

  const initials = employeeInitials_(adminName);
  for (var i = 0; i < 200; i++) {
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const candidate = "ADMIN-" + initials + "-" + digits;
    if (!existing[candidate]) return candidate;
  }
  return "ADMIN-" + initials + "-" + String(new Date().getTime()).slice(-4);
}

function decodeBase64TextSafe_(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const bytes = Utilities.base64DecodeWebSafe(raw);
    const text = Utilities.newBlob(bytes).getDataAsString().trim();
    if (text) return text;
  } catch (err) {
    // Ignore and try standard base64 decode below.
  }

  try {
    const bytes2 = Utilities.base64Decode(raw);
    const text2 = Utilities.newBlob(bytes2).getDataAsString().trim();
    if (text2) return text2;
  } catch (err2) {
    // Invalid base64 input.
  }

  return "";
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
  const p = String(preset || "last7").trim();
  const anchor = parseIsoDate_(anchorDate);
  const a = anchor || new Date();

  const range = { preset: p, fromDate: "", toDate: "", days: [] };
  let from = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  let to = new Date(a.getFullYear(), a.getMonth(), a.getDate());

  if (p === "last7") {
    from.setDate(from.getDate() - 6);
  } else if (p === "yesterday") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else if (p === "last_week") {
    const dayOfWeek = a.getDay(); // 0=Sun ... 6=Sat
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const thisWeekMonday = new Date(a.getFullYear(), a.getMonth(), a.getDate() - daysSinceMonday);
    from = new Date(thisWeekMonday.getFullYear(), thisWeekMonday.getMonth(), thisWeekMonday.getDate() - 7);
    to = new Date(thisWeekMonday.getFullYear(), thisWeekMonday.getMonth(), thisWeekMonday.getDate() - 1);
  } else if (p === "current_month") {
    from = new Date(a.getFullYear(), a.getMonth(), 1);
    to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  } else if (p === "last_month") {
    from = new Date(a.getFullYear(), a.getMonth() - 1, 1);
    to = new Date(a.getFullYear(), a.getMonth(), 0);
  } else if (p === "custom_day" || p === "today") {
    // from/to remain anchor date
    range.preset = "custom_day";
  } else {
    range.preset = "last7";
    from.setDate(from.getDate() - 6);
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

function buildCarryoverRows_(carryState, asOfDate, stage, leaveByEmployeeDate) {
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
        pendingSinceDate: String(t.carryStartDate || ""),
        pendingWorkingDays: countWorkingDaysExcludingSundayAndLeave_(
          t.carryStartDate,
          asOfDate,
          leaveByEmployeeDate && leaveByEmployeeDate[empKey]
        ),
        lastUpdatedDate: t.lastUpdatedDate
      });
    });
  });

  rows.sort(function(a, b) {
    if (a.pendingWorkingDays !== b.pendingWorkingDays) return b.pendingWorkingDays - a.pendingWorkingDays;
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

function buildCompletedTasksRows_(eodTimeline, range, leaveByEmployeeDate) {
  const fromDate = String(range && range.fromDate || "");
  const toDate = String(range && range.toDate || "");
  const taskStateByEmployee = {};
  const rows = [];
  (eodTimeline || []).forEach(function(eod) {
    if (!eod || !eod.payload) return;
    const empKey = employeeKey_(eod.department, eod.employeeName);
    if (!taskStateByEmployee[empKey]) taskStateByEmployee[empKey] = {};
    const stateByTask = taskStateByEmployee[empKey];
    const updates = ensureArray_(eod.payload.updates);
    updates.forEach(function(u) {
      const title = String(u.title || "").trim();
      if (!title) return;
      const taskId = String(u.taskId || "").trim();
      const taskKey = taskId ? ("id:" + taskId) : ("title:" + title.toLowerCase());
      const completion = Number(
        u.completionPercent != null ? u.completionPercent : (u.completion != null ? u.completion : u.progress)
      );
      if (!isFinite(completion)) return;

      if (!stateByTask[taskKey]) {
        stateByTask[taskKey] = {
          taskId: taskId,
          title: title,
          openSinceDate: "",
          lastCompletion: null,
          wasOpen: false
        };
      }

      const taskState = stateByTask[taskKey];
      if (!taskState.taskId && taskId) taskState.taskId = taskId;
      if (!taskState.title && title) taskState.title = title;

      if (completion < 100) {
        if (!taskState.wasOpen) {
          taskState.openSinceDate = String(eod.workDate || "");
          taskState.wasOpen = true;
        }
        taskState.lastCompletion = completion;
        return;
      }

      const transitionedToComplete = taskState.lastCompletion === null || Number(taskState.lastCompletion) < 100 || taskState.wasOpen;
      const addedDate = taskState.openSinceDate || String(eod.workDate || "");
      if (transitionedToComplete && eod.workDate >= fromDate && eod.workDate <= toDate) {
        rows.push({
          taskId: taskState.taskId || taskId,
          employeeName: String(eod.employeeName || ""),
          department: String(eod.department || ""),
          title: taskState.title || title,
          addedDate: addedDate,
          completedDate: String(eod.workDate || ""),
          daysTakenWorking: countWorkingDaysExcludingSundayAndLeave_(
            addedDate,
            String(eod.workDate || ""),
            leaveByEmployeeDate && leaveByEmployeeDate[empKey]
          ),
          completionPercent: Math.round(completion),
          submittedAt: String(eod.submittedAt || "")
        });
      }

      taskState.wasOpen = false;
      taskState.openSinceDate = "";
      taskState.lastCompletion = completion;
    });
  });

  rows.sort(function(a, b) {
    if (a.completedDate !== b.completedDate) return a.completedDate > b.completedDate ? -1 : 1;
    if (a.submittedAt !== b.submittedAt) return a.submittedAt > b.submittedAt ? -1 : 1;
    if (a.department !== b.department) return a.department < b.department ? -1 : 1;
    if (a.employeeName !== b.employeeName) return a.employeeName < b.employeeName ? -1 : 1;
    return a.title < b.title ? -1 : 1;
  });
  return rows;
}

function buildLeaveByEmployeeDateMap_(scopedEmployees, toDate) {
  const out = {};
  const scoped = Array.isArray(scopedEmployees) ? scopedEmployees : [];
  const byName = {};

  scoped.forEach(function(e) {
    const key = employeeKey_(e.department, e.employeeName);
    out[key] = out[key] || {};
    const n = String(e.employeeName || "").trim().toLowerCase();
    if (!n) return;
    if (!byName[n]) byName[n] = [];
    byName[n].push(e);
  });

  const leaveRows = readLeaveRowsFlexible_();
  leaveRows.forEach(function(r) {
    const leaveDate = toIsoDate_(r.date);
    if (!leaveDate) return;
    if (toDate && leaveDate > toDate) return;

    const leaveName = String(r.name || "").trim();
    if (!leaveName) return;
    const leaveDept = String(r.department || "").trim();

    let target = null;
    if (leaveDept) {
      const deptCanonical = canonicalDepartmentName_(leaveDept);
      target = scoped.find(function(e) {
        return canonicalDepartmentName_(e.department) === deptCanonical
          && sameTextLocal_(e.employeeName, leaveName);
      }) || null;
    }
    if (!target) {
      const nameMatches = byName[String(leaveName || "").trim().toLowerCase()] || [];
      if (nameMatches.length === 1) target = nameMatches[0];
    }
    if (!target) return;

    const empKey = employeeKey_(target.department, target.employeeName);
    if (!out[empKey]) out[empKey] = {};
    out[empKey][leaveDate] = true;
  });

  return out;
}

function readLeaveRowsFlexible_() {
  const sh = getSpreadsheet_().getSheetByName("Leave");
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (!values || !values.length) return [];

  const first = values[0].map(function(v) { return String(v || "").trim().toLowerCase(); });
  const findHeader = function(candidates) {
    for (var i = 0; i < first.length; i++) {
      var cell = first[i];
      for (var j = 0; j < candidates.length; j++) {
        if (cell === candidates[j] || cell.indexOf(candidates[j]) > -1) return i;
      }
    }
    return -1;
  };

  var dateCol = findHeader(["date", "leave date", "workdate", "work date"]);
  var nameCol = findHeader(["name", "employee", "employee name"]);
  var deptCol = findHeader(["department", "dept"]);
  var startRow = 1;

  if (dateCol < 0 || nameCol < 0) {
    startRow = 0;
    dateCol = 0;
    nameCol = 1;
    deptCol = 2;
  }

  const out = [];
  for (var r = startRow; r < values.length; r++) {
    const row = values[r] || [];
    out.push({
      date: row[dateCol],
      name: row[nameCol],
      department: deptCol >= 0 ? row[deptCol] : ""
    });
  }
  return out;
}

function countWorkingDaysExcludingSundayAndLeave_(fromISO, toISO, leaveDatesMap) {
  const from = parseIsoDate_(fromISO);
  const to = parseIsoDate_(toISO);
  if (!from || !to || to < from) return 0;

  const leaveMap = leaveDatesMap && typeof leaveDatesMap === "object" ? leaveDatesMap : {};
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let count = 0;

  while (d <= to) {
    if (d.getDay() !== 0) {
      const iso = formatIsoDate_(d);
      if (!leaveMap[iso]) count += 1;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
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

function normalizeAssignmentDeadlineDays_(value) {
  const n = Number(value);
  return n === 2 ? 2 : 1;
}

function addDaysToIsoDate_(isoDate, days) {
  const base = parseIsoDate_(isoDate);
  if (!base) return "";
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + Number(days || 0));
  return formatIsoDate_(d);
}

function getCliqEmailFromName_(name, department) {
  const full = String(name || "").trim();
  if (!full) return "";
  const emailMap = getUserEmailMap_();
  const dept = String(department || "").trim();
  if (dept && emailMap[dept] && emailMap[dept][full]) {
    return String(emailMap[dept][full] || "").trim();
  }
  const allMatches = [];
  Object.keys(emailMap || {}).forEach(function(dep) {
    const users = emailMap[dep] || {};
    Object.keys(users).forEach(function(n) {
      if (!sameTextLocal_(n, full)) return;
      const email = String(users[n] || "").trim();
      if (email) allMatches.push(email);
    });
  });
  if (allMatches.length === 1) return allMatches[0];
  return defaultEmailFromName_(full);
}

function parseJsonObject_(value) {
  try {
    const obj = JSON.parse(String(value || "{}"));
    return obj && typeof obj === "object" ? obj : {};
  } catch (err) {
    return {};
  }
}

function firstNameOnly_(value) {
  const full = String(value || "").trim();
  if (!full) return "";
  return full.split(/\s+/)[0] || full;
}
