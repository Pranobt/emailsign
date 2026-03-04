const CONFIG = {
  SPREADSHEET_ID: "1JM2o-cwKuwWVe-Xwxar-jVAH_82wMuUJY4ct5whx7zg",
  SHEETS: {
    SOD: "SOD",
    EOD: "EOD",
    USER_DIRECTORY: "USER_DIRECTORY"
  },
  USER_DIRECTORY_HEADERS: [
    "changedAt",
    "department",
    "employeeName",
    "accessCode",
    "email",
    "changedBy",
    "source"
  ],
  HEADERS: [
    "submittedAt",
    "workDate",
    "department",
    "employeeName",
    "accessCode",
    "stage",
    "taskCount",
    "totalSpentMinutes",
    "payloadJson"
  ],
  QUEUE: {
    BACKUP_PROPERTY: "SHEETS_BACKUP_QUEUE_V1",
    MAX_ITEMS: 300,
    DRAIN_BATCH: 8,
    MAX_RETRIES: 25
  }
};

const USER_DIRECTORY = {
  "Information Technology": {
    "Shalin Bhavsar": "IT-SB-7391",
    "Pranav Shah": "IT-PS-1842",
    "Anoj Tambe": "IT-AT-5627",
    "Gunjan Rusia": "IT-GR-9034",
    "Thakur Prasad": "IT-TP-4478"
  },
  "Operations": {
    "Rahul Meher": "OP-RM-6183",
    "Nagma Shaikh": "OP-NS-8501",
    "Amit Lad": "OP-AL-3926",
    "Akshay Jadhav": "OP-AJ-7754"
  },
  "Human Resources": {
    "Vibha Vashistha": "HR-VV-6204",
    "Akshata Kochrekar": "HR-AK-7396",
    "Ajay Chariya": "HR-AC-6732",
    "Nimisha Gaonkar": "HR-NG-5182"
  },
  "Research": {
    "Humaid Khot": "RS-HK-4175",
    "Yash Asrani": "RS-YA-2864",
    "Vinjal Rao": "RS-VR-6412",
    "Ria Ignatious": "RS-RI-8097"
  },
  "Equity": {
    "Gaurav Haldankar": "EQ-GH-1539",
    "Milind Jain": "EQ-MJ-7204",
    "Ovesh Khatri": "EQ-OK-6427"
  },
  "Advisory": {
    "Rashi Panchal": "AD-RP-5791"
  },
  "Direct Reportees": {
    "Pranob Thachanthara": "DR-PT-3328",
    "Rajvi Gori": "DR-RG-6815",
    "Chintan Dudhela": "DR-CD-9043",
    "Sagar Maheshwari": "DR-SM-2576",
    "Jignesh Gajjar": "DR-JG-5462",
    "Jayant Furia": "DR-JF-1198",
    "Vandana Manwani": "DR-VM-8730",
    "Neha Sanghrajka": "HR-NS-4471",
    "Kainaz Tata": "HR-KT-2401",
    "Priyanka Kelkar": "DR-PK-4826",
    "Pravin Mayekar": "OP-PM-2749",
    "Riya Jain": "RS-RJ-5318",
    "Rushabh Dugad": "RS-RD-9620"
  },
  "Marketing": {
    "Aastha Tiwari": "MK-AT-4412",
    "Anas Ansari": "MK-AA-5837",
    "Deepti Baria": "MK-DB-7294",
    "Pavan Dhake": "MK-PD-3681",
    "Omkar Kandalekar": "MK-OK-9156",
    "Himanshi Makhe": "MK-HM-2407",
    "Renu Agarwal": "MK-RA-6543",
    "Shruti Wagaralkar": "MK-SW-7419"
  }
};


function doPost(e) {
  try {
    processBackupQueueSafe_();
    const body = parseRequestBody_(e);
    const action = String(body.action || "").trim();

    const adminRoute = routeAdminAction_(action, body);
    if (adminRoute) return adminRoute;

    if (action === "validateAccess") return handleValidateAccess_(body);
    if (action === "submitSOD") return handleSubmitSOD_(body);
    if (action === "submitEOD") return handleSubmitEOD_(body);
    if (action === "getCarryover") return handleGetCarryover_(body);

    return json_({ ok: false, message: "Unknown action." });
  } catch (err) {
    return json_({ ok: false, message: String(err) });
  }
}

