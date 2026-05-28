(function initTaskAppApprovals(global) {
  function createManager(options) {
    const opts = options || {};
    const getState = typeof opts.getState === "function" ? opts.getState : function() { return null; };
    const getIdentity = typeof opts.getIdentity === "function" ? opts.getIdentity : function() { return null; };
    const callApi = opts.callApi;
    const saveState = typeof opts.saveState === "function" ? opts.saveState : function() {};
    const ensureArray = typeof opts.ensureArray === "function" ? opts.ensureArray : function(value) { return Array.isArray(value) ? value : []; };
    const normalizePriority = typeof opts.normalizePriority === "function" ? opts.normalizePriority : function(v) { return v; };
    const parsePercent = typeof opts.parsePercent === "function" ? opts.parsePercent : function() { return null; };
    const parseHours = typeof opts.parseHours === "function" ? opts.parseHours : function() { return null; };
    const parseMinutes = typeof opts.parseMinutes === "function" ? opts.parseMinutes : function() { return null; };
    const parseTimeHHMM = typeof opts.parseTimeHHMM === "function" ? opts.parseTimeHHMM : function() { return { ok: false }; };
    const formatMinutes = typeof opts.formatMinutes === "function" ? opts.formatMinutes : function(v) { return String(v || ""); };
    const formatDateTime = typeof opts.formatDateTime === "function" ? opts.formatDateTime : function(v) { return String(v || ""); };
    const formatDateLabel = typeof opts.formatDateLabel === "function" ? opts.formatDateLabel : function(v) { return String(v || ""); };
    const autoResizeTextarea_ = typeof opts.autoResizeTextarea_ === "function" ? opts.autoResizeTextarea_ : function() {};
    const getFieldError = typeof opts.getFieldError === "function" ? opts.getFieldError : function() { return ""; };
    const clearFieldError = typeof opts.clearFieldError === "function" ? opts.clearFieldError : function() {};
    const setFieldError = typeof opts.setFieldError === "function" ? opts.setFieldError : function() {};
    const focusEditorField = typeof opts.focusEditorField === "function" ? opts.focusEditorField : function() {};
    const renderEodTasks = typeof opts.renderEodTasks === "function" ? opts.renderEodTasks : function() {};
    const getPendingTasksForDate = typeof opts.getPendingTasksForDate === "function" ? opts.getPendingTasksForDate : function() { return []; };
    const getAllowedCompletionOptions = typeof opts.getAllowedCompletionOptions === "function" ? opts.getAllowedCompletionOptions : function() { return []; };
    const getNextActiveEodEditor_ = typeof opts.getNextActiveEodEditor_ === "function" ? opts.getNextActiveEodEditor_ : function() { return ""; };
    const setStatus = typeof opts.setStatus === "function" ? opts.setStatus : function() {};
    const createRequestId = typeof opts.createRequestId === "function" ? opts.createRequestId : function() { return ""; };
    const getSubmitterEmailForCliq = typeof opts.getSubmitterEmailForCliq === "function" ? opts.getSubmitterEmailForCliq : function() { return ""; };
    const sendApprovalRequestCliqNotifications = typeof opts.sendApprovalRequestCliqNotifications === "function"
      ? opts.sendApprovalRequestCliqNotifications
      : async function() { return { ok: true, sent: 0 }; };
    const dom = opts.dom || {};
    const clientVersion = String(opts.clientVersion || "");
    const LOCAL_DEPARTMENT_APPROVERS = {
      advisory: ["Vandana Manwani"],
      marketing: ["Chintan Dudhela", "Pranob Thachanthara"],
      equity: ["Ovesh Khatri", "Nehal Mota", "Naveen Singh"],
      operations: ["Naveen Singh", "Nehal Mota", "Pravin Mayekar"],
      research: ["Rushabh Dugad", "Riya Jain"],
      directreportees: ["Nehal Mota"],
      humanresources: ["Neha Sanghrajka", "Kainaz Tata"],
      informationtechnology: ["Naveen Singh"]
    };

    function canonicalDepartmentKey(value) {
      const raw = String(value || "").toLowerCase().replace(/[^a-z]/g, "");
      if (raw === "hr" || raw === "humanresources") return "humanresources";
      if (raw === "it" || raw === "informationtechnology") return "informationtechnology";
      if (raw === "op" || raw === "operations") return "operations";
      if (raw === "rs" || raw === "research") return "research";
      if (raw === "eq" || raw === "equity") return "equity";
      if (raw === "dr" || raw === "directreportees") return "directreportees";
      if (raw === "mk" || raw === "marketing") return "marketing";
      return raw;
    }

    function getAllowedApproverNames(department) {
      const key = canonicalDepartmentKey(department);
      return Array.isArray(LOCAL_DEPARTMENT_APPROVERS[key]) ? LOCAL_DEPARTMENT_APPROVERS[key].slice() : [];
    }

    function getDepartmentApproversForIdentity(state, identity) {
      const allowedNames = getAllowedApproverNames(identity && identity.dept);
      const rows = Array.isArray(state && state.departmentApprovers) ? state.departmentApprovers : [];
      if (!allowedNames.length) return rows.slice();
      const allowedSet = new Set(allowedNames.map((name) => String(name || "").trim().toLowerCase()));
      const filtered = rows.filter((row) => allowedSet.has(String(row && row.admin || "").trim().toLowerCase()));
      if (filtered.length) return filtered;
      return allowedNames.map((name) => ({ admin: name, role: "Admin" }));
    }

    function renderApproverOptions(selectEl, approvers, selectedValue) {
      if (!selectEl) return;
      selectEl.innerHTML = '<option value="">Choose approver</option>';
      ensureArray(approvers).forEach((row) => {
        const name = String(row && row.admin || "").trim();
        if (!name) return;
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        selectEl.appendChild(option);
      });
      selectEl.value = String(selectedValue || "").trim();
    }

    function getApprovalDraftForTask(eodDraft, taskId) {
      if (!eodDraft.approvalByTaskId || typeof eodDraft.approvalByTaskId !== "object") {
        eodDraft.approvalByTaskId = {};
      }
      const key = String(taskId || "").trim();
      if (!key) {
        return { enabled: false, approverAdmin: "", requestNote: "", requestId: "", approvalStatus: "", approvalApprover: "" };
      }
      if (!eodDraft.approvalByTaskId[key] || typeof eodDraft.approvalByTaskId[key] !== "object") {
        eodDraft.approvalByTaskId[key] = { enabled: false, approverAdmin: "", requestNote: "", requestId: "", approvalStatus: "", approvalApprover: "" };
      }
      if (typeof eodDraft.approvalByTaskId[key].requestId !== "string") eodDraft.approvalByTaskId[key].requestId = "";
      if (typeof eodDraft.approvalByTaskId[key].approvalStatus !== "string") eodDraft.approvalByTaskId[key].approvalStatus = "";
      if (typeof eodDraft.approvalByTaskId[key].approvalApprover !== "string") eodDraft.approvalByTaskId[key].approvalApprover = "";
      return eodDraft.approvalByTaskId[key];
    }

    function clearApprovalDraftForTask(eodDraft, taskId) {
      const key = String(taskId || "").trim();
      if (!key || !eodDraft || !eodDraft.approvalByTaskId || typeof eodDraft.approvalByTaskId !== "object") return;
      delete eodDraft.approvalByTaskId[key];
    }

    function clearApprovalDraftByRequestId(requestId) {
      const reqId = String(requestId || "").trim();
      const state = getState();
      if (!reqId || !state || !state.eodDraftByDate || typeof state.eodDraftByDate !== "object") return false;
      let changed = false;
      Object.keys(state.eodDraftByDate).forEach((dateKey) => {
        const eodDraft = state.eodDraftByDate[dateKey];
        if (!eodDraft || !eodDraft.approvalByTaskId || typeof eodDraft.approvalByTaskId !== "object") return;
        Object.keys(eodDraft.approvalByTaskId).forEach((taskKey) => {
          const approvalDraft = eodDraft.approvalByTaskId[taskKey];
          if (!approvalDraft || typeof approvalDraft !== "object") return;
          if (String(approvalDraft.requestId || "").trim() !== reqId) return;
          approvalDraft.enabled = false;
          approvalDraft.requestId = "";
          approvalDraft.approvalStatus = "";
          approvalDraft.approvalApprover = "";
          approvalDraft.requestNote = "";
          changed = true;
        });
      });
      return changed;
    }

    function normalizeApprovalStatus(value) {
      const v = String(value || "").trim().toLowerCase();
      if (v === "approved") return "approved";
      if (v === "rejected") return "rejected";
      if (v === "cancelled" || v === "canceled") return "cancelled";
      return "pending";
    }

    function findUserApprovalByRequestId(requestId) {
      const key = String(requestId || "").trim();
      if (!key) return null;
      const state = getState();
      const rows = Array.isArray(state && state.userApprovals) ? state.userApprovals : [];
      for (const row of rows) {
        if (String(row && row.requestId || "").trim() === key) return row;
      }
      return null;
    }

    function isApprovalTaskSubmittedLock(eodDraft, taskId) {
      const key = String(taskId || "").trim();
      if (!key || !eodDraft || !eodDraft.approvalByTaskId || typeof eodDraft.approvalByTaskId !== "object") return false;
      const draft = eodDraft.approvalByTaskId[key];
      if (!draft || typeof draft !== "object") return false;
      const requestId = String(draft.requestId || "").trim();
      if (!requestId) return false;
      const requestRow = findUserApprovalByRequestId(requestId);
      const requestStatus = normalizeApprovalStatus((requestRow && requestRow.status) || draft.approvalStatus);
      return requestStatus === "pending" || requestStatus === "approved";
    }

    function approvalStatusLabel(approval) {
      const row = approval || {};
      const status = normalizeApprovalStatus(row.status || row.approvalStatus);
      if (status === "approved" && row.reassignedEmployeeName) {
        return `Approved and assigned to ${String(row.reassignedEmployeeName || "").trim()}`;
      }
      if (status === "approved") return "Approved";
      if (status === "cancelled") return "Cancelled";
      if (status === "rejected") {
        const note = String(row.resolutionNote || "").trim();
        return note ? `Rejected: ${note}` : "Rejected";
      }
      const approver = String(row.approverAdmin || row.approvalApprover || "").trim();
      return approver ? `Pending approval from ${approver}` : "Pending approval";
    }

    function approvalStatusClass(approval) {
      const row = approval || {};
      return normalizeApprovalStatus(row.status || row.approvalStatus);
    }

    function approvalStatusShortLabel(approval) {
      const row = approval || {};
      const status = normalizeApprovalStatus(row.status || row.approvalStatus);
      if (status === "pending") {
        const approver = String(row.approverAdmin || row.approvalApprover || "").trim();
        return approver ? `Pending approval from ${approver}` : "Pending approval";
      }
      if (status === "approved") return "Approved";
      if (status === "rejected") return "Rejected";
      if (status === "cancelled") return "Cancelled";
      return "Pending approval";
    }

    function approvalAgeLabel(approval) {
      const row = approval || {};
      const status = normalizeApprovalStatus(row.status || row.approvalStatus);
      const createdRaw = String((row && row.createdAt) || "").trim();
      if (!createdRaw) return "";
      const createdDate = new Date(createdRaw);
      if (Number.isNaN(createdDate.getTime())) return "";
      const resolvedRaw = String((row && row.resolvedAt) || (row && row.updatedAt) || "").trim();
      const resolvedDate = resolvedRaw ? new Date(resolvedRaw) : null;
      const msPerDay = 24 * 60 * 60 * 1000;
      if ((status === "approved" || status === "rejected" || status === "cancelled") && resolvedDate && !Number.isNaN(resolvedDate.getTime())) {
        const daysToResolve = Math.max(0, Math.floor((resolvedDate.getTime() - createdDate.getTime()) / msPerDay));
        if (status === "approved") return daysToResolve === 0 ? "Approved same day" : `Approved after ${daysToResolve} day${daysToResolve === 1 ? "" : "s"}`;
        if (status === "rejected") return daysToResolve === 0 ? "Rejected today" : `Rejected in ${daysToResolve} day${daysToResolve === 1 ? "" : "s"}`;
        return daysToResolve === 0 ? "Closed today" : `Closed in ${daysToResolve} day${daysToResolve === 1 ? "" : "s"}`;
      }
      const now = new Date();
      const days = Math.max(0, Math.floor((now.getTime() - createdDate.getTime()) / msPerDay));
      return days === 0 ? "Since today" : `Since ${days} day${days === 1 ? "" : "s"}`;
    }

    function getLatestApprovalForTask(taskId, title, workDate) {
      const taskKey = String(taskId || "").trim();
      const titleKey = String(title || "").trim().toLowerCase();
      const dateKey = String(workDate || "").trim();
      const state = getState();
      const rows = Array.isArray(state && state.userApprovals) ? state.userApprovals : [];
      return rows.find((row) => {
        const sameDate = !dateKey || String(row && row.workDate || "").trim() === dateKey;
        if (!sameDate) return false;
        const rowTaskId = String(row && row.taskId || "").trim();
        const rowTitle = String(row && row.title || "").trim().toLowerCase();
        return (taskKey && rowTaskId === taskKey) || (!taskKey && titleKey && rowTitle === titleKey);
      }) || null;
    }

    function getCliqEmailForName(name) {
      return getSubmitterEmailForCliq(name);
    }

    async function syncDepartmentApprovers(force) {
      const state = getState();
      const identity = getIdentity();
      if (!identity || !state) return [];
      const departmentKey = canonicalDepartmentKey(identity.dept);
      if (!force && state.departmentApproversDepartmentKey === departmentKey && Array.isArray(state.departmentApprovers) && state.departmentApprovers.length) {
        return getDepartmentApproversForIdentity(state, identity);
      }
      try {
        const result = await callApi("getDepartmentApprovers", {
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code
        }, { timeoutMs: 12000 });
        state.departmentApprovers = result && result.ok && Array.isArray(result.approvers) ? result.approvers : [];
        state.departmentApproversDepartmentKey = departmentKey;
        state.departmentApproversSyncedAt = new Date().toISOString();
        saveState();
      } catch (err) {
        state.departmentApprovers = Array.isArray(state.departmentApprovers) ? state.departmentApprovers : [];
      }
      return getDepartmentApproversForIdentity(state, identity);
    }

    async function syncUserApprovals(force) {
      const state = getState();
      const identity = getIdentity();
      if (!identity || !state) return [];
      if (!force && Array.isArray(state.userApprovals) && state.userApprovals.length) return state.userApprovals;
      const result = await callApi("getUserApprovals", {
        department: identity.dept,
        employeeName: identity.name,
        accessCode: identity.code
      }, { timeoutMs: 15000 });
      if (!result || result.ok === false) {
        throw new Error(result && result.message ? result.message : "Could not load approvals.");
      }
      state.userApprovals = Array.isArray(result.approvals) ? result.approvals : [];
      state.userApprovalsSyncedAt = new Date().toISOString();
      saveState();
      return state.userApprovals;
    }

    function buildApprovalControls(dateKey, taskId, title, project, sourceNote, editorId, eodDraft) {
      const state = getState();
      const identity = getIdentity();
      const approvalDraft = getApprovalDraftForTask(eodDraft, taskId);
      const wrap = document.createElement("div");
      wrap.className = "meta-field note-field approval-control";
      wrap.style.gridColumn = "1 / -1";
      const errorText = getFieldError(eodDraft, editorId, "approvalApprover");
      if (errorText) wrap.classList.add("has-error");
      const top = document.createElement("div");
      top.className = "approval-control-head";
      const toggleRow = document.createElement("label");
      toggleRow.className = "pending-select approval-toggle-row";
      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = Boolean(approvalDraft.enabled);
      const labelText = document.createElement("span");
      labelText.textContent = "Send for approval";
      toggleRow.appendChild(toggle);
      toggleRow.appendChild(labelText);
      top.appendChild(toggleRow);
      const approverField = document.createElement("select");
      approverField.disabled = !approvalDraft.enabled;
      approverField.dataset.editorId = editorId;
      approverField.dataset.field = "approvalApprover";
      renderApproverOptions(
        approverField,
        getDepartmentApproversForIdentity(state, identity),
        approvalDraft.approverAdmin
      );
      const approverLabel = document.createElement("label");
      approverLabel.textContent = "Approver";
      const approverWrap = document.createElement("div");
      approverWrap.className = "meta-field";
      if (errorText) approverWrap.classList.add("has-error");
      approverWrap.appendChild(approverLabel);
      approverWrap.appendChild(approverField);
      if (errorText) {
        const error = document.createElement("div");
        error.className = "field-error";
        error.textContent = errorText;
        approverWrap.appendChild(error);
      }
      const noteLabel = document.createElement("label");
      noteLabel.textContent = "Approval Note";
      const noteInput = document.createElement("textarea");
      noteInput.placeholder = "Optional note for approver";
      noteInput.value = String(approvalDraft.requestNote || "").trim();
      noteInput.disabled = !approvalDraft.enabled;
      autoResizeTextarea_(noteInput);
      const requestId = String(approvalDraft.requestId || "").trim();
      const requestRow = findUserApprovalByRequestId(requestId);
      const requestStatus = normalizeApprovalStatus((requestRow && requestRow.status) || approvalDraft.approvalStatus);
      const isSubmittedApprovalLocked = Boolean(requestId) && (requestStatus === "pending" || requestStatus === "approved");
      const requestLabel = requestId ? approvalStatusLabel(Object.assign({}, requestRow || {}, {
        requestId,
        approvalApprover: approvalDraft.approvalApprover || approvalDraft.approverAdmin
      })) : "";
      if (isSubmittedApprovalLocked) toggle.disabled = true;
      if (requestLabel) {
        const statusMeta = document.createElement("span");
        statusMeta.className = `approval-inline-status ${requestStatus}`;
        statusMeta.textContent = requestLabel;
        top.appendChild(statusMeta);
      }
      const approvalActions = document.createElement("div");
      approvalActions.className = "inline";
      approvalActions.style.marginTop = "8px";
      const sendNowBtn = document.createElement("button");
      sendNowBtn.type = "button";
      sendNowBtn.className = "secondary";
      sendNowBtn.textContent = isSubmittedApprovalLocked ? "Approval Sent" : (requestStatus === "rejected" ? "Resend Approval Now" : "Send Approval Now");
      sendNowBtn.disabled = isSubmittedApprovalLocked || !approvalDraft.enabled;
      approvalActions.appendChild(sendNowBtn);
      let isApprovalRequestInFlight = false;
      const helper = document.createElement("div");
      helper.className = "muted";
      helper.textContent = `Task "${String(title || "").trim() || "-"}" will be sent to the selected admin for review before follow-up work is assigned.`;
      const details = document.createElement("div");
      details.className = "approval-control-body";
      details.hidden = !approvalDraft.enabled;
      details.appendChild(approverWrap);
      details.appendChild(noteLabel);
      details.appendChild(noteInput);
      if (String(project || "").trim()) {
        const projectMeta = document.createElement("div");
        projectMeta.className = "muted";
        projectMeta.textContent = `Project: ${String(project || "").trim()}`;
        details.appendChild(projectMeta);
      }
      if (String(sourceNote || "").trim()) {
        const prev = document.createElement("div");
        prev.className = "muted";
        prev.textContent = `Progress note: ${String(sourceNote || "").trim()}`;
        details.appendChild(prev);
      }
      details.appendChild(approvalActions);
      details.appendChild(helper);
      wrap.appendChild(top);
      wrap.appendChild(details);
      toggle.addEventListener("change", async () => {
        if (isSubmittedApprovalLocked) {
          toggle.checked = true;
          setStatus(dom.eodStatusEl, "Approval already submitted for this task. It cannot be unticked now.", "info");
          return;
        }
        const nextEnabled = Boolean(toggle.checked);
        const prevEnabled = Boolean(approvalDraft.enabled);
        if (prevEnabled === nextEnabled) return;
        const previousRequestId = String(approvalDraft.requestId || "").trim();
        const previousRequestRow = findUserApprovalByRequestId(previousRequestId);
        const previousStatus = normalizeApprovalStatus((previousRequestRow && previousRequestRow.status) || approvalDraft.approvalStatus);
        approvalDraft.enabled = Boolean(toggle.checked);
        clearFieldError(eodDraft, editorId, "approvalApprover");
        approverField.disabled = !approvalDraft.enabled;
        noteInput.disabled = !approvalDraft.enabled;
        sendNowBtn.disabled = isSubmittedApprovalLocked || !approvalDraft.enabled || isApprovalRequestInFlight;
        details.hidden = !approvalDraft.enabled;
        if (!approvalDraft.enabled && previousRequestId && previousStatus === "pending") {
          try {
            isApprovalRequestInFlight = true;
            sendNowBtn.disabled = true;
            const cancelRes = await callApi("cancelApprovalRequest", {
              department: identity.dept, employeeName: identity.name, accessCode: identity.code, requestId: previousRequestId,
              cancelNote: "Cancelled by requester before EOD submission.", workDate: dateKey, clientVersion: clientVersion
            }, { timeoutMs: 15000 });
            if (!cancelRes || cancelRes.ok === false) throw new Error(cancelRes && cancelRes.message ? cancelRes.message : "Could not cancel approval request.");
            await syncUserApprovals(true).catch(() => {});
            setStatus(dom.eodStatusEl, "Pending approval cancelled.", "success");
          } catch (err) {
            approvalDraft.enabled = true;
            toggle.checked = true;
            approverField.disabled = false;
            noteInput.disabled = false;
            details.hidden = false;
            saveState();
            renderEodTasks();
            setStatus(dom.eodStatusEl, `Cancel failed: ${String(err && err.message ? err.message : err)}`, "error");
            return;
          } finally {
            isApprovalRequestInFlight = false;
          }
        }
        if (!approvalDraft.enabled) {
          approvalDraft.requestId = "";
          approvalDraft.approvalStatus = "";
          approvalDraft.approvalApprover = "";
        }
        if (approvalDraft.enabled && !getDepartmentApproversForIdentity(state, identity).length) {
          try { await syncDepartmentApprovers(true); } catch (err) {}
          renderApproverOptions(
            approverField,
            getDepartmentApproversForIdentity(state, identity),
            approvalDraft.approverAdmin
          );
        }
        sendNowBtn.disabled = isSubmittedApprovalLocked || !approvalDraft.enabled || isApprovalRequestInFlight;
        saveState();
        renderEodTasks();
      });
      approverField.addEventListener("change", () => {
        approvalDraft.approverAdmin = String(approverField.value || "").trim();
        clearFieldError(eodDraft, editorId, "approvalApprover");
        saveState();
      });
      noteInput.addEventListener("input", () => {
        approvalDraft.requestNote = noteInput.value;
        autoResizeTextarea_(noteInput);
        saveState();
      });
      sendNowBtn.addEventListener("click", async () => {
        const approver = String(approvalDraft.approverAdmin || "").trim();
        if (!approvalDraft.enabled) return;
        const isExtraEditor = String(editorId || "").startsWith("extra:");
        let completion = null;
        let durationRaw = "";
        let hRaw = "";
        let mRaw = "";
        let allowed = null;
        if (isExtraEditor) {
          const extraRow = ensureArray(eodDraft.extras).find((e) => String(e && e.taskId || "").trim() === String(taskId || "").trim()) || {};
          completion = parsePercent(extraRow.completionPercent);
          durationRaw = String(extraRow.spentDuration || "").trim();
          hRaw = extraRow.spentHours;
          mRaw = extraRow.spentMinutes;
        } else {
          const update = eodDraft.updatesByTaskId[taskId] || {};
          completion = parsePercent(update.completionPercent);
          durationRaw = String(update.spentDuration || "").trim();
          hRaw = update.spentHours;
          mRaw = update.spentMinutes;
          const pendingTask = getPendingTasksForDate(dateKey).find((t) => String(t && t.taskId || "").trim() === String(taskId || "").trim());
          if (pendingTask) allowed = getAllowedCompletionOptions(pendingTask);
        }
        if (completion === null || (Array.isArray(allowed) && allowed.length && !allowed.includes(completion))) {
          const completionMessage = "Fill valid completion % before sending approval.";
          setFieldError(eodDraft, editorId, "completionPercent", completionMessage);
          saveState();
          renderEodTasks();
          focusEditorField(editorId, "completionPercent");
          setStatus(dom.eodStatusEl, completionMessage, "error");
          return;
        }
        clearFieldError(eodDraft, editorId, "completionPercent");
        let h = parseHours(hRaw);
        let m = parseMinutes(mRaw);
        if (durationRaw) {
          const parsedDuration = parseTimeHHMM(durationRaw);
          if (!parsedDuration.ok) {
            const durationMessage = "Fill valid duration before sending approval.";
            setFieldError(eodDraft, editorId, "spentDuration", durationMessage);
            saveState(); renderEodTasks(); focusEditorField(editorId, "spentDuration"); setStatus(dom.eodStatusEl, durationMessage, "error"); return;
          }
          h = parsedDuration.hours; m = parsedDuration.minutes;
        } else if (h === null || m === null) {
          const durationMessage = "Fill valid duration before sending approval.";
          setFieldError(eodDraft, editorId, "spentDuration", durationMessage);
          saveState(); renderEodTasks(); focusEditorField(editorId, "spentDuration"); setStatus(dom.eodStatusEl, durationMessage, "error"); return;
        }
        const hasAnyTimeInput = durationRaw.length > 0 || String(hRaw ?? "").trim() !== "" || String(mRaw ?? "").trim() !== "";
        if (!hasAnyTimeInput || (h === 0 && m === 0)) {
          const durationMessage = "Enter dedicated time greater than zero before sending approval.";
          setFieldError(eodDraft, editorId, "spentDuration", durationMessage);
          saveState(); renderEodTasks(); focusEditorField(editorId, "spentDuration"); setStatus(dom.eodStatusEl, durationMessage, "error"); return;
        }
        clearFieldError(eodDraft, editorId, "spentDuration");
        if (!approver) {
          setFieldError(eodDraft, editorId, "approvalApprover", "Choose an approver before sending approval.");
          saveState(); renderEodTasks(); focusEditorField(editorId, "approvalApprover"); return;
        }
        const latestRow = findUserApprovalByRequestId(approvalDraft.requestId);
        const latestStatus = normalizeApprovalStatus((latestRow && latestRow.status) || approvalDraft.approvalStatus);
        if (approvalDraft.requestId && (latestStatus === "pending" || latestStatus === "approved")) {
          setStatus(dom.eodStatusEl, `Approval already ${latestStatus} for this task.`, "info"); return;
        }
        isApprovalRequestInFlight = true;
        sendNowBtn.disabled = true;
        const oldLabel = sendNowBtn.textContent;
        sendNowBtn.textContent = "Sending...";
        try {
          let requestResult = null;
          if (approvalDraft.requestId && latestStatus === "rejected") {
            requestResult = await callApi("resubmitApprovalRequest", {
              department: identity.dept, employeeName: identity.name, accessCode: identity.code, requestId: String(approvalDraft.requestId || "").trim(),
              approverAdmin: approver, requestNote: String(approvalDraft.requestNote || "").trim(), taskId: String(taskId || "").trim(),
              title: String(title || "").trim(), project: String(project || "").trim(), sourceNote: String(sourceNote || "").trim(), workDate: dateKey
            }, { timeoutMs: 15000 });
            if (!requestResult || requestResult.ok === false || !requestResult.request) throw new Error(requestResult && requestResult.message ? requestResult.message : "Could not resend approval.");
            const req = requestResult.request || {};
            approvalDraft.requestId = String(req.requestId || "").trim();
            approvalDraft.approvalStatus = String(req.status || "pending").trim();
            approvalDraft.approvalApprover = String(req.approverAdmin || approver).trim();
          } else {
            requestResult = await callApi("submitApprovalRequests", {
              workDate: dateKey, department: identity.dept, employeeName: identity.name, accessCode: identity.code,
              tasks: [{
                requestId: createRequestId(), taskId: String(taskId || "").trim(), title: String(title || "").trim(),
                project: String(project || "").trim(),
                priority: normalizePriority((eodDraft.updatesByTaskId[taskId] || {}).priority || "Medium"),
                completionPercent: parsePercent((eodDraft.updatesByTaskId[taskId] || {}).completionPercent) || 0,
                spentMinutes: ((Number(h) || 0) * 60) + (Number(m) || 0), sourceNote: String(sourceNote || "").trim(), requestNote: String(approvalDraft.requestNote || "").trim(), approverAdmin: approver
              }],
              clientVersion: clientVersion
            }, { timeoutMs: 15000 });
            if (!requestResult || requestResult.ok === false) throw new Error(requestResult && requestResult.message ? requestResult.message : "Could not send approval.");
            const firstReq = (Array.isArray(requestResult.requests) ? requestResult.requests[0] : null) || {};
            approvalDraft.requestId = String(firstReq.requestId || "").trim();
            approvalDraft.approvalStatus = String(firstReq.approvalStatus || "pending").trim();
            approvalDraft.approvalApprover = String(firstReq.approvalApprover || approver).trim();
          }
          const cliqResult = await sendApprovalRequestCliqNotifications([{
            requestId: String(approvalDraft.requestId || "").trim(),
            taskId: String(taskId || "").trim(),
            title: String(title || "").trim(),
            project: String(project || "").trim(),
            workDate: dateKey,
            completionPercent: parsePercent((eodDraft.updatesByTaskId[taskId] || {}).completionPercent) || 0,
            spentMinutes: (Number(h) || 0) * 60 + (Number(m) || 0),
            sourceNote: String(sourceNote || "").trim(),
            requestNote: String(approvalDraft.requestNote || "").trim(),
            approvalApprover: String(approvalDraft.approvalApprover || approver).trim()
          }]);
          if (!cliqResult || cliqResult.ok === false) {
            throw new Error(cliqResult && cliqResult.message ? cliqResult.message : "Approval request saved, but Cliq notification failed.");
          }
          saveState();
          await syncUserApprovals(true).catch(() => {});
          eodDraft.activeEditorId = getNextActiveEodEditor_(dateKey);
          saveState();
          renderEodTasks();
          renderApprovalsPanel();
          setStatus(dom.eodStatusEl, "Approval request sent. You can still submit EOD later.", "success");
        } catch (err) {
          sendNowBtn.textContent = oldLabel;
          setStatus(dom.eodStatusEl, `Approval send failed: ${String(err && err.message ? err.message : err)}`, "error");
        } finally {
          isApprovalRequestInFlight = false;
          const latestRequestRow = findUserApprovalByRequestId(approvalDraft.requestId);
          const latestRequestStatus = normalizeApprovalStatus((latestRequestRow && latestRequestRow.status) || approvalDraft.approvalStatus);
          const isLockedAfterSend = Boolean(String(approvalDraft.requestId || "").trim()) && (latestRequestStatus === "pending" || latestRequestStatus === "approved");
          sendNowBtn.textContent = isLockedAfterSend ? "Approval Sent" : (latestRequestStatus === "rejected" ? "Resend Approval Now" : "Send Approval Now");
          sendNowBtn.disabled = isLockedAfterSend || !approvalDraft.enabled || isApprovalRequestInFlight;
        }
      });
      return wrap;
    }

    function renderApprovalsPanel() {
      const state = getState();
      const identity = getIdentity();
      if (!dom.approvalsListEl) return;
      const rows = Array.isArray(state && state.userApprovals) ? state.userApprovals.slice() : [];
      dom.approvalsListEl.innerHTML = "";
      if (dom.approvalCountCardEl) dom.approvalCountCardEl.textContent = String(rows.length);
      if (!rows.length) {
        dom.approvalsListEl.innerHTML = '<div class="empty"><i class="fa-regular fa-bell"></i>No approval requests yet.</div>';
        return;
      }
      const statusOrder = ["pending", "approved", "rejected", "cancelled"];
      const statusLabels = {
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        cancelled: "Other Status"
      };
      const sortByLatestDesc = (a, b) => {
        const aTime = new Date((a && a.updatedAt) || (a && a.resolvedAt) || (a && a.createdAt) || 0).getTime() || 0;
        const bTime = new Date((b && b.updatedAt) || (b && b.resolvedAt) || (b && b.createdAt) || 0).getTime() || 0;
        return bTime - aTime;
      };
      const grouped = {
        pending: [],
        approved: [],
        rejected: [],
        cancelled: []
      };
      rows.forEach((row) => {
        const status = normalizeApprovalStatus(row && row.status);
        if (!grouped[status]) grouped[status] = [];
        grouped[status].push(row);
      });
      const frag = document.createDocumentFragment();
      statusOrder.forEach((statusKey) => {
        const bucket = ensureArray(grouped[statusKey]).slice().sort(sortByLatestDesc);
        if (!bucket.length) return;
        const section = document.createElement("section");
        section.className = "approval-group";
        const sectionHead = document.createElement("div");
        sectionHead.className = "approval-group-head";
        const sectionTitle = document.createElement("h3");
        sectionTitle.className = "approval-group-title";
        sectionTitle.textContent = statusLabels[statusKey] || "Other Status";
        const sectionCount = document.createElement("div");
        sectionCount.className = "approval-group-count";
        sectionCount.textContent = String(bucket.length);
        sectionHead.appendChild(sectionTitle);
        sectionHead.appendChild(sectionCount);
        section.appendChild(sectionHead);
        const list = document.createElement("div");
        list.className = "approval-group-list";
        bucket.forEach((row) => {
        const card = document.createElement("div");
        card.className = "approval-card";
        const head = document.createElement("div");
        head.className = "approval-card-head";
        head.setAttribute("role", "button");
        head.setAttribute("tabindex", "0");
        head.setAttribute("aria-expanded", "false");
        const titleWrap = document.createElement("div");
        const titleEl = document.createElement("div");
        titleEl.className = "approval-card-title";
        titleEl.textContent = String(row && row.title || "-");
        titleWrap.appendChild(titleEl);
        const headActions = document.createElement("div");
        headActions.className = "approval-card-head-actions";
        const statusChip = document.createElement("div");
        statusChip.className = `approval-status-chip ${approvalStatusClass(row)}`;
        statusChip.textContent = approvalStatusShortLabel(row);
        const ageChip = document.createElement("div");
        ageChip.className = "approval-age-chip";
        ageChip.textContent = approvalAgeLabel(row);
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "approval-card-toggle secondary";
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
        head.appendChild(titleWrap);
        headActions.appendChild(statusChip);
        if (ageChip.textContent) headActions.appendChild(ageChip);
        headActions.appendChild(toggleBtn);
        head.appendChild(headActions);
        card.appendChild(head);
        const body = document.createElement("div");
        body.className = "approval-card-body";
        body.hidden = true;
        const meta = document.createElement("div");
        meta.className = "approval-card-meta";
        const addMeta = (label, value, cls) => {
          const val = String(value || "").trim();
          if (!val) return;
          const pill = document.createElement("span");
          pill.className = `approval-meta-pill${cls ? ` ${cls}` : ""}`;
          pill.textContent = `${label}: ${val}`;
          meta.appendChild(pill);
        };
        addMeta("Approver", String(row && row.approverAdmin || "-"));
        addMeta("Project", String(row && row.project || ""));
        addMeta("Work started on", formatDateLabel(row && row.workDate || ""));
        addMeta("Priority", String(row && row.priority || "Medium"), `priority-${String(row && row.priority || "Medium").toLowerCase()}`);
        addMeta("Progress", `${Number(row && row.completionPercent || 0)}%`);
        addMeta("Spent", formatMinutes(Number(row && row.spentMinutes || 0)));
        body.appendChild(meta);
        const timeline = document.createElement("div");
        timeline.className = "approval-card-timeline";
        const requestedAt = formatDateTime(row && row.createdAt);
        const resolvedAtRaw = (row && row.resolvedAt) || (row && row.updatedAt);
        const resolvedAt = formatDateTime(resolvedAtRaw);
        const status = normalizeApprovalStatus(row && row.status);
        const timelineParts = [];
        if (requestedAt) timelineParts.push(`Approval Requested on: ${requestedAt}`);
        if (status === "approved" && resolvedAt) timelineParts.push(`Approved on: ${resolvedAt}`);
        else if (status === "rejected" && resolvedAt) timelineParts.push(`Rejected on: ${resolvedAt}`);
        else if (status === "cancelled" && resolvedAt) timelineParts.push(`Cancelled on: ${resolvedAt}`);
        timeline.textContent = timelineParts.join(" • ");
        body.appendChild(timeline);
        const summary = document.createElement("div");
        summary.className = "approval-card-summary";
        const addSummary = (label, value) => {
          const text = String(value || "").trim();
          if (!text) return;
          const line = document.createElement("div");
          line.className = "approval-summary-line";
          line.textContent = `${label}: ${text}`;
          summary.appendChild(line);
        };
        addSummary("Request note", row && row.requestNote);
        addSummary("Progress note", row && row.sourceNote);
        if (String(row && row.reassignedEmployeeName || "").trim()) {
          addSummary("Assigned to", `${String(row.reassignedEmployeeName || "").trim()}${row.reassignedDepartment ? ` (${String(row.reassignedDepartment).trim()})` : ""}`);
        }
        addSummary("Resolution", row && row.resolutionNote);
        if (summary.childElementCount) body.appendChild(summary);
        const rowStatus = normalizeApprovalStatus(row && row.status);
        if (rowStatus === "pending" || rowStatus === "rejected") {
          const actions = document.createElement("div");
          actions.className = "approval-card-actions";
          if (rowStatus === "rejected") {
            const resubmitBtn = document.createElement("button");
            resubmitBtn.type = "button";
            resubmitBtn.className = "approval-action-primary";
            resubmitBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>Resubmit';
            resubmitBtn.addEventListener("click", async () => {
              const nextNote = window.prompt("Update approval note before resubmitting", String(row && row.requestNote || ""));
              if (nextNote === null) return;
              try {
                const result = await callApi("resubmitApprovalRequest", {
                  department: identity.dept, employeeName: identity.name, accessCode: identity.code, requestId: row.requestId,
                  requestNote: String(nextNote || ""), approverAdmin: row.approverAdmin, workDate: row.workDate, taskId: row.taskId,
                  title: row.title, project: row.project, priority: row.priority, completionPercent: row.completionPercent, spentMinutes: row.spentMinutes, sourceNote: row.sourceNote
                }, { timeoutMs: 15000 });
                if (!result || result.ok === false) throw new Error(result && result.message ? result.message : "Resubmit failed.");
                await syncUserApprovals(true);
                renderApprovalsPanel();
                setStatus(dom.approvalsStatusEl, "Approval request resubmitted.", "success");
              } catch (err) {
                setStatus(dom.approvalsStatusEl, `Resubmit failed: ${String(err && err.message ? err.message : err)}`, "error");
              }
            });
            actions.appendChild(resubmitBtn);
          }
          if (rowStatus === "pending") {
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "danger";
            cancelBtn.innerHTML = '<i class="fa-solid fa-ban"></i>Remove Request';
            cancelBtn.addEventListener("click", async () => {
              const nextNote = window.prompt("Reason to remove this approval request", "Cancelled by requester from approvals list.");
              if (nextNote === null) return;
              try {
                const result = await callApi("cancelApprovalRequest", {
                  department: identity.dept, employeeName: identity.name, accessCode: identity.code, requestId: row.requestId,
                  cancelNote: String(nextNote || "").trim() || "Cancelled by requester from approvals list.", workDate: row.workDate
                }, { timeoutMs: 15000 });
                if (!result || result.ok === false) throw new Error(result && result.message ? result.message : "Could not remove request.");
                const changed = clearApprovalDraftByRequestId(row.requestId);
                if (changed) saveState();
                await syncUserApprovals(true);
                renderEodTasks();
                renderApprovalsPanel();
                setStatus(dom.approvalsStatusEl, "Approval request removed.", "success");
              } catch (err) {
                setStatus(dom.approvalsStatusEl, `Remove failed: ${String(err && err.message ? err.message : err)}`, "error");
              }
            });
            actions.appendChild(cancelBtn);
          }
          body.appendChild(actions);
        }
        card.appendChild(body);
        const setCollapsed = (collapsed) => {
          body.hidden = collapsed;
          card.classList.toggle("is-collapsed", collapsed);
          head.setAttribute("aria-expanded", collapsed ? "false" : "true");
          toggleBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        };
        setCollapsed(true);
        const toggleCard = () => {
          setCollapsed(!body.hidden);
        };
        head.addEventListener("click", () => {
          toggleCard();
        });
        head.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          toggleCard();
        });
        toggleBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleCard();
        });
        list.appendChild(card);
      });
        section.appendChild(list);
        frag.appendChild(section);
      });
      dom.approvalsListEl.appendChild(frag);
    }

    return {
      getApprovalDraftForTask,
      clearApprovalDraftForTask,
      clearApprovalDraftByRequestId,
      isApprovalTaskSubmittedLock,
      normalizeApprovalStatus,
      approvalStatusLabel,
      approvalStatusShortLabel,
      approvalStatusClass,
      findUserApprovalByRequestId,
      getLatestApprovalForTask,
      getCliqEmailForName,
      syncDepartmentApprovers,
      syncUserApprovals,
      buildApprovalControls,
      renderApprovalsPanel
    };
  }

  global.TaskAppApprovals = { createManager };
})(window);
