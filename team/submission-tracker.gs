/**
 * Department-wise Submission Tracker (Zoho Flow / Cliq)
 *
 * Sends one message per department so Zoho Flow can route each to a different group.
 * Working-day logic is adapted from your old script:
 * - Org working day requires minimum distinct people activity
 * - Sundays and manual holidays are excluded
 * - Personal effective working days = personal working days minus leave
 */

const SUBMISSION_TRACKER_CONFIG = {
  SPREADSHEET_ID: "1JM2o-cwKuwWVe-Xwxar-jVAH_82wMuUJY4ct5whx7zg",
  TZ: "Asia/Kolkata",

  // Data sources from tracker workbook
  SUBMISSION_SHEET: "EOD", // count "submissions" from this sheet
  ACTIVE_DAY_SHEETS: ["SOD", "EOD"], // used for org/personal working-day activity
  LEAVE_SHEET: "Leave", // fallback leave source in primary workbook
  LEAVE_DATE_FIELD: "date",
  LEAVE_NAME_FIELD: "name",
  LEAVE_DEPT_FIELD: "department",
  LEAVE_REQUIRE_DEPARTMENT_MATCH: false,
  LEAVE_SOURCE: {
    ENABLED: true,
    SPREADSHEET_ID: "1tjz5vskU_6X-kEEk9ZYA-QK4P1wjlgPNjQGTmKOqRXs",
    SHEET: { name: "Leave", dateCol: 1, nameCol: 2, department: "Marketing" } // A=date, B=name
  },

  // Cycle window: 16th -> as-of date
  CYCLE_START_DAY: 16,

  // Working-day rules (from old code style)
  MIN_PEOPLE_FOR_ORG_WORKDAY: 3,
  EXCLUDED_WEEKDAYS: [0], // Sunday
  NON_WORKING_DAYS: [
    "2026-01-10", "2026-01-24", "2026-01-25", "2026-01-26",
    "2026-02-07", "2026-02-21",
    "2026-03-03", "2026-03-07", "2026-03-21",
    "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-18",
    "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-16", "2026-05-23",
    "2026-06-13", "2026-06-26", "2026-06-27", "2026-06-28",
    "2026-07-11", "2026-07-18", "2026-07-25",
    "2026-08-01", "2026-08-15", "2026-08-29",
    "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-26",
    "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-17", "2026-10-20",
    "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-28",
    "2026-12-12", "2026-12-25", "2026-12-26", "2026-12-27"
  ],

  INCLUDED_DEPARTMENTS: ["Marketing"], // run only for Marketing
  DEPARTMENT_MEMBERS: {
    Marketing: [
      "Aastha Tiwari",
      "Anas Ansari",
      "David Fernandes",
      "Deepti Baria",
      "Himanshi Makhe",
      "Omkar Kandalekar",
      "Pavan Dhake",
      "Pranav Kumar",
      "Renu Agarwal",
      "Shruti Wagaralkar"
    ]
  },
  ADDITIONAL_DEPARTMENT_MEMBERS: {
    Marketing: ["David Fernandes", "Pranav Kumar"]
  },
  // Keep tracker output limited to canonical configured members.
  // Disabling row-derived members avoids noisy names like "Aastha", "Anas, Deepti", etc.
  ALLOW_ROW_DERIVED_MEMBERS: false,
  IGNORE_NAME_CONTAINS: [
    "for previous day's submission use this form",
    "view form"
  ],

  EXTERNAL_TASK_SOURCE: {
    ENABLED: true,
    SPREADSHEET_ID: "1tjz5vskU_6X-kEEk9ZYA-QK4P1wjlgPNjQGTmKOqRXs",
    NAME_SHEET_RULES: {
      "David Fernandes": "Calling",
      "Pranav Kumar": "Calling"
    },
    SHEETS: [
      { name: "Current Team", dateCol: 3, nameCol: 9 },
      { name: "CompletedTasks", dateCol: 4, nameCol: 3 },
      { name: "Calling", dateCol: 3, nameCol: 22 }
    ]
  },

  // Routing
  TRACKER_WEBHOOK_URL: "https://flow.zoho.in/60027533273/flow/webhook/incoming?zapikey=1001.d239e76575e9045809160bb05d6d8ccf.16679b9de4ba576d98f21c43dc4435c5&isdebug=false",
  DEPARTMENT_WEBHOOKS: {
    // "Marketing": "https://flow.zoho.in/.../marketing...",
    // "Information Technology": "https://flow.zoho.in/.../it..."
  },

  // Avoid duplicate downstream messages.
  // Keep false unless your webhook explicitly requires form-data.
  ENABLE_FORM_FALLBACK: false
};