function doGet(e) {
  try {
    processBackupQueueSafe_();
    var p = (e && e.parameter) ? e.parameter : {};
    var action = String(p.action || "").trim();
    var callback = String(p.callback || "").trim();

    if (!action) {
      return json_({ ok: true, service: "task-tracker-api" });
    }

    var body = {
      action: action,
      dept: p.dept,
      name: p.name,
      code: p.code || p.accessCode,
      department: p.department,
      employeeName: p.employeeName,
      accessCode: p.accessCode || p.code,
      workDate: p.workDate,
      clientVersion: p.clientVersion,
      admin: p.admin,
      stage: p.stage,
      rangePreset: p.rangePreset,
      tasks: p.tasks,
      updates: p.updates,
      taskIds: p.taskIds,
      titles: p.titles
    };

    var out;
    if (action === "validateAccess") out = handleValidateAccess_(body);
    else if (action === "getCarryover") out = handleGetCarryover_(body);
    else {
      var adminRoute = routeAdminAction_(action, body); // handles recurring/admin actions
      out = adminRoute || json_({ ok: false, message: "Unknown action." });
    }

    var text = out.getContent();
    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + text + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return out;
  } catch (err) {
    var fail = { ok: false, message: String(err) };
    var cb = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : "";
    if (cb) {
      return ContentService
        .createTextOutput(cb + "(" + JSON.stringify(fail) + ");")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return json_(fail);
  }
}


function handleValidateAccess_(body) {
  const dept = String(body.dept || body.department || "").trim();
  const name = String(body.name || body.employeeName || "").trim();
  const code = String(body.code || body.accessCode || "").trim();

  const valid = isValidUser_(dept, name, code);
  if (!valid) return json_({ ok: false, message: "Invalid access." });

  return json_({ ok: true, dept: dept, name: name });
}

function handleSubmitSOD_(body) {
  initializeTrackerSheets();

  const dept = String(body.department || "").trim();
  const name = String(body.employeeName || "").trim();
  const code = String(body.accessCode || body.code || "").trim();
  if (!isValidUser_(dept, name, code)) {
    return json_({ ok: false, message: "Invalid user identity." });
  }

  const tasks = ensureArray_(body.tasks);
  const cleaned = tasks
    .map(function(t) {
      return {
        taskId: String(t.taskId || "").trim(),
        title: String(t.title || "").trim(),
        priority: normalizePriority_(t.priority)
      };
    })
    .filter(function(t) { return t.title.length > 0; });

  if (!cleaned.length) return json_({ ok: false, message: "No tasks found for SOD." });

  const payload = Object.assign({}, body, {
    workDate: toIsoDate_(body.workDate),
    tasks: cleaned
  });

  const writeResult = writeSubmissionWithBackup_("SOD", payload, cleaned.length, 0);
  return json_(writeResult);
}

function handleSubmitEOD_(body) {
  initializeTrackerSheets();

  const dept = String(body.department || "").trim();
  const name = String(body.employeeName || "").trim();
  const code = String(body.accessCode || body.code || "").trim();
  if (!isValidUser_(dept, name, code)) {
    return json_({ ok: false, message: "Invalid user identity." });
  }

  const updates = ensureArray_(body.updates);
  const cleaned = [];
  let totalSpentMinutes = 0;

  for (var i = 0; i < updates.length; i++) {
    var u = updates[i] || {};
    var title = String(u.title || "").trim();
    if (!title) continue;

    var completion = Number(u.completionPercent);
    var spentHours = Number(u.spentHours);
    var spentMinutes = Number(u.spentMinutes);

    if (!isFinite(completion) || completion < 0 || completion > 100) {
      return json_({ ok: false, message: "Invalid completionPercent." });
    }
    if (!isFinite(spentHours) || spentHours < 0) {
      return json_({ ok: false, message: "Invalid spentHours." });
    }
    if (!isFinite(spentMinutes) || spentMinutes < 0 || spentMinutes > 59) {
      return json_({ ok: false, message: "Invalid spentMinutes." });
    }

    spentHours = Math.floor(spentHours);
    spentMinutes = Math.floor(spentMinutes);
    totalSpentMinutes += (spentHours * 60 + spentMinutes);

    cleaned.push({
      taskId: String(u.taskId || "").trim(),
      title: title,
      completionPercent: Math.round(completion),
      spentHours: spentHours,
      spentMinutes: spentMinutes,
      note: String(u.note || "").trim(),
      priority: normalizePriority_(u.priority),
      isExtra: Boolean(u.isExtra)
    });
  }

  if (!cleaned.length) return json_({ ok: false, message: "No updates found for EOD." });

  const payload = Object.assign({}, body, {
    workDate: toIsoDate_(body.workDate),
    updates: cleaned,
    totalSpentMinutes: totalSpentMinutes
  });

  const writeResult = writeSubmissionWithBackup_("EOD", payload, cleaned.length, totalSpentMinutes);
  return json_(writeResult);
}

function handleGetCarryover_(body) {
  initializeTrackerSheets();

  const dept = String(body.department || "").trim();
  const name = String(body.employeeName || "").trim();
  const code = String(body.accessCode || body.code || "").trim();
  const reqDate = toIsoDate_(body.workDate);

  if (!isValidUser_(dept, name, code)) {
    return json_({ ok: false, message: "Invalid user identity." });
  }
  if (!reqDate) return json_({ ok: false, message: "workDate required in YYYY-MM-DD." });

  const rows = getSubmissionRowsForCarryover_(dept, name, reqDate);
  const eodRows = rows.eodRows;
  const sodRows = rows.sodRows;

  var latestSubmissionDate = "";
  var latestByTaskKey = {};
  var latestCompletionByTaskKey = {};
  var openSinceByTaskKey = {};
  var normalizeTaskTitle_ = function(title) {
    return String(title || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ");
  };
  var getTaskKeys_ = function(taskId, title) {
    var keys = [];
    var id = String(taskId || "").trim();
    var text = normalizeTaskTitle_(title);
    if (id) keys.push("id:" + id);
    if (text) keys.push("title:" + text);
    return keys;
  };
  var getLatestFromMapByKeys_ = function(map, keys) {
    var best = null;
    for (var i = 0; i < keys.length; i++) {
      var entry = map[keys[i]];
      if (!entry) continue;
      if (!best || isLaterEntry_(entry, best)) best = entry;
    }
    return best;
  };
  var isLaterEntry_ = function(a, b) {
    if (!b) return true;
    if (String(a.workDate || "") !== String(b.workDate || "")) {
      return String(a.workDate || "") > String(b.workDate || "");
    }
    var aTs = parseTimeMs_(a.submittedAt);
    var bTs = parseTimeMs_(b.submittedAt);
    if (aTs && bTs && aTs !== bTs) return aTs > bTs;
    if (aTs && !bTs) return true;
    if (!aTs && bTs) return false;
    return String(a.submittedAt || "") > String(b.submittedAt || "");
  };

  for (var i = 0; i < eodRows.length; i++) {
    var r = eodRows[i];
    if (!sameText_(r.department, dept)) continue;
    if (!sameText_(r.employeeName, name)) continue;

    var rowDate = toIsoDate_(r.workDate);
    if (!rowDate || rowDate >= reqDate) continue;

    var submittedAt = String(r.submittedAt || "");
    if (!latestSubmissionDate || rowDate > latestSubmissionDate) {
      latestSubmissionDate = rowDate;
    }

    var payload = {};
    try {
      payload = JSON.parse(String(r.payloadJson || "{}"));
    } catch (e) {
      payload = {};
    }
    var updates = ensureArray_(payload && payload.updates);
    for (var u = 0; u < updates.length; u++) {
      var upd = updates[u] || {};
      var rawCompletion = upd.completionPercent;
      if (rawCompletion == null || rawCompletion === "") {
        rawCompletion = upd.completion;
      }
      if (rawCompletion == null || rawCompletion === "") {
        rawCompletion = upd.progress;
      }
      var completion = Number(rawCompletion);
      if (!isFinite(completion) && rawCompletion != null) {
        var parsedCompletion = Number(String(rawCompletion).replace("%", "").trim());
        if (isFinite(parsedCompletion)) completion = parsedCompletion;
      }
      if (!isFinite(completion)) continue;

      var taskId = String(upd.taskId || "").trim();
      var title = String(upd.title || "").trim();
      if (!taskId && !title) continue;

      var keys = getTaskKeys_(taskId, title);
      if (!keys.length) continue;
      var key = keys[0];
      var completionCandidate = {
        completion: completion,
        workDate: rowDate,
        submittedAt: submittedAt
      };
      for (var ck = 0; ck < keys.length; ck++) {
        var completionKey = keys[ck];
        var prevCompletionEntry = latestCompletionByTaskKey[completionKey];
        if (!prevCompletionEntry || isLaterEntry_(completionCandidate, prevCompletionEntry)) {
          latestCompletionByTaskKey[completionKey] = completionCandidate;
        }
      }
      if (completion >= 100) {
        delete openSinceByTaskKey[key];
      } else if (!openSinceByTaskKey[key]) {
        openSinceByTaskKey[key] = rowDate;
      }
      var candidate = {
        taskId: taskId,
        title: title,
        priority: normalizePriority_(upd.priority),
        completion: completion,
        note: String(upd.note || "").trim(),
        addedDate: String(openSinceByTaskKey[key] || rowDate || ""),
        workDate: rowDate,
        submittedAt: submittedAt
      };
      var prev = latestByTaskKey[key];
      if (!prev || isLaterEntry_(candidate, prev)) {
        latestByTaskKey[key] = candidate;
      }
    }
  }

  // Backfill from previous-day SOD for tasks missing in EOD (or no EOD submitted).
  var reqDateObj = new Date(reqDate + "T00:00:00");
  if (!isNaN(reqDateObj.getTime())) {
    var prevDateObj = new Date(reqDateObj.getTime());
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    var prevDate = Utilities.formatDate(prevDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");

    var latestSodPrev = null;
    for (var s = 0; s < sodRows.length; s++) {
      var sodRow = sodRows[s] || {};
      if (!sameText_(sodRow.department, dept)) continue;
      if (!sameText_(sodRow.employeeName, name)) continue;
      if (toIsoDate_(sodRow.workDate) !== prevDate) continue;
      if (
        !latestSodPrev ||
        String(sodRow.submittedAt || "") > String(latestSodPrev.submittedAt || "")
      ) {
        latestSodPrev = sodRow;
      }
    }

    if (latestSodPrev) {
      var eodByKey = {};
      var relevantEodRows = [];
      for (var e = 0; e < eodRows.length; e++) {
        var eodRow = eodRows[e] || {};
        if (!sameText_(eodRow.department, dept)) continue;
        if (!sameText_(eodRow.employeeName, name)) continue;
        var eodWorkDate = toIsoDate_(eodRow.workDate);
        if (eodWorkDate !== prevDate && eodWorkDate !== reqDate) continue;
        relevantEodRows.push(eodRow);
      }

      for (var er = 0; er < relevantEodRows.length; er++) {
        var eodSourceRow = relevantEodRows[er] || {};
        var sourceWorkDate = toIsoDate_(eodSourceRow.workDate);
        var sourceSubmittedAt = String(eodSourceRow.submittedAt || "");
        var eodPayload = {};
        try {
          eodPayload = JSON.parse(String(eodSourceRow.payloadJson || "{}"));
        } catch (eodErr) {
          eodPayload = {};
        }
        var eodUpdates = ensureArray_(eodPayload && eodPayload.updates);
        for (var eu = 0; eu < eodUpdates.length; eu++) {
          var updPrev = eodUpdates[eu] || {};
          var updTaskId = String(updPrev.taskId || "").trim();
          var updTitle = String(updPrev.title || "").trim();
          if (!updTaskId && !updTitle) continue;

          var updCompletion = Number(updPrev.completionPercent);
          if (!isFinite(updCompletion)) updCompletion = Number(updPrev.completion);
          if (!isFinite(updCompletion)) updCompletion = Number(updPrev.progress);
          if (!isFinite(updCompletion)) updCompletion = 0;

          var updKeys = getTaskKeys_(updTaskId, updTitle);
          var eodEntry = {
            completion: updCompletion,
            note: String(updPrev.note || "").trim(),
            priority: normalizePriority_(updPrev.priority),
            workDate: sourceWorkDate,
            submittedAt: sourceSubmittedAt
          };
          for (var uk = 0; uk < updKeys.length; uk++) {
            var updKey = updKeys[uk];
            var existingEodEntry = eodByKey[updKey];
            if (!existingEodEntry || isLaterEntry_(eodEntry, existingEodEntry)) {
              eodByKey[updKey] = eodEntry;
            }
          }
        }
      }

      var sodPayloadPrev = {};
      try {
        sodPayloadPrev = JSON.parse(String(latestSodPrev.payloadJson || "{}"));
      } catch (sodErr) {
        sodPayloadPrev = {};
      }
      var sodTasksPrev = ensureArray_(sodPayloadPrev.tasks).length
        ? ensureArray_(sodPayloadPrev.tasks)
        : ensureArray_(sodPayloadPrev.updates);

      for (var st = 0; st < sodTasksPrev.length; st++) {
        var sodTask = sodTasksPrev[st] || {};
        var sodTaskId = String(sodTask.taskId || sodTask.id || "").trim();
        var sodTitle = String(sodTask.title || sodTask.task || sodTask.name || "").trim();
        if (!sodTaskId && !sodTitle) continue;

        var sodKeys = getTaskKeys_(sodTaskId, sodTitle);
        if (!sodKeys.length) continue;
        var sodKey = sodKeys[0];
        var completionHistory = getLatestFromMapByKeys_(latestCompletionByTaskKey, sodKeys);
        if (completionHistory && Number(completionHistory.completion) >= 100) {
          delete openSinceByTaskKey[sodKey];
          continue;
        }
        var eodMatch = getLatestFromMapByKeys_(eodByKey, sodKeys);
        var sodCompletion = eodMatch ? Number(eodMatch.completion || 0) : 0;
        var existingFromHistory = getLatestFromMapByKeys_(latestByTaskKey, sodKeys);

        // If latest EOD does not include this task, keep previously derived completion from EOD history
        // (important when multiple EOD submissions exist on the same day).
        if (!eodMatch && existingFromHistory) {
          continue;
        }

        if (sodCompletion >= 100) {
          delete openSinceByTaskKey[sodKey];
          continue;
        }

        if (!openSinceByTaskKey[sodKey]) {
          openSinceByTaskKey[sodKey] = prevDate;
        }

        var sodCandidate = {
          taskId: sodTaskId,
          title: sodTitle,
          priority: normalizePriority_(eodMatch && eodMatch.priority ? eodMatch.priority : sodTask.priority),
          completion: sodCompletion,
          note: eodMatch ? String(eodMatch.note || "").trim() : "",
          addedDate: String(openSinceByTaskKey[sodKey] || prevDate || ""),
          workDate: prevDate,
          submittedAt: String(eodMatch ? (eodMatch.submittedAt || "") : (latestSodPrev.submittedAt || ""))
        };
        var existing = latestByTaskKey[sodKey];
        if (!existing || isLaterEntry_(sodCandidate, existing)) {
          latestByTaskKey[sodKey] = sodCandidate;
        }
      }

      if (!latestSubmissionDate || prevDate > latestSubmissionDate) {
        latestSubmissionDate = prevDate;
      }
    }
  }

  if (!latestSubmissionDate) return json_({ ok: true, tasks: [], sourceWorkDate: "" });

  var tasks = Object.keys(latestByTaskKey).map(function(key) {
    var t = latestByTaskKey[key];
    if (!t) return null;
    if (Number(t.completion) >= 100) return null;
    return {
      taskId: String(t.taskId || "").trim() || Utilities.getUuid(),
      title: String(t.title || "").trim(),
      priority: normalizePriority_(t.priority),
      addedDate: String(t.addedDate || ""),
      lastCompletion: Number(t.completion),
      lastNote: String(t.note || "").trim()
    };
  }).filter(function(t) {
    return t && t.title.length > 0;
  });

  return json_({
    ok: true,
    tasks: tasks,
    sourceWorkDate: latestSubmissionDate
  });
}

/* Shared helpers */

function getSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var enabledRaw = String(props.getProperty("SUPABASE_ENABLED") || "").trim().toLowerCase();
  var enabled = enabledRaw === "true" || enabledRaw === "1" || enabledRaw === "yes";
  var url = String(props.getProperty("SUPABASE_URL") || "").trim().replace(/\/+$/, "");
  var serviceRoleKey = String(props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  var table = String(props.getProperty("SUPABASE_SUBMISSIONS_TABLE") || "task_submissions").trim();
  return {
    enabled: enabled && !!url && !!serviceRoleKey,
    url: url,
    serviceRoleKey: serviceRoleKey,
    table: table || "task_submissions"
  };
}

function isSupabaseEnabled_() {
  return getSupabaseConfig_().enabled;
}

function supabaseRequest_(method, path, payload, queryParams) {
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) throw new Error("Supabase is not configured.");
  var query = "";
  if (queryParams && typeof queryParams === "object") {
    var keys = Object.keys(queryParams);
    if (keys.length) {
      query = "?" + keys.map(function(k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(String(queryParams[k]));
      }).join("&");
    }
  }
  var endpoint = cfg.url + path + query;
  var options = {
    method: String(method || "get").toUpperCase(),
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: "Bearer " + cfg.serviceRoleKey,
      "Content-Type": "application/json"
    }
  };
  if (payload != null) {
    options.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch(endpoint, options);
  var status = Number(res.getResponseCode() || 0);
  var text = String(res.getContentText() || "");
  var parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (err) {
    parsed = null;
  }
  if (status >= 200 && status < 300) {
    return parsed;
  }
  throw new Error("Supabase request failed (" + status + "): " + (text || "empty response"));
}

function toSupabaseSubmissionRow_(stage, payload, taskCount, totalSpentMinutes) {
  return {
    request_id: String(payload.requestId || payload.requestID || "").trim() || null,
    stage: String(stage || payload.stage || "").trim().toUpperCase(),
    submitted_at: String(payload.submittedAt || new Date().toISOString()),
    work_date: toIsoDate_(payload.workDate),
    department: String(payload.department || "").trim(),
    employee_name: String(payload.employeeName || "").trim(),
    access_code: String(payload.accessCode || payload.code || "").trim(),
    task_count: Number(taskCount || 0),
    total_spent_minutes: Number(totalSpentMinutes || 0),
    payload_json: payload && typeof payload === "object" ? payload : {}
  };
}

function saveSubmissionToSupabase_(stage, payload, taskCount, totalSpentMinutes) {
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) return { ok: false, skipped: true };
  var row = toSupabaseSubmissionRow_(stage, payload, taskCount, totalSpentMinutes);
  var headers = {
    Prefer: "resolution=ignore-duplicates,return=minimal"
  };
  var endpoint = cfg.url + "/rest/v1/" + encodeURIComponent(cfg.table);
  var options = {
    method: "post",
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: "Bearer " + cfg.serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: headers.Prefer
    },
    payload: JSON.stringify([row])
  };
  var res = UrlFetchApp.fetch(endpoint, options);
  var status = Number(res.getResponseCode() || 0);
  if (status >= 200 && status < 300) {
    return { ok: true };
  }
  var text = String(res.getContentText() || "");
  return { ok: false, message: "Supabase write failed (" + status + "): " + (text || "empty response") };
}

