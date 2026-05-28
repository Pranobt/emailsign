(function initTaskAppPlanner(global) {
  function createManager(options) {
    const opts = options || {};
    const getState = typeof opts.getState === "function" ? opts.getState : function() { return null; };
    const getIdentity = typeof opts.getIdentity === "function" ? opts.getIdentity : function() { return null; };
    const callApi = opts.callApi;
    const callApiJsonp = opts.callApiJsonp;
    const saveState = typeof opts.saveState === "function" ? opts.saveState : function() {};
    const setStatus = typeof opts.setStatus === "function" ? opts.setStatus : function() {};
    const ensureArray = typeof opts.ensureArray === "function" ? opts.ensureArray : function(v) { return Array.isArray(v) ? v : []; };
    const normalizePriority = typeof opts.normalizePriority === "function" ? opts.normalizePriority : function(v) { return v; };
    const createTaskId = typeof opts.createTaskId === "function" ? opts.createTaskId : function() { return ""; };
    const escapeHtml = typeof opts.escapeHtml === "function" ? opts.escapeHtml : function(v) { return String(v == null ? "" : v); };
    const todayISO = typeof opts.todayISO === "function" ? opts.todayISO : function() { return ""; };
    const isUnsupportedActionError_ = typeof opts.isUnsupportedActionError_ === "function" ? opts.isUnsupportedActionError_ : function() { return false; };
    const isPastDate_ = typeof opts.isPastDate_ === "function" ? opts.isPastDate_ : function() { return false; };
    const isSodSubmittedForDate_ = typeof opts.isSodSubmittedForDate_ === "function" ? opts.isSodSubmittedForDate_ : function() { return false; };
    const isSodLockedByMode_ = typeof opts.isSodLockedByMode_ === "function" ? opts.isSodLockedByMode_ : function() { return false; };
    const isEodSubmittedForDate_ = typeof opts.isEodSubmittedForDate_ === "function" ? opts.isEodSubmittedForDate_ : function() { return false; };
    const normalizePlannerTitleKey_ = typeof opts.normalizePlannerTitleKey_ === "function" ? opts.normalizePlannerTitleKey_ : function(v) { return String(v || "").trim().toLowerCase(); };
    const getOrCreateStartDraft = typeof opts.getOrCreateStartDraft === "function" ? opts.getOrCreateStartDraft : function() { return []; };
    const getOrCreateEodDraft = typeof opts.getOrCreateEodDraft === "function" ? opts.getOrCreateEodDraft : function() { return { extras: [] }; };
    const renderAll = typeof opts.renderAll === "function" ? opts.renderAll : function() {};
    const setButtonLoading = typeof opts.setButtonLoading === "function" ? opts.setButtonLoading : function() {};
    const showToast = typeof opts.showToast === "function" ? opts.showToast : function() {};
    const formatDateLabel = typeof opts.formatDateLabel === "function" ? opts.formatDateLabel : function(v) { return String(v || ""); };
    const dom = opts.dom || {};
    const clientVersion = String(opts.clientVersion || "");

    function normalizePlannerAddedOn_(task, fallbackDate) {
      const candidates = [
        task && task.addedOn,
        task && task.added_on,
        task && task.createdAt,
        task && task.created_at,
        task && task.workDate,
        fallbackDate
      ];
      for (let i = 0; i < candidates.length; i += 1) {
        const raw = String(candidates[i] || "").trim();
        if (!raw) continue;
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : raw.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
      }
      return "";
    }

    function normalizePlannerPayload_(result) {
      const raw = ensureArray(result && result.tasks);
      return raw.map((t) => {
        const plannedHours = Math.max(0, Math.floor(Number(t && t.plannedHours || 0)));
        const plannedMinutes = Math.max(0, Math.floor(Number(t && t.plannedMinutes || 0)));
        return {
          taskId: String(t && t.taskId || "").trim() || createTaskId(),
          title: String(t && t.title || "").trim(),
          priority: normalizePriority(t && t.priority),
          plannedHours,
          plannedMinutes,
          addedOn: normalizePlannerAddedOn_(t, result && result.workDate),
          source: "planner",
          status: "Open"
        };
      }).filter((t) => t.title.length > 0);
    }

    function normalizePlannerTaskState_(tasks) {
      return ensureArray(tasks).map((t) => {
        const plannedHours = Math.max(0, Math.floor(Number(t && t.plannedHours || 0)));
        const plannedMinutes = Math.max(0, Math.floor(Number(t && t.plannedMinutes || 0)));
        return {
          taskId: String(t && t.taskId || "").trim() || createTaskId(),
          title: String(t && t.title || "").trim(),
          priority: normalizePriority(t && t.priority),
          plannedHours,
          plannedMinutes,
          addedOn: normalizePlannerAddedOn_(t),
          source: "planner",
          status: "Open"
        };
      }).filter((t) => t.title.length > 0);
    }

    function normalizePlannerInSodPayload_(result) {
      const raw = ensureArray(result && result.inSodTasks);
      return raw.map((t) => {
        const plannedHours = Math.max(0, Math.floor(Number(t && t.plannedHours || 0)));
        const plannedMinutes = Math.max(0, Math.floor(Number(t && t.plannedMinutes || 0)));
        return {
          taskId: String(t && t.taskId || "").trim() || createTaskId(),
          title: String(t && t.title || "").trim(),
          priority: normalizePriority(t && t.priority),
          plannedHours,
          plannedMinutes,
          addedOn: normalizePlannerAddedOn_(t, result && result.workDate),
          source: "planner",
          status: "InSOD"
        };
      }).filter((t) => t.title.length > 0);
    }

    async function syncPlannerFromSheets(dateKey, force) {
      const state = getState();
      const identity = getIdentity();
      if (!identity || !state) return;
      const workDate = String(dateKey || dom.workDateEl.value || "").trim() || todayISO();
      if (!force && state.plannerSyncedAt) return;
      const localPlannerTasks = normalizePlannerTaskState_(state && state.plannerTasks);
      try {
        const result = await callApiJsonp("getPlannerTasks", {
          workDate,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion
        }, 9000);
        if (!result || result.ok === false) throw new Error(result && result.message ? result.message : "Planner fetch rejected.");
        const remotePlannerTasks = normalizePlannerPayload_(result);
        state.plannerTasks = remotePlannerTasks.length ? remotePlannerTasks : localPlannerTasks;
        if (!remotePlannerTasks.length && localPlannerTasks.length) {
          setStatus(dom.plannerStatusEl, "Showing your saved planner tasks because the latest planner sync returned no backlog items.", "info");
        }
        if (!isSodSubmittedForDate_(workDate)) {
          mergePlannerInSodIntoStartDraft_(workDate, state.plannerTasks);
        }
        const hasInSodPayload = Boolean(result && Object.prototype.hasOwnProperty.call(result, "inSodTasks"));
        const inSodTasks = hasInSodPayload ? normalizePlannerInSodPayload_(result) : [];
        if (!state.plannerInSodByDate || typeof state.plannerInSodByDate !== "object") state.plannerInSodByDate = {};
        if (hasInSodPayload) state.plannerInSodByDate[workDate] = inSodTasks;
        state.plannerConsumedTitleKeys = ensureArray(result.consumedTitleKeys).map((k) => String(k || "").trim()).filter((k) => k.length > 0);
        const validSelected = {};
        const taskSet = {};
        ensureArray(state.plannerTasks).forEach((t) => { taskSet[String(t.taskId || "").trim()] = true; });
        Object.keys(state.plannerSelectedTaskIds || {}).forEach((taskId) => {
          if (taskSet[taskId] && state.plannerSelectedTaskIds[taskId]) validSelected[taskId] = true;
        });
        state.plannerSelectedTaskIds = validSelected;
        state.plannerSyncedAt = new Date().toISOString();
      } catch (err) {
        if (isUnsupportedActionError_(err)) {
          state.plannerTasks = [];
          if (!state.plannerInSodByDate || typeof state.plannerInSodByDate !== "object") state.plannerInSodByDate = {};
          state.plannerInSodByDate[workDate] = [];
          state.plannerSelectedTaskIds = {};
          if (!isSodSubmittedForDate_(workDate)) mergePlannerInSodIntoStartDraft_(workDate, []);
          state.plannerSyncedAt = new Date().toISOString();
          return;
        }
        setStatus(dom.plannerStatusEl, `Planner sync failed: ${String(err && err.message ? err.message : err)}`, "info");
      } finally {
        saveState();
      }
    }

    function mergePlannerMovedTasksIntoSod_(dateKey, movedTasks) {
      const state = getState();
      const draft = getOrCreateStartDraft(dateKey);
      ensureArray(movedTasks).forEach((t) => {
        const taskId = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim();
        if (!taskId || !title) return;
        const exists = draft.some((x) => {
          const aId = String(x && x.taskId || "").trim();
          if (aId && taskId) return aId === taskId;
          return String(x && x.title || "").trim().toLowerCase() === title.toLowerCase();
        });
        if (exists) return;
        draft.push({
          taskId,
          title,
          priority: normalizePriority(t.priority),
          source: "planner",
          plannedHours: Math.max(0, Math.floor(Number(t && t.plannedHours || 0))),
          plannedMinutes: Math.max(0, Math.floor(Number(t && t.plannedMinutes || 0)))
        });
      });
      state.startSourceByDate[dateKey] = "local-storage";
    }

    function mergePlannerInSodIntoStartDraft_(dateKey, inSodTasks) {
      const state = getState();
      const existing = Array.isArray(state.startDraftByDate[dateKey]) ? state.startDraftByDate[dateKey] : [];
      const keyOf = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };
      const plannerKeySet = {};
      const byKey = new Map();
      ensureArray(inSodTasks).forEach((t) => {
        const k = keyOf(t);
        if (!k) return;
        plannerKeySet[k] = true;
        byKey.set(k, {
          taskId: String(t.taskId || "").trim() || createTaskId(),
          title: String(t.title || "").trim(),
          priority: normalizePriority(t.priority),
          plannedHours: Math.max(0, Math.floor(Number(t && t.plannedHours || 0))),
          plannedMinutes: Math.max(0, Math.floor(Number(t && t.plannedMinutes || 0))),
          source: "planner"
        });
      });
      existing.forEach((t) => {
        const key = keyOf(t);
        if (!key) return;
        if (String(t && t.source || "").toLowerCase() === "planner" && !plannerKeySet[key]) return;
        if (byKey.has(key)) return;
        byKey.set(key, { ...t });
      });
      state.startDraftByDate[dateKey] = Array.from(byKey.values()).filter((t) => String(t.title || "").trim().length > 0);
      state.startSourceByDate[dateKey] = "local-storage";
    }

    function addPlannerDraftTask_() {
      const state = getState();
      const identity = getIdentity();
      if (!identity) return;
      const title = String(dom.plannerTaskTitleEl && dom.plannerTaskTitleEl.value || "").trim();
      if (!title) {
        setStatus(dom.plannerStatusEl, "Planner task title is required.", "error");
        return;
      }
      const titleKey = normalizePlannerTitleKey_(title);
      const consumedSet = {};
      ensureArray(state.plannerConsumedTitleKeys).forEach((k) => { consumedSet[String(k || "").trim()] = true; });
      if (consumedSet[titleKey]) {
        setStatus(dom.plannerStatusEl, "This task was already consumed and cannot be added again.", "error");
        return;
      }
      const openExists = ensureArray(state.plannerTasks).some((t) => normalizePlannerTitleKey_(t.title) === titleKey);
      const draftExists = ensureArray(state.plannerDraftTasks).some((t) => normalizePlannerTitleKey_(t.title) === titleKey);
      if (openExists || draftExists) {
        setStatus(dom.plannerStatusEl, "Task already exists in planner.", "info");
        return;
      }
      const dateKey = String(dom.workDateEl && dom.workDateEl.value || "").trim() || todayISO();
      const task = { taskId: createTaskId(), title, priority: "Medium", plannedHours: 0, plannedMinutes: 0 };
      if (dom.addPlannerTaskBtn) dom.addPlannerTaskBtn.disabled = true;
      setStatus(dom.plannerStatusEl, "Adding task to planner...", "info");
      return callApi("addPlannerTasks", {
        workDate: dateKey,
        department: identity.dept,
        employeeName: identity.name,
        accessCode: identity.code,
        tasks: [task]
      }).then(async (res) => {
        if (!res || res.ok === false) throw new Error(res && res.message ? res.message : "Planner add failed.");
        state.plannerDraftTasks = [];
        state.plannerTasks = ensureArray(state.plannerTasks);
        if (!state.plannerTasks.some((existing) => normalizePlannerTitleKey_(existing && existing.title) === titleKey)) {
          state.plannerTasks.unshift({
            taskId: String(task.taskId || "").trim() || createTaskId(),
            title,
            priority: "Medium",
            plannedHours: 0,
            plannedMinutes: 0,
            addedOn: dateKey,
            source: "planner",
            status: "Open"
          });
        }
        if (dom.plannerTaskTitleEl) dom.plannerTaskTitleEl.value = "";
        state.plannerComposeCollapsed = false;
        saveState();
        renderAll();
        await syncPlannerFromSheets(dateKey, true);
        saveState();
        renderAll();
        const skippedLocked = ensureArray(res.skippedLockedTitles).length;
        const skippedExisting = ensureArray(res.skippedExistingTitles).length;
        const added = Number(res.addedCount || 0);
        const msg = `Added ${added} task(s)` + (skippedLocked ? ` | Locked: ${skippedLocked}` : "") + (skippedExisting ? ` | Existing: ${skippedExisting}` : "");
        setStatus(dom.plannerStatusEl, msg, "success");
      }).catch((err) => {
        setStatus(dom.plannerStatusEl, `Planner add failed: ${String(err && err.message ? err.message : err)}`, "error");
      }).finally(() => {
        if (dom.addPlannerTaskBtn) dom.addPlannerTaskBtn.disabled = false;
      });
    }

    function renderPlannerDraftTasks_() {
      const state = getState();
      if (!dom.plannerDraftTasksEl) return;
      const draft = ensureArray(state.plannerDraftTasks);
      dom.plannerDraftTasksEl.innerHTML = "";
      if (!draft.length) {
        const empty = document.createElement("div");
        empty.className = "muted";
        empty.textContent = "Draft list is empty.";
        dom.plannerDraftTasksEl.appendChild(empty);
        return;
      }
      draft.forEach((task, idx) => {
        const row = document.createElement("div");
        row.className = "task-row";
        const head = document.createElement("div");
        head.className = "task-row-head";
        const left = document.createElement("div");
        left.className = "task-title-wrap";
        const sr = document.createElement("span");
        sr.className = "sr-badge";
        sr.textContent = `D${idx + 1}`;
        const title = document.createElement("span");
        title.className = "task-title";
        title.textContent = String(task.title || "");
        left.appendChild(sr);
        left.appendChild(title);
        head.appendChild(left);
        const actions = document.createElement("div");
        actions.className = "task-actions-inline";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary icon-subtle";
        edit.title = "Edit task";
        edit.innerHTML = "<i class=\"fa-solid fa-pen\"></i>";
        edit.addEventListener("click", () => {
          const nextTitleRaw = window.prompt("Edit planner draft title", String(task.title || ""));
          if (nextTitleRaw === null) return;
          const nextTitle = String(nextTitleRaw || "").trim();
          if (!nextTitle) {
            setStatus(dom.plannerStatusEl, "Title is required.", "error");
            return;
          }
          draft[idx] = Object.assign({}, draft[idx], { title: nextTitle });
          state.plannerDraftTasks = draft;
          saveState();
          renderPlannerTasks();
        });
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger icon-danger";
        remove.title = "Remove task";
        remove.innerHTML = "<i class=\"fa-solid fa-xmark\"></i>";
        remove.addEventListener("click", () => {
          draft.splice(idx, 1);
          state.plannerDraftTasks = draft;
          saveState();
          renderPlannerTasks();
        });
        actions.appendChild(edit);
        actions.appendChild(remove);
        head.appendChild(actions);
        row.appendChild(head);
        dom.plannerDraftTasksEl.appendChild(row);
      });
    }

    async function submitPlannerDraftTasks_() {
      const state = getState();
      const identity = getIdentity();
      if (!identity) return;
      const dateKey = String(dom.workDateEl.value || "").trim() || todayISO();
      const draft = ensureArray(state.plannerDraftTasks);
      if (!draft.length) {
        setStatus(dom.plannerStatusEl, "Draft list is empty.", "error");
        return;
      }
      setButtonLoading(dom.submitPlannerTasksBtn, true, "Submitting...", "<i class=\"fa-solid fa-upload\"></i>Submit List To Planner");
      try {
        const res = await callApi("addPlannerTasks", { workDate: dateKey, department: identity.dept, employeeName: identity.name, accessCode: identity.code, tasks: draft });
        if (!res || res.ok === false) throw new Error(res && res.message ? res.message : "Planner submit failed.");
        state.plannerDraftTasks = [];
        await syncPlannerFromSheets(dateKey, true);
        const skippedLocked = ensureArray(res.skippedLockedTitles).length;
        const skippedExisting = ensureArray(res.skippedExistingTitles).length;
        const added = Number(res.addedCount || 0);
        const msg = `Added ${added} task(s)` + (skippedLocked ? ` | Locked: ${skippedLocked}` : "") + (skippedExisting ? ` | Existing: ${skippedExisting}` : "");
        setStatus(dom.plannerStatusEl, msg, "success");
        state.plannerComposeCollapsed = true;
        saveState();
        renderAll();
      } catch (err) {
        setStatus(dom.plannerStatusEl, `Planner submit failed: ${String(err && err.message ? err.message : err)}`, "error");
      } finally {
        setButtonLoading(dom.submitPlannerTasksBtn, false, "", "<i class=\"fa-solid fa-upload\"></i>Submit List To Planner");
      }
    }

    function clearPlannerDraftTasks_() {
      const state = getState();
      state.plannerDraftTasks = [];
      saveState();
      renderPlannerTasks();
      setStatus(dom.plannerStatusEl, "Draft list cleared.", "info");
    }

    async function updatePlannerTask_(task) {
      const identity = getIdentity();
      const nextTitleRaw = window.prompt("Edit planner task title", String(task && task.title || ""));
      if (nextTitleRaw === null) return;
      const nextTitle = String(nextTitleRaw || "").trim();
      if (!nextTitle) {
        setStatus(dom.plannerStatusEl, "Title is required.", "error");
        return;
      }
      try {
        const res = await callApi("updatePlannerTask", {
          workDate: dom.workDateEl.value, department: identity.dept, employeeName: identity.name, accessCode: identity.code,
          taskId: String(task && task.taskId || "").trim(), title: nextTitle, priority: normalizePriority(task && task.priority),
          plannedHours: Math.max(0, Math.floor(Number(task && task.plannedHours || 0))), plannedMinutes: Math.max(0, Math.floor(Number(task && task.plannedMinutes || 0)))
        });
        if (!res || res.ok === false) throw new Error(res && res.message ? res.message : "Update failed.");
        await syncPlannerFromSheets(dom.workDateEl.value, true);
        setStatus(dom.plannerStatusEl, "Planner task updated.", "success");
        renderPlannerTasks();
      } catch (err) {
        setStatus(dom.plannerStatusEl, `Update failed: ${String(err && err.message ? err.message : err)}`, "error");
      }
    }

    async function deletePlannerTask_(task) {
      const identity = getIdentity();
      const ok = window.confirm(`Remove planner task "${String(task && task.title || "").trim()}"?`);
      if (!ok) return;
      try {
        const res = await callApi("deletePlannerTask", {
          workDate: dom.workDateEl.value, department: identity.dept, employeeName: identity.name, accessCode: identity.code,
          taskId: String(task && task.taskId || "").trim()
        });
        if (!res || res.ok === false) throw new Error(res && res.message ? res.message : "Delete failed.");
        await syncPlannerFromSheets(dom.workDateEl.value, true);
        setStatus(dom.plannerStatusEl, "Planner task removed.", "success");
        renderPlannerTasks();
      } catch (err) {
        setStatus(dom.plannerStatusEl, `Delete failed: ${String(err && err.message ? err.message : err)}`, "error");
      }
    }

    async function moveSelectedPlannerTasks_(targetMode) {
      const state = getState();
      const identity = getIdentity();
      if (!identity) return;
      const dateKey = String(dom.workDateEl.value || "").trim() || todayISO();
      if (isPastDate_(dateKey)) {
        setStatus(dom.plannerStatusEl, "Cannot move planner tasks to a past date.", "error");
        return;
      }
      const selectedIds = Object.keys(state.plannerSelectedTaskIds || {}).filter((taskId) => Boolean(state.plannerSelectedTaskIds[taskId]));
      if (!selectedIds.length) {
        setStatus(dom.plannerStatusEl, "Select at least one planner task.", "error");
        return;
      }
      const plannerTasksById = {};
      ensureArray(state.plannerTasks).forEach((task) => {
        const taskId = String(task && task.taskId || "").trim();
        if (!taskId) return;
        plannerTasksById[taskId] = task;
      });
      const selectedPlannerTasks = selectedIds.map((taskId) => plannerTasksById[taskId]).filter(Boolean).map((task) => ({
        taskId: String(task.taskId || "").trim(),
        title: String(task.title || "").trim(),
        priority: normalizePriority(task.priority),
        plannedHours: Math.max(0, Math.floor(Number(task && task.plannedHours || 0))),
        plannedMinutes: Math.max(0, Math.floor(Number(task && task.plannedMinutes || 0))),
        source: "planner"
      })).filter((task) => task.taskId && task.title);
      const mode = String(targetMode || "sod").toLowerCase();
      const isForceEod = mode === "eod";
      const isSodSubmitted = isSodSubmittedForDate_(dateKey);
      const isLocked = isSodLockedByMode_(dateKey);
      const isEodSubmitted = isEodSubmittedForDate_(dateKey);
      if (isForceEod && isEodSubmitted) {
        setStatus(dom.plannerStatusEl, "Cannot add planner tasks to EOD extras after EOD submit.", "info");
        return;
      }
      let moveToEodInstead = false;
      if (isForceEod) moveToEodInstead = true;
      else if (isSodSubmitted) {
        moveToEodInstead = window.confirm("SOD is already submitted for this date. Move selected planner tasks to EOD extras instead?");
        if (!moveToEodInstead) return;
      } else if (isLocked) {
        setStatus(dom.plannerStatusEl, "Cannot move tasks. Start of Day mode is locked.", "info");
        return;
      }
      const actionBtn = isForceEod ? dom.addPlannerToExtraBtn : dom.movePlannerToSodBtn;
      const loadingLabel = isForceEod ? "Adding..." : "Moving...";
      const normalLabel = isForceEod ? "<i class=\"fa-solid fa-plus\"></i>EOD Extra" : "<i class=\"fa-solid fa-arrow-right\"></i>Move To SOD";
      setButtonLoading(actionBtn, true, loadingLabel, normalLabel);
      try {
        const res = await callApi("movePlannerToSOD", {
          workDate: dateKey, department: identity.dept, employeeName: identity.name, accessCode: identity.code, taskIds: selectedIds
        });
        if (!res || res.ok === false) throw new Error(res && res.message ? res.message : "Move failed.");
        const moved = ensureArray(res.movedTasks);
        const movedEffective = (moved.length || res.transport !== "no-cors") ? moved : selectedPlannerTasks;
        const updatedOn = String(dateKey || "").trim();
        const updatedOnDisplay = /^\d{4}-\d{2}-\d{2}$/.test(updatedOn) ? `${updatedOn.slice(8, 10)}-${updatedOn.slice(5, 7)}-${updatedOn.slice(0, 4)}` : updatedOn;
        if (moveToEodInstead) {
          const eodDraft = getOrCreateEodDraft(dateKey);
          movedEffective.forEach((t) => {
            eodDraft.extras.unshift({
              taskId: createTaskId(), title: String(t.title || "").trim(), completionPercent: "", spentHours: "", spentMinutes: "",
              spentDuration: "", note: "", priority: normalizePriority(t.priority), source: "planner", plannerTaskId: String(t.taskId || "").trim()
            });
          });
          setStatus(dom.plannerStatusEl, "Planner task(s) added to EOD extras.", "success");
          showToast(`Planner tasks added to EOD on ${updatedOnDisplay}.`, "success", 5000);
        } else {
          mergePlannerMovedTasksIntoSod_(dateKey, movedEffective);
          setStatus(dom.plannerStatusEl, "Planner task(s) moved to SOD.", "success");
          showToast(`Planner tasks moved to SOD on ${updatedOnDisplay}.`, "success", 5000);
        }
        state.plannerSelectedTaskIds = {};
        await syncPlannerFromSheets(dateKey, true);
        saveState();
        renderAll();
      } catch (err) {
        setStatus(dom.plannerStatusEl, `Move failed: ${String(err && err.message ? err.message : err)}`, "error");
      } finally {
        setButtonLoading(actionBtn, false, "", normalLabel);
      }
    }

    function moveSelectedPlannerToSod_() { return moveSelectedPlannerTasks_("sod"); }
    function moveSelectedPlannerToEodExtras_() { return moveSelectedPlannerTasks_("eod"); }
    function togglePlannerCompose_() {
      const state = getState();
      state.plannerComposeCollapsed = !Boolean(state.plannerComposeCollapsed);
      saveState();
      renderPlannerTasks();
    }

    function renderPlannerTasks() {
      const state = getState();
      if (!dom.plannerTasksEl) return;
      const dateKey = String(dom.workDateEl.value || "").trim() || todayISO();
      const isPast = isPastDate_(dateKey);
      const isLocked = isSodLockedByMode_(dateKey);
      const isSodSubmitted = isSodSubmittedForDate_(dateKey);
      const tasks = ensureArray(state.plannerTasks);
      const selected = state.plannerSelectedTaskIds && typeof state.plannerSelectedTaskIds === "object" ? state.plannerSelectedTaskIds : {};
      if (dom.plannerToggleBtn) dom.plannerToggleBtn.hidden = true;
      if (dom.plannerFocusOverlayEl) dom.plannerFocusOverlayEl.hidden = true;
      if (dom.plannerSidebarEl) {
        dom.plannerSidebarEl.hidden = false;
        dom.plannerSidebarEl.classList.toggle("compose-open", !Boolean(state.plannerComposeCollapsed));
      }
      if (dom.plannerTaskTitleEl) dom.plannerTaskTitleEl.disabled = false;
      if (dom.addPlannerTaskBtn) dom.addPlannerTaskBtn.disabled = false;
      if (dom.plannerComposeSectionEl) dom.plannerComposeSectionEl.hidden = Boolean(state.plannerComposeCollapsed);
      if (dom.plannerComposeHeaderEl) dom.plannerComposeHeaderEl.setAttribute("aria-expanded", state.plannerComposeCollapsed ? "false" : "true");
      if (dom.submitPlannerTasksBtn) dom.submitPlannerTasksBtn.disabled = true;
      if (dom.clearPlannerDraftBtn) dom.clearPlannerDraftBtn.disabled = true;
      const plannerRows = tasks.length ? tasks.map((task, idx) => {
        const taskId = String(task.taskId || "").trim();
        const plannedH = Number(task.plannedHours || 0);
        const plannedM = Number(task.plannedMinutes || 0);
        const hasPlan = plannedH > 0 || plannedM > 0;
        const isSelected = Boolean(selected[taskId]);
        const title = escapeHtml(String(task.title || ""));
        const priority = normalizePriority(task.priority);
        const priorityClass = String(priority || "Medium").toLowerCase();
        const planText = hasPlan ? `${plannedH}h ${plannedM}m` : "";
        const showPriority = priority && String(priority).toLowerCase() !== "medium";
        return `<div class="planner-backlog-row${isSelected ? " is-selected" : ""}" data-planner-index="${idx}">
          <label class="planner-backlog-selector"><input type="checkbox" data-planner-select="${idx}" ${isSelected ? "checked" : ""} ${isPast ? "disabled" : ""} /></label>
          <div class="planner-backlog-body">
            <div class="planner-backlog-titlebar">
              <span class="sr-badge">#${String(idx + 1).padStart(2, "0")}</span>
              <span class="task-title">${title}</span>
            </div>
            <div class="planner-backlog-meta">
              ${showPriority ? `<span class="priority ${priorityClass}">${escapeHtml(priority)}</span>` : ""}
              ${hasPlan ? `<span class="planner-backlog-plan is-set"><i class="fa-regular fa-clock"></i>${escapeHtml(planText)}</span>` : ""}
            </div>
          </div>
          <div class="planner-backlog-actions-wrap">
            <div class="planner-backlog-actions">
              <button type="button" class="secondary icon-subtle" title="Edit task" data-planner-edit="${idx}"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="danger icon-danger" title="Remove task" data-planner-delete="${idx}"><i class="fa-solid fa-xmark"></i></button>
            </div>
          </div>
        </div>`;
      }).join("") : `<div class="planner-backlog-empty"><span class="planner-backlog-empty-content"><i class="fa-regular fa-rectangle-list"></i>No planner tasks in backlog.</span></div>`;
      dom.plannerTasksEl.innerHTML = `<div class="planner-backlog-shell"><div class="planner-backlog-list" aria-label="Planner backlog">${plannerRows}</div></div>`;
      tasks.forEach((task, idx) => {
        const checkbox = dom.plannerTasksEl.querySelector(`[data-planner-select="${idx}"]`);
        const edit = dom.plannerTasksEl.querySelector(`[data-planner-edit="${idx}"]`);
        const remove = dom.plannerTasksEl.querySelector(`[data-planner-delete="${idx}"]`);
        if (checkbox) checkbox.addEventListener("change", () => {
          const taskId = String(task.taskId || "").trim();
          if (!taskId) return;
          if (!state.plannerSelectedTaskIds || typeof state.plannerSelectedTaskIds !== "object") state.plannerSelectedTaskIds = {};
          if (checkbox.checked) state.plannerSelectedTaskIds[taskId] = true;
          else delete state.plannerSelectedTaskIds[taskId];
          saveState();
          renderPlannerTasks();
        });
        if (edit) edit.addEventListener("click", () => updatePlannerTask_(task));
        if (remove) remove.addEventListener("click", () => deletePlannerTask_(task));
      });
      renderPlannerDraftTasks_();
      const selectedCount = Object.keys(selected).filter((taskId) => Boolean(selected[taskId])).length;
      if (dom.plannerCountCardEl) dom.plannerCountCardEl.textContent = String(tasks.length);
      if (dom.plannerSelectedCountCardEl) dom.plannerSelectedCountCardEl.textContent = String(selectedCount);
      if (dom.movePlannerToSodBtn) {
        dom.movePlannerToSodBtn.innerHTML = "<i class=\"fa-solid fa-arrow-right\"></i>Move To SOD";
        dom.movePlannerToSodBtn.disabled = isPast || (isLocked && !isSodSubmitted) || !selectedCount;
      }
      if (dom.addPlannerToExtraBtn) {
        const isEodSubmitted = isEodSubmittedForDate_(dateKey);
        dom.addPlannerToExtraBtn.innerHTML = "<i class=\"fa-solid fa-plus\"></i>EOD Extra";
        dom.addPlannerToExtraBtn.disabled = isPast || isEodSubmitted || !selectedCount;
      }
    }

    return {
      normalizePlannerPayload_,
      normalizePlannerTaskState_,
      normalizePlannerInSodPayload_,
      syncPlannerFromSheets,
      mergePlannerMovedTasksIntoSod_,
      mergePlannerInSodIntoStartDraft_,
      addPlannerDraftTask_,
      renderPlannerDraftTasks_,
      submitPlannerDraftTasks_,
      clearPlannerDraftTasks_,
      updatePlannerTask_,
      deletePlannerTask_,
      moveSelectedPlannerTasks_,
      moveSelectedPlannerToSod_,
      moveSelectedPlannerToEodExtras_,
      togglePlannerCompose_,
      renderPlannerTasks
    };
  }

  global.TaskAppPlanner = { createManager };
})(window);