function runSubmissionTracker() {
  return runSubmissionTrackerForDate(new Date());
}

function runSubmissionTrackerYesterday() {
  const y = shiftISTDays_(new Date(), -1, SUBMISSION_TRACKER_CONFIG.TZ);
  return runSubmissionTrackerForDate(y);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Submission Tracker")
    .addItem("Run for Today", "runSubmissionTrackerFromMenu_")
    .addItem("Run for Yesterday", "runSubmissionTrackerYesterdayFromMenu_")
    .addToUi();
}

function runSubmissionTrackerFromMenu_() {
  const result = runSubmissionTracker();
  showTrackerRunResult_(result, "today");
}

function runSubmissionTrackerYesterdayFromMenu_() {
  const result = runSubmissionTrackerYesterday();
  showTrackerRunResult_(result, "yesterday");
}

function showTrackerRunResult_(result, label) {
  const ui = SpreadsheetApp.getUi();
  if (!result || result.ok !== true) {
    ui.alert("Submission tracker run failed for " + label + ".");
    return;
  }

  if (result.skipped) {
    ui.alert(
      "Submission tracker run for " + label + " skipped (" + String(result.reason || "unknown") + ")."
    );
    return;
  }

  ui.alert(
    "Submission tracker run for " + label + " completed. Messages sent: " + String(result.sent || 0)
  );
}

function runSubmissionTrackerForDate(asOfDate) {
  const cfg = SUBMISSION_TRACKER_CONFIG;
  const tz = cfg.TZ;
  const asOf = yMdToDate_(dateKey_(asOfDate, tz));
  const asOfKey = dateKey_(asOf, tz);

  if (isNonWorkingCalendarDay_(asOfKey, cfg)) {
    Logger.log("Non-working day (%s) - skipping.", asOfKey);
    return { ok: true, skipped: true, reason: "non_working_day", asOfDate: asOfKey, sent: 0 };
  }

  const cycle = getMonthCycleRange_(asOf, tz, cfg.CYCLE_START_DAY);
  const submissionRows = getRowsFromSheet_(cfg.SPREADSHEET_ID, cfg.SUBMISSION_SHEET);
  const activeRows = getRowsFromManySheets_(cfg.SPREADSHEET_ID, cfg.ACTIVE_DAY_SHEETS);
  const externalTaskRows = getExternalTaskRowsSafe_(cfg);
  const leaveRows = getLeaveRowsSafe_(cfg);

  const departments = getDepartmentMembersMap_(submissionRows, activeRows, externalTaskRows);
  const departmentNames = Object.keys(departments).sort();
  const results = [];

  for (var i = 0; i < departmentNames.length; i++) {
    const dept = departmentNames[i];
    const members = departments[dept];
    if (!members.length) continue;

    const report = buildDepartmentReport_(dept, members, submissionRows, activeRows, externalTaskRows, leaveRows, asOf, cycle, cfg);
    if (!report) continue;

    const payload = {
      department: dept,
      text: sanitizeOutboundMessage_(report.message),
      date: report.headerDate,
      asOfDateKey: asOfKey,
      cycleStart: cycle.startIso,
      cycleEnd: cycle.endIso,
      totalWorkingDays: report.totalWorkingDays,
      members: report.membersPayload
    };

    const webhook = String(cfg.DEPARTMENT_WEBHOOKS[dept] || cfg.TRACKER_WEBHOOK_URL || "").trim();
    if (!webhook) {
      results.push({ department: dept, sent: false, reason: "missing_webhook" });
      Logger.log("No webhook configured for department: %s", dept);
      continue;
    }

    sendToZohoFlowWithFallback_(webhook, payload);
    results.push({ department: dept, sent: true, webhook: webhook });
  }

  return { ok: true, skipped: false, asOfDate: asOfKey, sent: results.filter(function(r) { return r.sent; }).length, results: results };
}