function fetchSubmissionRowsFromSupabase_(stage, department, employeeName, opts) {
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) return [];
  var params = {
    select: "submitted_at,work_date,department,employee_name,access_code,stage,task_count,total_spent_minutes,payload_json",
    stage: "eq." + String(stage || "").trim().toUpperCase(),
    department: "eq." + String(department || "").trim(),
    employee_name: "eq." + String(employeeName || "").trim(),
    order: "submitted_at.asc",
    limit: String(Number((opts && opts.limit) || 2000))
  };
  if (opts && opts.workDateLt) params.work_date = "lt." + String(opts.workDateLt).trim();
  if (opts && opts.workDateLte) params.work_date = "lte." + String(opts.workDateLte).trim();
  if (opts && opts.workDateEq) params.work_date = "eq." + String(opts.workDateEq).trim();

  var rows = supabaseRequest_("GET", "/rest/v1/" + encodeURIComponent(cfg.table), null, params);
  var list = Array.isArray(rows) ? rows : [];
  return list.map(function(r) {
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

function getSubmissionRowsForCarryover_(dept, name, reqDate) {
  if (!isSupabaseEnabled_()) {
    return {
      eodRows: readRowsAsObjects_(getSheet_(CONFIG.SHEETS.EOD)),
      sodRows: readRowsAsObjects_(getSheet_(CONFIG.SHEETS.SOD))
    };
  }
  try {
    var reqDateObj = new Date(reqDate + "T00:00:00");
    var prevDate = "";
    if (!isNaN(reqDateObj.getTime())) {
      reqDateObj.setDate(reqDateObj.getDate() - 1);
      prevDate = Utilities.formatDate(reqDateObj, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    var eodRows = fetchSubmissionRowsFromSupabase_("EOD", dept, name, { workDateLt: reqDate, limit: 3000 });
    var sodRows = fetchSubmissionRowsFromSupabase_("SOD", dept, name, { workDateLte: reqDate, limit: 3000 });
    if (prevDate) {
      var prevEodRows = fetchSubmissionRowsFromSupabase_("EOD", dept, name, { workDateEq: prevDate, limit: 500 });
      if (prevEodRows.length) eodRows = eodRows.concat(prevEodRows);
    }
    return { eodRows: eodRows, sodRows: sodRows, source: "supabase" };
  } catch (err) {
    return {
      eodRows: readRowsAsObjects_(getSheet_(CONFIG.SHEETS.EOD)),
      sodRows: readRowsAsObjects_(getSheet_(CONFIG.SHEETS.SOD)),
      source: "sheets-fallback",
      error: String(err && err.message ? err.message : err)
    };
  }
}

function readBackupQueue_() {
  var raw = String(PropertiesService.getScriptProperties().getProperty(CONFIG.QUEUE.BACKUP_PROPERTY) || "").trim();
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeBackupQueue_(items) {
  var list = Array.isArray(items) ? items.slice(-CONFIG.QUEUE.MAX_ITEMS) : [];
  PropertiesService.getScriptProperties().setProperty(CONFIG.QUEUE.BACKUP_PROPERTY, JSON.stringify(list));
}

function enqueueBackupWrite_(sheetName, payload, taskCount, totalSpentMinutes, reason) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var queue = readBackupQueue_();
    queue.push({
      sheetName: String(sheetName || ""),
      payload: payload && typeof payload === "object" ? payload : {},
      taskCount: Number(taskCount || 0),
      totalSpentMinutes: Number(totalSpentMinutes || 0),
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
      lastError: String(reason || "")
    });
    writeBackupQueue_(queue);
  } finally {
    lock.releaseLock();
  }
}

function processBackupQueueSafe_() {
  try {
    processBackupQueue_(CONFIG.QUEUE.DRAIN_BATCH);
  } catch (err) {
    // Non-blocking queue processing.
  }
}

function processBackupQueue_(batchSize) {
  var maxBatch = Math.max(1, Number(batchSize || CONFIG.QUEUE.DRAIN_BATCH));
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var queue = readBackupQueue_();
    if (!queue.length) return;
    var remaining = [];
    var processed = 0;
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i] || {};
      if (processed >= maxBatch) {
        remaining.push(item);
        continue;
      }
      try {
        appendSubmissionRow_(
          String(item.sheetName || ""),
          item.payload || {},
          Number(item.taskCount || 0),
          Number(item.totalSpentMinutes || 0)
        );
        processed += 1;
      } catch (err) {
        item.attempts = Number(item.attempts || 0) + 1;
        item.lastError = String(err && err.message ? err.message : err);
        if (item.attempts < CONFIG.QUEUE.MAX_RETRIES) {
          remaining.push(item);
        }
      }
    }
    writeBackupQueue_(remaining);
  } finally {
    lock.releaseLock();
  }
}

