(function initTaskAppState(global) {
  const ATTENDANCE_DEBUG_STORAGE_KEY = "taskApp:attendanceDebug";
  const SAVE_DEBOUNCE_MS = 180;

  function createStorageKey(storagePrefix, identity) {
    if (!storagePrefix || !identity) return "";
    return `${storagePrefix}:${identity.dept}:${identity.name}`;
  }

  function createDefaultState(todayISO) {
    return {
      workDate: todayISO(),
      startDraftByDate: {},
      startSourceByDate: {},
      sodSelectedTaskIdsByDate: {},
      sodPendingByDate: {},
      sodPostponedByDate: {},
      sodPostponeCountByTaskKey: {},
      syncMetaByDate: {},
      sodByDate: {},
      sodSubmittedFlagByDate: {},
      eodSubmittedByDate: {},
      eodSubmittedUpdatesByDate: {},
      submissionCheckByDate: {},
      submissionDetailsSyncedByDate: {},
      eodDraftByDate: {},
      carryoverByDate: {},
      carryoverSourceByDate: {},
      carryoverSyncedByDate: {},
      attendanceByDate: {},
      dayStatusByDate: {},
      attendanceSyncedByDate: {},
      assignmentByDate: {},
      assignmentSyncedByDate: {},
      recurringByDate: {},
      recurringSyncedByDate: {},
      plannerTasks: [],
      plannerInSodByDate: {},
      plannerDraftTasks: [],
      plannerConsumedTitleKeys: [],
      plannerSelectedTaskIds: {},
      plannerSyncedAt: "",
      plannerCollapsed: true,
      plannerComposeCollapsed: false,
      taskTab: "submissions",
      departmentApprovers: [],
      departmentApproversSyncedAt: "",
      userApprovals: [],
      userApprovalsSyncedAt: "",
      eodUnlockedWithoutSodByDate: {},
      collapsedSectionsByDate: {},
      _savedAt: ""
    };
  }

  function loadState(options) {
    const opts = options || {};
    const base = createDefaultState(typeof opts.todayISO === "function" ? opts.todayISO : function() { return ""; });
    const storage = opts.storage || global.localStorage;
    const key = createStorageKey(opts.storagePrefix, opts.identity);
    if (!key || !storage) return base;
    try {
      const raw = storage.getItem(key);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return base;
      const merged = Object.assign(base, parsed);
      merged.plannerComposeCollapsed = false;
      return merged;
    } catch (err) {
      return base;
    }
  }

  function createStore(options) {
    const opts = options || {};
    const storage = opts.storage || global.localStorage;
    const getIdentity = typeof opts.getIdentity === "function" ? opts.getIdentity : function() { return null; };
    const todayISO = typeof opts.todayISO === "function" ? opts.todayISO : function() { return ""; };
    const renderSaveMeta = typeof opts.renderSaveMeta === "function" ? opts.renderSaveMeta : function() {};
    const debounceMs = Number(opts.debounceMs || SAVE_DEBOUNCE_MS);
    const storagePrefix = String(opts.storagePrefix || "");
    let saveTimerId = null;
    let hasPendingSave = false;

    function getStorageKey() {
      return createStorageKey(storagePrefix, getIdentity());
    }

    function load() {
      return loadState({
        storagePrefix,
        identity: getIdentity(),
        todayISO,
        storage
      });
    }

    function flush(state, force) {
      if (!hasPendingSave || !state) return;
      if (!force && saveTimerId) return;
      const key = getStorageKey();
      if (!key || !storage) return;
      try {
        storage.setItem(key, JSON.stringify(state));
        hasPendingSave = false;
      } catch (err) {}
    }

    function save(state, force) {
      const key = getStorageKey();
      if (!key || !state) return;
      try {
        state._savedAt = new Date().toISOString();
        renderSaveMeta();
        hasPendingSave = true;
        if (force === true) {
          if (saveTimerId) {
            global.clearTimeout(saveTimerId);
            saveTimerId = null;
          }
          flush(state, true);
          return;
        }
        if (saveTimerId) return;
        saveTimerId = global.setTimeout(() => {
          saveTimerId = null;
          flush(state, true);
        }, debounceMs);
      } catch (err) {}
    }

    return {
      getStorageKey,
      loadState: load,
      saveState: save,
      flushStateSave: flush,
      hasPendingSave: function() {
        return hasPendingSave;
      }
    };
  }

  global.TaskAppState = {
    ATTENDANCE_DEBUG_STORAGE_KEY,
    SAVE_DEBOUNCE_MS,
    createStorageKey,
    createDefaultState,
    loadState,
    createStore
  };
})(window);