function getZohoCliqPayloadForToday() {
  const cfg = SUBMISSION_TRACKER_CONFIG;
  const tz = cfg.TZ;
  const asOf = yMdToDate_(dateKey_(new Date(), tz));
  const cycle = getMonthCycleRange_(asOf, tz, cfg.CYCLE_START_DAY);
  const submissionRows = getRowsFromSheet_(cfg.SPREADSHEET_ID, cfg.SUBMISSION_SHEET);
  const activeRows = getRowsFromManySheets_(cfg.SPREADSHEET_ID, cfg.ACTIVE_DAY_SHEETS);
  const externalTaskRows = getExternalTaskRowsSafe_(cfg);
  const leaveRows = getLeaveRowsSafe_(cfg);
  const departments = getDepartmentMembersMap_(submissionRows, activeRows, externalTaskRows);
  const out = [];

  const names = Object.keys(departments).sort();
  for (var i = 0; i < names.length; i++) {
    const dept = names[i];
    const report = buildDepartmentReport_(dept, departments[dept], submissionRows, activeRows, externalTaskRows, leaveRows, asOf, cycle, cfg);
    if (!report) continue;
    out.push({
      department: dept,
      text: sanitizeOutboundMessage_(report.message),
      date: report.headerDate,
      totalWorkingDays: report.totalWorkingDays,
      members: report.membersPayload
    });
  }
  return out;
}

// Debug helper: list raw names that do not resolve to configured team members.
function auditUnknownTrackerNames_(department) {
  const cfg = SUBMISSION_TRACKER_CONFIG;
  const dept = String(department || "").trim() || "Marketing";
  const submissionRows = getRowsFromSheet_(cfg.SPREADSHEET_ID, cfg.SUBMISSION_SHEET);
  const activeRows = getRowsFromManySheets_(cfg.SPREADSHEET_ID, cfg.ACTIVE_DAY_SHEETS);
  const externalTaskRows = getExternalTaskRowsSafe_(cfg);
  const leaveRows = getLeaveRowsSafe_(cfg);
  const deptMembers = getDepartmentMembersMap_(submissionRows, activeRows, externalTaskRows)[dept] || [];
  const resolver = buildMemberNameResolver_(deptMembers);
  const unknown = {};

  var collectUnknown = function(rawName) {
    const raw = String(rawName || "").trim();
    if (!raw) return;
    if (isIgnoredName_(raw, cfg)) return;
    const resolved = resolveMemberName_(raw, resolver);
    if (resolved) return;
    unknown[raw] = (unknown[raw] || 0) + 1;
  };

  for (var i = 0; i < submissionRows.length; i++) {
    const r = submissionRows[i] || {};
    if (!sameText_(r.department, dept)) continue;
    collectUnknown(r.employeeName);
  }
  for (var a = 0; a < activeRows.length; a++) {
    const ar = activeRows[a] || {};
    if (!sameText_(ar.department, dept)) continue;
    collectUnknown(ar.employeeName);
  }
  for (var e = 0; e < externalTaskRows.length; e++) {
    const er = externalTaskRows[e] || {};
    if (!sameText_(er.department, dept)) continue;
    collectUnknown(er.employeeName);
  }
  for (var l = 0; l < leaveRows.length; l++) {
    const lr = leaveRows[l] || {};
    if (cfg.LEAVE_REQUIRE_DEPARTMENT_MATCH && !sameText_(readFirstPresent_(lr, [cfg.LEAVE_DEPT_FIELD, "department", "Department"]), dept)) continue;
    collectUnknown(readFirstPresent_(lr, [cfg.LEAVE_NAME_FIELD, "employeeName", "name", "Name"]));
  }

  const out = Object.keys(unknown).sort().map(function(name) {
    return { rawName: name, occurrences: unknown[name] };
  });
  Logger.log("Unknown tracker names for %s: %s", dept, JSON.stringify(out));
  return out;
}

function createDaily8pmTrackerTrigger() {
  ScriptApp.newTrigger("runSubmissionTracker")
    .timeBased()
    .atHour(20)
    .everyDays(1)
    .create();
}

function deleteTrackerTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    const fn = triggers[i].getHandlerFunction();
    if (fn === "runSubmissionTracker" || fn === "runTechSubmissionTracker") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