function writeSubmissionWithBackup_(stage, payload, taskCount, totalSpentMinutes) {
  var stageKey = String(stage || "").trim().toUpperCase();
  var targetSheet = stageKey === "EOD" ? CONFIG.SHEETS.EOD : CONFIG.SHEETS.SOD;
  var useSupabase = isSupabaseEnabled_();

  if (useSupabase) {
    var sb = saveSubmissionToSupabase_(stageKey, payload, taskCount, totalSpentMinutes);
    if (!sb.ok) {
      return { ok: false, message: sb.message || "Could not submit to primary storage." };
    }
    try {
      appendSubmissionRow_(targetSheet, payload, taskCount, totalSpentMinutes);
      return { ok: true };
    } catch (sheetErr) {
      enqueueBackupWrite_(targetSheet, payload, taskCount, totalSpentMinutes, String(sheetErr && sheetErr.message ? sheetErr.message : sheetErr));
      return { ok: true, backupQueued: true, warning: "Primary submit saved. Google Sheet backup queued." };
    }
  }

  var wasDuplicate = withSubmissionLock_(function() {
    if (isRecentDuplicateSubmission_(targetSheet, payload, taskCount, totalSpentMinutes, stageKey)) {
      return true;
    }
    appendSubmissionRow_(targetSheet, payload, taskCount, totalSpentMinutes);
    return false;
  });
  if (wasDuplicate) return { ok: true, duplicateIgnored: true };
  return { ok: true };
}

function initializeTrackerSheets() {
  ensureSheet_(CONFIG.SHEETS.SOD, CONFIG.HEADERS);
  ensureSheet_(CONFIG.SHEETS.EOD, CONFIG.HEADERS);
}

function appendSubmissionRow_(sheetName, payload, taskCount, totalSpentMinutes) {
  const sh = getSheet_(sheetName);
  const submittedAt = String(payload.submittedAt || new Date().toISOString());
  const workDate = toIsoDate_(payload.workDate);
  const department = String(payload.department || "");
  const employeeName = String(payload.employeeName || "");
  const accessCode = String(payload.accessCode || payload.code || "");
  const stage = String(payload.stage || sheetName);
  const count = Number(taskCount || 0);
  const total = Number(totalSpentMinutes || payload.totalSpentMinutes || 0);

  sh.appendRow([
    submittedAt,
    workDate,
    department,
    employeeName,
    accessCode,
    stage,
    count,
    total,
    JSON.stringify(payload)
  ]);
}

function withSubmissionLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function isRecentDuplicateSubmission_(sheetName, payload, taskCount, totalSpentMinutes, stage) {
  const sheet = getSheet_(sheetName);
  const rows = readRowsAsObjects_(sheet);
  if (!rows.length) return false;

  const dept = String(payload.department || "").trim();
  const employeeName = String(payload.employeeName || "").trim();
  const workDate = toIsoDate_(payload.workDate);
  const stageText = String(stage || payload.stage || sheetName || "").trim();
  const count = Number(taskCount || 0);
  const total = Number(totalSpentMinutes || payload.totalSpentMinutes || 0);
  const nowMs = Date.now();
  const lookbackMs = 3 * 60 * 1000; // 3 minutes
  const incomingFingerprint = buildSubmissionFingerprint_(payload, stageText);

  for (var i = rows.length - 1; i >= 0; i--) {
    const row = rows[i] || {};
    const rowDept = String(row.department || "").trim();
    const rowEmployee = String(row.employeeName || "").trim();
    const rowWorkDate = toIsoDate_(row.workDate);
    const rowStage = String(row.stage || "").trim();
    const rowCount = Number(row.taskCount || 0);
    const rowTotal = Number(row.totalSpentMinutes || 0);

    if (!sameText_(rowDept, dept)) continue;
    if (!sameText_(rowEmployee, employeeName)) continue;
    if (rowWorkDate !== workDate) continue;
    if (!sameText_(rowStage, stageText)) continue;
    if (rowCount !== count) continue;
    if (rowTotal !== total) continue;

    const rowTs = parseTimeMs_(row.submittedAt);
    if (!rowTs || (nowMs - rowTs) > lookbackMs) break;

    const rowPayload = parseJsonSafe_(row.payloadJson);
    const rowFingerprint = buildSubmissionFingerprint_(rowPayload, rowStage || stageText);
    if (rowFingerprint === incomingFingerprint) return true;
  }

  return false;
}