function buildDepartmentReport_(department, members, submissionRows, activeRows, externalTaskRows, leaveRows, asOfDate, cycle, cfg) {
  const tz = cfg.TZ;
  const asOfKey = dateKey_(asOfDate, tz);
  const headerDate = Utilities.formatDate(asOfDate, tz, "dd-MMM-yyyy");
  const trackerStartedDays = getInclusiveDaySpan_(cycle.startIso, cycle.endIso);
  const memberSet = toLookup_(members);
  const minPeopleForDept = Math.max(1, Math.min(Number(cfg.MIN_PEOPLE_FOR_ORG_WORKDAY || 1), members.length));

  const submissionsByPerson = {};
  const activeByPerson = {};
  const leaveByPerson = {};
  for (var i = 0; i < members.length; i++) {
    submissionsByPerson[members[i]] = {};
    activeByPerson[members[i]] = {};
    leaveByPerson[members[i]] = {};
  }

  const datePeople = {};
  const allActivityDates = {};
  const memberNameResolver = buildMemberNameResolver_(members);

  for (var s = 0; s < submissionRows.length; s++) {
    const row = submissionRows[s];
    if (!sameText_(row.department, department)) continue;
    const name = resolveMemberName_(String(row.employeeName || ""), memberNameResolver);
    if (!name || !memberSet[name]) continue;

    const dKey = toIsoDateSafe_(row.workDate, tz);
    if (!dKey || dKey < cycle.startIso || dKey > cycle.endIso) continue;

    submissionsByPerson[name][dKey] = true;
  }

  // External task presence counts as submitted/activity for that day.
  for (var ex = 0; ex < externalTaskRows.length; ex++) {
    const row = externalTaskRows[ex];
    if (!sameText_(row.department, department)) continue;
    const resolved = resolveMemberName_(String(row.employeeName || ""), memberNameResolver);
    if (!resolved || !memberSet[resolved]) continue;

    const dKey = toIsoDateSafe_(row.workDate, tz);
    if (!dKey || dKey < cycle.startIso || dKey > cycle.endIso) continue;

    submissionsByPerson[resolved][dKey] = true;
    activeByPerson[resolved][dKey] = true;
    allActivityDates[dKey] = true;
    if (!datePeople[dKey]) datePeople[dKey] = {};
    datePeople[dKey][resolved] = true;
  }

  for (var a = 0; a < activeRows.length; a++) {
    const row = activeRows[a];
    if (!sameText_(row.department, department)) continue;
    const name = resolveMemberName_(String(row.employeeName || ""), memberNameResolver);
    if (!name || !memberSet[name]) continue;

    const dKey = toIsoDateSafe_(row.workDate, tz);
    if (!dKey || dKey < cycle.startIso || dKey > cycle.endIso) continue;

    activeByPerson[name][dKey] = true;
    allActivityDates[dKey] = true;

    if (!datePeople[dKey]) datePeople[dKey] = {};
    datePeople[dKey][name] = true;
  }

  if (cfg.LEAVE_SHEET) {
    for (var l = 0; l < leaveRows.length; l++) {
      const row = leaveRows[l];
      const leaveDept = readFirstPresent_(row, [cfg.LEAVE_DEPT_FIELD, "department", "Department"]);
      if (cfg.LEAVE_REQUIRE_DEPARTMENT_MATCH && !sameText_(leaveDept, department)) continue;

      const name = resolveMemberName_(
        String(readFirstPresent_(row, [cfg.LEAVE_NAME_FIELD, "employeeName", "name", "Name"]) || ""),
        memberNameResolver
      );
      if (!name || !memberSet[name]) continue;

      const dKey = toIsoDateSafe_(readFirstPresent_(row, [cfg.LEAVE_DATE_FIELD, "workDate", "date", "Date"]), tz);
      if (!dKey || dKey < cycle.startIso || dKey > cycle.endIso) continue;
      leaveByPerson[name][dKey] = true;
    }
  }

  const orgWorkingDays = {};
  const activityDates = Object.keys(allActivityDates).sort();
  for (var d = 0; d < activityDates.length; d++) {
    const day = activityDates[d];
    if (isNonWorkingCalendarDay_(day, cfg)) continue;
    const peopleCount = datePeople[day] ? Object.keys(datePeople[day]).length : 0;
    if (peopleCount < minPeopleForDept) continue;
    orgWorkingDays[day] = true;
  }

  const orgWorkingDaysSorted = Object.keys(orgWorkingDays).sort();
  const totalWorkingDays = orgWorkingDaysSorted.length;

  const lines = [];
  lines.push("Submission Tracker for " + headerDate);
  lines.push("Department: " + department);
  lines.push("Total working days: " + totalWorkingDays);
  lines.push("New Tracker started since: " + trackerStartedDays + " day" + (trackerStartedDays === 1 ? "" : "s"));
  lines.push("");

  const membersPayload = [];
  const sortedMembers = members.slice().sort();
  for (var m = 0; m < sortedMembers.length; m++) {
    const person = sortedMembers[m];
    const personSubmission = submissionsByPerson[person];
    const personActivity = activeByPerson[person];
    const personLeave = leaveByPerson[person];

    const personalWorkingDays = {};
    for (var ow = 0; ow < orgWorkingDaysSorted.length; ow++) {
      personalWorkingDays[orgWorkingDaysSorted[ow]] = true;
    }

    const personActivityDays = Object.keys(personActivity);
    for (var pa = 0; pa < personActivityDays.length; pa++) {
      const dKey = personActivityDays[pa];
      if (isNonWorkingCalendarDay_(dKey, cfg)) continue;
      personalWorkingDays[dKey] = true;
    }

    const personalWorkingDaysSorted = Object.keys(personalWorkingDays).sort();
    const effectiveWorkingDaysList = [];
    for (var e = 0; e < personalWorkingDaysSorted.length; e++) {
      const dKey = personalWorkingDaysSorted[e];
      if (!personLeave[dKey]) effectiveWorkingDaysList.push(dKey);
    }

    var submissionCount = 0;
    for (var c = 0; c < effectiveWorkingDaysList.length; c++) {
      if (personSubmission[effectiveWorkingDaysList[c]]) submissionCount++;
    }

    const isOnLeaveToday = Boolean(personLeave[asOfKey]);
    const todaySubmitted = Boolean(personSubmission[asOfKey]);
    const todayStatus = isOnLeaveToday ? "ON LEAVE" : (todaySubmitted ? "✅" : "❌");

    const subWord = submissionCount === 1 ? "submission" : "submissions";
    const dayWord = effectiveWorkingDaysList.length === 1 ? "day" : "days";
    lines.push(person + " (" + submissionCount + " " + subWord + " in " + effectiveWorkingDaysList.length + " " + dayWord + ")");
    lines.push(todayStatus);
    lines.push("");

    membersPayload.push({
      name: person,
      submissions: submissionCount,
      totalWorkingDays: totalWorkingDays,
      effectiveWorkingDays: effectiveWorkingDaysList.length,
      leaveDays: countOverlapKeys_(personLeave, personalWorkingDays),
      todaySubmitted: todaySubmitted,
      onLeaveToday: isOnLeaveToday
    });
  }

  return {
    department: department,
    headerDate: headerDate,
    totalWorkingDays: totalWorkingDays,
    membersPayload: membersPayload,
    message: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  };
}

function getDepartmentMembersMap_() {
  const map = {};
  const include = SUBMISSION_TRACKER_CONFIG.INCLUDED_DEPARTMENTS || [];
  const explicitMembers = SUBMISSION_TRACKER_CONFIG.DEPARTMENT_MEMBERS || {};

  // Prefer explicit member definitions to avoid noisy names from raw sheet rows.
  const explicitDepts = Object.keys(explicitMembers);
  for (var em = 0; em < explicitDepts.length; em++) {
    const dept = explicitDepts[em];
    if (include.length && include.indexOf(dept) === -1) continue;
    const names = (explicitMembers[dept] || []).map(function(v) { return String(v || "").trim(); }).filter(Boolean).sort();
    if (names.length) map[dept] = names;
  }

  if (!Object.keys(map).length && typeof USER_DIRECTORY !== "undefined" && USER_DIRECTORY && typeof USER_DIRECTORY === "object") {
    const allDepts = Object.keys(USER_DIRECTORY);
    for (var i = 0; i < allDepts.length; i++) {
      const dept = allDepts[i];
      if (include.length && include.indexOf(dept) === -1) continue;
      const names = Object.keys(USER_DIRECTORY[dept] || {}).sort();
      if (names.length) map[dept] = names;
    }
  }

  // If USER_DIRECTORY is unavailable, optionally build department/member map from row data.
  if (!Object.keys(map).length && SUBMISSION_TRACKER_CONFIG.ALLOW_ROW_DERIVED_MEMBERS) {
    for (var a = 0; a < arguments.length; a++) {
      const rows = arguments[a] || [];
      for (var r = 0; r < rows.length; r++) {
        const dept = String(rows[r].department || "").trim();
        const name = String(rows[r].employeeName || "").trim();
        if (isIgnoredName_(name, SUBMISSION_TRACKER_CONFIG)) continue;
        if (!dept || !name) continue;
        if (include.length && include.indexOf(dept) === -1) continue;
        if (!map[dept]) map[dept] = [];
        if (map[dept].indexOf(name) === -1) map[dept].push(name);
      }
    }
  }

  const depts = Object.keys(map);
  for (var d = 0; d < depts.length; d++) map[depts[d]].sort();

  const extras = SUBMISSION_TRACKER_CONFIG.ADDITIONAL_DEPARTMENT_MEMBERS || {};
  const extraDepts = Object.keys(extras);
  for (var e = 0; e < extraDepts.length; e++) {
    const dept = extraDepts[e];
    if (include.length && include.indexOf(dept) === -1) continue;
    if (!map[dept]) map[dept] = [];
    const names = extras[dept] || [];
    for (var n = 0; n < names.length; n++) {
      const name = String(names[n] || "").trim();
      if (!name) continue;
      if (map[dept].indexOf(name) === -1) map[dept].push(name);
    }
    map[dept].sort();
  }

  return map;
}