function buildSubmissionFingerprint_(payload, stage) {
  const p = payload && typeof payload === "object" ? payload : {};
  const stageText = String(stage || p.stage || "").trim().toUpperCase();

  const base = {
    stage: stageText,
    department: String(p.department || "").trim(),
    employeeName: String(p.employeeName || "").trim(),
    workDate: toIsoDate_(p.workDate)
  };

  if (stageText === "SOD") {
    base.tasks = ensureArray_(p.tasks).map(function(t) {
      return {
        taskId: String(t && t.taskId || "").trim(),
        title: String(t && t.title || "").trim(),
        priority: normalizePriority_(t && t.priority)
      };
    }).filter(function(t) {
      return t.title.length > 0;
    }).sort(function(a, b) {
      const ak = a.taskId + "|" + a.title + "|" + a.priority;
      const bk = b.taskId + "|" + b.title + "|" + b.priority;
      return ak < bk ? -1 : (ak > bk ? 1 : 0);
    });
  } else {
    base.updates = ensureArray_(p.updates).map(function(u) {
      return {
        taskId: String(u && u.taskId || "").trim(),
        title: String(u && u.title || "").trim(),
        completionPercent: Number(u && u.completionPercent || 0),
        spentHours: Number(u && u.spentHours || 0),
        spentMinutes: Number(u && u.spentMinutes || 0),
        note: String(u && u.note || "").trim(),
        priority: normalizePriority_(u && u.priority),
        isExtra: Boolean(u && u.isExtra)
      };
    }).filter(function(u) {
      return u.title.length > 0;
    }).sort(function(a, b) {
      const ak = a.taskId + "|" + a.title + "|" + a.completionPercent + "|" + a.spentHours + "|" + a.spentMinutes + "|" + a.note + "|" + a.priority + "|" + a.isExtra;
      const bk = b.taskId + "|" + b.title + "|" + b.completionPercent + "|" + b.spentHours + "|" + b.spentMinutes + "|" + b.note + "|" + b.priority + "|" + b.isExtra;
      return ak < bk ? -1 : (ak > bk ? 1 : 0);
    });
  }

  return JSON.stringify(base);
}

function parseJsonSafe_(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function parseTimeMs_(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const ts = Date.parse(raw);
  return isFinite(ts) ? ts : 0;
}

function ensureSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const lastCol = headers.length;
  const firstRow = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const needsHeader = firstRow.join("").trim() === "";

  if (needsHeader) {
    sh.getRange(1, 1, 1, lastCol).setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function readRowsAsObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(function(h) { return String(h).trim(); });

  const out = [];
  for (var i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error("Missing sheet tab: " + name);
  return sh;
}

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim()) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function isValidUser_(dept, name, code) {
  const directory = getUserDirectoryMap_();
  const group = directory[dept];
  if (!group) return false;
  const expected = group[name];
  if (!expected) return false;
  return String(expected) === String(code || "");
}

function getUserDirectoryMap_() {
  var map = {};
  var entries = getUserDirectoryEntries_();
  Object.keys(entries).forEach(function(dept) {
    map[dept] = {};
    var users = entries[dept] || {};
    Object.keys(users).forEach(function(name) {
      var rec = users[name] || {};
      var code = String(rec.accessCode || "").trim();
      if (code) map[dept][name] = code;
    });
  });
  return map;
}

function getUserEmailMap_() {
  var map = {};
  var entries = getUserDirectoryEntries_();
  Object.keys(entries).forEach(function(dept) {
    map[dept] = {};
    var users = entries[dept] || {};
    Object.keys(users).forEach(function(name) {
      var rec = users[name] || {};
      var email = String(rec.email || "").trim();
      if (!email) email = defaultEmailFromName_(name);
      map[dept][name] = email;
    });
  });
  return map;
}

function getUserDirectoryEntries_() {
  var merged = {};
  var addEntry_ = function(dept, name, accessCode, email) {
    var d = String(dept || "").trim();
    var n = String(name || "").trim();
    var code = String(accessCode || "").trim();
    if (!d || !n || !code) return;
    if (!merged[d]) merged[d] = {};
    merged[d][n] = {
      accessCode: code,
      email: String(email || "").trim() || defaultEmailFromName_(n)
    };
  };

  var staticDir = USER_DIRECTORY && typeof USER_DIRECTORY === "object" ? USER_DIRECTORY : {};
  Object.keys(staticDir).forEach(function(dept) {
    var users = staticDir[dept] || {};
    Object.keys(users).forEach(function(name) {
      addEntry_(dept, name, users[name], "");
    });
  });

  var sheet = null;
  try {
    sheet = getSheet_(CONFIG.SHEETS.USER_DIRECTORY);
  } catch (err) {
    return merged;
  }
  var rows = readRowsAsObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    addEntry_(row.department, row.employeeName, row.accessCode, row.email);
  }
  return merged;
}

function readDynamicUserDirectoryMap_() {
  var map = {};
  var sheet = null;
  try {
    sheet = getSheet_(CONFIG.SHEETS.USER_DIRECTORY);
  } catch (err) {
    return map;
  }
  var rows = readRowsAsObjects_(sheet);
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {};
    var dept = String(row.department || "").trim();
    var name = String(row.employeeName || "").trim();
    var code = String(row.accessCode || "").trim();
    if (!dept || !name || !code) continue;
    if (!map[dept]) map[dept] = {};
    map[dept][name] = code;
  }
  return map;
}

function initializeUserDirectorySheet_() {
  ensureSheet_(CONFIG.SHEETS.USER_DIRECTORY, CONFIG.USER_DIRECTORY_HEADERS);
  var sh = getSheet_(CONFIG.SHEETS.USER_DIRECTORY);
  var headerValues = sh.getRange(1, 1, 1, sh.getLastColumn() || CONFIG.USER_DIRECTORY_HEADERS.length).getValues()[0] || [];
  var headers = headerValues.map(function(h) { return String(h || "").trim(); });
  if (headers.indexOf("email") === -1) {
    sh.insertColumnAfter(sh.getLastColumn() || 1);
    sh.getRange(1, sh.getLastColumn()).setValue("email");
  }
}