function getRowsFromManySheets_(spreadsheetId, sheetNames) {
  const out = [];
  const names = sheetNames || [];
  for (var i = 0; i < names.length; i++) {
    const nm = String(names[i] || "").trim();
    if (!nm) continue;
    const rows = getRowsFromSheet_(spreadsheetId, nm);
    for (var r = 0; r < rows.length; r++) out.push(rows[r]);
  }
  return out;
}

function getRowsFromSheet_(spreadsheetId, sheetName) {
  const ss = openSpreadsheetSafe_(spreadsheetId, "primary");
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error("Sheet not found: " + sheetName);

  const values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(function(h) { return String(h || "").trim(); });
  const rows = [];

  for (var i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    rows.push(obj);
  }
  return rows;
}

function getRowsFromSheetSafe_(spreadsheetId, sheetName) {
  try {
    return getRowsFromSheet_(spreadsheetId, sheetName);
  } catch (err) {
    Logger.log("Optional sheet not found (%s). Continuing without it.", sheetName);
    return [];
  }
}

function getExternalTaskRowsSafe_(cfg) {
  const out = [];
  const ext = cfg.EXTERNAL_TASK_SOURCE || {};
  if (!ext.ENABLED) return out;
  const spreadsheetId = String(ext.SPREADSHEET_ID || "").trim();
  const nameSheetRules = ext.NAME_SHEET_RULES || {};
  if (!spreadsheetId) return out;

  try {
    const ss = openSpreadsheetSafe_(spreadsheetId, "external_task");
    const sheetDefs = ext.SHEETS || [];
    for (var i = 0; i < sheetDefs.length; i++) {
      const def = sheetDefs[i] || {};
      const sheetName = String(def.name || "").trim();
      const dateCol = Number(def.dateCol || 0);
      const nameCol = Number(def.nameCol || 0);
      if (!sheetName || !dateCol || !nameCol) continue;

      const sh = ss.getSheetByName(sheetName);
      if (!sh) continue;
      const lastRow = sh.getLastRow();
      const lastCol = sh.getLastColumn();
      if (lastRow < 2) continue;

      const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
      for (var r = 0; r < values.length; r++) {
        const row = values[r];
        const rawDate = row[dateCol - 1];
        const rawName = row[nameCol - 1];
        if (!rawDate || !rawName) continue;
        if (isIgnoredName_(rawName, cfg)) continue;

        // If a person has a forced source sheet rule, only count from that sheet.
        if (isRestrictedBySheetRule_(String(rawName || ""), sheetName, nameSheetRules)) continue;

        out.push({
          department: "Marketing",
          employeeName: String(rawName || "").trim(),
          workDate: rawDate
        });
      }
    }
  } catch (err) {
    Logger.log("External task source read skipped: %s", String(err));
  }
  return out;
}

function getLeaveRowsSafe_(cfg) {
  const src = cfg.LEAVE_SOURCE || {};
  if (src.ENABLED) {
    const spreadsheetId = String(src.SPREADSHEET_ID || "").trim();
    const shDef = src.SHEET || {};
    const sheetName = String(shDef.name || "").trim();
    const dateCol = Number(shDef.dateCol || 0);
    const nameCol = Number(shDef.nameCol || 0);
    const dept = String(shDef.department || "Marketing").trim();
    if (!spreadsheetId || !sheetName || !dateCol || !nameCol) return [];

    try {
      const ss = openSpreadsheetSafe_(spreadsheetId, "external_leave");
      const sh = ss.getSheetByName(sheetName);
      if (!sh) return [];
      const lastRow = sh.getLastRow();
      const lastCol = sh.getLastColumn();
      if (lastRow < 2) return [];

      const values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const out = [];
      for (var r = 0; r < values.length; r++) {
        const row = values[r];
        const rawDate = row[dateCol - 1];
        const rawName = row[nameCol - 1];
        if (!rawDate || !rawName) continue;
        if (isIgnoredName_(rawName, cfg)) continue;
        out.push({
          department: dept,
          name: String(rawName || "").trim(),
          date: rawDate
        });
      }
      return out;
    } catch (err) {
      Logger.log("External leave source read skipped: %s", String(err));
      return [];
    }
  }

  return cfg.LEAVE_SHEET ? getRowsFromSheetSafe_(cfg.SPREADSHEET_ID, cfg.LEAVE_SHEET) : [];
}