function defaultEmailFromName_(name) {
  var full = String(name || "").trim();
  if (!full) return "";
  if (full.toLowerCase() === "kainaz tata") return "kainaz.t@finnovate.in";
  if (full.toLowerCase() === "aastha tiwari") return "aasthatiwari@finnovate.in";
  if (full.toLowerCase() === "priyanka kelkar") return "accounts@finnovate.in";
  return full.toLowerCase().replace(/\s+/g, ".") + "@finnovate.in";
}

function normalizePriority_(v) {
  const p = String(v || "").toLowerCase().trim();
  if (p === "low") return "Low";
  if (p === "high") return "High";
  return "Medium";
}

function ensureArray_(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

function parseRequestBody_(e) {
  if (!e || !e.postData) return {};
  const contentType = String(e.postData.type || "").toLowerCase();
  const raw = String(e.postData.contents || "");

  if (contentType.indexOf("application/json") !== -1) {
    return raw ? JSON.parse(raw) : {};
  }

  const body = {};
  raw.split("&").forEach(function(part) {
    if (!part) return;
    const idx = part.indexOf("=");
    const k = idx >= 0 ? part.substring(0, idx) : part;
    const v = idx >= 0 ? part.substring(idx + 1) : "";
    const key = decodeURIComponent(k.replace(/\+/g, " "));
    const val = decodeURIComponent(v.replace(/\+/g, " "));
    body[key] = val;
  });

  ["tasks", "updates", "taskIds", "titles"].forEach(function(key) {
    if (typeof body[key] === "string" && body[key].trim()) {
      try { body[key] = JSON.parse(body[key]); } catch (e) {}
    }
  });

  return body;
}


function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sameText_(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function toIsoDate_(v) {
  if (!v) return "";

  if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v)) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  var s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  var m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    var dd = m[1].padStart(2, "0");
    var mm = m[2].padStart(2, "0");
    var yy = m[3];
    return yy + "-" + mm + "-" + dd;
  }

  return "";
}

function migrationRequestId_(row, stage) {
  var seed = [
    String(stage || ""),
    String(row && row.submittedAt || ""),
    String(row && row.workDate || ""),
    String(row && row.department || ""),
    String(row && row.employeeName || ""),
    String(row && row.taskCount || ""),
    String(row && row.totalSpentMinutes || "")
  ].join("|");
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  return "hist-" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, "");
}

function migrateHistoricalSheetsToSupabase_() {
  initializeTrackerSheets();
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) {
    throw new Error("Supabase is not enabled. Set SUPABASE_ENABLED=true, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  }

  var sodRows = readRowsAsObjects_(getSheet_(CONFIG.SHEETS.SOD));
  var eodRows = readRowsAsObjects_(getSheet_(CONFIG.SHEETS.EOD));
  var all = [];
  var seenRequestIds = {};
  var skippedDuplicateRequestIds = 0;
  var toPayload_ = function(raw) {
    var payload = parseJsonSafe_(raw && raw.payloadJson);
    if (!payload || typeof payload !== "object") payload = {};
    return payload;
  };
  var pushIfUnique_ = function(row) {
    var reqId = String(row && row.request_id || "").trim();
    if (reqId) {
      if (seenRequestIds[reqId]) {
        skippedDuplicateRequestIds += 1;
        return;
      }
      seenRequestIds[reqId] = true;
    }
    all.push(row);
  };

  sodRows.forEach(function(r) {
    var payload = toPayload_(r);
    if (!payload.requestId) payload.requestId = migrationRequestId_(r, "SOD");
    pushIfUnique_(toSupabaseSubmissionRow_("SOD", payload, Number(r.taskCount || 0), 0));
  });
  eodRows.forEach(function(r) {
    var payload = toPayload_(r);
    if (!payload.requestId) payload.requestId = migrationRequestId_(r, "EOD");
    pushIfUnique_(toSupabaseSubmissionRow_("EOD", payload, Number(r.taskCount || 0), Number(r.totalSpentMinutes || 0)));
  });

  if (!all.length) return { ok: true, inserted: 0, skippedDuplicateRequestIds: skippedDuplicateRequestIds };

  var inserted = 0;
  var batchSize = 250;
  for (var i = 0; i < all.length; i += batchSize) {
    var chunk = all.slice(i, i + batchSize);
    supabaseBulkUpsert_(cfg.table, chunk, "request_id");
    inserted += chunk.length;
  }
  return { ok: true, inserted: inserted, skippedDuplicateRequestIds: skippedDuplicateRequestIds };
}

function runHistoricalMigrationToSupabase() {
  return migrateHistoricalSheetsToSupabase_();
}

function migrateDirectoriesToSupabase_() {
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) {
    throw new Error("Supabase is not enabled. Set SUPABASE_ENABLED=true, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  }

  var userEntries = [];
  if (typeof getUserDirectoryEntries_ === "function") {
    userEntries = getUserDirectoryEntries_();
  }
  var userRows = (Array.isArray(userEntries) ? userEntries : []).map(function(e) {
    var row = e && typeof e === "object" ? e : {};
    return {
      department: String(row.department || "").trim(),
      employeeName: String(row.employeeName || "").trim(),
      accessCode: String(row.accessCode || "").trim(),
      email: String(row.email || "").trim(),
      changedBy: String(row.changedBy || "migration").trim(),
      source: String(row.source || "apps-script-user-directory").trim()
    };
  }).filter(function(r) {
    return r.department && r.employeeName && r.accessCode;
  });

  var adminRows = [];
  if (typeof getAdminDirectory_ === "function") {
    var adminMap = getAdminDirectory_();
    Object.keys(adminMap || {}).forEach(function(name) {
      var rec = adminMap[name] || {};
      adminRows.push({
        adminName: String(name || "").trim(),
        code: String(rec.code || "").trim(),
        role: String(rec.role || "Admin").trim(),
        allowedDepartments: JSON.stringify(Array.isArray(rec.allowedDepartments) ? rec.allowedDepartments : ["All"]),
        changedBy: "migration",
        source: "apps-script-admin-directory"
      });
    });
  }

  var usersRes = supabaseRequest_("POST", "/rest/v1/rpc/internal_upsert_users_directory", {
    p_payload: { rows: userRows }
  }, null);
  var adminsRes = supabaseRequest_("POST", "/rest/v1/rpc/internal_upsert_admins_directory", {
    p_payload: { rows: adminRows }
  }, null);

  return {
    ok: true,
    users: usersRes || { ok: true, upserted: userRows.length },
    admins: adminsRes || { ok: true, upserted: adminRows.length }
  };
}

function runDirectoryMigrationToSupabase() {
  return migrateDirectoriesToSupabase_();
}

function supabaseBulkUpsert_(table, rows, onConflictKey) {
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) throw new Error("Supabase is not configured.");
  var path = "/rest/v1/" + encodeURIComponent(String(table || "").trim());
  var query = "?on_conflict=" + encodeURIComponent(String(onConflictKey || "").trim());
  var endpoint = cfg.url + path + query;
  var res = UrlFetchApp.fetch(endpoint, {
    method: "post",
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: "Bearer " + cfg.serviceRoleKey,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    payload: JSON.stringify(Array.isArray(rows) ? rows : [])
  });
  var code = Number(res.getResponseCode() || 0);
  if (code >= 200 && code < 300) return;
  throw new Error("Supabase upsert failed (" + code + "): " + String(res.getContentText() || ""));
}

function supabaseExactCount_(table, queryParams) {
  var cfg = getSupabaseConfig_();
  if (!cfg.enabled) throw new Error("Supabase is not configured.");
  var params = Object.assign({ select: "id" }, queryParams || {});
  var q = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k]));
  }).join("&");
  var endpoint = cfg.url + "/rest/v1/" + encodeURIComponent(String(table || "").trim()) + "?" + q;
  var res = UrlFetchApp.fetch(endpoint, {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: "Bearer " + cfg.serviceRoleKey,
      Prefer: "count=exact"
    }
  });
  var code = Number(res.getResponseCode() || 0);
  if (code < 200 || code >= 300) {
    throw new Error("Supabase count failed (" + code + "): " + String(res.getContentText() || ""));
  }
  var headers = res.getAllHeaders ? res.getAllHeaders() : {};
  var contentRange = String((headers && (headers["Content-Range"] || headers["content-range"])) || "");
  var m = contentRange.match(/\/(\d+)\s*$/);
  if (m && m[1]) return Number(m[1] || 0);
  var body = String(res.getContentText() || "").trim();
  if (!body || body === "[]") return 0;
  try {
    var parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (err) {
    return 0;
  }
}