function sendToZohoFlowWithFallback_(webhookUrl, payloadObj) {
  const jsonOptions = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payloadObj),
    muteHttpExceptions: true
  };

  const res1 = UrlFetchApp.fetch(webhookUrl, jsonOptions);
  const code1 = res1.getResponseCode();
  const body1 = res1.getContentText();
  Logger.log("Zoho JSON send -> code: %s body: %s", code1, body1);

  if (code1 >= 200 && code1 < 300) return;
  if (!SUBMISSION_TRACKER_CONFIG.ENABLE_FORM_FALLBACK) {
    throw new Error("JSON send failed. Code: " + code1 + ". Body: " + body1);
  }

  const formPayload = {
    department: String(payloadObj.department || ""),
    text: String(payloadObj.text || ""),
    date: String(payloadObj.date || ""),
    totalWorkingDays: String(payloadObj.totalWorkingDays || ""),
    members: JSON.stringify(payloadObj.members || [])
  };
  const formOptions = { method: "post", payload: formPayload, muteHttpExceptions: true };
  const res2 = UrlFetchApp.fetch(webhookUrl, formOptions);
  const code2 = res2.getResponseCode();
  const body2 = res2.getContentText();
  Logger.log("Zoho FORM send -> code: %s body: %s", code2, body2);

  if (code2 < 200 || code2 >= 300) {
    throw new Error("Both JSON and FORM sends failed. Codes: " + code1 + " & " + code2 + ". Bodies: " + body1 + " || " + body2);
  }
}

function getMonthCycleRange_(dateObj, tz, cycleStartDay) {
  const y = Number(Utilities.formatDate(dateObj, tz, "yyyy"));
  const m = Number(Utilities.formatDate(dateObj, tz, "M"));
  const d = Number(Utilities.formatDate(dateObj, tz, "d"));
  var startYear = y;
  var startMonth = m;

  if (d < cycleStartDay) {
    startMonth -= 1;
    if (startMonth < 1) {
      startMonth = 12;
      startYear -= 1;
    }
  }

  const start = new Date(startYear, startMonth - 1, cycleStartDay);
  return {
    startIso: Utilities.formatDate(start, tz, "yyyy-MM-dd"),
    endIso: Utilities.formatDate(dateObj, tz, "yyyy-MM-dd")
  };
}

function toIsoDateSafe_(value, tz) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, tz, "yyyy-MM-dd");
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, tz, "yyyy-MM-dd");
  return "";
}

function sameText_(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function isNonWorkingCalendarDay_(isoDate, cfg) {
  if (!isoDate) return false;
  if ((cfg.NON_WORKING_DAYS || []).indexOf(isoDate) !== -1) return true;
  const dt = yMdToDate_(isoDate);
  return (cfg.EXCLUDED_WEEKDAYS || []).indexOf(dt.getDay()) !== -1;
}

function dateKey_(dt, tz) {
  return Utilities.formatDate(dt, tz, "yyyy-MM-dd");
}

function yMdToDate_(yMd) {
  const parts = String(yMd || "").split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function shiftISTDays_(dt, deltaDays, tz) {
  const base = yMdToDate_(dateKey_(dt, tz));
  base.setDate(base.getDate() + Number(deltaDays || 0));
  return base;
}

function toLookup_(arr) {
  const map = {};
  const a = arr || [];
  for (var i = 0; i < a.length; i++) map[String(a[i])] = true;
  return map;
}

function countOverlapKeys_(a, b) {
  var count = 0;
  const keys = Object.keys(a || {});
  for (var i = 0; i < keys.length; i++) if (b[keys[i]]) count++;
  return count;
}

function readFirstPresent_(obj, keys) {
  if (!obj) return "";
  const arr = keys || [];
  for (var i = 0; i < arr.length; i++) {
    const k = String(arr[i] || "").trim();
    if (!k) continue;
    if (Object.prototype.hasOwnProperty.call(obj, k) && String(obj[k] || "").trim() !== "") {
      return obj[k];
    }
  }
  return "";
}

function normalizeName_(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u00A0]/g, " ")
    .replace(/[.,()/\\\-_*+|'"`~:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMemberNameResolver_(members) {
  const byFull = {};
  const byFirst = {};
  const firstCounts = {};
  const list = members || [];

  for (var i = 0; i < list.length; i++) {
    const display = String(list[i] || "").trim();
    const norm = normalizeName_(display);
    if (!norm) continue;
    byFull[norm] = display;
    const first = norm.split(" ")[0] || norm;
    firstCounts[first] = (firstCounts[first] || 0) + 1;
  }
  for (var j = 0; j < list.length; j++) {
    const display = String(list[j] || "").trim();
    const norm = normalizeName_(display);
    if (!norm) continue;
    const first = norm.split(" ")[0] || norm;
    if (firstCounts[first] === 1) byFirst[first] = display;
  }

  return { byFull: byFull, byFirst: byFirst };
}

function resolveMemberName_(rawName, resolver) {
  if (isCompositeName_(rawName)) return "";
  const norm = normalizeName_(rawName);
  if (!norm) return "";
  if (resolver.byFull[norm]) return resolver.byFull[norm];

  const parts = norm.split(" ");
  for (var i = 0; i < parts.length; i++) {
    if (resolver.byFirst[parts[i]]) return resolver.byFirst[parts[i]];
  }
  return "";
}

function isCompositeName_(normalizedName) {
  const n = String(normalizedName || "").trim().toLowerCase();
  if (!n) return false;
  if (n.indexOf(",") !== -1 || n.indexOf("&") !== -1 || n.indexOf("+") !== -1 || n.indexOf("/") !== -1) return true;
  return /\band\b/.test(n);
}

function isRestrictedBySheetRule_(rawName, currentSheetName, rules) {
  const entries = Object.keys(rules || {});
  if (!entries.length) return false;
  for (var i = 0; i < entries.length; i++) {
    const person = entries[i];
    const requiredSheet = String(rules[person] || "").trim();
    if (!requiredSheet) continue;
    if (namesLookSame_(rawName, person) && !sameText_(currentSheetName, requiredSheet)) {
      return true;
    }
  }
  return false;
}

function namesLookSame_(a, b) {
  const na = normalizeName_(a);
  const nb = normalizeName_(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const af = na.split(" ")[0] || na;
  const bf = nb.split(" ")[0] || nb;
  return af && bf && af === bf;
}

function isIgnoredName_(rawName, cfg) {
  const n = normalizeName_(rawName);
  if (!n) return true;
  const phrases = (cfg && cfg.IGNORE_NAME_CONTAINS) ? cfg.IGNORE_NAME_CONTAINS : [];
  for (var i = 0; i < phrases.length; i++) {
    const p = normalizeName_(phrases[i]);
    if (p && n.indexOf(p) !== -1) return true;
  }
  return false;
}

function getInclusiveDaySpan_(startIso, endIso) {
  if (!startIso || !endIso) return 0;
  const s = yMdToDate_(startIso);
  const e = yMdToDate_(endIso);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86400000) + 1;
}

function openSpreadsheetSafe_(spreadsheetIdOrUrl, sourceLabel) {
  const normalizedId = normalizeSpreadsheetId_(spreadsheetIdOrUrl);
  if (!normalizedId) {
    throw new Error("Missing or invalid spreadsheet id for source: " + String(sourceLabel || "unknown"));
  }

  // In bound scripts, primary data should default to the active spreadsheet.
  if (String(sourceLabel || "") === "primary") {
    try {
      const activePrimary = SpreadsheetApp.getActiveSpreadsheet();
      if (activePrimary && activePrimary.getId) return activePrimary;
    } catch (ignore) {}
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active && active.getId && active.getId() === normalizedId) return active;

  var lastErr = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      return SpreadsheetApp.openById(normalizedId);
    } catch (err) {
      lastErr = err;
      Utilities.sleep(attempt * 250);
    }
  }

  // Some Apps Script environments intermittently fail with openById but succeed with URL.
  try {
    return SpreadsheetApp.openByUrl("https://docs.google.com/spreadsheets/d/" + normalizedId + "/edit");
  } catch (err2) {
    lastErr = err2 || lastErr;
  }

  throw new Error(
    "Unable to open spreadsheet (" + String(sourceLabel || "unknown") + ") id=" + normalizedId +
    ". Check ID format, sharing access, and Apps Script OAuth scopes for the account running this script. Original error: " + String(lastErr)
  );
}

function normalizeSpreadsheetId_(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const fromUrl = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = fromUrl ? fromUrl[1] : raw;
  return id.replace(/[^a-zA-Z0-9-_]/g, "");
}

function sanitizeOutboundMessage_(text) {
  const s = String(text || "");
  return s
    .replace(/^.*For previous day's submission use this form: View Form.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Backward-compatible aliases
function runTechSubmissionTracker() {
  return runSubmissionTracker();
}

function createDaily8pmTechTrackerTrigger() {
  createDaily8pmTrackerTrigger();
}

function deleteTechTrackerTriggers() {
  deleteTrackerTriggers();
}