function getMigrationParityReport_() {
  initializeTrackerSheets();
  var report = {
    ok: true,
    sheets: {
      sod: readRowsAsObjects_(getSheet_(CONFIG.SHEETS.SOD)).length,
      eod: readRowsAsObjects_(getSheet_(CONFIG.SHEETS.EOD)).length,
      assignments: 0,
      recurring: 0,
      plannerTasks: 0,
      plannerConsumed: 0,
      users: 0,
      admins: 0
    },
    supabase: {
      submissionsSod: 0,
      submissionsEod: 0,
      assignments: 0,
      recurring: 0,
      plannerTasks: 0,
      plannerConsumed: 0,
      users: 0,
      admins: 0
    }
  };

  if (typeof getUserDirectoryEntries_ === "function") {
    var userEntries = getUserDirectoryEntries_();
    report.sheets.users = Array.isArray(userEntries) ? userEntries.length : 0;
  }
  if (typeof getAdminDirectory_ === "function") {
    var adminMap = getAdminDirectory_();
    report.sheets.admins = adminMap && typeof adminMap === "object" ? Object.keys(adminMap).length : 0;
  }
  if (typeof getSheet_ === "function" && typeof ADMIN_CONFIG !== "undefined" && ADMIN_CONFIG) {
    if (ADMIN_CONFIG.ASSIGNMENTS_SHEET) report.sheets.assignments = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.ASSIGNMENTS_SHEET)).length;
    if (ADMIN_CONFIG.RECURRING_SHEET) report.sheets.recurring = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.RECURRING_SHEET)).length;
    if (ADMIN_CONFIG.PLANNER_TASKS_SHEET) report.sheets.plannerTasks = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.PLANNER_TASKS_SHEET)).length;
    if (ADMIN_CONFIG.PLANNER_CONSUMED_SHEET) report.sheets.plannerConsumed = readRowsAsObjects_(getSheet_(ADMIN_CONFIG.PLANNER_CONSUMED_SHEET)).length;
  }

  var cfg = getSupabaseConfig_();
  var adminTable = "task_admin_events";
  if (typeof getAdminEventsSupabaseTable_ === "function") {
    adminTable = getAdminEventsSupabaseTable_();
  }
  report.supabase.submissionsSod = supabaseExactCount_(cfg.table, { stage: "eq.SOD" });
  report.supabase.submissionsEod = supabaseExactCount_(cfg.table, { stage: "eq.EOD" });
  report.supabase.assignments = supabaseExactCount_(adminTable, { event_type: "eq.assignment" });
  report.supabase.recurring = supabaseExactCount_(adminTable, { event_type: "eq.recurring" });
  report.supabase.plannerTasks = supabaseExactCount_(adminTable, { event_type: "eq.planner_task" });
  report.supabase.plannerConsumed = supabaseExactCount_(adminTable, { event_type: "eq.planner_consumed" });
  report.supabase.users = supabaseExactCount_("users_directory", { active: "eq.true" });
  report.supabase.admins = supabaseExactCount_("admins_directory", { active: "eq.true" });
  report.matches = {
    sod: report.sheets.sod === report.supabase.submissionsSod,
    eod: report.sheets.eod === report.supabase.submissionsEod,
    assignments: report.sheets.assignments === report.supabase.assignments,
    recurring: report.sheets.recurring === report.supabase.recurring,
    plannerTasks: report.sheets.plannerTasks === report.supabase.plannerTasks,
    plannerConsumed: report.sheets.plannerConsumed === report.supabase.plannerConsumed
  };
  return report;
}

function runPhase2MigrationToSupabase() {
  var result = {
    ok: true,
    ranAt: new Date().toISOString(),
    steps: {}
  };
  result.steps.directories = runDirectoryMigrationToSupabase();
  result.steps.submissions = runHistoricalMigrationToSupabase();
  if (typeof runAdminSheetsMigrationToSupabase === "function") {
    result.steps.adminEvents = runAdminSheetsMigrationToSupabase();
  } else {
    result.steps.adminEvents = { ok: false, message: "runAdminSheetsMigrationToSupabase not found in current Apps Script project." };
  }
  result.parity = getMigrationParityReport_();
  return result;
}

function runMigrationParityReport() {
  return getMigrationParityReport_();
}
