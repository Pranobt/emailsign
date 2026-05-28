const TASK_DATA = window.TASK_DATA || {};
window.__TASK_APP_BOOTED = true;
const __decodeSecret = typeof TASK_DATA.__decodeSecret === "function"
  ? TASK_DATA.__decodeSecret
  : function(b64) {
      try {
        return atob(String(b64 || ""));
      } catch (err) {
        return "";
      }
    };
const SUPABASE_URL = String(TASK_DATA.SUPABASE_URL || "");
const SUPABASE_ANON_KEY = String(TASK_DATA.SUPABASE_ANON_KEY || "");
const ZOHO_FLOW_WEBHOOK_URL = String(TASK_DATA.ZOHO_FLOW_WEBHOOK_URL || "");
const ZOHO_SUBMISSION_WEBHOOK_URL = String(TASK_DATA.ZOHO_SUBMISSION_WEBHOOK_URL || ZOHO_FLOW_WEBHOOK_URL || "");
const STORAGE_PREFIX = String(TASK_DATA.STORAGE_PREFIX || "dailyTaskTrackerV4");
const CLIENT_VERSION = String(TASK_DATA.CLIENT_VERSION || "task-ui-v4");
const USER_DIRECTORY = TASK_DATA.USER_DIRECTORY && typeof TASK_DATA.USER_DIRECTORY === "object"
  ? TASK_DATA.USER_DIRECTORY
  : {};
const SUPER_ADMIN_LINKS = TASK_DATA.SUPER_ADMIN_LINKS && typeof TASK_DATA.SUPER_ADMIN_LINKS === "object"
  ? TASK_DATA.SUPER_ADMIN_LINKS
  : {};
const ATTENDANCE_DEBUG_STORAGE_KEY = window.TaskAppState.ATTENDANCE_DEBUG_STORAGE_KEY;
const supabaseClient = (window.supabase && typeof window.supabase.createClient === "function" && SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

const {
  appEl,
  blockedEl,
  blockedMsgEl,
  nameLineEl,
  deptLineEl,
  streakChipEl,
  streakTextEl,
  streakLeaderboardToggleEl,
  streakPopEl,
  streakNoteEl,
  streakLeaderboardEl,
  streakConfettiEl,
  workDateEl,
  taskTabButtons,
  taskTabSubmissionsEl,
  taskTabPlannerEl,
  taskTabApprovalsEl,
  approvalsListEl,
  approvalsStatusEl,
  approvalCountCardEl,
  prevMonthBtn,
  nextMonthBtn,
  prevDayBtn,
  nextDayBtn,
  monthLabelEl,
  dateChipListEl,
  startCountCardEl,
  hoursSplitCardEl,
  eodElapsedTimeEl,
  postponedCountCardEl,
  toastStackEl,
  confirmOverlayEl,
  confirmTitleEl,
  confirmBodyEl,
  confirmDetailsEl,
  confirmCancelBtn,
  confirmProceedBtn,
  taskEditOverlayEl,
  taskEditTitleEl,
  taskEditTitleInputEl,
  taskEditPriorityInputEl,
  taskEditFrequencyInputEl,
  taskEditProjectWrapEl,
  taskEditProjectInputEl,
  taskEditWeeklyWrapEl,
  taskEditWeeklyInputEl,
  taskEditMonthlyWrapEl,
  taskEditMonthlyInputEl,
  taskEditPlannedInputEl,
  taskEditQuickChipsEl,
  taskEditErrorEl,
  taskEditCancelBtn,
  taskEditSaveBtn,
  newTaskTitleEl,
  newTaskFrequencyEl,
  newTaskProjectWrapEl,
  newTaskProjectEl,
  newTaskRecurrenceRowEl,
  newTaskWeeklyDayEl,
  newTaskMonthlyDateEl,
  newTaskPriorityEl,
  newTaskPriorityGroupEl,
  newTaskPlannedTimeEl,
  addTaskBtn,
  plannerTaskTitleEl,
  plannerDraftTasksEl,
  addPlannerTaskBtn,
  plannerComposeHeaderEl,
  plannerComposeSectionEl,
  submitPlannerTasksBtn,
  clearPlannerDraftBtn,
  plannerTasksEl,
  plannerStatusEl,
  plannerCountCardEl,
  plannerSelectedCountCardEl,
  addPlannerToExtraBtn,
  movePlannerToSodBtn,
  plannerToggleBtn,
  plannerCloseBtn,
  plannerSidebarEl,
  plannerFocusOverlayEl,
  submitSodBtn,
  sodSubmitMetaEl,
  sodStatusEl,
  sodTasksEl,
  sodPanelEl,
  sodSourceHintEl,
  syncMetaLineEl,
  saveMetaLineEl,
  dayStatusRowEl,
  dayStatusBtnEl,
  dayStatusMetaEl,
  sodLoginTimeMetaEl,
  eodCheckoutTimeMetaEl,
  sodBucketsEl,
  sodSelectedPreviewEl,
  plannedQuickChipsEl,
  syncCarryoverBtn,
  openAdminBtn,
  addExtraBtn,
  submitEodBtn,
  eodStatusEl,
  eodTasksEl,
  eodPanelEl,
  COMPLETION_OPTIONS,
  RECURRING_FREQUENCIES,
  WEEKDAY_LABELS,
  SOD_POSTPONE_LIMIT
} = window.TaskAppDom || {};

    let identity = null;
    let state = null;
    let isDateLoading = false;
    let isSodSubmitting = false;
    let isEodSubmitting = false;
    let pendingWebhookRequests = 0;
    let undoActionState = null;
    const WEBHOOK_DEDUP_WINDOW_MS = 3 * 60 * 1000;
    const webhookSentAt = {};
    let isRenderQueued = false;
    let isRenderingAll = false;
    let rerenderRequested = false;
    let summaryCardsRafId = 0;
    let eodTimerTickerId = 0;
    let eodElapsedIntervalId = 0;
    const attendanceRefreshTimerByDate = {};
    const eodAttendanceEditSyncTimerByDate = {};
    const IS_APPLE_PLATFORM = /mac|iphone|ipad|ipod/i.test(
      String((navigator && (navigator.userAgentData && navigator.userAgentData.platform)) || navigator.platform || "")
    );
    const {
      parseISODate_,
      toISODate_,
      shiftISODateByDays_,
      shiftISODateByMonths_,
      createRequestId,
      formatDateTime,
      formatStatusTimestamp_,
      createTaskId,
      escapeHtml,
      parseHours,
      parseMinutes,
      parseTimeHHMM,
      formatMinutes,
      formatDurationInput_
    } = window.TaskAppUtils || {};
    const parsePercent = function(value) {
      return window.TaskAppUtils.parsePercent(value, COMPLETION_OPTIONS);
    };
    const stateStore = window.TaskAppState.createStore({
      storagePrefix: STORAGE_PREFIX,
      getIdentity: () => identity,
      todayISO,
      renderSaveMeta
    });
    const streakManager = window.TaskAppStreaks.createManager({
      callApi,
      getIdentity: () => identity,
      clientVersion: CLIENT_VERSION,
      dom: window.TaskAppDom,
      escapeHtml,
      formatCliqDate: formatCliqDate_,
      showToast
    });
    const renderStreak_ = function() {
      return streakManager.renderStreak();
    };
    const renderStreakLeaderboard_ = function() {
      return streakManager.renderStreakLeaderboard();
    };
    const applyStreakResult_ = function(incoming, options) {
      return streakManager.applyStreakResult(incoming, options);
    };
    const refreshUserStreak_ = function(options) {
      return streakManager.refreshUserStreak(options);
    };
    const refreshStreakLeaderboard_ = function(options) {
      return streakManager.refreshStreakLeaderboard(options);
    };
    window.__refreshStreakLeaderboard = function() {
      refreshStreakLeaderboard_({ timeoutMs: 8000 });
    };
    const approvalsManager = window.TaskAppApprovals.createManager({
      getState: () => state,
      getIdentity: () => identity,
      callApi,
      saveState,
      ensureArray,
      normalizePriority,
      parsePercent,
      parseHours,
      parseMinutes,
      parseTimeHHMM,
      formatMinutes,
      formatDateTime,
      formatDateLabel,
      autoResizeTextarea_,
      getFieldError,
      clearFieldError,
      setFieldError,
      focusEditorField,
      renderEodTasks,
      getPendingTasksForDate,
      getAllowedCompletionOptions,
      getNextActiveEodEditor_,
      setStatus,
      createRequestId,
      getSubmitterEmailForCliq: getSubmitterEmailForCliq_,
      sendApprovalRequestCliqNotifications: sendApprovalRequestCliqNotifications_,
      dom: window.TaskAppDom,
      clientVersion: CLIENT_VERSION
    });
    const plannerManager = window.TaskAppPlanner.createManager({
      getState: () => state,
      getIdentity: () => identity,
      callApi,
      callApiJsonp,
      saveState,
      setStatus,
      ensureArray,
      normalizePriority,
      createTaskId,
      escapeHtml,
      todayISO,
      isUnsupportedActionError_,
      isPastDate_,
      isSodSubmittedForDate_,
      isSodLockedByMode_,
      isEodSubmittedForDate_,
      normalizePlannerTitleKey_,
      getOrCreateStartDraft,
      getOrCreateEodDraft,
      renderAll,
      setButtonLoading,
      showToast,
      formatDateLabel,
      dom: window.TaskAppDom,
      clientVersion: CLIENT_VERSION
    });
    const attendanceManager = window.TaskAppAttendance.createManager({
      getState: () => state,
      getIdentity: () => identity,
      callApiJsonp,
      saveState,
      renderAll,
      escapeHtml,
      setButtonLoading,
      isSodSubmittedForDate_,
      isEodSubmittedForDate_,
      todayISO,
      isTruthyDebugFlag_,
      attendanceDebugStorageKey: ATTENDANCE_DEBUG_STORAGE_KEY,
      dom: window.TaskAppDom,
      clientVersion: CLIENT_VERSION
    });
    const apiClient = window.TaskAppApi.createClient({
      supabaseClient
    });

    function timerIconHtml_(kind, fallbackFaClass) {
      if (IS_APPLE_PLATFORM) {
        const symbols = {
          play: "▶︎",
          switch: "⇄",
          pause: "⏸",
          stop: "⏹",
          reset: "↺"
        };
        const symbol = symbols[kind] || symbols.play;
        return `<span class="apple-symbol" aria-hidden="true">${symbol}</span>`;
      }
      return `<i class="${fallbackFaClass}" aria-hidden="true"></i>`;
    }

    function setWorkDateAndRefresh_(iso) {
      const nextIso = String(iso || "").trim();
      if (!nextIso || nextIso === workDateEl.value) return;
      workDateEl.value = nextIso;
      workDateEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function renderDateNavigator_() {
      if (!monthLabelEl || !dateChipListEl) return;
      const selectedIso = String(workDateEl.value || todayISO());
      const selected = parseISODate_(selectedIso) || new Date();
      const monthText = selected.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric"
      });
      monthLabelEl.innerHTML = `<i class="fa-regular fa-calendar-days"></i><span>${monthText}</span>`;

      dateChipListEl.innerHTML = "";
      for (let offset = -2; offset <= 2; offset += 1) {
        const dt = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate());
        dt.setDate(dt.getDate() + offset);
        const iso = toISODate_(dt);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = `date-chip${iso === selectedIso ? " active" : ""}`;
        chip.setAttribute("role", "option");
        chip.setAttribute("aria-selected", iso === selectedIso ? "true" : "false");
        chip.innerHTML = `
          <span class="date-chip-day">${dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
          <span class="date-chip-date">${dt.getDate()}</span>
        `;
        chip.addEventListener("click", () => setWorkDateAndRefresh_(iso));
        dateChipListEl.appendChild(chip);
      }
    }

    function todayISO() {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());
      const get = (type) => (parts.find((p) => p.type === type) || {}).value || "";
      return `${get("year")}-${get("month")}-${get("day")}`;
    }

    function getRequestedWorkDateFromUrl_() {
      try {
        const qs = new URLSearchParams(window.location.search || "");
        const raw = String(qs.get("date") || "").trim();
        return parseISODate_(raw) ? raw : "";
      } catch (err) {
        return "";
      }
    }

    function isTruthyDebugFlag_(val) {
      const v = String(val || "").trim().toLowerCase();
      return v === "1" || v === "true" || v === "yes" || v === "on";
    }

    function isAttendanceDebugEnabled_() {
      return attendanceManager.isAttendanceDebugEnabled_();
    }

    function attendanceDebugLog_() {
      return attendanceManager.attendanceDebugLog_.apply(null, arguments);
    }

    function attendanceDebugError_() {
      return attendanceManager.attendanceDebugError_.apply(null, arguments);
    }

    function resolveInitialWorkDate_(savedDate) {
      // Always start on current day; ignore URL/local saved date at boot.
      return todayISO();
    }

    async function enforceStartupWorkDateRule_() {
      const todayKey = todayISO();
      if (String(workDateEl.value || "").trim() === todayKey) return todayKey;
      state.workDate = todayKey;
      workDateEl.value = todayKey;
      getOrCreateStartDraft(todayKey);
      getOrCreateEodDraft(todayKey);
      return todayKey;
    }

    function nextDateISO(isoDate) {
      const [y, m, d] = (isoDate || todayISO()).split("-").map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      dt.setDate(dt.getDate() + 1);
      const yy = String(dt.getFullYear());
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }

    function previousDateISO(isoDate) {
      const [y, m, d] = (isoDate || todayISO()).split("-").map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      dt.setDate(dt.getDate() - 1);
      const yy = String(dt.getFullYear());
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }

    function normalizePriority(raw) {
      const v = (raw || "").trim().toLowerCase();
      if (v === "low") return "Low";
      if (v === "high") return "High";
      return "Medium";
    }

    function canonicalDepartmentKey_(value) {
      const key = String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
      if (key === "mk" || key === "marketing") return "marketing";
      return key;
    }

    function isMarketingDepartment_(value) {
      return canonicalDepartmentKey_(value) === "marketing";
    }

    function isMarketingIdentity_() {
      return isMarketingDepartment_(identity && identity.dept);
    }

    function normalizeTaskProject(raw) {
      return String(raw || "").trim();
    }

    function ensureProjectOptionValue_(selectEl, value) {
      if (!selectEl) return;
      const normalized = normalizeTaskProject(value);
      if (!normalized) {
        selectEl.value = "";
        return;
      }
      const hasOption = Array.from(selectEl.options || []).some((opt) => String(opt.value || "").trim() === normalized);
      if (!hasOption) {
        const optionEl = document.createElement("option");
        optionEl.value = normalized;
        optionEl.textContent = normalized;
        selectEl.appendChild(optionEl);
      }
      selectEl.value = normalized;
    }

    function renderNewTaskProjectControls_() {
      const dateKey = String(workDateEl && workDateEl.value || "").trim();
      const isMarketing = isMarketingIdentity_();
      const isSodSubmitted = isSodSubmittedForDate_(dateKey);
      const isSodLocked = isSodLockedByMode_(dateKey);
      const isDisabled = isSodSubmitted || isSodLocked;
      if (newTaskProjectWrapEl) newTaskProjectWrapEl.hidden = !isMarketing;
      if (newTaskProjectEl) {
        newTaskProjectEl.disabled = isMarketing ? isDisabled : true;
        if (!isMarketing) newTaskProjectEl.value = "";
      }
    }

    function buildProjectChip_(project) {
      const value = normalizeTaskProject(project);
      if (!value) return null;
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = `Project: ${value}`;
      return chip;
    }

    function renderSodPrioritySegment_() {
      if (!newTaskPriorityGroupEl || !newTaskPriorityEl) return;
      const current = normalizePriority(newTaskPriorityEl.value || "Medium");
      newTaskPriorityGroupEl.querySelectorAll(".priority-segment-btn").forEach((btn) => {
        const value = normalizePriority(btn.getAttribute("data-priority") || "");
        const isActive = value === current;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    function renderNewTaskRecurrenceControls_() {
      if (!newTaskFrequencyEl || !newTaskRecurrenceRowEl || !newTaskWeeklyDayEl || !newTaskMonthlyDateEl) return;
      const frequency = normalizeRecurringFrequency(newTaskFrequencyEl.value);
      const showWeekly = frequency === "Weekly";
      const showMonthly = frequency === "Monthly";
      newTaskRecurrenceRowEl.hidden = !(showWeekly || showMonthly);
      newTaskWeeklyDayEl.hidden = !showWeekly;
      newTaskWeeklyDayEl.disabled = !showWeekly;
      newTaskMonthlyDateEl.hidden = !showMonthly;
      newTaskMonthlyDateEl.disabled = !showMonthly;
      if (!showWeekly) newTaskWeeklyDayEl.value = "";
      if (!showMonthly) newTaskMonthlyDateEl.value = "";
    }

    function normalizeRecurringFrequency(raw) {
      const v = (raw || "").trim().toLowerCase();
      if (v === "daily") return "Daily";
      if (v === "weekly") return "Weekly";
      if (v === "monthly") return "Monthly";
      return "";
    }

    function normalizeRecurringWeekday(raw) {
      if (raw == null || String(raw).trim() === "") return null;
      const day = Number(raw);
      if (!Number.isFinite(day)) return null;
      const whole = Math.floor(day);
      return whole >= 0 && whole <= 6 ? whole : null;
    }

    function normalizeRecurringDayOfMonth(raw) {
      if (raw == null || String(raw).trim() === "") return null;
      const day = Number(raw);
      if (!Number.isFinite(day)) return null;
      const whole = Math.floor(day);
      return whole >= 1 && whole <= 31 ? whole : null;
    }

    function inferRecurringRuleFromStartDate_(frequency, startDateRaw) {
      const freq = normalizeRecurringFrequency(frequency);
      const dt = parseISODate_(startDateRaw);
      if (!dt) return { recurrenceWeekday: null, recurrenceDayOfMonth: null };
      if (freq === "Weekly") {
        return { recurrenceWeekday: dt.getDay(), recurrenceDayOfMonth: null };
      }
      if (freq === "Monthly") {
        return { recurrenceWeekday: null, recurrenceDayOfMonth: dt.getDate() };
      }
      return { recurrenceWeekday: null, recurrenceDayOfMonth: null };
    }

    function resolveRecurringRule_(task, fallbackStartDate) {
      const freq = normalizeRecurringFrequency(task && task.frequency);
      const startDate = String((task && task.startDate) || fallbackStartDate || workDateEl.value || "").trim();
      const inferred = inferRecurringRuleFromStartDate_(freq, startDate);
      const weekday = normalizeRecurringWeekday(task && task.recurrenceWeekday);
      const dayOfMonth = normalizeRecurringDayOfMonth(task && task.recurrenceDayOfMonth);
      if (freq === "Weekly") {
        return { recurrenceWeekday: weekday !== null ? weekday : inferred.recurrenceWeekday, recurrenceDayOfMonth: null };
      }
      if (freq === "Monthly") {
        return { recurrenceWeekday: null, recurrenceDayOfMonth: dayOfMonth !== null ? dayOfMonth : inferred.recurrenceDayOfMonth };
      }
      return { recurrenceWeekday: null, recurrenceDayOfMonth: null };
    }

    function getRecurringRuleLabel_(task) {
      const freq = normalizeRecurringFrequency(task && task.frequency);
      if (freq === "Weekly") {
        const day = normalizeRecurringWeekday(task && task.recurrenceWeekday);
        return day === null ? "Weekly" : `Weekly (${WEEKDAY_LABELS[day]})`;
      }
      if (freq === "Monthly") {
        const day = normalizeRecurringDayOfMonth(task && task.recurrenceDayOfMonth);
        return day === null ? "Monthly" : `Monthly (${day})`;
      }
      return freq || "";
    }

    function firstNameOnly(raw) {
      const full = String(raw || "").trim();
      if (!full) return "";
      return full.split(/\s+/)[0] || full;
    }

    function priorityClass(priority) {
      const p = normalizePriority(priority).toLowerCase();
      return p === "low" || p === "high" ? p : "medium";
    }

    function getAccessParams() {
      const params = new URLSearchParams(window.location.search);
      const read = (...keys) => {
        for (let i = 0; i < keys.length; i += 1) {
          const raw = params.get(keys[i]);
          if (raw != null && String(raw).trim()) return String(raw).trim();
        }
        return "";
      };
      return {
        dept: read("dept", "department", "Department", "DEPT"),
        name: read("name", "employeeName", "employee", "Name", "EMPLOYEENAME"),
        code: read("code", "accessCode", "access_code", "Code", "ACCESSCODE")
      };
    }

    function accessCodeCandidates_(rawCode) {
      const raw = String(rawCode || "").trim();
      if (!raw) return [];
      const out = [];
      const add = (value) => {
        const code = String(value || "").trim();
        if (code && !out.includes(code)) out.push(code);
      };
      add(raw);
      try {
        add(atob(raw));
      } catch (err) {}
      try {
        add(btoa(raw));
      } catch (err) {}
      return out;
    }

    function resolveIdentityFromParams_(params) {
      const dept = String(params && params.dept || "").trim();
      const name = String(params && params.name || "").trim();
      const code = String(params && params.code || "").trim();
      if (!code) return null;

      const tryDept = USER_DIRECTORY[dept];
      if (tryDept && tryDept[name]) {
        const expected = __decodeSecret(tryDept[name]);
        if (expected && expected === code) {
          return { dept, name, code };
        }
      }

      const sameText = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
      const canonicalDept = (raw) => String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
      const targetDept = canonicalDept(dept);
      let match = null;
      const codeMatches = [];
      Object.keys(USER_DIRECTORY || {}).some((d) => {
        const users = USER_DIRECTORY[d] || {};
        return Object.keys(users).some((n) => {
          const expected = __decodeSecret(users[n]);
          if (!expected || expected !== code) return false;
          codeMatches.push({ dept: d, name: n, code });
          if (name && !sameText(n, name)) return false;
          if (targetDept && !sameText(d, dept) && canonicalDept(d) !== targetDept) return false;
          match = { dept: d, name: n, code };
          return true;
        });
      });
      if (!match && codeMatches.length === 1) return codeMatches[0];
      return match;
    }

    function getAdminPageUrl() {
      const currentPath = String(window.location.pathname || "/");
      if (/task\.html$/i.test(currentPath)) {
        return `${window.location.origin}${currentPath.replace(/task\.html$/i, "admin.html")}`;
      }
      return `${window.location.origin}/team/admin.html`;
    }

    function configureAdminButtonForIdentity() {
      if (!openAdminBtn || !identity) return;
      const rec = SUPER_ADMIN_LINKS[identity.name];
      if (!rec) {
        openAdminBtn.hidden = true;
        return;
      }
      const adminName = __decodeSecret(rec.admin);
      const adminCode = __decodeSecret(rec.code);
      if (!adminName || !adminCode) {
        openAdminBtn.hidden = true;
        return;
      }
      const params = new URLSearchParams({
        admin: adminName,
        code: adminCode
      });
      openAdminBtn.dataset.adminUrl = `${getAdminPageUrl()}?${params.toString()}`;
      openAdminBtn.hidden = false;
    }

    function loadState() {
      return stateStore.loadState();
    }

    const startDraftRemoteSyncTimersByDate = Object.create(null);
    const startDraftRemoteSyncInFlightByDate = Object.create(null);
    const startDraftRemoteSyncQueuedByDate = Object.create(null);
    const startDraftRemoteSignatureByDate = Object.create(null);

    function saveState(force) {
      stateStore.saveState(state, force);
      scheduleRemoteStartDraftSync_(String((workDateEl && workDateEl.value) || (state && state.workDate) || "").trim(), force === true);
    }

    function ensureArray(value) {
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          return [];
        }
      }
      return [];
    }

    function sanitizeStartDraftTasksForRemote_(dateKey) {
      const draftTasks = ensureArray(state && state.startDraftByDate && state.startDraftByDate[dateKey]);
      return draftTasks
        .map((t) => ({
          taskId: String(t && t.taskId || "").trim() || createTaskId(),
          title: String(t && t.title || "").trim(),
          project: normalizeTaskProject(t && t.project),
          priority: normalizePriority(t && t.priority),
          source: (String(t && t.source || "").trim().toLowerCase() === "planner")
            ? "planner"
            : (isCarryoverTask(t) ? "carryover" : (isAssignedTask(t) ? "assigned" : (isRecurringTask(t) ? "recurring" : "sod"))),
          frequency: normalizeRecurringFrequency(t && t.frequency),
          recurrenceWeekday: normalizeRecurringWeekday(t && t.recurrenceWeekday),
          recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t && t.recurrenceDayOfMonth),
          plannedHours: Number.isFinite(Number(t && t.plannedHours)) ? Number(t.plannedHours) : 0,
          plannedMinutes: Number.isFinite(Number(t && t.plannedMinutes)) ? Number(t.plannedMinutes) : 0,
          addedDate: isCarryoverTask(t) ? String(t && (t.addedDate || t.carryFrom) || "").trim() : "",
          lastCompletion: (isCarryoverTask(t) || isAssignedTask(t) || isRecurringTask(t)) ? getCarryoverLastCompletion(t) : null,
          lastNote: (isCarryoverTask(t) || isAssignedTask(t) || isRecurringTask(t)) ? String(t && t.lastNote || "").trim() : "",
          carryoverOrigin: isCarryoverTask(t) ? String(t && t.carryoverOrigin || "") : "",
          assignedBy: isAssignedTask(t) ? String(t && t.assignedBy || "").trim() : ""
        }))
        .filter((t) => t.title.length > 0);
    }

    function getSelectedStartDraftTaskIdsForRemote_(dateKey, tasks) {
      const selectedMap = state && state.sodSelectedTaskIdsByDate && typeof state.sodSelectedTaskIdsByDate === "object"
        ? state.sodSelectedTaskIdsByDate[dateKey]
        : null;
      const out = {};
      (Array.isArray(tasks) ? tasks : []).forEach((task) => {
        const taskId = String(task && task.taskId || "").trim();
        if (!taskId) return;
        out[taskId] = selectedMap ? Boolean(selectedMap[taskId]) : true;
      });
      return out;
    }

    function computeRemoteStartDraftSignature_(dateKey) {
      const tasks = sanitizeStartDraftTasksForRemote_(dateKey);
      const selectedTaskIds = getSelectedStartDraftTaskIdsForRemote_(dateKey, tasks);
      return JSON.stringify({ tasks, selectedTaskIds });
    }

    async function flushRemoteStartDraftSync_(dateKey, force = false) {
      const key = String(dateKey || "").trim();
      if (!identity || !key) return;
      if (startDraftRemoteSyncInFlightByDate[key]) {
        startDraftRemoteSyncQueuedByDate[key] = true;
        return;
      }
      const isAlreadySubmitted = Boolean(
        (Array.isArray(state && state.sodByDate && state.sodByDate[key]) && state.sodByDate[key].length > 0)
        || (state && state.sodSubmittedFlagByDate && state.sodSubmittedFlagByDate[key])
      );
      if (isAlreadySubmitted) {
        delete startDraftRemoteSignatureByDate[key];
        return;
      }
      const signature = computeRemoteStartDraftSignature_(key);
      if (!force && startDraftRemoteSignatureByDate[key] === signature) return;
      const parsed = JSON.parse(signature);
      startDraftRemoteSyncInFlightByDate[key] = true;
      try {
        const result = await callApi("saveStartDraft", {
          workDate: key,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          tasks: parsed.tasks,
          selectedTaskIds: parsed.selectedTaskIds,
          clientVersion: CLIENT_VERSION
        }, { timeoutMs: 8000, maxAttempts: 2 });
        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : "Draft sync failed.");
        }
        startDraftRemoteSignatureByDate[key] = signature;
      } catch (err) {
      } finally {
        startDraftRemoteSyncInFlightByDate[key] = false;
        if (startDraftRemoteSyncQueuedByDate[key]) {
          startDraftRemoteSyncQueuedByDate[key] = false;
          scheduleRemoteStartDraftSync_(key, true);
        }
      }
    }

    function scheduleRemoteStartDraftSync_(dateKey, immediate = false) {
      const key = String(dateKey || "").trim();
      if (!identity || !key) return;
      const existingTimer = startDraftRemoteSyncTimersByDate[key];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        delete startDraftRemoteSyncTimersByDate[key];
      }
      const delayMs = immediate ? 0 : 900;
      startDraftRemoteSyncTimersByDate[key] = window.setTimeout(() => {
        delete startDraftRemoteSyncTimersByDate[key];
        flushRemoteStartDraftSync_(key, immediate).catch(() => {});
      }, delayMs);
    }

    function normalizeRemoteStartDraftPayload_(result) {
      const rawTasks = Array.isArray(result && result.tasks) ? result.tasks : [];
      const tasks = rawTasks
        .map((t) => ({
          taskId: String(t && t.taskId || "").trim() || createTaskId(),
          title: String(t && t.title || t.task || "").trim(),
          project: normalizeTaskProject(t && t.project),
          priority: normalizePriority(t && t.priority),
          source: (String(t && t.source || "").trim().toLowerCase() === "planner")
            ? "planner"
            : (String(t && t.source || "").trim().toLowerCase() === "carryover"
              ? "carryover"
              : (String(t && t.source || "").trim().toLowerCase() === "assigned"
                ? "assigned"
                : (normalizeRecurringFrequency(t && t.frequency) ? "recurring" : "sod"))),
          frequency: normalizeRecurringFrequency(t && t.frequency),
          recurrenceWeekday: normalizeRecurringWeekday(t && t.recurrenceWeekday),
          recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t && t.recurrenceDayOfMonth),
          plannedHours: Number.isFinite(Number(t && t.plannedHours)) ? Number(t.plannedHours) : 0,
          plannedMinutes: Number.isFinite(Number(t && t.plannedMinutes)) ? Number(t.plannedMinutes) : 0,
          addedDate: String(t && (t.addedDate || t.carryFrom) || "").trim(),
          lastCompletion: Number.isFinite(Number(t && t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: String(t && t.lastNote || "").trim(),
          carryoverOrigin: String(t && t.carryoverOrigin || "").trim(),
          assignedBy: String(t && t.assignedBy || "").trim()
        }))
        .filter((t) => t.title.length > 0);
      const selectedTaskIdsRaw = (result && result.selectedTaskIds && typeof result.selectedTaskIds === "object" && !Array.isArray(result.selectedTaskIds))
        ? result.selectedTaskIds
        : {};
      const selectedTaskIds = {};
      tasks.forEach((task) => {
        const taskId = String(task.taskId || "").trim();
        if (!taskId) return;
        selectedTaskIds[taskId] = Object.prototype.hasOwnProperty.call(selectedTaskIdsRaw, taskId)
          ? Boolean(selectedTaskIdsRaw[taskId])
          : true;
      });
      return { tasks, selectedTaskIds };
    }

    async function loadRemoteStartDraft_(dateKey, options = {}) {
      const key = String(dateKey || "").trim();
      if (!identity || !key) return false;
      const hasSubmittedSod = Boolean(
        (Array.isArray(state && state.sodByDate && state.sodByDate[key]) && state.sodByDate[key].length > 0)
        || (state && state.sodSubmittedFlagByDate && state.sodSubmittedFlagByDate[key])
      );
      if (hasSubmittedSod) return false;
      const existingDraft = ensureArray(state && state.startDraftByDate && state.startDraftByDate[key]);
      const allowOverwrite = Boolean(options && options.allowOverwrite);
      if (!allowOverwrite && existingDraft.length > 0) return false;
      try {
        const result = await callApi("getStartDraft", {
          workDate: key,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion: CLIENT_VERSION
        }, { timeoutMs: 8000, maxAttempts: 2 });
        if (!result || result.ok === false) return false;
        const remote = normalizeRemoteStartDraftPayload_(result);
        if (!remote.tasks.length) return false;
        state.startDraftByDate[key] = remote.tasks;
        state.sodSelectedTaskIdsByDate[key] = remote.selectedTaskIds;
        state.startSourceByDate[key] = "supabase";
        startDraftRemoteSignatureByDate[key] = JSON.stringify({
          tasks: remote.tasks,
          selectedTaskIds: remote.selectedTaskIds
        });
        saveState();
        return true;
      } catch (err) {
        return false;
      }
    }

    async function ensurePreviousDraftAvailableForCarryover_(dateKey) {
      const prevDate = previousDateISO(dateKey);
      const prevSod = ensureArray(state && state.sodByDate && state.sodByDate[prevDate]);
      const prevDraft = ensureArray(state && state.startDraftByDate && state.startDraftByDate[prevDate]);
      if (prevSod.length || prevDraft.length) return;
      if (isEodSubmittedForDate_(prevDate)) return;
      await loadRemoteStartDraft_(prevDate);
    }

    function normalizePlannerTitleKey_(title) {
      return String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
    }

    function isPastDate_(iso) {
      const dateKey = String(iso || "").trim();
      if (!dateKey) return false;
      return dateKey < todayISO();
    }

    function setStatus(el, message, type) {
      el.className = "status";
      if (type) el.classList.add(type);
      el.textContent = message || "";
    }

    function showToast(message, type = "info", durationMs = 2400, action) {
      if (!toastStackEl) return;
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      const text = document.createElement("span");
      text.textContent = String(message || "");
      toast.appendChild(text);

      if (action && typeof action === "object" && action.label && typeof action.onClick === "function") {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "toast-action";
        actionBtn.textContent = String(action.label);
        actionBtn.addEventListener("click", () => {
          action.onClick();
          toast.classList.add("out");
          setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, 180);
        });
        toast.appendChild(actionBtn);
      }

      toastStackEl.appendChild(toast);
      setTimeout(() => {
        toast.classList.add("out");
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 180);
      }, durationMs);
    }

    function hasPendingSubmitOrWebhook_() {
      return Boolean(isSodSubmitting || isEodSubmitting || pendingWebhookRequests > 0);
    }

    function showUndoToast_(message, undoFn) {
      if (typeof undoFn !== "function") {
        showToast(message, "info");
        return;
      }
      const token = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      undoActionState = { token, undoFn };
      showToast(message, "info", 5200, {
        label: "Undo",
        onClick: () => {
          if (!undoActionState || undoActionState.token !== token) return;
          const callback = undoActionState.undoFn;
          undoActionState = null;
          callback();
        }
      });
      setTimeout(() => {
        if (undoActionState && undoActionState.token === token) {
          undoActionState = null;
        }
      }, 5400);
    }

    function setButtonLoading(button, loading, loadingLabel, normalLabel) {
      if (!button) return;
      if (loading) {
        if (!button.dataset.labelNormal) {
          button.dataset.labelNormal = normalLabel || button.innerHTML;
        }
        button.disabled = true;
        button.classList.add("btn-loading");
        button.innerHTML = `<i class="fa-solid fa-spinner"></i>${loadingLabel || "Loading..."}`;
        return;
      }
      button.disabled = false;
      button.classList.remove("btn-loading");
      button.innerHTML = normalLabel || button.dataset.labelNormal || button.innerHTML;
    }

    function cssEscapeSafe_(value) {
      const raw = String(value == null ? "" : value);
      if (window.CSS && typeof window.CSS.escape === "function") return CSS.escape(raw);
      return raw.replace(/["\\]/g, "\\$&");
    }

    function getOrCreateStartDraft(dateKey) {
      if (!state.startDraftByDate[dateKey]) {
        const carry = Array.isArray(state.carryoverByDate[dateKey]) ? state.carryoverByDate[dateKey] : [];
        state.startDraftByDate[dateKey] = carry.map((t) => ({
          taskId: t.taskId || createTaskId(),
          title: t.title || "",
          priority: normalizePriority(t.priority),
          source: "carryover",
          addedDate: String(t.addedDate || t.carryFrom || "").trim(),
          frequency: normalizeRecurringFrequency(t.frequency),
          recurrenceWeekday: normalizeRecurringWeekday(t.recurrenceWeekday),
          recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t.recurrenceDayOfMonth),
          lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: t.lastNote || "",
          plannedHours: Number.isFinite(Number(t.plannedHours)) ? Number(t.plannedHours) : 0,
          plannedMinutes: Number.isFinite(Number(t.plannedMinutes)) ? Number(t.plannedMinutes) : 0,
          carryoverOrigin: String(t.carryoverOrigin || state.carryoverSourceByDate[dateKey] || "local-storage")
        }));
        if (carry.length) {
          state.startSourceByDate[dateKey] = (state.carryoverSourceByDate[dateKey] === "google-sheets" || state.carryoverSourceByDate[dateKey] === "supabase")
            ? "supabase"
            : "local-storage";
        } else if (!state.startSourceByDate[dateKey]) {
          state.startSourceByDate[dateKey] = "new";
        }
      }
      return state.startDraftByDate[dateKey];
    }

    function getOrCreateSodSelectionByDate_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return {};
      if (!state.sodSelectedTaskIdsByDate || typeof state.sodSelectedTaskIdsByDate !== "object") {
        state.sodSelectedTaskIdsByDate = {};
      }
      if (!state.sodSelectedTaskIdsByDate[key] || typeof state.sodSelectedTaskIdsByDate[key] !== "object") {
        state.sodSelectedTaskIdsByDate[key] = {};
      }
      return state.sodSelectedTaskIdsByDate[key];
    }

    function syncSodSelectionForDate_(dateKey, tasks) {
      const selectedMap = getOrCreateSodSelectionByDate_(dateKey);
      const validIds = {};
      ensureArray(tasks).forEach((task, idx) => {
        const taskId = String(task && task.taskId || "").trim();
        if (!taskId) return;
        validIds[taskId] = true;
        if (!Object.prototype.hasOwnProperty.call(selectedMap, taskId)) {
          selectedMap[taskId] = false;
        }
      });
      Object.keys(selectedMap).forEach((taskId) => {
        if (!validIds[taskId]) delete selectedMap[taskId];
      });
      return selectedMap;
    }

    function getCarryoverLastCompletion(task) {
      const n = Number(task && task.lastCompletion);
      return Number.isFinite(n) ? n : null;
    }

    function getTaskIdentityKey_(task) {
      const taskId = String(task && task.taskId || "").trim();
      if (taskId) return `id:${taskId}`;
      const title = String(task && task.title || "").trim().toLowerCase();
      return title ? `title:${title}` : "";
    }

    function removeTaskFromListByIdentity_(list, task) {
      if (!Array.isArray(list) || !task) return list;
      const targetKey = getTaskIdentityKey_(task);
      if (!targetKey) return list;
      return list.filter((item) => getTaskIdentityKey_(item) !== targetKey);
    }

    function isCarryoverTask(task) {
      return task && task.source === "carryover";
    }

    function isAssignedTask(task) {
      return task && task.source === "assigned";
    }

    function isRecurringTask(task) {
      return task && task.source === "recurring";
    }

    function isLockedStartTask(task) {
      return isAssignedTask(task) || isRecurringTask(task);
    }

    function isPartiallyCompletedStartTask_(task) {
      const completion = Number(task && task.lastCompletion);
      return Number.isFinite(completion) && completion > 0 && completion < 100;
    }

    function getSodPostponeTaskKeys_(task) {
      const keys = [];
      const taskId = String(task && task.taskId || "").trim();
      if (taskId) keys.push(`id:${taskId}`);
      const title = String(task && task.title || "").trim().toLowerCase();
      const source = String(task && task.source || "").trim().toLowerCase();
      if (title) {
        if (source) keys.push(`source:${source}|title:${title}`);
        keys.push(`title:${title}`);
      }
      return Array.from(new Set(keys)).filter(Boolean);
    }

    function getSodPostponeTaskKey_(task) {
      const keys = getSodPostponeTaskKeys_(task);
      if (!keys.length) return "";
      const titleKey = keys.find((key) => key.startsWith("source:")) || keys.find((key) => key.startsWith("title:"));
      return titleKey || keys[0];
    }

    function getSodPostponeCount_(task) {
      if (!state || !state.sodPostponeCountByTaskKey || typeof state.sodPostponeCountByTaskKey !== "object") {
        return 0;
      }
      const counts = getSodPostponeTaskKeys_(task)
        .map((key) => Number(state.sodPostponeCountByTaskKey[key] || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (!counts.length) return 0;
      return Math.max.apply(null, counts);
    }

    function setSodPostponeCount_(task, value) {
      if (!state) return;
      if (!state.sodPostponeCountByTaskKey || typeof state.sodPostponeCountByTaskKey !== "object") {
        state.sodPostponeCountByTaskKey = {};
      }
      const next = Math.max(0, Math.floor(Number(value || 0)));
      getSodPostponeTaskKeys_(task).forEach((key) => {
        state.sodPostponeCountByTaskKey[key] = next;
      });
    }

    function getAllowedCompletionOptions(task) {
      if (isRecurringTask(task)) return [...COMPLETION_OPTIONS];
      const prev = getCarryoverLastCompletion(task);
      if (prev === null) return [...COMPLETION_OPTIONS];
      const filtered = COMPLETION_OPTIONS.filter((v) => v > prev);
      if (filtered.length) return filtered;
      return [100];
    }

    function getSodSubmissionSnapshot_(dateKey, tasks) {
      const list = Array.isArray(tasks) ? tasks : [];
      const selectedMap = getOrCreateSodSelectionByDate_(dateKey);
      let submitCount = 0;
      let totalPlannedMinutes = 0;

      list.forEach((task) => {
        const taskId = String(task && task.taskId || "").trim();
        if (!isSodSubmittedForDate_(dateKey) && taskId && !selectedMap[taskId]) return;

        submitCount += 1;
        const plannedHours = Number(task && task.plannedHours);
        const plannedMinutes = Number(task && task.plannedMinutes);
        const h = Number.isFinite(plannedHours) && plannedHours > 0 ? Math.floor(plannedHours) : 0;
        const m = Number.isFinite(plannedMinutes) && plannedMinutes > 0 ? Math.floor(plannedMinutes) : 0;
        totalPlannedMinutes += (h * 60 + m);
      });

      return {
        submitCount: submitCount,
        totalPlannedMinutes: totalPlannedMinutes
      };
    }

    function updateSodSubmitMeta_(dateKey, tasks) {
      if (!sodSubmitMetaEl) return;
      if (isSodLockedByMode_(dateKey)) {
        sodSubmitMetaEl.textContent = "SOD locked for this date";
        return;
      }

      const snap = getSodSubmissionSnapshot_(dateKey, tasks);
      const taskWord = snap.submitCount === 1 ? "task" : "tasks";
      if (isSodSubmittedForDate_(dateKey)) {
        sodSubmitMetaEl.textContent = `Submitted: ${snap.submitCount} ${taskWord} | Planned: ${formatMinutes(snap.totalPlannedMinutes)}`;
        return;
      }
      sodSubmitMetaEl.textContent = `Will submit: ${snap.submitCount} ${taskWord} | Planned: ${formatMinutes(snap.totalPlannedMinutes)}`;
    }

    function computeElapsedMinutesSinceLogin_(dateKey) {
      const attendance = getAttendancePayloadForDate_(dateKey);
      if (!attendance) return null;
      // If EOD submitted, use stored workingMinutes
      if (isEodSubmittedForDate_(dateKey) && attendance.workingMinutes != null) {
        return Number(attendance.workingMinutes);
      }
      const loginRaw = String(attendance.loginTime || "").trim();
      if (!loginRaw) return null;
      // loginTime is "HH:MM"
      const match = loginRaw.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      const loginH = Number(match[1]);
      const loginM = Number(match[2]);
      if (!Number.isFinite(loginH) || !Number.isFinite(loginM)) return null;
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const loginMinutes = loginH * 60 + loginM;
      const elapsed = nowMinutes - loginMinutes;
      return elapsed >= 0 ? elapsed : null;
    }

    function updateEodElapsedTime_(dateKey) {
      if (!eodElapsedTimeEl) return;
      const elapsed = computeElapsedMinutesSinceLogin_(dateKey);
      if (elapsed === null) {
        eodElapsedTimeEl.textContent = "--";
        return;
      }
      const h = Math.floor(elapsed / 60);
      const m = elapsed % 60;
      eodElapsedTimeEl.textContent = `${h}h ${String(m).padStart(2, "0")}m`;
    }

    function startEodElapsedInterval_() {
      if (eodElapsedIntervalId) return;
      eodElapsedIntervalId = setInterval(() => {
        const dateKey = workDateEl && workDateEl.value;
        if (dateKey) updateEodElapsedTime_(dateKey);
      }, 60000);
    }

    function renderSodSelectedPreview_(dateKey, tasks, selectedMap) {
      if (!sodSelectedPreviewEl) return;
      if (isSodSubmittedForDate_(dateKey) || isSodLockedByMode_(dateKey)) {
        sodSelectedPreviewEl.hidden = true;
        return;
      }
      const selected = ensureArray(tasks).filter((t) => {
        const taskId = String(t && t.taskId || "").trim();
        return taskId && Boolean(selectedMap[taskId]);
      });
      if (!selected.length) {
        sodSelectedPreviewEl.hidden = true;
        return;
      }
      sodSelectedPreviewEl.hidden = false;
      const titleEl = document.createElement("div");
      titleEl.className = "sod-preview-title";
      titleEl.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Queued for submission (${selected.length})`;
      const list = document.createElement("ul");
      list.className = "sod-preview-list";
      selected.forEach((t, i) => {
        const li = document.createElement("li");
        li.className = "sod-preview-item";
        const num = document.createElement("span");
        num.className = "sod-preview-num";
        num.textContent = `${i + 1}.`;
        const name = document.createElement("span");
        name.className = "sod-preview-name";
        name.textContent = t.title;
        const h = Number.isFinite(Number(t.plannedHours)) ? Number(t.plannedHours) : 0;
        const m = Number.isFinite(Number(t.plannedMinutes)) ? Number(t.plannedMinutes) : 0;
        if (h > 0 || m > 0) {
          const dur = document.createElement("span");
          dur.className = "sod-preview-dur";
          dur.textContent = `${h}h ${m}m`;
          li.appendChild(num);
          li.appendChild(name);
          li.appendChild(dur);
        } else {
          li.appendChild(num);
          li.appendChild(name);
        }
        list.appendChild(li);
      });
      sodSelectedPreviewEl.innerHTML = "";
      sodSelectedPreviewEl.appendChild(titleEl);
      sodSelectedPreviewEl.appendChild(list);
    }

    function buildCompletionOptionsMarkup(values) {
      return [
        "<option value=\"\">Select</option>",
        ...values.map((v) => `<option value=\"${v}\">${v}</option>`)
      ].join("");
    }

    const PROJECT_GROUPS = [
      { label: "Branding", options: ["Medical Monarchs", "The Compounding Mindset", "Medical Maharathi", "Business Monarchs", "Brand Film", "FinancialOPD", "Fund ka Funda"] },
      { label: "Social Media & Digital", options: ["CRM", "Lead Gen Ads", "Financial Fitness Checkup", "Founders Linkedin Account", "Social Media", "Website"] },
      { label: "Webinars & Events", options: ["Paid Webinar", "Wednesday Webinar"] },
      { label: "Offline Marketing", options: ["Mega Event", "RTM", "Nashik April Event", "IDA", "Ajanta Pharma"] },
      { label: "Content & PR", options: ["Case Studies", "NewsLetter", "PR"] },
    ];

    function buildProjectOptionsMarkup() {
      return [
        "<option value=\"\">Select project</option>",
        ...PROJECT_GROUPS.map(g =>
          `<optgroup label="${g.label}">${g.options.map(o => `<option value="${o}">${o}</option>`).join("")}</optgroup>`
        )
      ].join("");
    }

    function focusEditorField(editorId, field) {
      window.requestAnimationFrame(() => {
        setTimeout(() => {
          const esc = (v) => (window.CSS && typeof CSS.escape === "function")
            ? CSS.escape(v)
            : String(v).replace(/["\\]/g, "\\$&");
          const selector = `[data-editor-id="${esc(editorId)}"][data-field="${esc(field)}"]`;
          const el = document.querySelector(selector);
          if (!el) return;
          if (typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
          el.focus({ preventScroll: false });
          if (typeof el.select === "function" && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
            el.select();
          }
        }, 0);
      });
    }

    function getPendingTasksForDate(dateKey) {
      if (isEodSubmittedForDate_(dateKey)) return [];
      const submitted = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
      if (state.sodSubmittedFlagByDate[dateKey] && !submitted.length) return [];
      if (submitted.length) return submitted;
      return getOrCreateStartDraft(dateKey);
    }

    function isSodSubmittedForDate_(dateKey) {
      return Boolean(
        (Array.isArray(state.sodByDate[dateKey]) && state.sodByDate[dateKey].length > 0)
        || state.sodSubmittedFlagByDate[dateKey]
      );
    }

    function isEodSubmittedForDate_(dateKey) {
      const hasSubmittedUpdates = Array.isArray(state.eodSubmittedUpdatesByDate[dateKey])
        && state.eodSubmittedUpdatesByDate[dateKey].length > 0;
      const hasSubmittedSync = Boolean(
        state.submissionDetailsSyncedByDate && state.submissionDetailsSyncedByDate[dateKey]
      );
      if (hasSubmittedUpdates && hasSubmittedSync) return true;
      if (!state.eodSubmittedByDate[dateKey]) return false;
      // Prevent stale local flags from locking EOD until backend day-details sync confirms it.
      return Boolean(hasSubmittedSync || hasSubmittedUpdates);
    }

    function isEodUnlockedWithoutSodForDate_(dateKey) {
      return Boolean(state && state.eodUnlockedWithoutSodByDate && state.eodUnlockedWithoutSodByDate[dateKey]);
    }

    function getDayEntryMode_(dateKey) {
      if (isSodSubmittedForDate_(dateKey)) return "EOD";
      return isEodUnlockedWithoutSodForDate_(dateKey) ? "EOD" : "SOD";
    }

    function isSodLockedByMode_(dateKey) {
      if (isSodSubmittedForDate_(dateKey)) return false;
      return getDayEntryMode_(dateKey) === "EOD";
    }

    function isEodLockedUntilSod_(dateKey) {
      if (isEodSubmittedForDate_(dateKey)) return false;
      if (isSodSubmittedForDate_(dateKey)) return false;
      return getDayEntryMode_(dateKey) !== "EOD";
    }

    function canEnableEodSubmitForDate_(dateKey) {
      if (isEodSubmittedForDate_(dateKey)) return false;
      if (isSodSubmittedForDate_(dateKey)) return true;
      return isEodUnlockedWithoutSodForDate_(dateKey);
    }

    function updateEodSubmitButtonState_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key || !submitEodBtn) return;
      const allowByRule = canEnableEodSubmitForDate_(key);
      submitEodBtn.disabled = Boolean(isDateLoading || isEodSubmitting || !allowByRule);
    }

    async function syncSubmittedStateFromSheets(dateKey, force = false) {
      if (!identity || !dateKey) return;
      try {
        await callApiJsonp("getCarryover", {
          workDate: nextDateISO(dateKey),
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion: CLIENT_VERSION
        }, 8000);

        // Do not mark EOD as submitted from carryover source date:
        // carryover can legitimately originate from previous-day SOD when EOD was not submitted.
        // Authoritative submitted flags are handled by getSubmittedDayDetails.
        if (force) {
          // Force mode can explicitly refresh stale local flags for the selected date.
          if (!Array.isArray(state.eodSubmittedUpdatesByDate[dateKey]) || !state.eodSubmittedUpdatesByDate[dateKey].length) {
            state.eodSubmittedByDate[dateKey] = false;
          }
        }
      } catch (err) {
        // Non-blocking: keep UX responsive even if this check fails.
      } finally {
        state.submissionCheckByDate[dateKey] = true;
        saveState();
      }
    }

    async function syncSubmittedDetailsFromSheets(dateKey, force = false, options = {}) {
      if (!identity || !dateKey) return;
      const hasSubmittedUpdates = Array.isArray(state.eodSubmittedUpdatesByDate[dateKey]) && state.eodSubmittedUpdatesByDate[dateKey].length > 0;
      const needsBackfill = Boolean(state.eodSubmittedByDate[dateKey] && !hasSubmittedUpdates);
      if (!force && state.submissionDetailsSyncedByDate[dateKey] && !needsBackfill) return;
      const fast = Boolean(options && options.fast);
      const maxAttempts = fast ? 2 : 3;
      const baseTimeout = fast ? 5000 : 6500;
      const timeoutStep = fast ? 1500 : 2500;
      try {
        let result = null;
        let lastErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            result = await callApiJsonp("getSubmittedDayDetails", {
              workDate: dateKey,
              department: identity.dept,
              employeeName: identity.name,
              accessCode: identity.code,
              clientVersion: CLIENT_VERSION
            }, baseTimeout + (attempt - 1) * timeoutStep);
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (!result && lastErr) throw lastErr;

        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : "Submitted day details fetch rejected.");
        }

        const keyOfTask_ = (task) => {
          const id = String(task && task.taskId || "").trim();
          const title = String(task && task.title || "").trim().toLowerCase();
          return id ? `id:${id}` : (title ? `title:${title}` : "");
        };
        const sourceMetaByKey = new Map();
        const upsertSourceMeta_ = (task) => {
          if (!task) return;
          const key = keyOfTask_(task);
          if (!key) return;
          const existing = sourceMetaByKey.get(key);
          const nextCompletion = Number(task && task.lastCompletion);
          const prevCompletion = Number(existing && existing.lastCompletion);
          if (!existing) {
            sourceMetaByKey.set(key, task);
            return;
          }
          const hasNext = Number.isFinite(nextCompletion);
          const hasPrev = Number.isFinite(prevCompletion);
          if (hasNext && (!hasPrev || nextCompletion > prevCompletion)) {
            sourceMetaByKey.set(key, task);
          }
        };
        [
          ensureArray(state.sodByDate[dateKey]),
          ensureArray(state.startDraftByDate[dateKey]),
          ensureArray(state.carryoverByDate[dateKey]),
          ensureArray(state.assignmentByDate[dateKey]),
          ensureArray(state.recurringByDate[dateKey])
        ].forEach((list) => list.forEach((task) => upsertSourceMeta_(task)));

        const sodTasks = ensureArray(result.sodTasks)
          .map((t) => {
            try {
              const taskId = String(t && t.taskId || "").trim() || createTaskId();
              const title = String(t && t.title || "").trim();
              const lookupTask = { taskId: taskId, title: title };
              const sourceMeta = sourceMetaByKey.get(keyOfTask_(lookupTask)) || null;
              const sourceRaw = String(sourceMeta && sourceMeta.source || "").toLowerCase();
              const fallbackFrequency = normalizeRecurringFrequency(sourceMeta && sourceMeta.frequency);
              const incomingFrequency = normalizeRecurringFrequency(t && t.frequency);
              const resolvedFrequency = incomingFrequency || fallbackFrequency;
              const incomingWeekday = normalizeRecurringWeekday(t && t.recurrenceWeekday);
              const incomingDayOfMonth = normalizeRecurringDayOfMonth(t && t.recurrenceDayOfMonth);
              const fallbackWeekday = normalizeRecurringWeekday(sourceMeta && sourceMeta.recurrenceWeekday);
              const fallbackDayOfMonth = normalizeRecurringDayOfMonth(sourceMeta && sourceMeta.recurrenceDayOfMonth);
              const inferredRule = inferRecurringRuleFromStartDate_(resolvedFrequency, t && t.startDate);
              const readSourceMetaNumber_ = (fieldName, fallbackValue) => {
                if (!sourceMeta || typeof sourceMeta !== "object") return fallbackValue;
                const parsed = Number(sourceMeta[fieldName]);
                return Number.isFinite(parsed) ? parsed : fallbackValue;
              };
              let source = "sod";
              if (sourceRaw === "carryover" || sourceRaw === "assigned" || sourceRaw === "recurring") {
                source = sourceRaw;
              } else if (incomingFrequency || fallbackFrequency) {
                source = "recurring";
              }
              const plannedHoursRaw = Number(t && t.plannedHours);
              const plannedMinutesRaw = Number(t && t.plannedMinutes);
              const plannedHours = Number.isFinite(plannedHoursRaw)
                ? plannedHoursRaw
                : readSourceMetaNumber_("plannedHours", 0);
              const plannedMinutes = Number.isFinite(plannedMinutesRaw)
                ? plannedMinutesRaw
                : readSourceMetaNumber_("plannedMinutes", 0);
              const lastCompletion = readSourceMetaNumber_("lastCompletion", null);
              return {
                taskId: taskId,
                title: title,
                project: normalizeTaskProject(t && t.project || sourceMeta && sourceMeta.project),
                priority: normalizePriority(t && t.priority),
                source: source,
                frequency: resolvedFrequency,
                recurrenceWeekday: resolvedFrequency === "Weekly"
                  ? (incomingWeekday !== null ? incomingWeekday : (fallbackWeekday !== null ? fallbackWeekday : inferredRule.recurrenceWeekday))
                  : null,
                recurrenceDayOfMonth: resolvedFrequency === "Monthly"
                  ? (incomingDayOfMonth !== null ? incomingDayOfMonth : (fallbackDayOfMonth !== null ? fallbackDayOfMonth : inferredRule.recurrenceDayOfMonth))
                  : null,
                plannedHours: plannedHours,
                plannedMinutes: plannedMinutes,
                lastCompletion: lastCompletion,
                lastNote: String(sourceMeta && sourceMeta.lastNote || "").trim(),
                carryoverOrigin: source === "carryover" ? String(sourceMeta && sourceMeta.carryoverOrigin || "local-storage") : "",
                assignedBy: source === "assigned" ? String(sourceMeta && sourceMeta.assignedBy || "").trim() : "",
                deadlineDate: source === "assigned" ? String(sourceMeta && sourceMeta.deadlineDate || "").trim() : "",
                deadlineDays: source === "assigned" && Number.isFinite(Number(sourceMeta && sourceMeta.deadlineDays))
                  ? Number(sourceMeta.deadlineDays)
                  : null
              };
            } catch (mapErr) {
              return {
                taskId: String(t && t.taskId || "").trim() || createTaskId(),
                title: String(t && t.title || "").trim(),
                project: normalizeTaskProject(t && t.project),
                priority: normalizePriority(t && t.priority),
                source: "sod",
                frequency: normalizeRecurringFrequency(t && t.frequency),
                recurrenceWeekday: normalizeRecurringWeekday(t && t.recurrenceWeekday),
                recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t && t.recurrenceDayOfMonth),
                plannedHours: Number.isFinite(Number(t && t.plannedHours)) ? Number(t.plannedHours) : 0,
                plannedMinutes: Number.isFinite(Number(t && t.plannedMinutes)) ? Number(t.plannedMinutes) : 0,
                lastCompletion: null,
                lastNote: "",
                carryoverOrigin: "",
                assignedBy: "",
                deadlineDate: "",
                deadlineDays: null
              };
            }
          })
          .filter((t) => t.title.length > 0);
        const sodPendingTasks = ensureArray(result.sodPendingTasks)
          .map((t) => ({
            taskId: String(t && t.taskId || "").trim() || createTaskId(),
            title: String(t && t.title || "").trim(),
            project: normalizeTaskProject(t && t.project),
            priority: normalizePriority(t && t.priority),
            source: String(t && t.source || "").trim().toLowerCase() || "sod",
            frequency: normalizeRecurringFrequency(t && t.frequency),
            recurrenceWeekday: normalizeRecurringWeekday(t && t.recurrenceWeekday),
            recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t && t.recurrenceDayOfMonth),
            plannedHours: Number.isFinite(Number(t && t.plannedHours)) ? Number(t.plannedHours) : 0,
            plannedMinutes: Number.isFinite(Number(t && t.plannedMinutes)) ? Number(t.plannedMinutes) : 0,
            lastCompletion: Number.isFinite(Number(t && t.lastCompletion)) ? Number(t.lastCompletion) : null,
            lastNote: String(t && t.lastNote || "").trim(),
            addedDate: String(t && (t.addedDate || t.carryFrom) || "").trim(),
            carryoverOrigin: String(t && t.carryoverOrigin || "").trim(),
            assignedBy: String(t && t.assignedBy || "").trim(),
            deadlineDate: String(t && t.deadlineDate || "").trim(),
            deadlineDays: Number.isFinite(Number(t && t.deadlineDays)) ? Number(t.deadlineDays) : null
          }))
          .filter((t) => t.title.length > 0);

        const eodUpdates = ensureArray(result.eodUpdates)
          .map((u) => ({
            taskId: String(u.taskId || "").trim() || createTaskId(),
            title: String(u.title || u.task || u.name || "").trim(),
            project: normalizeTaskProject(u.project),
            completionPercent: Number(u.completionPercent || 0),
            spentHours: Number(u.spentHours || 0),
            spentMinutes: Number(u.spentMinutes || 0),
            note: String(u.note || "").trim(),
            priority: normalizePriority(u.priority),
            source: String(u.source || "").trim().toLowerCase(),
            isExtra: Boolean(u.isExtra)
          }))
          .filter((u) => u.title.length > 0 || String(u.taskId || "").trim().length > 0);

        if (result.hasSod) {
          state.sodSubmittedFlagByDate[dateKey] = true;
          state.sodByDate[dateKey] = sodTasks;
          state.sodPendingByDate[dateKey] = sodPendingTasks;
        } else {
          // Backend is authoritative for submitted flags; clear stale local state.
          state.sodSubmittedFlagByDate[dateKey] = false;
          delete state.sodByDate[dateKey];
          delete state.sodPendingByDate[dateKey];
        }
        if (result.hasEod) {
          state.eodSubmittedByDate[dateKey] = true;
          state.eodSubmittedUpdatesByDate[dateKey] = eodUpdates;
          if (!state.eodSubmittedUpdatesByDate[dateKey].length && sodTasks.length) {
            state.eodSubmittedUpdatesByDate[dateKey] = sodTasks.map((t) => ({
              taskId: String(t.taskId || "").trim() || createTaskId(),
              title: String(t.title || "").trim(),
              project: normalizeTaskProject(t.project),
              completionPercent: 0,
              spentHours: 0,
              spentMinutes: 0,
              note: "",
              priority: normalizePriority(t.priority),
              source: String(t.source || "").trim().toLowerCase(),
              isExtra: false
            }));
          }
        } else {
          // Backend is authoritative for submitted flags; clear stale local state.
          state.eodSubmittedByDate[dateKey] = false;
          delete state.eodSubmittedUpdatesByDate[dateKey];
        }

        state.submissionDetailsSyncedByDate[dateKey] = true;
        saveState();
      } catch (err) {
        state.submissionDetailsSyncedByDate[dateKey] = false;
        const msg = String(err && err.message ? err.message : err);
        const hint = String(msg).toLowerCase().includes("timed out")
          ? " Check VPN/firewall/antivirus and allow *.supabase.co."
          : "";
        setStatus(sodStatusEl, `Submitted-day sync failed: ${msg}.${hint}`, "info");
        // Keep UI usable even if submitted-day sync fails temporarily.
        if (Array.isArray(state.sodByDate[dateKey]) && state.sodByDate[dateKey].length > 0) {
          state.sodSubmittedFlagByDate[dateKey] = true;
        }
        saveState();
      }
    }

    function mergeCarryoverIntoStartDraft(dateKey, carryoverTasks) {
      const existing = Array.isArray(state.startDraftByDate[dateKey]) ? state.startDraftByDate[dateKey] : [];
      const byKey = new Map();
      const carryoverKeySet = {};
      const taskKey = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };

      carryoverTasks.forEach((t) => {
        const key = taskKey(t);
        carryoverKeySet[key] = true;
        byKey.set(key, {
          taskId: t.taskId || createTaskId(),
          title: (t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: "carryover",
          addedDate: String(t.addedDate || t.carryFrom || "").trim(),
          lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: String(t.lastNote || "").trim(),
          carryoverOrigin: String(t.carryoverOrigin || "local-storage")
        });
      });

      existing.forEach((t) => {
        const key = taskKey(t);
        if (isCarryoverTask(t) && !carryoverKeySet[key]) return;
        if (byKey.has(key)) return;
        const source = isCarryoverTask(t)
          ? "carryover"
          : (isAssignedTask(t) ? "assigned" : (isRecurringTask(t) ? "recurring" : "sod"));
        byKey.set(key, {
          taskId: t.taskId || createTaskId(),
          title: (t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source,
          frequency: normalizeRecurringFrequency(t.frequency),
          recurrenceWeekday: normalizeRecurringWeekday(t.recurrenceWeekday),
          recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t.recurrenceDayOfMonth),
          addedDate: isCarryoverTask(t) ? String(t.addedDate || t.carryFrom || "").trim() : "",
          lastCompletion: (isCarryoverTask(t) || isAssignedTask(t) || isRecurringTask(t)) ? getCarryoverLastCompletion(t) : null,
          lastNote: (isCarryoverTask(t) || isAssignedTask(t) || isRecurringTask(t)) ? String(t.lastNote || "").trim() : "",
          carryoverOrigin: isCarryoverTask(t) ? String(t.carryoverOrigin || "local-storage") : "",
          assignedBy: isAssignedTask(t) ? String(t.assignedBy || "").trim() : "",
          plannedHours: Number.isFinite(Number(t.plannedHours)) ? Number(t.plannedHours) : 0,
          plannedMinutes: Number.isFinite(Number(t.plannedMinutes)) ? Number(t.plannedMinutes) : 0
        });
      });

      state.startDraftByDate[dateKey] = Array.from(byKey.values()).filter((t) => t.title.length > 0);
    }

    function hydrateCarryoverFromUnsubmittedSod(dateKey) {
      const prevDate = previousDateISO(dateKey);
      const prevSod = Array.isArray(state.sodByDate[prevDate]) ? state.sodByDate[prevDate] : [];
      const prevDraft = Array.isArray(state.startDraftByDate[prevDate]) ? state.startDraftByDate[prevDate] : [];
      const prevTasks = prevSod.length ? prevSod : prevDraft;
      if (!prevTasks.length) return false;
      if (isEodSubmittedForDate_(prevDate)) return false;

      const fallbackTasks = prevTasks
        .map((t) => ({
          taskId: t.taskId || createTaskId(),
          title: String(t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: "carryover",
          carryFrom: prevDate,
          addedDate: String(t.addedDate || t.carryFrom || prevDate || "").trim(),
          lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: String(t.lastNote || "").trim() || "Auto carryover (previous day EOD not submitted).",
          carryoverOrigin: "auto-unsubmitted-eod"
        }))
        .filter((t) => {
          if (t.title.length <= 0) return false;
          const completion = Number(t.lastCompletion);
          return !Number.isFinite(completion) || completion < 100;
        });

      if (!fallbackTasks.length) return false;

      const existing = Array.isArray(state.carryoverByDate[dateKey]) ? state.carryoverByDate[dateKey] : [];
      const map = new Map();
      const keyOf = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };

      existing.forEach((t) => map.set(keyOf(t), { ...t }));
      fallbackTasks.forEach((t) => {
        const k = keyOf(t);
        if (!map.has(k)) {
          map.set(k, t);
          return;
        }
        const current = map.get(k) || {};
        const curProgress = Number.isFinite(Number(current.lastCompletion)) ? Number(current.lastCompletion) : 0;
        const nextProgress = Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : 0;
        if (nextProgress > curProgress) {
          map.set(k, { ...current, ...t });
        }
      });

      const merged = Array.from(map.values()).filter((t) => String(t.title || "").trim().length > 0);
      state.carryoverByDate[dateKey] = merged;
      if (!state.carryoverSourceByDate[dateKey]) {
        state.carryoverSourceByDate[dateKey] = "local-storage";
      }
      if (!state.startSourceByDate[dateKey]) {
        state.startSourceByDate[dateKey] = "local-storage";
      }
      mergeCarryoverIntoStartDraft(dateKey, fallbackTasks);
      return true;
    }

    function mergeAssignmentsIntoStartDraft(dateKey, assignmentTasks) {
      const existing = Array.isArray(state.startDraftByDate[dateKey]) ? state.startDraftByDate[dateKey] : [];
      const byKey = new Map();
      const keyOf = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };
      const assignmentKeySet = {};

      assignmentTasks.forEach((t) => {
        const k = keyOf(t);
        assignmentKeySet[k] = true;
        byKey.set(k, {
          taskId: t.taskId || createTaskId(),
          title: String(t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: "assigned",
          assignedBy: String(t.assignedBy || "").trim(),
          assignedAt: String(t.assignedAt || "").trim(),
          deadlineDate: String(t.deadlineDate || "").trim(),
          deadlineDays: Number.isFinite(Number(t.deadlineDays)) ? Number(t.deadlineDays) : null,
          lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: String(t.lastNote || "").trim()
        });
      });

      existing.forEach((t) => {
        const key = keyOf(t);
        if (isAssignedTask(t) && !assignmentKeySet[key]) return;
        if (byKey.has(key)) return;
        byKey.set(key, { ...t });
      });

      state.startDraftByDate[dateKey] = Array.from(byKey.values()).filter((t) => String(t.title || "").trim().length > 0);
    }

    function mergeAssignmentsIntoSubmittedSod(dateKey, assignmentTasks) {
      const existing = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
      if (!existing.length) return;

      const byKey = new Map();
      const keyOf = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };
      const assignmentKeySet = {};

      assignmentTasks.forEach((t) => {
        const k = keyOf(t);
        assignmentKeySet[k] = true;
        if (byKey.has(k)) return;
        byKey.set(k, {
          taskId: t.taskId || createTaskId(),
          title: String(t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: "assigned",
          assignedBy: String(t.assignedBy || "").trim(),
          assignedAt: String(t.assignedAt || "").trim(),
          deadlineDate: String(t.deadlineDate || "").trim(),
          deadlineDays: Number.isFinite(Number(t.deadlineDays)) ? Number(t.deadlineDays) : null,
          lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: String(t.lastNote || "").trim()
        });
      });

      existing.forEach((t) => {
        const key = keyOf(t);
        if (isAssignedTask(t) && !assignmentKeySet[key]) return;
        if (byKey.has(key)) return;
        byKey.set(key, { ...t });
      });

      state.sodByDate[dateKey] = Array.from(byKey.values()).filter((t) => String(t.title || "").trim().length > 0);
    }

    function getCompletedTaskLookupUntilDate_(dateKey) {
      const lookup = { ids: {}, titles: {} };
      const target = String(dateKey || "").trim();
      const byDate = state && state.eodSubmittedUpdatesByDate && typeof state.eodSubmittedUpdatesByDate === "object"
        ? state.eodSubmittedUpdatesByDate
        : {};
      Object.keys(byDate).forEach((d) => {
        if (!target || String(d) > target) return;
        ensureArray(byDate[d]).forEach((u) => {
          const completion = Number(u && u.completionPercent || 0);
          if (!Number.isFinite(completion) || completion < 100) return;
          if (Boolean(u && u.isExtra)) return;
          const id = String(u && u.taskId || "").trim();
          const title = String(u && u.title || "").trim().toLowerCase();
          if (id) lookup.ids[id] = { completionPercent: completion, note: String(u && u.note || "").trim() };
          if (title) lookup.titles[title] = { completionPercent: completion, note: String(u && u.note || "").trim() };
        });
      });
      return lookup;
    }

    async function syncAssignmentsFromAdmin(dateKey, force = false) {
      if (!identity || !dateKey) return;

      try {
        const result = await callApiJsonp("getAssignments", {
          workDate: dateKey,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion: CLIENT_VERSION
        }, 12000);

        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : "Assignment fetch rejected.");
        }

        const assignments = ensureArray(result.tasks)
          .map((t) => ({
            taskId: t.taskId || createTaskId(),
            title: String(t.title || "").trim(),
            project: normalizeTaskProject(t.project),
            priority: normalizePriority(t.priority),
            source: "assigned",
            assignedBy: String(t.assignedBy || "").trim(),
            assignedAt: String(t.assignedAt || "").trim(),
            deadlineDate: String(t.deadlineDate || "").trim(),
            deadlineDays: Number.isFinite(Number(t.deadlineDays)) ? Number(t.deadlineDays) : null,
            lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
            lastNote: String(t.lastNote || "").trim()
          }))
          .filter((t) => t.title.length > 0);
        const completedLookup = getCompletedTaskLookupUntilDate_(dateKey);
        const activeAssignments = assignments.map((t) => {
          const id = String(t.taskId || "").trim();
          const titleKey = String(t.title || "").trim().toLowerCase();
          const local = (id && completedLookup.ids[id]) ? completedLookup.ids[id]
            : (titleKey && completedLookup.titles[titleKey]) ? completedLookup.titles[titleKey]
            : null;
          const remoteCompletion = Number(t.lastCompletion);
          const localCompletion = Number(local && local.completionPercent);
          const resolvedCompletion = Number.isFinite(localCompletion)
            ? (Number.isFinite(remoteCompletion) ? Math.max(remoteCompletion, localCompletion) : localCompletion)
            : (Number.isFinite(remoteCompletion) ? remoteCompletion : null);
          const resolvedNote = String(t.lastNote || "").trim() || String(local && local.note || "").trim();
          return {
            ...t,
            lastCompletion: resolvedCompletion,
            lastNote: resolvedNote
          };
        }).filter((t) => {
          const id = String(t.taskId || "").trim();
          const titleKey = String(t.title || "").trim().toLowerCase();
          const completion = Number(t.lastCompletion);
          if (Number.isFinite(completion) && completion >= 100) return false;
          if (id && completedLookup.ids[id]) return false;
          if (titleKey && completedLookup.titles[titleKey]) return false;
          return true;
        });

        state.assignmentByDate[dateKey] = activeAssignments;
        if (!isSodSubmittedForDate_(dateKey)) {
          // Always merge, even when assignments are empty, so removed tasks are purged.
          mergeAssignmentsIntoStartDraft(dateKey, activeAssignments);
        }
        if (activeAssignments.length) {
          state.startSourceByDate[dateKey] = (state.startSourceByDate[dateKey] === "google-sheets" || state.startSourceByDate[dateKey] === "supabase")
            ? "supabase"
            : "local-storage";
        }
        state.assignmentSyncedByDate[dateKey] = true;
        saveState();
      } catch (err) {
        if (isUnsupportedActionError_(err)) {
          state.assignmentByDate[dateKey] = [];
          state.assignmentSyncedByDate[dateKey] = true;
          saveState();
          return;
        }
        setStatus(sodStatusEl, `Assigned task sync failed: ${String(err && err.message ? err.message : err)}`, "info");
        saveState();
      }
    }

    function normalizeRecurringPayload(result) {
      const raw = ensureArray(result && result.tasks);
      return raw.map((t) => {
        const frequency = normalizeRecurringFrequency(t.frequency);
        const startDate = String(t.startDate || "").trim();
        const inferred = inferRecurringRuleFromStartDate_(frequency, startDate);
        const recurrenceWeekday = normalizeRecurringWeekday(t.recurrenceWeekday);
        const recurrenceDayOfMonth = normalizeRecurringDayOfMonth(t.recurrenceDayOfMonth);
        return {
          taskId: t.taskId || createTaskId(),
          title: String(t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: "recurring",
          frequency: frequency,
          startDate: startDate,
          recurrenceWeekday: frequency === "Weekly" ? (recurrenceWeekday !== null ? recurrenceWeekday : inferred.recurrenceWeekday) : null,
          recurrenceDayOfMonth: frequency === "Monthly" ? (recurrenceDayOfMonth !== null ? recurrenceDayOfMonth : inferred.recurrenceDayOfMonth) : null,
          lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
          lastNote: String(t.lastNote || "").trim(),
          plannedHours: Number.isFinite(Number(t.plannedHours)) ? Number(t.plannedHours) : 0,
          plannedMinutes: Number.isFinite(Number(t.plannedMinutes)) ? Number(t.plannedMinutes) : 0
        };
      }).filter((t) => t.title.length > 0 && RECURRING_FREQUENCIES.includes(t.frequency));
    }

    function mergeRecurringIntoStartDraft(dateKey, recurringTasks) {
      const existing = Array.isArray(state.startDraftByDate[dateKey]) ? state.startDraftByDate[dateKey] : [];
      const keyOf = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };
      const recurringKeySet = {};
      const byKey = new Map();

      recurringTasks.forEach((t) => {
        const k = keyOf(t);
        recurringKeySet[k] = true;
        byKey.set(k, { ...t, source: "recurring" });
      });

      existing.forEach((t) => {
        const key = keyOf(t);
        if (isRecurringTask(t) && !recurringKeySet[key]) return;
        if (byKey.has(key)) return;
        byKey.set(key, { ...t });
      });

      state.startDraftByDate[dateKey] = Array.from(byKey.values()).filter((t) => String(t.title || "").trim().length > 0);
    }

    function mergeRecurringIntoSubmittedSod(dateKey, recurringTasks) {
      const existing = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
      if (!existing.length) return;
      const keyOf = (t) => {
        const id = String(t && t.taskId || "").trim();
        const title = String(t && t.title || "").trim().toLowerCase();
        return id ? `id:${id}` : `title:${title}`;
      };
      const recurringKeySet = {};
      const byKey = new Map();

      recurringTasks.forEach((t) => {
        const k = keyOf(t);
        recurringKeySet[k] = true;
        byKey.set(k, { ...t, source: "recurring" });
      });

      existing.forEach((t) => {
        const key = keyOf(t);
        if (isRecurringTask(t) && !recurringKeySet[key]) return;
        if (byKey.has(key)) return;
        byKey.set(key, { ...t });
      });

      state.sodByDate[dateKey] = Array.from(byKey.values()).filter((t) => String(t.title || "").trim().length > 0);
    }

    async function syncRecurringFromSheets(dateKey, force = false) {
      if (!identity || !dateKey) return;
      if (!force && state.recurringSyncedByDate[dateKey]) return;

      try {
        const result = await callApiJsonp("getRecurringTasks", {
          workDate: dateKey,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion: CLIENT_VERSION
        }, 12000);

        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : "Recurring fetch rejected.");
        }

        const recurringTasks = normalizeRecurringPayload(result);
        state.recurringByDate[dateKey] = recurringTasks;
        if (recurringTasks.length) {
          if (!isSodSubmittedForDate_(dateKey)) {
            mergeRecurringIntoStartDraft(dateKey, recurringTasks);
          }
        }
        state.recurringSyncedByDate[dateKey] = true;
        saveState();
      } catch (err) {
        if (isUnsupportedActionError_(err)) {
          state.recurringByDate[dateKey] = [];
          state.recurringSyncedByDate[dateKey] = true;
          saveState();
          return;
        }
        setStatus(sodStatusEl, `Recurring sync failed: ${String(err && err.message ? err.message : err)}`, "info");
        saveState();
      }
    }

    function getOrCreateEodDraft(dateKey) {
      if (!state.eodDraftByDate[dateKey]) {
        state.eodDraftByDate[dateKey] = {
          selectedTaskIds: {},
          updatesByTaskId: {},
          stopRecurringByTaskId: {},
          approvalByTaskId: {},
          extras: [],
          activeEditorId: "",
          fieldErrors: {}
        };
      }
      if (!state.eodDraftByDate[dateKey].stopRecurringByTaskId || typeof state.eodDraftByDate[dateKey].stopRecurringByTaskId !== "object") {
        state.eodDraftByDate[dateKey].stopRecurringByTaskId = {};
      }
      if (typeof state.eodDraftByDate[dateKey].activeEditorId !== "string") {
        state.eodDraftByDate[dateKey].activeEditorId = "";
      }
      if (!state.eodDraftByDate[dateKey].fieldErrors || typeof state.eodDraftByDate[dateKey].fieldErrors !== "object") {
        state.eodDraftByDate[dateKey].fieldErrors = {};
      }
      if (!state.eodDraftByDate[dateKey].approvalByTaskId || typeof state.eodDraftByDate[dateKey].approvalByTaskId !== "object") {
        state.eodDraftByDate[dateKey].approvalByTaskId = {};
      }
      return state.eodDraftByDate[dateKey];
    }

    function getApprovalDraftForTask_(eodDraft, taskId) {
      return approvalsManager.getApprovalDraftForTask(eodDraft, taskId);
    }

    function clearApprovalDraftForTask_(eodDraft, taskId) {
      return approvalsManager.clearApprovalDraftForTask(eodDraft, taskId);
    }

    function clearApprovalDraftByRequestId_(requestId) {
      return approvalsManager.clearApprovalDraftByRequestId(requestId);
    }

    function isApprovalTaskSubmittedLock_(eodDraft, taskId) {
      return approvalsManager.isApprovalTaskSubmittedLock(eodDraft, taskId);
    }

    function normalizeApprovalStatus_(value) {
      return approvalsManager.normalizeApprovalStatus(value);
    }

    function approvalStatusLabel_(approval) {
      return approvalsManager.approvalStatusLabel(approval);
    }

    function approvalStatusClass_(approval) {
      return approvalsManager.approvalStatusClass(approval);
    }

    function findUserApprovalByRequestId_(requestId) {
      return approvalsManager.findUserApprovalByRequestId(requestId);
    }

    function getLatestApprovalForTask_(taskId, title, workDate) {
      return approvalsManager.getLatestApprovalForTask(taskId, title, workDate);
    }

    function getCliqEmailForName_(name) {
      return approvalsManager.getCliqEmailForName(name);
    }

    async function syncDepartmentApprovers_(force = false) {
      return approvalsManager.syncDepartmentApprovers(force);
    }

    async function syncUserApprovals_(force = false) {
      return approvalsManager.syncUserApprovals(force);
    }

    function renderTaskTabState_() {
      const rawTab = String(state && state.taskTab || "submissions").trim() || "submissions";
      const activeTab = rawTab === "planner" ? "submissions" : rawTab;
      if (state && state.taskTab !== activeTab) state.taskTab = activeTab;
      taskTabButtons.forEach((btn) => {
        const isActive = String(btn.dataset.taskTab || "") === activeTab;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });
      if (taskTabSubmissionsEl) taskTabSubmissionsEl.hidden = activeTab !== "submissions";
      if (taskTabPlannerEl) taskTabPlannerEl.hidden = activeTab !== "planner";
      if (taskTabApprovalsEl) taskTabApprovalsEl.hidden = activeTab !== "approvals";
    }

    function setTaskTab_(tab) {
      if (!state) return;
      const rawTab = String(tab || "").trim() || "submissions";
      const nextTab = rawTab === "planner" ? "submissions" : rawTab;
      if (state.taskTab === nextTab) return;
      state.taskTab = nextTab;
      saveState();
      renderAll();
      if (nextTab === "approvals") {
        syncUserApprovals_(true)
          .then(() => renderApprovalsPanel_())
          .catch((err) => {
            setStatus(approvalsStatusEl, `Approval sync failed: ${String(err && err.message ? err.message : err)}`, "error");
          });
      }
    }

    function buildApprovalControls_(dateKey, taskId, title, project, sourceNote, editorId, eodDraft) {
      return approvalsManager.buildApprovalControls(dateKey, taskId, title, project, sourceNote, editorId, eodDraft);
    }

    function renderApprovalsPanel_() {
      return approvalsManager.renderApprovalsPanel();
    }

    function showBlocked(message) {
      blockedMsgEl.textContent = message;
      blockedEl.classList.add("active");
      blockedEl.setAttribute("aria-hidden", "false");
      appEl.hidden = true;
      submitSodBtn.disabled = true;
      submitEodBtn.disabled = true;
    }

    function toFormEncoded(payload) {
      return window.TaskAppApi.toFormEncoded(payload);
    }

    function isCorsLikeNetworkError(err) {
      return window.TaskAppApi.isCorsLikeNetworkError(err);
    }

    function isTimeoutLikeError(err) {
      return window.TaskAppApi.isTimeoutLikeError(err);
    }

    function normalizeApiPayload_(payload) {
      return window.TaskAppApi.normalizeApiPayload_(payload);
    }

    function withTimeout_(promise, timeoutMs) {
      return window.TaskAppApi.withTimeout_(promise, timeoutMs);
    }

    function rpcNameForAction_(action) {
      return window.TaskAppApi.rpcNameForAction_(action);
    }

    async function callApi(action, payload, options = {}) {
      return apiClient.callApi(action, payload, options);
    }

    function callApiJsonp(action, payload, timeoutMs = 8000) {
      return apiClient.callApiJsonp(action, payload, timeoutMs);
    }

    function isUnsupportedActionError_(err) {
      return window.TaskAppApi.isUnsupportedActionError_(err);
    }

    function normalizeCarryoverPayload(result) {
      const raw = Array.isArray(result && result.tasks) ? result.tasks
        : Array.isArray(result && result.carryoverTasks) ? result.carryoverTasks
        : [];
      return raw
        .map((t) => ({
          taskId: t.taskId || createTaskId(),
          title: (t.title || t.task || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: "carryover",
          addedDate: String(t.addedDate || t.carryStartDate || t.pendingSinceDate || "").trim(),
          lastCompletion: t.lastCompletion,
          lastNote: t.lastNote,
          carryoverOrigin: "supabase"
        }))
        .filter((t) => {
          if (t.title.length <= 0) return false;
          const completion = Number(t.lastCompletion);
          return !Number.isFinite(completion) || completion < 100;
        });
    }

    function mergeCarryoverProgressWithLocal_(dateKey, incomingTasks) {
      const existingCarry = ensureArray(state && state.carryoverByDate && state.carryoverByDate[dateKey]);
      const existingStart = ensureArray(state && state.startDraftByDate && state.startDraftByDate[dateKey])
        .filter((t) => isCarryoverTask(t));
      const byId = new Map();
      const byTitle = new Map();
      const idOf = (t) => String(t && t.taskId || "").trim();
      const titleOf = (t) => String(t && t.title || "").trim().toLowerCase();
      const upsert = (t) => {
        const id = idOf(t);
        const title = titleOf(t);
        if (!id && !title) return;
        const completion = Number(t && t.lastCompletion);
        const meta = {
          localTaskId: id || "",
          completion: Number.isFinite(completion) ? completion : null,
          note: String(t && t.lastNote || "").trim(),
          project: normalizeTaskProject(t && t.project)
        };
        if (id) byId.set(id, meta);
        if (title) byTitle.set(title, meta);
      };
      existingCarry.forEach(upsert);
      existingStart.forEach(upsert);

      return ensureArray(incomingTasks).map((t) => {
        const incomingId = idOf(t);
        const incomingTitle = titleOf(t);
        const prev = (incomingId && byId.get(incomingId))
          || (incomingTitle && byTitle.get(incomingTitle))
          || null;
        if (!prev) return t;
        const remoteCompletion = Number(t && t.lastCompletion);
        const localCompletion = Number(prev && prev.completion);
        const resolvedCompletion = Number.isFinite(localCompletion)
          ? (Number.isFinite(remoteCompletion) ? Math.max(remoteCompletion, localCompletion) : localCompletion)
          : (Number.isFinite(remoteCompletion) ? remoteCompletion : null);
        return {
          ...t,
          taskId: prev.localTaskId || t.taskId || createTaskId(),
          project: normalizeTaskProject(t && t.project || prev && prev.project),
          lastCompletion: resolvedCompletion,
          lastNote: String(t && t.lastNote || "").trim() || String(prev && prev.note || "").trim()
        };
      });
    }

    function normalizePlannerPayload_(result) {
      return plannerManager.normalizePlannerPayload_(result);
    }

    function normalizePlannerTaskState_(tasks) {
      return plannerManager.normalizePlannerTaskState_(tasks);
    }

    function normalizePlannerInSodPayload_(result) {
      return plannerManager.normalizePlannerInSodPayload_(result);
    }

    async function syncPlannerFromSheets(dateKey, force = false) {
      return plannerManager.syncPlannerFromSheets(dateKey, force);
    }

    function mergePlannerMovedTasksIntoSod_(dateKey, movedTasks) {
      return plannerManager.mergePlannerMovedTasksIntoSod_(dateKey, movedTasks);
    }

    function mergePlannerInSodIntoStartDraft_(dateKey, inSodTasks) {
      return plannerManager.mergePlannerInSodIntoStartDraft_(dateKey, inSodTasks);
    }

    function addPlannerDraftTask_() {
      return plannerManager.addPlannerDraftTask_();
    }

    function renderPlannerDraftTasks_() {
      return plannerManager.renderPlannerDraftTasks_();
    }

    async function submitPlannerDraftTasks_() {
      return plannerManager.submitPlannerDraftTasks_();
    }

    function clearPlannerDraftTasks_() {
      return plannerManager.clearPlannerDraftTasks_();
    }

    async function updatePlannerTask_(task) {
      const result = await plannerManager.updatePlannerTask_(task);
      renderAll();
      return result;
    }

    async function deletePlannerTask_(task) {
      const result = await plannerManager.deletePlannerTask_(task);
      renderAll();
      return result;
    }

    async function moveSelectedPlannerTasks_(targetMode) {
      return plannerManager.moveSelectedPlannerTasks_(targetMode);
    }

    async function moveSelectedPlannerToSod_() {
      return plannerManager.moveSelectedPlannerToSod_();
    }

    async function moveSelectedPlannerToEodExtras_() {
      return plannerManager.moveSelectedPlannerToEodExtras_();
    }

    function togglePlannerCompose_() {
      return plannerManager.togglePlannerCompose_();
    }

    function renderPlannerTasks() {
      return plannerManager.renderPlannerTasks();
    }

    async function fetchCarryoverWithRetry(payload, maxAttempts = 2, baseTimeoutMs = 5000, timeoutStepMs = 2000) {
      let lastError = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await callApiJsonp("getCarryover", payload, baseTimeoutMs + (attempt - 1) * timeoutStepMs);
          if (!result || result.ok === false) {
            throw new Error(result && result.message ? result.message : "Carryover fetch rejected.");
          }
          return { result, attempts: attempt };
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error("Carryover sync failed.");
    }

    function setSyncMeta(dateKey, meta) {
      state.syncMetaByDate[dateKey] = {
        at: new Date().toISOString(),
        status: meta.status || "idle",
        attempts: Number(meta.attempts || 0),
        message: String(meta.message || "")
      };
    }

    async function syncCarryoverFromSheets(dateKey, force = false, options = {}) {
      if (!identity || !dateKey) return;
      if (!force && state.carryoverSyncedByDate[dateKey]) return;
      if (Array.isArray(state.sodByDate[dateKey]) && state.sodByDate[dateKey].length) {
        state.carryoverSyncedByDate[dateKey] = true;
        setSyncMeta(dateKey, { status: "skipped", message: "Skipped (SOD already submitted for this date)." });
        saveState();
        return;
      }

      try {
        const fast = Boolean(options && options.fast);
        const chosenAttempts = force ? 3 : (fast ? 2 : 3);
        const baseTimeout = force ? 6500 : (fast ? 5000 : 6500);
        const timeoutStep = force ? 2500 : (fast ? 1500 : 2500);
        const { result, attempts: attemptCount } = await fetchCarryoverWithRetry({
          workDate: dateKey,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion: CLIENT_VERSION
        }, chosenAttempts, baseTimeout, timeoutStep);

        const carryoverTasks = normalizeCarryoverPayload(result);
        if (carryoverTasks.length) {
          const mergedCarryoverTasks = mergeCarryoverProgressWithLocal_(dateKey, carryoverTasks);
          state.carryoverByDate[dateKey] = mergedCarryoverTasks;
          state.carryoverSourceByDate[dateKey] = "supabase";
          mergeCarryoverIntoStartDraft(dateKey, mergedCarryoverTasks);
          state.startSourceByDate[dateKey] = "supabase";
          setSyncMeta(dateKey, { status: "success", attempts: attemptCount, message: `Synced ${mergedCarryoverTasks.length} carryover task(s) from Supabase.` });
        } else {
          state.carryoverByDate[dateKey] = [];
          delete state.carryoverSourceByDate[dateKey];
          await ensurePreviousDraftAvailableForCarryover_(dateKey);
          const usedLocalDraft = hydrateCarryoverFromUnsubmittedSod(dateKey);
          if (!usedLocalDraft) {
            mergeCarryoverIntoStartDraft(dateKey, []);
            if (!state.startSourceByDate[dateKey]) {
              state.startSourceByDate[dateKey] = "new";
            }
            setSyncMeta(dateKey, { status: "success", attempts: attemptCount, message: "No carryover tasks found." });
          } else {
            setSyncMeta(dateKey, { status: "success", attempts: attemptCount, message: "Loaded from previous day's draft (SOD was not submitted)." });
          }
        }

        state.carryoverSyncedByDate[dateKey] = true;
        saveState();
      } catch (err) {
        await syncSubmittedDetailsFromSheets(previousDateISO(dateKey), true);
        await ensurePreviousDraftAvailableForCarryover_(dateKey);
        const usedFallback = hydrateCarryoverFromUnsubmittedSod(dateKey);
        const hasCarryoverFallback = Array.isArray(state.carryoverByDate[dateKey]) && state.carryoverByDate[dateKey].length > 0;
        if (Array.isArray(state.carryoverByDate[dateKey]) && state.carryoverByDate[dateKey].length) {
          state.carryoverSourceByDate[dateKey] = "local-storage";
          if (!state.startSourceByDate[dateKey]) {
            state.startSourceByDate[dateKey] = "local-storage";
          }
          setSyncMeta(dateKey, {
            status: "fallback",
            message: usedFallback
              ? "Using previous day SOD because EOD was not submitted."
              : "Using local carryover fallback."
          });
        } else {
          setSyncMeta(dateKey, { status: "error", message: String(err && err.message ? err.message : err) });
        }
        saveState();
        if (force || !hasCarryoverFallback) {
          setStatus(sodStatusEl, "Could not pull carryover from Supabase. Showing local carryover fallback.", "info");
        }
      }
    }

    function renderSodSourceHint() {
      if (sodSourceHintEl) sodSourceHintEl.style.display = "none";
    }

    function renderSyncMeta() {
      const dateKey = workDateEl.value;
      const meta = state.syncMetaByDate[dateKey];
      if (!meta) {
        syncMetaLineEl.textContent = "Sync status: Not run";
        return;
      }
      const label = meta.status === "success" ? "Success"
        : meta.status === "fallback" ? "Fallback"
        : meta.status === "error" ? "Failed"
        : meta.status === "skipped" ? "Skipped"
        : "Info";
      syncMetaLineEl.textContent = `Sync status: ${label}`;
    }

    function renderSaveMeta() {
      if (!saveMetaLineEl || !state) return;
      saveMetaLineEl.textContent = "Save status: Saved";
    }

    function formatAttendanceClock12h_(hhmm) {
      return attendanceManager.formatAttendanceClock12h_(hhmm);
    }

    function formatMinutesCompact_(minutes) {
      return attendanceManager.formatMinutesCompact_(minutes);
    }

    function getDayStatusForDate_(dateKey) {
      return attendanceManager.getDayStatusForDate_(dateKey);
    }

    function updateAttendanceMetaForDate_(dateKey) {
      return attendanceManager.updateAttendanceMetaForDate_(dateKey);
    }

    function getAttendancePayloadForDate_(dateKey) {
      return attendanceManager.getAttendancePayloadForDate_(dateKey);
    }

    function renderDayStatusControls_(dateKey) {
      return attendanceManager.renderDayStatusControls_(dateKey);
    }

    async function syncAttendanceForDate_(dateKey, force = false) {
      return attendanceManager.syncAttendanceForDate_(dateKey, force);
    }

    function clearScheduledAttendanceRefresh_(dateKey) {
      return attendanceManager.clearScheduledAttendanceRefresh_(dateKey);
    }

    function scheduleAttendanceRefreshAfterEod_(dateKey, options) {
      return attendanceManager.scheduleAttendanceRefreshAfterEod_(dateKey, options);
    }

    function getCurrentEodDraftSpentMinutes_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return 0;
      const eodDraft = getOrCreateEodDraft(key);
      const pending = getPendingTasksForDate(key);
      let totalMinutes = 0;

      pending.forEach((task) => {
        if (!eodDraft.selectedTaskIds[task.taskId]) return;
        const update = eodDraft.updatesByTaskId[task.taskId];
        if (!update) return;
        const parsedDuration = parseTimeHHMM(update.spentDuration);
        const hours = parsedDuration.ok ? parsedDuration.hours : parseHours(update.spentHours);
        const minutes = parsedDuration.ok ? parsedDuration.minutes : parseMinutes(update.spentMinutes);
        if (hours === null || minutes === null) return;
        totalMinutes += (Number(hours || 0) * 60) + Number(minutes || 0);
      });

      ensureArray(eodDraft.extras).forEach((extra) => {
        const parsedDuration = parseTimeHHMM(extra && extra.spentDuration);
        const hours = parsedDuration.ok ? parsedDuration.hours : parseHours(extra && extra.spentHours);
        const minutes = parsedDuration.ok ? parsedDuration.minutes : parseMinutes(extra && extra.spentMinutes);
        if (hours === null || minutes === null) return;
        totalMinutes += (Number(hours || 0) * 60) + Number(minutes || 0);
      });

      return totalMinutes;
    }

    function scheduleAttendanceSyncFromEodEdit_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return;
      if (String(state && state.taskTab || "submissions").trim() !== "submissions") return;
      if (getDayEntryMode_(key) !== "EOD" || isEodSubmittedForDate_(key)) return;
      if (getCurrentEodDraftSpentMinutes_(key) < (8 * 60)) return;
      if (eodAttendanceEditSyncTimerByDate[key]) {
        clearTimeout(eodAttendanceEditSyncTimerByDate[key]);
      }
      eodAttendanceEditSyncTimerByDate[key] = setTimeout(async () => {
        delete eodAttendanceEditSyncTimerByDate[key];
        try {
          await syncAttendanceForDate_(key, true);
          if (String(workDateEl && workDateEl.value || "").trim() === key) {
            updateAttendanceMetaForDate_(key);
          }
        } catch (err) {
          attendanceDebugError_("EOD edit attendance sync failed", { dateKey: key, err });
        }
      }, 1200);
    }

    function renderStartTasks() {
      const dateKey = workDateEl.value;
      const isSodSubmittedForSelectedDate = isSodSubmittedForDate_(dateKey);
      const isSodLockedByMode = isSodLockedByMode_(dateKey);
      const assignedForDate = Array.isArray(state.assignmentByDate[dateKey]) ? state.assignmentByDate[dateKey] : [];
      const recurringForDate = Array.isArray(state.recurringByDate[dateKey]) ? state.recurringByDate[dateKey] : [];
      if (!isSodSubmittedForSelectedDate) {
        mergeRecurringIntoStartDraft(dateKey, recurringForDate);
        // Always merge so deleted/unassigned tasks are removed from draft.
        mergeAssignmentsIntoStartDraft(dateKey, assignedForDate);
      }
      const submittedTasks = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
      const pendingTasks = Array.isArray(state.sodPendingByDate && state.sodPendingByDate[dateKey]) ? state.sodPendingByDate[dateKey] : [];
      const draftTasks = getOrCreateStartDraft(dateKey);
      const tasks = isSodSubmittedForSelectedDate ? pendingTasks : draftTasks;
      const selectedMap = syncSodSelectionForDate_(dateKey, draftTasks);
      if (sodPanelEl) {
        sodPanelEl.classList.toggle("sod-readonly", isSodSubmittedForSelectedDate || isSodLockedByMode);
      }
      renderNewTaskRecurrenceControls_();
      renderNewTaskProjectControls_();
      newTaskTitleEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      newTaskFrequencyEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      if (newTaskProjectEl) newTaskProjectEl.disabled = !isMarketingIdentity_() || isSodSubmittedForSelectedDate || isSodLockedByMode;
      if (newTaskWeeklyDayEl) newTaskWeeklyDayEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode || newTaskWeeklyDayEl.hidden;
      if (newTaskMonthlyDateEl) newTaskMonthlyDateEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode || newTaskMonthlyDateEl.hidden;
      newTaskPriorityEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      if (newTaskPriorityGroupEl) {
        newTaskPriorityGroupEl.setAttribute("aria-disabled", (isSodSubmittedForSelectedDate || isSodLockedByMode) ? "true" : "false");
        newTaskPriorityGroupEl.querySelectorAll(".priority-segment-btn").forEach((btn) => {
          btn.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
        });
      }
      renderSodPrioritySegment_();
      newTaskPlannedTimeEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      addTaskBtn.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      if (plannerTaskTitleEl) plannerTaskTitleEl.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      if (addPlannerTaskBtn) addPlannerTaskBtn.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      submitSodBtn.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
      updateSodSubmitMeta_(dateKey, isSodSubmittedForSelectedDate ? submittedTasks : draftTasks);
      renderSodSelectedPreview_(dateKey, draftTasks, selectedMap);
      if (plannedQuickChipsEl) {
        plannedQuickChipsEl.querySelectorAll(".quick-time-chip").forEach((chip) => {
          chip.disabled = isSodSubmittedForSelectedDate || isSodLockedByMode;
        });
      }
      sodTasksEl.innerHTML = "";
      sodBucketsEl.innerHTML = "";

      if (isSodLockedByMode) {
        const lockBanner = document.createElement("div");
        lockBanner.className = "submitted-lock-banner";
        lockBanner.innerHTML = "<i class=\"fa-solid fa-lock\"></i>Start of Day is currently off. End of Day mode is active for this date.";
        sodTasksEl.appendChild(lockBanner);

        const switchWrap = document.createElement("div");
        switchWrap.className = "action-row";
        switchWrap.style.paddingTop = "6px";
        const switchBtn = document.createElement("button");
        switchBtn.type = "button";
        switchBtn.className = "secondary";
        switchBtn.innerHTML = "<i class=\"fa-solid fa-toggle-on\"></i>Enable Start of Day Mode";
        switchBtn.addEventListener("click", () => {
          if (!state.eodUnlockedWithoutSodByDate || typeof state.eodUnlockedWithoutSodByDate !== "object") {
            state.eodUnlockedWithoutSodByDate = {};
          }
          state.eodUnlockedWithoutSodByDate[dateKey] = false;
          saveState();
          setStatus(sodStatusEl, "Start of Day mode enabled. End of Day is now locked until SOD is submitted.", "info");
          renderAll();
        });
        switchWrap.appendChild(switchBtn);
        sodTasksEl.appendChild(switchWrap);
        return;
      }

      const assignedTasks = tasks.filter((t) => isAssignedTask(t));
      const carryoverTasks = tasks.filter((t) => isCarryoverTask(t));
      const recurringTasks = tasks.filter((t) => isRecurringTask(t));
      const plannerTasks = tasks.filter((t) => String(t && t.source || "").toLowerCase() === "planner");
      const newTasks = tasks.filter((t) => !isCarryoverTask(t) && !isAssignedTask(t) && !isRecurringTask(t) && String(t && t.source || "").toLowerCase() !== "planner");
      const assignedChip = document.createElement("span");
      assignedChip.className = "bucket-chip";
      assignedChip.textContent = `Assigned ${assignedTasks.length}`;
      sodBucketsEl.appendChild(assignedChip);
      const carryChip = document.createElement("span");
      carryChip.className = "bucket-chip";
      carryChip.textContent = `Carryover ${carryoverTasks.length}`;
      const recurringChip = document.createElement("span");
      recurringChip.className = "bucket-chip";
      recurringChip.textContent = `Recurring ${recurringTasks.length}`;
      const newChip = document.createElement("span");
      newChip.className = "bucket-chip";
      newChip.textContent = `New ${newTasks.length}`;
      const plannerChip = document.createElement("span");
      plannerChip.className = "bucket-chip";
      plannerChip.textContent = `Planner ${plannerTasks.length}`;
      sodBucketsEl.appendChild(carryChip);
      sodBucketsEl.appendChild(recurringChip);
      sodBucketsEl.appendChild(plannerChip);
      sodBucketsEl.appendChild(newChip);
      if (!isSodSubmittedForSelectedDate) {
        const selectedChip = document.createElement("span");
        selectedChip.className = "bucket-chip";
        selectedChip.textContent = `Selected ${Object.keys(selectedMap).filter((taskId) => Boolean(selectedMap[taskId])).length}`;
        sodBucketsEl.appendChild(selectedChip);
      } else {
        const pendingChip = document.createElement("span");
        pendingChip.className = "bucket-chip";
        pendingChip.textContent = `Pending ${tasks.length}`;
        sodBucketsEl.appendChild(pendingChip);
      }

      if (isSodSubmittedForSelectedDate) {
        const doneBanner = document.createElement("div");
        doneBanner.className = "submitted-lock-banner";
        doneBanner.innerHTML = "<i class=\"fa-solid fa-circle-check\"></i>Start of Day submitted. Only the selected tasks moved to End of Day. Remaining pending tasks are shown below.";
        sodTasksEl.appendChild(doneBanner);
      }

      if (!tasks.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.innerHTML = isSodSubmittedForSelectedDate
          ? "<i class=\"fa-regular fa-calendar-check\"></i>No pending SOD tasks left for this date."
          : "<i class=\"fa-regular fa-square-plus\"></i>No tasks yet. Add your first task from the input above.";
        sodTasksEl.appendChild(empty);
        return;
      }

      let srIndex = 0;
      const renderTask = (task, index, readonly) => {
        const isCarryover = isCarryoverTask(task);
        const isAssigned = isAssignedTask(task);
        const isRecurring = isRecurringTask(task);
        const isPlannerTask = String(task && task.source || "").toLowerCase() === "planner";
        const prevCompletion = getCarryoverLastCompletion(task);
        const taskId = String(task && task.taskId || "").trim();
        const row = document.createElement("div");
        row.className = "task-row";

        const head = document.createElement("div");
        head.className = "task-row-head";

        const titleWrap = document.createElement("div");
        titleWrap.className = "task-title-wrap";
        if (!readonly) {
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "sod-task-check";
          checkbox.checked = Boolean(selectedMap[taskId]);
          checkbox.setAttribute("aria-label", `Select task ${task.title}`);
          checkbox.addEventListener("change", () => {
            selectedMap[taskId] = Boolean(checkbox.checked);
            saveState();
            updateSummaryCards();
            renderStartTasks();
          });
          titleWrap.appendChild(checkbox);
        }
        const sr = document.createElement("span");
        sr.className = "sr-badge";
        sr.textContent = `#${String(index).padStart(2, "0")}`;
        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = task.title;
        titleWrap.appendChild(sr);
        titleWrap.appendChild(title);

        const tags = document.createElement("div");
        tags.className = "task-tags";
        const actions = document.createElement("div");
        actions.className = "task-actions-inline";

        const priority = document.createElement("span");
        const normalizedPriority = normalizePriority(task.priority);
        priority.className = `priority ${priorityClass(normalizedPriority)}`;
        priority.textContent = normalizedPriority;

        tags.appendChild(priority);
        const projectChip = buildProjectChip_(task && task.project);
        if (projectChip) tags.appendChild(projectChip);
        if (isAssigned && task.assignedBy) {
          const assignChip = document.createElement("span");
          assignChip.className = "meta-chip";
          assignChip.textContent = `Assigned by ${firstNameOnly(task.assignedBy)}`;
          tags.appendChild(assignChip);
        }
        if (isAssigned) {
          const deadlineDate = String(task && task.deadlineDate || "").trim();
          const deadlineDays = Number(task && task.deadlineDays);
          if (deadlineDate) {
            const deadlineChip = document.createElement("span");
            deadlineChip.className = "meta-chip";
            deadlineChip.textContent = `Deadline: ${formatDateLabel(deadlineDate)}`;
            tags.appendChild(deadlineChip);
          } else if (Number.isFinite(deadlineDays) && deadlineDays > 0) {
            const deadlineChip = document.createElement("span");
            deadlineChip.className = "meta-chip";
            deadlineChip.textContent = `Deadline: ${deadlineDays} day${deadlineDays === 1 ? "" : "s"}`;
            tags.appendChild(deadlineChip);
          }
        }
        if (isRecurring && task.frequency) {
          const recurringTag = document.createElement("span");
          recurringTag.className = "meta-chip";
          recurringTag.textContent = `Recurring: ${getRecurringRuleLabel_(task)}`;
          tags.appendChild(recurringTag);
        }
        if (isPlannerTask) {
          const plannerTag = document.createElement("span");
          plannerTag.className = "meta-chip";
          plannerTag.textContent = "Planner";
          tags.appendChild(plannerTag);
        }
        const plannedH = Number.isFinite(Number(task.plannedHours)) ? Number(task.plannedHours) : 0;
        const plannedM = Number.isFinite(Number(task.plannedMinutes)) ? Number(task.plannedMinutes) : 0;
        if (plannedH > 0 || plannedM > 0) {
          const planChip = document.createElement("span");
          planChip.className = "meta-chip";
          planChip.textContent = `Plan: ${plannedH}h ${plannedM}m`;
          tags.appendChild(planChip);
        }
        if (prevCompletion !== null) {
          const prevChip = document.createElement("span");
          prevChip.className = "meta-chip prev";
          prevChip.textContent = `Prev: ${prevCompletion}%`;
          tags.appendChild(prevChip);
        }
        if (isCarryover) {
          const addedDateRaw = String(task && (task.addedDate || task.carryFrom) || "").trim();
          if (addedDateRaw) {
            const addedChip = document.createElement("span");
            addedChip.className = "meta-chip";
            addedChip.textContent = getAddedDaysAgoLabel_(addedDateRaw, workDateEl.value) || `Added: ${formatDateLabel(addedDateRaw)}`;
            tags.appendChild(addedChip);
          }
        }
        if (!isLockedStartTask(task)) {
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "secondary icon-subtle";
          edit.title = "Edit task";
          edit.setAttribute("aria-label", "Edit task");
          edit.innerHTML = "<i class=\"fa-solid fa-pen\"></i>";
          edit.addEventListener("click", () => {
            if (isPlannerTask) {
              updatePlannerTask_(task);
              return;
            }
            openTaskTitleEditPrompt_(dateKey, task, sodStatusEl);
          });
          actions.appendChild(edit);

          if (!readonly && !isPartiallyCompletedStartTask_(task)) {
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "danger icon-danger";
            remove.title = "Remove task";
            remove.setAttribute("aria-label", "Remove task");
            remove.innerHTML = "<i class=\"fa-solid fa-xmark\"></i>";
            remove.addEventListener("click", async () => {
              if (isPlannerTask && taskId) {
                await deletePlannerTask_(task);
                return;
              }

              const previousTasks = draftTasks.map((item) => Object.assign({}, item));
              const previousCarryover = Array.isArray(state.carryoverByDate[dateKey])
                ? state.carryoverByDate[dateKey].map((item) => Object.assign({}, item))
                : [];
              const previousCarryoverSource = String(state.carryoverSourceByDate[dateKey] || "").trim();
              const idx = draftTasks.findIndex((t) => {
                const aId = String(t && t.taskId || "").trim();
                const bId = String(task && task.taskId || "").trim();
                if (aId && bId) return aId === bId;
                return String(t && t.title || "").trim() === String(task && task.title || "").trim();
              });
              if (idx > -1) draftTasks.splice(idx, 1);
              if (isCarryoverTask(task)) {
                state.carryoverByDate[dateKey] = removeTaskFromListByIdentity_(previousCarryover, task);
                if (!state.carryoverByDate[dateKey].length) {
                  delete state.carryoverSourceByDate[dateKey];
                }
              }
              delete selectedMap[taskId];
              state.startSourceByDate[dateKey] = "local-storage";
              saveState();
              renderStartTasks();
              renderEodTasks();
              updateSummaryCards();
              showUndoToast_("Task removed.", () => {
                state.startDraftByDate[dateKey] = previousTasks;
                if (isCarryoverTask(task)) {
                  state.carryoverByDate[dateKey] = previousCarryover;
                  if (previousCarryover.length) {
                    state.carryoverSourceByDate[dateKey] = previousCarryoverSource || "local-storage";
                  }
                }
                selectedMap[taskId] = true;
                state.startSourceByDate[dateKey] = "local-storage";
                saveState();
                renderAll();
                setStatus(sodStatusEl, "Task restored.", "success");
              });
            });
            actions.appendChild(remove);
          }
        }
        head.appendChild(titleWrap);
        head.appendChild(actions);
        row.appendChild(head);
        if (tags.children.length) row.appendChild(tags);

        return row;
      };
      tasks.forEach((task) => {
        srIndex += 1;
        sodTasksEl.appendChild(renderTask(task, srIndex, isSodSubmittedForSelectedDate));
      });
    }

    function getFieldError(eodDraft, editorId, field) {
      return eodDraft.fieldErrors
        && eodDraft.fieldErrors[editorId]
        && eodDraft.fieldErrors[editorId][field]
        ? String(eodDraft.fieldErrors[editorId][field])
        : "";
    }

    function clearFieldError(eodDraft, editorId, field) {
      if (!eodDraft.fieldErrors || !eodDraft.fieldErrors[editorId]) return;
      delete eodDraft.fieldErrors[editorId][field];
      if (!Object.keys(eodDraft.fieldErrors[editorId]).length) {
        delete eodDraft.fieldErrors[editorId];
      }
    }

    function clearFieldVisualError_(inputEl) {
      const fieldWrap = inputEl && typeof inputEl.closest === "function"
        ? inputEl.closest(".meta-field")
        : null;
      if (!fieldWrap) return;
      fieldWrap.classList.remove("has-error");
      const msg = fieldWrap.querySelector(".field-error");
      if (msg && msg.parentNode) msg.parentNode.removeChild(msg);
    }

    function autoResizeTextarea_(textareaEl) {
      if (!textareaEl) return;
      textareaEl.style.height = "40px";
      const next = Math.max(40, textareaEl.scrollHeight);
      textareaEl.style.height = `${next}px`;
    }

    function buildDurationQuickChips_(inputEl) {
      const row = document.createElement("div");
      row.className = "quick-time-row inline-one-line";
      const options = [
        { label: "+15m", minutes: 15 },
        { label: "+30m", minutes: 30 },
        { label: "+45m", minutes: 45 },
        { label: "+1h", minutes: 60 },
        { label: "+1h30m", minutes: 90 }
      ];

      options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quick-time-chip";
        btn.textContent = opt.label;
        btn.addEventListener("click", () => {
          const raw = String(inputEl.value || "").trim();
          const parsed = parseTimeHHMM(raw);
          const currentMinutes = parsed.ok ? ((parsed.hours || 0) * 60 + (parsed.minutes || 0)) : 0;
          const nextTotal = Math.max(0, currentMinutes + opt.minutes);
          const h = Math.floor(nextTotal / 60);
          const m = nextTotal % 60;
          inputEl.value = formatDurationInput_(h, m);
          inputEl.dispatchEvent(new Event("input", { bubbles: true }));
          inputEl.focus();
        });
        row.appendChild(btn);
      });
      return row;
    }

    function ensureEodTimerState_(eodDraft) {
      if (!eodDraft.timerState || typeof eodDraft.timerState !== "object") {
        eodDraft.timerState = { editorId: "", startedAtMs: 0, baseSeconds: 0, savedSecondsByEditor: {} };
      }
      if (typeof eodDraft.timerState.editorId !== "string") eodDraft.timerState.editorId = "";
      if (!Number.isFinite(Number(eodDraft.timerState.startedAtMs))) eodDraft.timerState.startedAtMs = 0;
      if (!Number.isFinite(Number(eodDraft.timerState.baseSeconds))) {
        const legacyBaseMinutes = Number(eodDraft.timerState.baseMinutes || 0);
        eodDraft.timerState.baseSeconds = Math.max(0, Math.floor(legacyBaseMinutes * 60));
      }
      if (!eodDraft.timerState.savedSecondsByEditor || typeof eodDraft.timerState.savedSecondsByEditor !== "object") {
        eodDraft.timerState.savedSecondsByEditor = {};
      }
      return eodDraft.timerState;
    }

    function getEditorDurationMinutes_(dateKey, editorId) {
      const key = String(dateKey || workDateEl.value || "").trim();
      const editor = String(editorId || "").trim();
      if (!key || !editor) return 0;
      const eodDraft = getOrCreateEodDraft(key);
      const split = editor.split(":");
      const type = String(split[0] || "");
      const id = String(split.slice(1).join(":") || "");
      if (!id) return 0;

      let holder = null;
      if (type === "pending") {
        holder = eodDraft.updatesByTaskId && eodDraft.updatesByTaskId[id] ? eodDraft.updatesByTaskId[id] : null;
      } else if (type === "extra") {
        holder = ensureArray(eodDraft.extras).find((e) => String(e && e.taskId || "") === id) || null;
      }
      if (!holder) return 0;

      const parsed = parseTimeHHMM(String(holder.spentDuration || "").trim());
      if (parsed.ok && !parsed.empty) return (parsed.hours * 60) + parsed.minutes;
      const h = parseHours(holder.spentHours);
      const m = parseMinutes(holder.spentMinutes);
      if (h == null || m == null) return 0;
      return (h * 60) + m;
    }

    function getEditorDurationSeconds_(dateKey, editorId, timerState) {
      const stateTimer = timerState && typeof timerState === "object"
        ? timerState
        : ensureEodTimerState_(getOrCreateEodDraft(String(dateKey || workDateEl.value || "").trim()));
      const editor = String(editorId || "").trim();
      if (!editor) return 0;
      const saved = Number(stateTimer.savedSecondsByEditor && stateTimer.savedSecondsByEditor[editor]);
      if (Number.isFinite(saved) && saved >= 0) {
        return Math.floor(saved);
      }
      return getEditorDurationMinutes_(dateKey, editor) * 60;
    }

    function applyDurationMinutesToEditor_(dateKey, editorId, minutes) {
      const key = String(dateKey || workDateEl.value || "").trim();
      const editor = String(editorId || "").trim();
      const total = Math.max(0, Math.floor(Number(minutes || 0)));
      if (!key || !editor) return;
      const eodDraft = getOrCreateEodDraft(key);
      const split = editor.split(":");
      const type = String(split[0] || "");
      const id = String(split.slice(1).join(":") || "");
      if (!id) return;

      const h = Math.floor(total / 60);
      const m = total % 60;
      const text = formatDurationInput_(h, m);
      if (type === "pending") {
        if (!eodDraft.updatesByTaskId[id]) {
          eodDraft.updatesByTaskId[id] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
        }
        eodDraft.updatesByTaskId[id].spentHours = h;
        eodDraft.updatesByTaskId[id].spentMinutes = m;
        eodDraft.updatesByTaskId[id].spentDuration = text;
        return;
      }
      if (type === "extra") {
        const extra = ensureArray(eodDraft.extras).find((e) => String(e && e.taskId || "") === id);
        if (!extra) return;
        extra.spentHours = h;
        extra.spentMinutes = m;
        extra.spentDuration = text;
      }
    }

    function applyDurationSecondsToEditor_(dateKey, editorId, totalSeconds) {
      const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds || 0)));
      const wholeMinutes = Math.floor(safeSeconds / 60);
      applyDurationMinutesToEditor_(dateKey, editorId, wholeMinutes);

      const key = String(dateKey || workDateEl.value || "").trim();
      const editor = String(editorId || "").trim();
      if (!key || !editor) return;
      const eodDraft = getOrCreateEodDraft(key);
      const split = editor.split(":");
      const type = String(split[0] || "");
      const id = String(split.slice(1).join(":") || "");
      const h = Math.floor(wholeMinutes / 60);
      const m = wholeMinutes % 60;
      const clockText = formatDurationInput_(h, m);
      if (!id) return;

      if (type === "pending") {
        if (!eodDraft.updatesByTaskId[id]) {
          eodDraft.updatesByTaskId[id] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
        }
        eodDraft.updatesByTaskId[id].spentDuration = clockText;
      } else if (type === "extra") {
        const extra = ensureArray(eodDraft.extras).find((e) => String(e && e.taskId || "") === id);
        if (extra) extra.spentDuration = clockText;
      }

      const selector = `[data-editor-id="${cssEscapeSafe_(editor)}"][data-field="spentDuration"]`;
      const inputEl = eodTasksEl ? eodTasksEl.querySelector(selector) : null;
      if (inputEl && String(inputEl.value || "") !== clockText) {
        inputEl.value = clockText;
      }
    }

    function getActiveTimerTotalSeconds_(timerState) {
      if (!timerState || !timerState.editorId || !Number(timerState.startedAtMs)) return 0;
      const elapsedMs = Math.max(0, Date.now() - Number(timerState.startedAtMs));
      const elapsedSeconds = Math.floor(elapsedMs / 1000);
      const baseSeconds = Math.max(0, Math.floor(Number(timerState.baseSeconds || 0)));
      return baseSeconds + elapsedSeconds;
    }

    function getActiveTimerTotalMinutes_(timerState) {
      return Math.floor(getActiveTimerTotalSeconds_(timerState) / 60);
    }

    function formatTimerClock_(totalSeconds) {
      const safe = Math.max(0, Math.floor(Number(totalSeconds || 0)));
      const h = Math.floor(safe / 3600);
      const m = Math.floor((safe % 3600) / 60);
      const s = safe % 60;
      if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function refreshEodTimerLabels_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key || !eodTasksEl) return;
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      eodTasksEl.querySelectorAll("[data-eod-timer-label]").forEach((el) => {
        const editor = String(el.getAttribute("data-eod-timer-editor") || "");
        const isRunningHere = timerState.editorId === editor && Number(timerState.startedAtMs) > 0;
        el.textContent = isRunningHere
          ? formatTimerClock_(getActiveTimerTotalSeconds_(timerState))
          : formatTimerClock_(getEditorDurationSeconds_(key, editor, timerState));
      });
      if (timerState.editorId && Number(timerState.startedAtMs) > 0) {
        applyDurationSecondsToEditor_(key, timerState.editorId, getActiveTimerTotalSeconds_(timerState));
      }
    }

    function stopEodTimerTicker_() {
      if (eodTimerTickerId) {
        clearInterval(eodTimerTickerId);
        eodTimerTickerId = 0;
      }
    }

    function ensureEodTimerTicker_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) {
        stopEodTimerTicker_();
        return;
      }
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      const isRunning = Boolean(timerState.editorId && Number(timerState.startedAtMs) > 0);
      if (!isRunning) {
        stopEodTimerTicker_();
        refreshEodTimerLabels_(key);
        return;
      }
      if (eodTimerTickerId) return;
      eodTimerTickerId = setInterval(() => {
        refreshEodTimerLabels_(key);
      }, 1000);
      refreshEodTimerLabels_(key);
    }

    function buildTimerControls_(dateKey, editorId, timerState) {
      const timerWrap = document.createElement("div");
      timerWrap.className = "action-row timer-liquid-row";

      const isRunningHere = timerState.editorId === editorId && Number(timerState.startedAtMs) > 0;
      const isRunningOther = timerState.editorId && timerState.editorId !== editorId && Number(timerState.startedAtMs) > 0;

      const timerStartBtn = document.createElement("button");
      timerStartBtn.type = "button";
      timerStartBtn.className = "secondary timer-liquid-btn";
      timerStartBtn.innerHTML = isRunningOther
        ? timerIconHtml_("switch", "fa-solid fa-right-left")
        : timerIconHtml_("play", "fa-solid fa-play");
      timerStartBtn.setAttribute("aria-label", isRunningOther ? "Switch timer to this task" : "Start timer");
      timerStartBtn.title = isRunningOther
        ? "Switch timer from current task to this task."
        : "Start timer";
      timerStartBtn.disabled = false;
      timerStartBtn.addEventListener("click", () => {
        startTaskTimer_(dateKey, editorId);
      });

      const timerStopBtn = document.createElement("button");
      timerStopBtn.type = "button";
      timerStopBtn.className = "secondary timer-liquid-btn";
      timerStopBtn.innerHTML = timerIconHtml_("pause", "fa-solid fa-pause");
      timerStopBtn.setAttribute("aria-label", "Pause timer");
      timerStopBtn.title = "Pause timer";
      timerStopBtn.disabled = !isRunningHere;
      timerStopBtn.addEventListener("click", () => {
        stopTaskTimer_(dateKey, editorId);
      });

      const timerHardStopBtn = document.createElement("button");
      timerHardStopBtn.type = "button";
      timerHardStopBtn.className = "secondary timer-liquid-btn";
      timerHardStopBtn.innerHTML = timerIconHtml_("stop", "fa-solid fa-stop");
      timerHardStopBtn.setAttribute("aria-label", "Stop timer");
      timerHardStopBtn.title = "Stop timer";
      timerHardStopBtn.disabled = !isRunningHere;
      timerHardStopBtn.addEventListener("click", () => {
        hardStopTaskTimer_(dateKey, editorId);
      });

      const timerResetBtn = document.createElement("button");
      timerResetBtn.type = "button";
      timerResetBtn.className = "secondary timer-liquid-btn";
      timerResetBtn.innerHTML = timerIconHtml_("reset", "fa-solid fa-rotate-left");
      timerResetBtn.setAttribute("aria-label", "Reset timer");
      timerResetBtn.title = "Reset timer";
      timerResetBtn.addEventListener("click", () => {
        resetTaskTimer_(dateKey, editorId);
      });

      const timerLabel = document.createElement("span");
      timerLabel.className = "muted timer-liquid-label";
      timerLabel.setAttribute("data-eod-timer-label", "1");
      timerLabel.setAttribute("data-eod-timer-editor", editorId);
      timerLabel.textContent = isRunningHere
        ? formatTimerClock_(getActiveTimerTotalSeconds_(timerState))
        : formatTimerClock_(getEditorDurationSeconds_(dateKey, editorId, timerState));

      timerWrap.appendChild(timerStartBtn);
      timerWrap.appendChild(timerStopBtn);
      timerWrap.appendChild(timerHardStopBtn);
      timerWrap.appendChild(timerResetBtn);
      timerWrap.appendChild(timerLabel);
      return timerWrap;
    }

    function finalizeActiveEodTimer_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return;
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      if (!timerState.editorId || !Number(timerState.startedAtMs)) return;
      const totalSeconds = getActiveTimerTotalSeconds_(timerState);
      applyDurationSecondsToEditor_(key, timerState.editorId, totalSeconds);
      timerState.savedSecondsByEditor[timerState.editorId] = totalSeconds;
      timerState.editorId = "";
      timerState.startedAtMs = 0;
      timerState.baseSeconds = 0;
      ensureEodTimerTicker_(key);
    }

    function startTaskTimer_(dateKey, editorId) {
      const key = String(dateKey || workDateEl.value || "").trim();
      const editor = String(editorId || "").trim();
      if (!key || !editor) return;
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      if (timerState.editorId && Number(timerState.startedAtMs)) {
        const previousTotalSeconds = getActiveTimerTotalSeconds_(timerState);
        applyDurationSecondsToEditor_(key, timerState.editorId, previousTotalSeconds);
        timerState.savedSecondsByEditor[timerState.editorId] = previousTotalSeconds;
      }
      timerState.editorId = editor;
      timerState.baseSeconds = getEditorDurationSeconds_(key, editor, timerState);
      timerState.startedAtMs = Date.now();
      eodDraft.activeEditorId = editor;
      saveState();
      renderEodTasks();
      ensureEodTimerTicker_(key);
      updateSummaryCards();
    }

    function stopTaskTimer_(dateKey, editorId) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return;
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      if (!timerState.editorId || !Number(timerState.startedAtMs)) return;
      if (editorId && String(editorId) !== String(timerState.editorId)) return;
      const totalSeconds = getActiveTimerTotalSeconds_(timerState);
      applyDurationSecondsToEditor_(key, timerState.editorId, totalSeconds);
      timerState.savedSecondsByEditor[timerState.editorId] = totalSeconds;
      timerState.editorId = "";
      timerState.startedAtMs = 0;
      timerState.baseSeconds = 0;
      saveState();
      renderEodTasks();
      ensureEodTimerTicker_(key);
      updateSummaryCards();
    }

    function hardStopTaskTimer_(dateKey, editorId) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return;
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      if (!timerState.editorId || !Number(timerState.startedAtMs)) return;
      if (editorId && String(editorId) !== String(timerState.editorId)) return;
      const totalSeconds = getActiveTimerTotalSeconds_(timerState);
      const runningEditorId = String(timerState.editorId);
      applyDurationSecondsToEditor_(key, runningEditorId, totalSeconds);
      delete timerState.savedSecondsByEditor[runningEditorId];
      timerState.editorId = "";
      timerState.startedAtMs = 0;
      timerState.baseSeconds = 0;
      saveState();
      renderEodTasks();
      ensureEodTimerTicker_(key);
      updateSummaryCards();
    }

    function resetTaskTimer_(dateKey, editorId) {
      const key = String(dateKey || workDateEl.value || "").trim();
      const editor = String(editorId || "").trim();
      if (!key || !editor) return;
      const eodDraft = getOrCreateEodDraft(key);
      const timerState = ensureEodTimerState_(eodDraft);
      if (timerState.editorId === editor) {
        timerState.editorId = "";
        timerState.startedAtMs = 0;
        timerState.baseSeconds = 0;
      }
      timerState.savedSecondsByEditor[editor] = 0;
      applyDurationMinutesToEditor_(key, editor, 0);
      saveState();
      renderEodTasks();
      ensureEodTimerTicker_(key);
      updateSummaryCards();
    }

    function setFieldError(eodDraft, editorId, field, message) {
      if (!eodDraft.fieldErrors) eodDraft.fieldErrors = {};
      if (!eodDraft.fieldErrors[editorId]) eodDraft.fieldErrors[editorId] = {};
      eodDraft.fieldErrors[editorId][field] = String(message || "");
    }

    function renderEodTasks() {
      const dateKey = workDateEl.value;
      const isEodSubmittedForSelectedDate = isEodSubmittedForDate_(dateKey);
      const isLockedUntilSod = isEodLockedUntilSod_(dateKey);
      if (eodPanelEl) {
        eodPanelEl.classList.toggle("eod-readonly", isEodSubmittedForSelectedDate || isLockedUntilSod);
      }
      addExtraBtn.disabled = isEodSubmittedForSelectedDate || isLockedUntilSod;
      updateEodSubmitButtonState_(dateKey);

      if (isLockedUntilSod) {
        stopEodTimerTicker_();
        eodTasksEl.innerHTML = "";
        const lockBanner = document.createElement("div");
        lockBanner.className = "submitted-lock-banner";
        lockBanner.innerHTML = "<i class=\"fa-solid fa-lock\"></i>End of Day is disabled until SOD is submitted.";
        eodTasksEl.appendChild(lockBanner);

        const unlockWrap = document.createElement("div");
        unlockWrap.className = "action-row";
        unlockWrap.style.paddingTop = "6px";
        const unlockBtn = document.createElement("button");
        unlockBtn.type = "button";
        unlockBtn.className = "secondary";
        unlockBtn.innerHTML = "<i class=\"fa-solid fa-toggle-on\"></i>Enable End of Day Mode";
        unlockBtn.addEventListener("click", () => {
          if (!state.eodUnlockedWithoutSodByDate || typeof state.eodUnlockedWithoutSodByDate !== "object") {
            state.eodUnlockedWithoutSodByDate = {};
          }
          state.eodUnlockedWithoutSodByDate[dateKey] = true;
          saveState();
          setStatus(eodStatusEl, "End of Day mode enabled for this date. Start of Day is now locked until you switch back.", "info");
          renderAll();
        });
        unlockWrap.appendChild(unlockBtn);
        eodTasksEl.appendChild(unlockWrap);
        return;
      }

      if (isEodSubmittedForSelectedDate) {
        stopEodTimerTicker_();
        const submittedUpdates = Array.isArray(state.eodSubmittedUpdatesByDate[dateKey])
          ? state.eodSubmittedUpdatesByDate[dateKey]
          : [];
        eodTasksEl.innerHTML = "";
        const submittedFrag = document.createDocumentFragment();

        const lockBanner = document.createElement("div");
        lockBanner.className = "submitted-lock-banner";
        lockBanner.innerHTML = "<i class=\"fa-solid fa-lock\"></i>End of Day already submitted for this date. This section is locked.";
        submittedFrag.appendChild(lockBanner);

        const title = document.createElement("div");
        title.className = "submitted-title";
        title.textContent = "Completed Tasks (Submitted)";
        submittedFrag.appendChild(title);

        if (!submittedUpdates.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.innerHTML = "<i class=\"fa-regular fa-note-sticky\"></i>End-of-Day already submitted for this day. Completed details are not available for this older submission.";
          submittedFrag.appendChild(empty);
          eodTasksEl.appendChild(submittedFrag);
          return;
        }

        submittedUpdates.forEach((u, idx) => {
          const row = document.createElement("div");
          row.className = "pending-row submitted-row";

          const head = document.createElement("div");
          head.className = "pending-row-head";

          const left = document.createElement("div");
          left.className = "task-title-wrap";
          const sr = document.createElement("span");
          sr.className = "sr-badge";
          sr.textContent = `#${String(idx + 1).padStart(2, "0")}`;
          const titleText = document.createElement("span");
          titleText.className = "task-title";
          titleText.textContent = String(u.title || "-");
          left.appendChild(sr);
          left.appendChild(titleText);

          const pri = document.createElement("span");
          const normalizedPriority = normalizePriority(u.priority);
          pri.className = `priority ${priorityClass(normalizedPriority)}`;
          pri.textContent = normalizedPriority;

          head.appendChild(left);
          head.appendChild(pri);
          row.appendChild(head);

          const projectChip = buildProjectChip_(u && u.project);
          if (projectChip) {
            const chipRow = document.createElement("div");
            chipRow.className = "task-tags";
            chipRow.appendChild(projectChip);
            row.appendChild(chipRow);
          }

          const hint = document.createElement("div");
          hint.className = "progress-hint";
          hint.textContent = `Completion: ${Number(u.completionPercent || 0)}% | Spent: ${Number(u.spentHours || 0)}h ${Number(u.spentMinutes || 0)}m${u.isExtra ? " | Extra task" : ""}`;
          row.appendChild(hint);

          if (String(u.approvalStatus || "").trim()) {
            const approvalLine = document.createElement("div");
            approvalLine.className = "muted";
            approvalLine.textContent = approvalStatusLabel_(u);
            row.appendChild(approvalLine);
          }

          const note = String(u.note || "").trim();
          if (note) {
            const noteLine = document.createElement("div");
            noteLine.className = "muted";
            noteLine.textContent = `Note: ${note}`;
            row.appendChild(noteLine);
          }
          submittedFrag.appendChild(row);
        });
        eodTasksEl.appendChild(submittedFrag);
        return;
      }

      const pending = getPendingTasksForDate(dateKey);
      const eodDraft = getOrCreateEodDraft(dateKey);
      const timerState = ensureEodTimerState_(eodDraft);
      (eodDraft.extras || []).forEach((extra) => {
        if (!extra.taskId) extra.taskId = createTaskId();
      });

      const validEditorIds = new Set([
        ...pending.map((t) => `pending:${t.taskId}`),
        ...(eodDraft.extras || []).map((e) => `extra:${e.taskId}`)
      ]);

      let activeEditorId = eodDraft.activeEditorId || "";
      if (activeEditorId && !validEditorIds.has(activeEditorId)) {
        activeEditorId = "";
      }

      if (!activeEditorId) {
        const firstSelectedPending = pending.find((t) =>
          eodDraft.selectedTaskIds[t.taskId] && !isApprovalTaskSubmittedLock_(eodDraft, t.taskId)
        );
        if (firstSelectedPending) {
          activeEditorId = `pending:${firstSelectedPending.taskId}`;
        } else if (pending.length) {
          const first = pending.find((t) => !isApprovalTaskSubmittedLock_(eodDraft, t.taskId)) || pending[0];
          eodDraft.selectedTaskIds[first.taskId] = true;
          if (!eodDraft.updatesByTaskId[first.taskId]) {
            eodDraft.updatesByTaskId[first.taskId] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
          }
          activeEditorId = isApprovalTaskSubmittedLock_(eodDraft, first.taskId) ? "" : `pending:${first.taskId}`;
        } else if ((eodDraft.extras || []).length) {
          activeEditorId = `extra:${eodDraft.extras[0].taskId}`;
        }
        eodDraft.activeEditorId = activeEditorId;
        saveState();
      }

      eodTasksEl.innerHTML = "";

      if (!pending.length && !eodDraft.extras.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.innerHTML = "<i class=\"fa-regular fa-calendar-check\"></i>No pending tasks. Sync carryover/assigned tasks, or add an extra task.";
        eodTasksEl.appendChild(empty);
      }

      const pendingFrag = document.createDocumentFragment();
      pending.forEach((task, pendingIndex) => {
        const editorId = `pending:${task.taskId}`;
        const row = document.createElement("div");
        row.className = "pending-row";
        row.dataset.editorId = editorId;
        const allowedCompletion = getAllowedCompletionOptions(task);

        const head = document.createElement("div");
        head.className = "pending-row-head";

        const sel = document.createElement("div");
        sel.className = "pending-select";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(eodDraft.selectedTaskIds[task.taskId]);
        checkbox.dataset.eodCheckbox = editorId;
        checkbox.setAttribute("aria-label", `Select task ${task.title}`);
        const sr = document.createElement("span");
        sr.className = "sr-badge";
        sr.textContent = `#${String(pendingIndex + 1).padStart(2, "0")}`;
        const title = document.createElement("span");
        title.className = "task-title";
        title.textContent = task.title;
        sel.appendChild(checkbox);
        sel.appendChild(sr);
        sel.appendChild(title);

        const pri = document.createElement("span");
        const normalizedPriority = normalizePriority(task.priority);
        pri.className = `priority ${priorityClass(normalizedPriority)}`;
        pri.textContent = normalizedPriority;

        head.appendChild(sel);
        head.appendChild(pri);
        if (!isLockedStartTask(task)) {
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "secondary icon-subtle";
          edit.title = "Edit task";
          edit.setAttribute("aria-label", "Edit task");
          edit.innerHTML = "<i class=\"fa-solid fa-pen\"></i>";
          edit.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openTaskEditPrompt_(dateKey, task, eodStatusEl);
          });
          head.appendChild(edit);
        }
        row.appendChild(head);
        const projectChip = buildProjectChip_(task && task.project);
        if (projectChip) {
          const chipRow = document.createElement("div");
          chipRow.className = "task-tags";
          chipRow.appendChild(projectChip);
          row.appendChild(chipRow);
        }
        if (isRecurringTask(task) && task.frequency) {
          const hint = document.createElement("div");
          hint.className = "progress-hint";
          const prev = getCarryoverLastCompletion(task);
          const recurringLabel = getRecurringRuleLabel_(task) || task.frequency;
          hint.textContent = prev === null
            ? `Recurring ${recurringLabel} task`
            : `Recurring ${recurringLabel} task | Last logged: ${prev}%`;
          row.appendChild(hint);
        }
        if (isAssignedTask(task)) {
          const deadlineDate = String(task && task.deadlineDate || "").trim();
          const deadlineDays = Number(task && task.deadlineDays);
          if (deadlineDate || (Number.isFinite(deadlineDays) && deadlineDays > 0)) {
            const hint = document.createElement("div");
            hint.className = "progress-hint";
            hint.textContent = deadlineDate
              ? `Assigned deadline: ${formatDateLabel(deadlineDate)}`
              : `Assigned deadline: ${deadlineDays} day${deadlineDays === 1 ? "" : "s"}`;
            row.appendChild(hint);
          }
        }

        const meta = document.createElement("div");
        meta.className = "pending-meta";
        meta.dataset.eodMeta = editorId;
        meta.dataset.eodMetaType = "pending";
        meta.style.display = checkbox.checked && activeEditorId === editorId ? "grid" : "none";

        const percent = document.createElement("select");
        percent.innerHTML = buildCompletionOptionsMarkup(allowedCompletion);

        const spentDuration = document.createElement("input");
        spentDuration.type = "text";
        spentDuration.placeholder = "e.g. 2h 30m";

        const note = document.createElement("textarea");
        note.placeholder = "Optional progress note";
        const stopRecurring = document.createElement("input");
        stopRecurring.type = "checkbox";
        stopRecurring.checked = Boolean(eodDraft.stopRecurringByTaskId[task.taskId]);

        const existing = eodDraft.updatesByTaskId[task.taskId] || { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
        const existingCompletion = existing.completionPercent == null ? "" : String(existing.completionPercent);
        const existingAllowed = existingCompletion !== "" && allowedCompletion.includes(Number(existingCompletion));
        percent.value = existingAllowed ? existingCompletion : "";
        if (existingCompletion !== "" && !existingAllowed && eodDraft.updatesByTaskId[task.taskId]) {
          eodDraft.updatesByTaskId[task.taskId].completionPercent = "";
        }
        percent.dataset.editorId = editorId;
        percent.dataset.field = "completionPercent";
        if (!isRecurringTask(task) && getCarryoverLastCompletion(task) >= 100) {
          percent.disabled = true;
          percent.value = "100";
        }
        spentDuration.value = String(existing.spentDuration || "").trim() || formatDurationInput_(existing.spentHours, existing.spentMinutes);
        spentDuration.dataset.editorId = editorId;
        spentDuration.dataset.field = "spentDuration";
        note.value = existing.note;
        note.dataset.editorId = editorId;
        note.dataset.field = "note";
        autoResizeTextarea_(note);
        stopRecurring.dataset.editorId = editorId;
        stopRecurring.dataset.field = "stopRecurring";

        const percentField = document.createElement("div");
        percentField.className = "meta-field";
        const percentError = getFieldError(eodDraft, editorId, "completionPercent");
        if (percentError) percentField.classList.add("has-error");
        const percentLabel = document.createElement("label");
        percentLabel.textContent = "Completion %";
        percentField.appendChild(percentLabel);
        percentField.appendChild(percent);
        if (percentError) {
          const error = document.createElement("div");
          error.className = "field-error";
          error.textContent = percentError;
          percentField.appendChild(error);
        }

        const durationField = document.createElement("div");
        durationField.className = "meta-field duration-field";
        const durationError = getFieldError(eodDraft, editorId, "spentDuration")
          || getFieldError(eodDraft, editorId, "spentHours")
          || getFieldError(eodDraft, editorId, "spentMinutes");
        if (durationError) durationField.classList.add("has-error");
        const durationLabel = document.createElement("label");
        durationLabel.textContent = "Duration";
        durationField.appendChild(durationLabel);
        durationField.appendChild(spentDuration);
        const timerControlRow = buildTimerControls_(dateKey, editorId, timerState);
        const durationQuickRow = buildDurationQuickChips_(spentDuration);
        durationQuickRow.dataset.eodQuickRow = editorId;
        durationQuickRow.dataset.eodQuickRowType = "pending";
        durationQuickRow.style.display = checkbox.checked && activeEditorId === editorId ? "flex" : "none";
        if (durationError) {
          const error = document.createElement("div");
          error.className = "field-error";
          error.textContent = durationError;
          durationField.appendChild(error);
        }

        const noteField = document.createElement("div");
        noteField.className = "meta-field note-field";
        const noteLabel = document.createElement("label");
        noteLabel.textContent = "Progress Note";
        noteField.appendChild(noteLabel);
        noteField.appendChild(note);

        const recurringField = document.createElement("div");
        recurringField.className = "meta-field recurring-field";
        if (isRecurringTask(task)) {
          const recurringLabel = document.createElement("label");
          recurringLabel.textContent = "Recurring";
          const recurringWrap = document.createElement("label");
          recurringWrap.className = "pending-select";
          const recurringText = document.createElement("span");
          recurringText.textContent = "Stop recurring after this submit";
          recurringWrap.appendChild(stopRecurring);
          recurringWrap.appendChild(recurringText);
          recurringField.appendChild(recurringLabel);
          recurringField.appendChild(recurringWrap);
        }

        meta.appendChild(durationField);
        meta.appendChild(percentField);
        meta.appendChild(noteField);
        meta.appendChild(timerControlRow);
        meta.appendChild(buildApprovalControls_(dateKey, task.taskId, task.title, task.project, existing.note, editorId, eodDraft));
        if (isRecurringTask(task)) {
          meta.appendChild(recurringField);
        }
        row.appendChild(meta);
        row.appendChild(durationQuickRow);
        head.style.cursor = "pointer";
        head.addEventListener("click", (event) => {
          if (event.target.closest("input[type=\"checkbox\"]")) return;
          if (!checkbox.checked) return;
          eodDraft.activeEditorId = editorId;
          saveState();
          setActiveEodEditor_(dateKey, editorId);
          updateSummaryCards();
        });

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            eodDraft.selectedTaskIds[task.taskId] = true;
            if (!eodDraft.updatesByTaskId[task.taskId]) {
              eodDraft.updatesByTaskId[task.taskId] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
            }
            eodDraft.activeEditorId = editorId;
          } else {
            if (timerState.editorId === editorId) {
              timerState.editorId = "";
              timerState.startedAtMs = 0;
              timerState.baseSeconds = 0;
            }
            delete timerState.savedSecondsByEditor[editorId];
            delete eodDraft.selectedTaskIds[task.taskId];
            delete eodDraft.updatesByTaskId[task.taskId];
            delete eodDraft.stopRecurringByTaskId[task.taskId];
            clearApprovalDraftForTask_(eodDraft, task.taskId);
            if (eodDraft.activeEditorId === editorId) {
              eodDraft.activeEditorId = "";
            }
          }
          saveState();
          ensureEodTimerTicker_(dateKey);
          setActiveEodEditor_(dateKey, checkbox.checked ? editorId : getNextActiveEodEditor_(dateKey));
          updateSummaryCards();
        });

        const syncPendingCompletion = () => {
          const value = percent.value;
          if (!eodDraft.updatesByTaskId[task.taskId]) {
            eodDraft.updatesByTaskId[task.taskId] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
          }
          eodDraft.updatesByTaskId[task.taskId].completionPercent = value;
          clearFieldError(eodDraft, editorId, "completionPercent");
          clearFieldVisualError_(percent);
          saveState();
          updateSummaryCards();
          scheduleAttendanceSyncFromEodEdit_(dateKey);
        };
        percent.addEventListener("input", syncPendingCompletion);
        percent.addEventListener("change", syncPendingCompletion);

        spentDuration.addEventListener("input", () => {
          if (!eodDraft.updatesByTaskId[task.taskId]) {
            eodDraft.updatesByTaskId[task.taskId] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
          }
          const update = eodDraft.updatesByTaskId[task.taskId];
          update.spentDuration = spentDuration.value;
          const parsedDuration = parseTimeHHMM(spentDuration.value);
          if (parsedDuration.ok) {
            update.spentHours = parsedDuration.hours;
            update.spentMinutes = parsedDuration.minutes;
            timerState.savedSecondsByEditor[editorId] = ((parsedDuration.hours * 60) + parsedDuration.minutes) * 60;
          }
          clearFieldError(eodDraft, editorId, "spentDuration");
          clearFieldError(eodDraft, editorId, "spentHours");
          clearFieldError(eodDraft, editorId, "spentMinutes");
          clearFieldVisualError_(spentDuration);
          saveState();
          updateSummaryCards();
          scheduleAttendanceSyncFromEodEdit_(dateKey);
        });

        spentDuration.addEventListener("blur", () => {
          const raw = String(spentDuration.value || "").trim();
          if (!raw) return;
          const parsedDuration = parseTimeHHMM(raw);
          if (!parsedDuration.ok) return;
          spentDuration.value = formatDurationInput_(parsedDuration.hours, parsedDuration.minutes);
        });

        note.addEventListener("input", () => {
          if (!eodDraft.updatesByTaskId[task.taskId]) {
            eodDraft.updatesByTaskId[task.taskId] = { completionPercent: "", spentHours: "", spentMinutes: "", spentDuration: "", note: "" };
          }
          eodDraft.updatesByTaskId[task.taskId].note = note.value;
          autoResizeTextarea_(note);
          saveState();
        });
        stopRecurring.addEventListener("change", () => {
          eodDraft.stopRecurringByTaskId[task.taskId] = Boolean(stopRecurring.checked);
          saveState();
        });

        pendingFrag.appendChild(row);
      });

      const extrasFrag = document.createDocumentFragment();
      eodDraft.extras.forEach((extra, index) => {
        const extraId = extra.taskId || createTaskId();
        extra.taskId = extraId;
        const editorId = `extra:${extraId}`;
        const row = document.createElement("div");
        row.className = "extra-row";
        row.dataset.editorId = editorId;

        const head = document.createElement("div");
        head.className = "extra-row-head";
        const titleWrap = document.createElement("div");
        titleWrap.className = "task-title-wrap";
        const sr = document.createElement("span");
        sr.className = "sr-badge";
        sr.textContent = `#${String(index + 1).padStart(2, "0")}`;
        const title = document.createElement("div");
        title.className = "task-title";
        title.textContent = `Extra Task ${index + 1}`;
        titleWrap.appendChild(sr);
        titleWrap.appendChild(title);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger icon-danger";
        remove.title = "Remove task";
        remove.setAttribute("aria-label", "Remove task");
        remove.innerHTML = "<i class=\"fa-solid fa-xmark\"></i>";
        remove.addEventListener("click", async () => {
          const plannerTaskId = String(extra && extra.plannerTaskId || "").trim();
          const extraSource = String(extra && extra.source || "").toLowerCase();
          if (extraSource === "planner" && plannerTaskId) {
            try {
              const returnRes = await callApi("returnPlannerTasks", {
                workDate: dateKey,
                department: identity.dept,
                employeeName: identity.name,
                accessCode: identity.code,
                taskIds: [plannerTaskId]
              });
              if (!returnRes || returnRes.ok === false) {
                throw new Error(returnRes && returnRes.message ? returnRes.message : "Could not return planner task.");
              }
            } catch (err) {
              setStatus(eodStatusEl, `Could not return planner task: ${String(err && err.message ? err.message : err)}`, "error");
              return;
            }
          }

          const previousExtras = (eodDraft.extras || []).map((item) => Object.assign({}, item));
          const previousApprovalByTaskId = Object.assign({}, eodDraft.approvalByTaskId || {});
          if (timerState.editorId === editorId) {
            timerState.editorId = "";
            timerState.startedAtMs = 0;
            timerState.baseSeconds = 0;
          }
          delete timerState.savedSecondsByEditor[editorId];
          clearApprovalDraftForTask_(eodDraft, extraId);
          eodDraft.extras.splice(index, 1);
          saveState();
          renderEodTasks();
          updateSummaryCards();
          if (extraSource === "planner" && plannerTaskId) {
            syncPlannerFromSheets(dateKey, true).then(() => {
              renderPlannerTasks();
            });
            setStatus(eodStatusEl, "Planner task returned to backlog.", "success");
            return;
          }
          showUndoToast_("Extra task removed.", () => {
            eodDraft.extras = previousExtras;
            eodDraft.approvalByTaskId = Object.assign({}, previousApprovalByTaskId);
            saveState();
            renderEodTasks();
            updateSummaryCards();
            setStatus(eodStatusEl, "Extra task restored.", "success");
          });
        });

        head.appendChild(titleWrap);
        head.appendChild(remove);
        row.appendChild(head);

        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.placeholder = "Extra task title";
        titleInput.value = extra.title || "";

        const meta = document.createElement("div");
        meta.className = "extra-meta";
        meta.dataset.eodMeta = editorId;
        meta.dataset.eodMetaType = "extra";
        meta.style.display = activeEditorId === editorId ? "grid" : "none";
        const percent = document.createElement("select");
        percent.innerHTML = buildCompletionOptionsMarkup(COMPLETION_OPTIONS);
        percent.value = extra.completionPercent == null ? "" : String(extra.completionPercent);
        percent.dataset.editorId = editorId;
        percent.dataset.field = "completionPercent";

        const spentDuration = document.createElement("input");
        spentDuration.type = "text";
        spentDuration.placeholder = "e.g. 2h 30m";
        spentDuration.value = String(extra.spentDuration || "").trim() || formatDurationInput_(extra.spentHours, extra.spentMinutes);
        spentDuration.dataset.editorId = editorId;
        spentDuration.dataset.field = "spentDuration";

        const note = document.createElement("textarea");
        note.placeholder = "Optional progress note";
        note.value = extra.note || "";
        note.dataset.editorId = editorId;
        note.dataset.field = "note";
        autoResizeTextarea_(note);

        const percentField = document.createElement("div");
        percentField.className = "meta-field";
        const percentError = getFieldError(eodDraft, editorId, "completionPercent");
        if (percentError) percentField.classList.add("has-error");
        const percentLabel = document.createElement("label");
        percentLabel.textContent = "Completion %";
        percentField.appendChild(percentLabel);
        percentField.appendChild(percent);
        if (percentError) {
          const error = document.createElement("div");
          error.className = "field-error";
          error.textContent = percentError;
          percentField.appendChild(error);
        }

        const durationField = document.createElement("div");
        durationField.className = "meta-field duration-field";
        const durationError = getFieldError(eodDraft, editorId, "spentDuration")
          || getFieldError(eodDraft, editorId, "spentHours")
          || getFieldError(eodDraft, editorId, "spentMinutes");
        if (durationError) durationField.classList.add("has-error");
        const durationLabel = document.createElement("label");
        durationLabel.textContent = "Duration";
        durationField.appendChild(durationLabel);
        durationField.appendChild(spentDuration);
        const timerControlRow = buildTimerControls_(dateKey, editorId, timerState);
        const durationQuickRow = buildDurationQuickChips_(spentDuration);
        durationQuickRow.dataset.eodQuickRow = editorId;
        durationQuickRow.dataset.eodQuickRowType = "extra";
        durationQuickRow.style.display = activeEditorId === editorId ? "flex" : "none";
        if (durationError) {
          const error = document.createElement("div");
          error.className = "field-error";
          error.textContent = durationError;
          durationField.appendChild(error);
        }

        const isMarketing = isMarketingIdentity_();

        const projectSelect = document.createElement("select");
        projectSelect.innerHTML = buildProjectOptionsMarkup();
        projectSelect.value = extra.project || "";
        projectSelect.dataset.editorId = editorId;
        projectSelect.dataset.field = "project";

        const projectField = document.createElement("div");
        projectField.className = "meta-field";
        projectField.hidden = !isMarketing;
        const projectLabel = document.createElement("label");
        projectLabel.textContent = "Project";
        projectField.appendChild(projectLabel);
        projectField.appendChild(projectSelect);

        const noteField = document.createElement("div");
        noteField.className = "meta-field note-field";
        const noteLabel = document.createElement("label");
        noteLabel.textContent = "Progress Note";
        noteField.appendChild(noteLabel);
        noteField.appendChild(note);

        meta.appendChild(durationField);
        meta.appendChild(percentField);
        if (isMarketing) meta.appendChild(projectField);
        meta.appendChild(noteField);
        meta.appendChild(timerControlRow);
        meta.appendChild(buildApprovalControls_(dateKey, extraId, extra.title || `Extra Task ${index + 1}`, extra.project, extra.note, editorId, eodDraft));
        row.appendChild(titleInput);
        row.appendChild(meta);
        row.appendChild(durationQuickRow);
        head.style.cursor = "pointer";
        head.addEventListener("click", () => {
          eodDraft.activeEditorId = editorId;
          saveState();
          setActiveEodEditor_(dateKey, editorId);
          updateSummaryCards();
        });

        titleInput.addEventListener("input", () => {
          extra.title = titleInput.value;
          eodDraft.activeEditorId = editorId;
          saveState();
          updateSummaryCards();
        });
        const syncExtraCompletion = () => {
          extra.completionPercent = percent.value;
          eodDraft.activeEditorId = editorId;
          clearFieldError(eodDraft, editorId, "completionPercent");
          clearFieldVisualError_(percent);
          saveState();
          updateSummaryCards();
          scheduleAttendanceSyncFromEodEdit_(dateKey);
        };
        percent.addEventListener("input", syncExtraCompletion);
        percent.addEventListener("change", syncExtraCompletion);
        spentDuration.addEventListener("input", () => {
          extra.spentDuration = spentDuration.value;
          eodDraft.activeEditorId = editorId;
          const parsedDuration = parseTimeHHMM(spentDuration.value);
          if (parsedDuration.ok) {
            extra.spentHours = parsedDuration.hours;
            extra.spentMinutes = parsedDuration.minutes;
          }
          clearFieldError(eodDraft, editorId, "spentDuration");
          clearFieldError(eodDraft, editorId, "spentHours");
          clearFieldError(eodDraft, editorId, "spentMinutes");
          clearFieldVisualError_(spentDuration);
          saveState();
          updateSummaryCards();
          scheduleAttendanceSyncFromEodEdit_(dateKey);
        });
        spentDuration.addEventListener("blur", () => {
          const raw = String(spentDuration.value || "").trim();
          if (!raw) return;
          const parsedDuration = parseTimeHHMM(raw);
          if (!parsedDuration.ok) return;
          spentDuration.value = formatDurationInput_(parsedDuration.hours, parsedDuration.minutes);
        });
        note.addEventListener("input", () => {
          extra.note = note.value;
          eodDraft.activeEditorId = editorId;
          autoResizeTextarea_(note);
          saveState();
        });
        if (isMarketing) {
          const syncExtraProject = () => {
            extra.project = projectSelect.value;
            eodDraft.activeEditorId = editorId;
            saveState();
          };
          projectSelect.addEventListener("input", syncExtraProject);
          projectSelect.addEventListener("change", syncExtraProject);
        }

        extrasFrag.appendChild(row);
      });
      // Keep extras visible first so users can access new additions without scrolling.
      eodTasksEl.appendChild(extrasFrag);
      eodTasksEl.appendChild(pendingFrag);
      ensureEodTimerTicker_(dateKey);
      refreshEodTimerLabels_(dateKey);
    }

    function setActiveEodEditor_(dateKey, nextEditorId) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key || !eodTasksEl) return;
      const eodDraft = getOrCreateEodDraft(key);
      const activeEditorId = String(nextEditorId || "").trim();
      eodDraft.activeEditorId = activeEditorId;

      eodTasksEl.querySelectorAll("[data-eod-meta]").forEach((metaEl) => {
        const editorId = String(metaEl.dataset.eodMeta || "");
        const metaType = String(metaEl.dataset.eodMetaType || "");
        let shouldShow = activeEditorId && editorId === activeEditorId;
        if (shouldShow && metaType === "pending") {
          const checkboxSel = `input[data-eod-checkbox="${cssEscapeSafe_(editorId)}"]`;
          const checkbox = eodTasksEl.querySelector(checkboxSel);
          shouldShow = Boolean(checkbox && checkbox.checked);
        }
        metaEl.style.display = shouldShow ? "grid" : "none";
      });

      eodTasksEl.querySelectorAll("[data-eod-quick-row]").forEach((quickRowEl) => {
        const editorId = String(quickRowEl.dataset.eodQuickRow || "");
        const quickType = String(quickRowEl.dataset.eodQuickRowType || "");
        let shouldShow = activeEditorId && editorId === activeEditorId;
        if (shouldShow && quickType === "pending") {
          const checkboxSel = `input[data-eod-checkbox="${cssEscapeSafe_(editorId)}"]`;
          const checkbox = eodTasksEl.querySelector(checkboxSel);
          shouldShow = Boolean(checkbox && checkbox.checked);
        }
        quickRowEl.style.display = shouldShow ? "flex" : "none";
      });
    }

    function getNextActiveEodEditor_(dateKey) {
      const key = String(dateKey || workDateEl.value || "").trim();
      if (!key) return "";
      const pending = getPendingTasksForDate(key);
      const eodDraft = getOrCreateEodDraft(key);
      const firstSelectedPending = pending.find((task) =>
        Boolean(eodDraft.selectedTaskIds[task.taskId]) && !isApprovalTaskSubmittedLock_(eodDraft, task.taskId)
      );
      if (firstSelectedPending) return `pending:${firstSelectedPending.taskId}`;
      const firstUnlockedPending = pending.find((task) => !isApprovalTaskSubmittedLock_(eodDraft, task.taskId));
      if (firstUnlockedPending) return `pending:${firstUnlockedPending.taskId}`;
      const extras = ensureArray(eodDraft.extras);
      if (extras.length && extras[0] && extras[0].taskId) return `extra:${extras[0].taskId}`;
      return "";
    }

    function renderAllNow_() {
      renderDateNavigator_();
      renderSodSourceHint();
      renderSyncMeta();
      renderSaveMeta();
      updateAttendanceMetaForDate_(workDateEl.value);
      renderDayStatusControls_(workDateEl.value);
      renderTaskTabState_();
      renderPlannerTasks();
      renderStartTasks();
      renderEodTasks();
      renderApprovalsPanel_();
      updateSummaryCards(true);
      updateCardMotionMode_();
    }

    function renderAll(forceNow) {
      const run = () => {
        isRenderQueued = false;
        if (isRenderingAll) {
          rerenderRequested = true;
          return;
        }
        isRenderingAll = true;
        try {
          do {
            rerenderRequested = false;
            renderAllNow_();
          } while (rerenderRequested);
        } finally {
          isRenderingAll = false;
        }
      };

      if (forceNow === true) {
        run();
        return;
      }

      if (isRenderQueued) {
        rerenderRequested = true;
        return;
      }
      isRenderQueued = true;
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
      } else {
        setTimeout(run, 16);
      }
    }

    function setDateLoading_(loading, message) {
      isDateLoading = Boolean(loading);
      if (isDateLoading) {
        const info = String(message || "").trim();
        setStatus(sodStatusEl, info, info ? "info" : "");
        setStatus(eodStatusEl, info, info ? "info" : "");
        sodTasksEl.innerHTML = "<div class=\"loading-card\"><i class=\"fa-solid fa-spinner\"></i>Loading Start of Day tasks...</div>";
        eodTasksEl.innerHTML = "<div class=\"loading-card\"><i class=\"fa-solid fa-spinner\"></i>Loading End of Day tasks...</div>";
        addTaskBtn.disabled = true;
        submitSodBtn.disabled = true;
        addExtraBtn.disabled = true;
        submitEodBtn.disabled = true;
        syncCarryoverBtn.disabled = true;
        if (prevMonthBtn) prevMonthBtn.disabled = true;
        if (nextMonthBtn) nextMonthBtn.disabled = true;
        if (prevDayBtn) prevDayBtn.disabled = true;
        if (nextDayBtn) nextDayBtn.disabled = true;
        return;
      }
      syncCarryoverBtn.disabled = false;
      if (prevMonthBtn) prevMonthBtn.disabled = false;
      if (nextMonthBtn) nextMonthBtn.disabled = false;
      if (prevDayBtn) prevDayBtn.disabled = false;
      if (nextDayBtn) nextDayBtn.disabled = false;
    }

    function updateCardMotionMode_() {
      const rowCount = document.querySelectorAll(".task-row, .pending-row, .extra-row").length;
      document.body.classList.toggle("reduce-card-motion", rowCount > 16);
    }

    function addTaskToStartDraft() {
      const dateKey = workDateEl.value;
      const title = newTaskTitleEl.value.trim();
      const project = normalizeTaskProject(newTaskProjectEl && newTaskProjectEl.value);
      const frequency = normalizeRecurringFrequency(newTaskFrequencyEl.value);
      const recurrenceWeekday = normalizeRecurringWeekday(newTaskWeeklyDayEl && !newTaskWeeklyDayEl.hidden ? newTaskWeeklyDayEl.value : null);
      const recurrenceDayOfMonth = normalizeRecurringDayOfMonth(newTaskMonthlyDateEl && !newTaskMonthlyDateEl.hidden ? newTaskMonthlyDateEl.value : null);
      const parsedPlan = parseTimeHHMM(newTaskPlannedTimeEl.value);
      const plannedHours = parsedPlan.hours;
      const plannedMinutes = parsedPlan.minutes;
      if (!title) {
        setStatus(sodStatusEl, "Task title is required.", "error");
        return;
      }
      if (!parsedPlan.ok) {
        setStatus(sodStatusEl, "Planned time must be valid (example: 2h 30m, 2:30, or 150m).", "error");
        return;
      }
      if (isMarketingIdentity_() && !project) {
        setStatus(sodStatusEl, "Project is required for Marketing tasks.", "error");
        if (newTaskProjectEl) newTaskProjectEl.focus();
        return;
      }
      if (frequency === "Weekly" && recurrenceWeekday === null) {
        setStatus(sodStatusEl, "Select a valid weekday for weekly recurring tasks.", "error");
        if (newTaskWeeklyDayEl) newTaskWeeklyDayEl.focus();
        return;
      }
      if (frequency === "Monthly" && recurrenceDayOfMonth === null) {
        setStatus(sodStatusEl, "Choose a valid monthly date between 1 and 31.", "error");
        if (newTaskMonthlyDateEl) newTaskMonthlyDateEl.focus();
        return;
      }

      const draft = getOrCreateStartDraft(dateKey);
      const taskId = createTaskId();
      draft.push({
        taskId: taskId,
        title,
        project,
        priority: normalizePriority(newTaskPriorityEl.value),
        source: "sod",
        frequency: frequency,
        recurrenceWeekday: frequency === "Weekly" ? recurrenceWeekday : null,
        recurrenceDayOfMonth: frequency === "Monthly" ? recurrenceDayOfMonth : null,
        plannedHours: parsedPlan.empty ? null : (plannedHours || 0),
        plannedMinutes: parsedPlan.empty ? null : (plannedMinutes || 0)
      });
      getOrCreateSodSelectionByDate_(dateKey)[taskId] = true;
      state.startSourceByDate[dateKey] = "local-storage";

      newTaskTitleEl.value = "";
      newTaskFrequencyEl.value = "";
      if (newTaskProjectEl) newTaskProjectEl.value = "";
      if (newTaskWeeklyDayEl) newTaskWeeklyDayEl.value = "";
      if (newTaskMonthlyDateEl) newTaskMonthlyDateEl.value = "";
      renderNewTaskRecurrenceControls_();
      newTaskPriorityEl.value = "Medium";
      renderSodPrioritySegment_();
      newTaskPlannedTimeEl.value = "";
      setStatus(sodStatusEl, "", "");
      saveState();
      renderAll();
    }

    function findTaskIndexInList_(tasks, task) {
      if (!Array.isArray(tasks) || !task) return -1;
      return tasks.findIndex((t) => {
        const aId = String(t && t.taskId || "").trim();
        const bId = String(task && task.taskId || "").trim();
        if (aId && bId) return aId === bId;
        return String(t && t.title || "").trim() === String(task && task.title || "").trim();
      });
    }

    function remapEodDraftTaskId_(dateKey, oldTaskId, newTaskId) {
      const fromId = String(oldTaskId || "").trim();
      const toId = String(newTaskId || "").trim();
      if (!toId || fromId === toId) return;
      const draft = getOrCreateEodDraft(dateKey);

      if (Object.prototype.hasOwnProperty.call(draft.selectedTaskIds, fromId)) {
        draft.selectedTaskIds[toId] = draft.selectedTaskIds[fromId];
        delete draft.selectedTaskIds[fromId];
      }
      if (Object.prototype.hasOwnProperty.call(draft.updatesByTaskId, fromId)) {
        draft.updatesByTaskId[toId] = draft.updatesByTaskId[fromId];
        delete draft.updatesByTaskId[fromId];
      }
      if (Object.prototype.hasOwnProperty.call(draft.stopRecurringByTaskId, fromId)) {
        draft.stopRecurringByTaskId[toId] = draft.stopRecurringByTaskId[fromId];
        delete draft.stopRecurringByTaskId[fromId];
      }

      const active = String(draft.activeEditorId || "");
      if (active === `pending:${fromId}`) {
        draft.activeEditorId = `pending:${toId}`;
      }
    }

    function getEditableTaskListForDate_(dateKey) {
      const submitted = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
      if (isSodSubmittedForDate_(dateKey) && submitted.length) {
        return { list: submitted, source: "sod" };
      }
      return { list: getOrCreateStartDraft(dateKey), source: "draft" };
    }

    function formatTaskPlannedInput_(task) {
      const h = Number.isFinite(Number(task && task.plannedHours)) ? Number(task.plannedHours) : 0;
      const m = Number.isFinite(Number(task && task.plannedMinutes)) ? Number(task.plannedMinutes) : 0;
      return formatDurationInput_(h, m);
    }

    function applyQuickMinutesToPlanned_(minutesToAdd) {
      const delta = Number(minutesToAdd || 0);
      if (!Number.isFinite(delta) || delta <= 0) return;
      const parsed = parseTimeHHMM(newTaskPlannedTimeEl.value);
      const currentMinutes = parsed.ok ? ((parsed.hours || 0) * 60 + (parsed.minutes || 0)) : 0;
      const totalMinutes = Math.max(0, currentMinutes + delta);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      newTaskPlannedTimeEl.value = formatDurationInput_(h, m);
      newTaskPlannedTimeEl.focus();
      setStatus(sodStatusEl, "", "");
    }

    function applyQuickMinutesToTaskEditPlanned_(minutesToAdd) {
      const delta = Number(minutesToAdd || 0);
      if (!Number.isFinite(delta) || delta <= 0) return;
      const parsed = parseTimeHHMM(taskEditPlannedInputEl.value);
      const currentMinutes = parsed.ok ? ((parsed.hours || 0) * 60 + (parsed.minutes || 0)) : 0;
      const totalMinutes = Math.max(0, currentMinutes + delta);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      taskEditPlannedInputEl.value = formatDurationInput_(h, m);
      taskEditPlannedInputEl.focus();
    }

    function getSectionCollapseState_(dateKey) {
      if (!state.collapsedSectionsByDate || typeof state.collapsedSectionsByDate !== "object") {
        state.collapsedSectionsByDate = {};
      }
      if (!state.collapsedSectionsByDate[dateKey] || typeof state.collapsedSectionsByDate[dateKey] !== "object") {
        state.collapsedSectionsByDate[dateKey] = {};
      }
      return state.collapsedSectionsByDate[dateKey];
    }

    function normalizePromptFrequency_(raw) {
      const v = String(raw || "").trim().toLowerCase();
      if (!v || v === "none" || v === "one-time" || v === "one time" || v === "onetime") return "";
      return normalizeRecurringFrequency(v);
    }

    function updateTaskEditRecurrenceUi_() {
      if (!taskEditFrequencyInputEl) return;
      const frequency = normalizeRecurringFrequency(taskEditFrequencyInputEl.value);
      if (taskEditWeeklyWrapEl) {
        taskEditWeeklyWrapEl.hidden = frequency !== "Weekly";
        taskEditWeeklyWrapEl.style.display = frequency === "Weekly" ? "" : "none";
      }
      if (taskEditWeeklyInputEl) {
        taskEditWeeklyInputEl.disabled = frequency !== "Weekly";
      }
      if (taskEditMonthlyWrapEl) {
        taskEditMonthlyWrapEl.hidden = frequency !== "Monthly";
        taskEditMonthlyWrapEl.style.display = frequency === "Monthly" ? "" : "none";
      }
      if (taskEditMonthlyInputEl) {
        taskEditMonthlyInputEl.disabled = frequency !== "Monthly";
      }
    }

    function openTaskEditModal_(task, dateKey) {
      if (!taskEditOverlayEl || !taskEditTitleInputEl || !taskEditPriorityInputEl || !taskEditFrequencyInputEl || !taskEditPlannedInputEl || !taskEditCancelBtn || !taskEditSaveBtn) {
        return Promise.resolve({ ok: false, cancelled: true });
      }

      const current = task && typeof task === "object" ? task : {};
      const currentRule = resolveRecurringRule_(current, dateKey);
      const requiresProject = isMarketingIdentity_();
      if (taskEditTitleEl) taskEditTitleEl.textContent = "Edit Task";
      taskEditTitleInputEl.value = String(current.title || "").trim();
      taskEditPriorityInputEl.value = normalizePriority(current.priority);
      taskEditFrequencyInputEl.value = normalizeRecurringFrequency(current.frequency);
      if (taskEditProjectWrapEl) taskEditProjectWrapEl.hidden = !requiresProject;
      if (taskEditProjectInputEl) {
        taskEditProjectInputEl.disabled = requiresProject ? false : true;
        ensureProjectOptionValue_(taskEditProjectInputEl, current.project);
      }
      if (taskEditWeeklyInputEl) taskEditWeeklyInputEl.value = currentRule.recurrenceWeekday == null ? "" : String(currentRule.recurrenceWeekday);
      if (taskEditMonthlyInputEl) taskEditMonthlyInputEl.value = currentRule.recurrenceDayOfMonth == null ? "" : String(currentRule.recurrenceDayOfMonth);
      taskEditPlannedInputEl.value = formatTaskPlannedInput_(current);
      if (taskEditErrorEl) {
        taskEditErrorEl.textContent = "";
        taskEditErrorEl.className = "status";
      }
      updateTaskEditRecurrenceUi_();

      return new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          taskEditOverlayEl.classList.remove("active");
          taskEditOverlayEl.setAttribute("aria-hidden", "true");
          taskEditCancelBtn.removeEventListener("click", onCancel);
          taskEditSaveBtn.removeEventListener("click", onSave);
          taskEditOverlayEl.removeEventListener("click", onOverlayClick);
          document.removeEventListener("keydown", onKeyDown);
          if (taskEditFrequencyInputEl) taskEditFrequencyInputEl.removeEventListener("change", updateTaskEditRecurrenceUi_);
        };
        const onCancel = () => {
          cleanup();
          resolve({ ok: false, cancelled: true });
        };
        const onSave = () => {
          const nextTitle = String(taskEditTitleInputEl.value || "").trim();
          const nextProject = normalizeTaskProject(taskEditProjectInputEl && taskEditProjectInputEl.value);
          if (!nextTitle) {
            if (taskEditErrorEl) {
              taskEditErrorEl.textContent = "Task title is required.";
              taskEditErrorEl.className = "status error";
            }
            taskEditTitleInputEl.focus();
            return;
          }
          if (requiresProject && !nextProject) {
            if (taskEditErrorEl) {
              taskEditErrorEl.textContent = "Project is required for Marketing tasks.";
              taskEditErrorEl.className = "status error";
            }
            if (taskEditProjectInputEl) taskEditProjectInputEl.focus();
            return;
          }
          const nextFrequency = normalizeRecurringFrequency(taskEditFrequencyInputEl.value);
          let nextRecurrenceWeekday = null;
          let nextRecurrenceDayOfMonth = null;
          if (nextFrequency === "Weekly") {
            nextRecurrenceWeekday = normalizeRecurringWeekday(taskEditWeeklyInputEl && taskEditWeeklyInputEl.value);
            if (nextRecurrenceWeekday === null) {
              if (taskEditErrorEl) {
                taskEditErrorEl.textContent = "Select a valid weekday.";
                taskEditErrorEl.className = "status error";
              }
              if (taskEditWeeklyInputEl) taskEditWeeklyInputEl.focus();
              return;
            }
          }
          if (nextFrequency === "Monthly") {
            nextRecurrenceDayOfMonth = normalizeRecurringDayOfMonth(taskEditMonthlyInputEl && taskEditMonthlyInputEl.value);
            if (nextRecurrenceDayOfMonth === null) {
              if (taskEditErrorEl) {
                taskEditErrorEl.textContent = "Choose a monthly date between 1 and 31.";
                taskEditErrorEl.className = "status error";
              }
              if (taskEditMonthlyInputEl) taskEditMonthlyInputEl.focus();
              return;
            }
          }
          const nextPlan = parseTimeHHMM(taskEditPlannedInputEl.value);
          if (!nextPlan.ok) {
            if (taskEditErrorEl) {
              taskEditErrorEl.textContent = "Planned time must be valid (example: 2h 30m, 2:30, or 150m).";
              taskEditErrorEl.className = "status error";
            }
            taskEditPlannedInputEl.focus();
            return;
          }
          cleanup();
          resolve({
            ok: true,
            value: {
              title: nextTitle,
              project: nextProject,
              priority: normalizePriority(taskEditPriorityInputEl.value),
              frequency: nextFrequency,
              recurrenceWeekday: nextFrequency === "Weekly" ? nextRecurrenceWeekday : null,
              recurrenceDayOfMonth: nextFrequency === "Monthly" ? nextRecurrenceDayOfMonth : null,
              plannedHours: nextPlan.hours || 0,
              plannedMinutes: nextPlan.minutes || 0
            }
          });
        };
        const onOverlayClick = (event) => {
          if (event.target === taskEditOverlayEl) onCancel();
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") onCancel();
        };

        taskEditCancelBtn.addEventListener("click", onCancel);
        taskEditSaveBtn.addEventListener("click", onSave);
        taskEditOverlayEl.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeyDown);
        if (taskEditFrequencyInputEl) taskEditFrequencyInputEl.addEventListener("change", updateTaskEditRecurrenceUi_);
        taskEditOverlayEl.classList.add("active");
        taskEditOverlayEl.setAttribute("aria-hidden", "false");
        window.requestAnimationFrame(() => {
          taskEditTitleInputEl.focus();
          taskEditTitleInputEl.select();
        });
      });
    }

    function openTaskTitleEditPrompt_(dateKey, task, statusEl) {
      const list = getOrCreateStartDraft(dateKey);
      const idx = findTaskIndexInList_(list, task);
      if (idx < 0) {
        setStatus(statusEl, "Task not found for edit.", "error");
        return;
      }

      const current = list[idx] || {};
      openTaskEditPrompt_(dateKey, current, statusEl);
    }

    async function openTaskEditPrompt_(dateKey, task, statusEl) {
      const editable = getEditableTaskListForDate_(dateKey);
      const list = editable.list;
      const idx = findTaskIndexInList_(list, task);
      if (idx < 0) {
        setStatus(statusEl, "Task not found for edit.", "error");
        return;
      }

      const current = list[idx] || {};
      const previousTask = Object.assign({}, current);
      const previousTaskId = String(current.taskId || "").trim();
      const modalResult = await openTaskEditModal_(current, dateKey);
      if (!modalResult || !modalResult.ok || !modalResult.value) {
        return;
      }
      const nextValue = modalResult.value;

      const resolvedTaskId = previousTaskId || String(task && task.taskId || "").trim() || createTaskId();
      list[idx] = Object.assign({}, current, {
        taskId: resolvedTaskId,
        title: nextValue.title,
        project: nextValue.project,
        priority: nextValue.priority,
        frequency: nextValue.frequency,
        recurrenceWeekday: nextValue.recurrenceWeekday,
        recurrenceDayOfMonth: nextValue.recurrenceDayOfMonth,
        plannedHours: nextValue.plannedHours,
        plannedMinutes: nextValue.plannedMinutes
      });
      remapEodDraftTaskId_(dateKey, previousTaskId, resolvedTaskId);
      if (editable.source === "sod") {
        const draftList = getOrCreateStartDraft(dateKey);
        const draftIdx = findTaskIndexInList_(draftList, previousTask);
        if (draftIdx >= 0) {
          draftList[draftIdx] = Object.assign({}, draftList[draftIdx], {
            taskId: resolvedTaskId,
            title: nextValue.title,
            project: nextValue.project,
            priority: nextValue.priority,
            frequency: nextValue.frequency,
            recurrenceWeekday: nextValue.recurrenceWeekday,
            recurrenceDayOfMonth: nextValue.recurrenceDayOfMonth,
            plannedHours: nextValue.plannedHours,
            plannedMinutes: nextValue.plannedMinutes
          });
        }
      }
      state.startSourceByDate[dateKey] = "local-storage";
      saveState();
      renderAll();
      setStatus(statusEl, "Task updated.", "success");
      showUndoToast_("Task updated.", () => {
        const undoTaskId = previousTaskId || resolvedTaskId;
        list[idx] = Object.assign({}, previousTask, { taskId: undoTaskId });
        remapEodDraftTaskId_(dateKey, resolvedTaskId, undoTaskId);
        if (editable.source === "sod") {
          const draftList = getOrCreateStartDraft(dateKey);
          const draftIdx = findTaskIndexInList_(draftList, list[idx]);
          if (draftIdx >= 0) {
            draftList[draftIdx] = Object.assign({}, previousTask, { taskId: undoTaskId });
          }
        }
        state.startSourceByDate[dateKey] = "local-storage";
        saveState();
        renderAll();
        setStatus(statusEl, "Task reverted.", "success");
      });
    }

    async function handleSodSubmit() {
      if (isSodSubmitting) return;
      const dateKey = workDateEl.value;
      const todayKey = todayISO();
      if (dateKey !== todayKey) {
        const decision = await confirmSodDateMismatch_(dateKey, todayKey);
        if (decision === "switch") {
          setWorkDateAndRefresh_(todayKey);
          setStatus(sodStatusEl, "Date changed to today. Please review and submit Start of Day.", "info");
          return;
        }
        if (decision !== "proceed") {
          setStatus(sodStatusEl, "Start-of-Day submission canceled.", "info");
          return;
        }
      }
      const isAlreadySubmitted = Boolean(
        (Array.isArray(state.sodByDate[dateKey]) && state.sodByDate[dateKey].length > 0)
        || state.sodSubmittedFlagByDate[dateKey]
      );
      if (isAlreadySubmitted) {
        setStatus(sodStatusEl, "Start-of-Day already submitted for this date.", "info");
        submitSodBtn.disabled = true;
        return;
      }

      const pendingTitle = String(newTaskTitleEl && newTaskTitleEl.value || "").trim();
      const pendingPlanned = String(newTaskPlannedTimeEl && newTaskPlannedTimeEl.value || "").trim();
      const pendingFrequency = normalizeRecurringFrequency(newTaskFrequencyEl && newTaskFrequencyEl.value);
      const pendingProject = normalizeTaskProject(newTaskProjectEl && newTaskProjectEl.value);
      const pendingWeeklyDay = String(newTaskWeeklyDayEl && !newTaskWeeklyDayEl.hidden ? newTaskWeeklyDayEl.value : "").trim();
      const pendingMonthlyDate = String(newTaskMonthlyDateEl && !newTaskMonthlyDateEl.hidden ? newTaskMonthlyDateEl.value : "").trim();
      const pendingPriority = normalizePriority(newTaskPriorityEl && newTaskPriorityEl.value);
      const hasUnsavedAddTaskInput = Boolean(
        pendingTitle
        || pendingPlanned
        || pendingProject
        || pendingFrequency
        || pendingWeeklyDay
        || pendingMonthlyDate
        || (pendingPriority && pendingPriority !== "Medium")
      );
      if (hasUnsavedAddTaskInput) {
        const proceedWithoutAdding = window.confirm(
          "One task is still not added. Click 'Cancel' and press 'Add Task' to include it, or press 'OK' to submit without adding it."
        );
        if (!proceedWithoutAdding) {
          setStatus(sodStatusEl, "One task is still not added. Add it first, then submit.", "info");
          if (pendingTitle) {
            newTaskTitleEl.focus();
          } else if (pendingPlanned) {
            newTaskPlannedTimeEl.focus();
          } else {
            newTaskTitleEl.focus();
          }
          return;
        }
      }

      const draftTasks = getOrCreateStartDraft(dateKey);
      const selectedMap = getOrCreateSodSelectionByDate_(dateKey);
      const tasksForState = draftTasks
        .map((t) => ({
          taskId: t.taskId || createTaskId(),
          title: (t.title || "").trim(),
          project: normalizeTaskProject(t.project),
          priority: normalizePriority(t.priority),
          source: (String(t && t.source || "").toLowerCase() === "planner")
            ? "planner"
            : (isCarryoverTask(t) ? "carryover" : (isAssignedTask(t) ? "assigned" : (isRecurringTask(t) ? "recurring" : "sod"))),
          frequency: normalizeRecurringFrequency(t.frequency),
          recurrenceWeekday: normalizeRecurringWeekday(t.recurrenceWeekday),
          recurrenceDayOfMonth: normalizeRecurringDayOfMonth(t.recurrenceDayOfMonth),
          lastCompletion: getCarryoverLastCompletion(t),
          lastNote: (t.lastNote || "").trim(),
          plannedHours: parseHours(t.plannedHours) || 0,
          plannedMinutes: parseMinutes(t.plannedMinutes) || 0,
          addedDate: isCarryoverTask(t) ? String(t.addedDate || t.carryFrom || "").trim() : "",
          carryoverOrigin: isCarryoverTask(t) ? String(t.carryoverOrigin || "local-storage") : "",
          assignedBy: isAssignedTask(t) ? String(t.assignedBy || "").trim() : ""
        }))
        .filter((t) => t.title.length > 0);
      const tasksForSubmission = tasksForState.filter((t) => Boolean(selectedMap[String(t.taskId || "").trim()]));
      const pendingTasksForSod = tasksForState.filter((t) => !Boolean(selectedMap[String(t.taskId || "").trim()]));
      const tasks = tasksForSubmission.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        project: t.project,
        priority: t.priority,
        source: t.source,
        frequency: t.frequency,
        recurrenceWeekday: t.frequency === "Weekly" ? t.recurrenceWeekday : null,
        recurrenceDayOfMonth: t.frequency === "Monthly" ? t.recurrenceDayOfMonth : null,
        plannedHours: t.plannedHours,
        plannedMinutes: t.plannedMinutes,
        addedDate: t.addedDate
      }));
      const pendingTasks = pendingTasksForSod.map((t) => ({
        taskId: t.taskId,
        title: t.title,
        project: t.project,
        priority: t.priority,
        source: t.source,
        frequency: t.frequency,
        recurrenceWeekday: t.frequency === "Weekly" ? t.recurrenceWeekday : null,
        recurrenceDayOfMonth: t.frequency === "Monthly" ? t.recurrenceDayOfMonth : null,
        plannedHours: t.plannedHours,
        plannedMinutes: t.plannedMinutes,
        addedDate: t.addedDate,
        carryoverOrigin: t.carryoverOrigin || "",
        assignedBy: t.assignedBy || "",
        lastCompletion: Number.isFinite(Number(t.lastCompletion)) ? Number(t.lastCompletion) : null,
        lastNote: String(t.lastNote || "").trim()
      }));

      if (!tasks.length) {
        setStatus(sodStatusEl, "Select at least one task to submit Start of Day.", "error");
        return;
      }
      setStatus(sodStatusEl, "Submitting Start-of-Day...", "");
      submitSodBtn.disabled = true;
      isSodSubmitting = true;
      try {
        await syncAttendanceForDate_(dateKey, true);
        const submitWarnings = [];
        const recurringTasks = tasks.filter((t) => RECURRING_FREQUENCIES.includes(normalizeRecurringFrequency(t.frequency)));
        const payload = {
          stage: "SOD",
          requestId: createRequestId(),
          payloadVersion: "v2",
          submittedAt: new Date().toISOString(),
          workDate: dateKey,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          attendance: getAttendancePayloadForDate_(dateKey),
          dayStatus: getDayStatusForDate_(dateKey) || "",
          tasks,
          pendingTasks,
          recurringTasks,
          clientVersion: CLIENT_VERSION
        };
        const result = await callApi("submitSOD", payload);
        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : "Start-of-Day submit rejected.");
        }

        if (recurringTasks.length) {
          const recurringRes = await callApi("syncRecurringTasks", {
            workDate: dateKey,
            department: identity.dept,
            employeeName: identity.name,
            accessCode: identity.code,
            tasks: recurringTasks
          });
          if (!recurringRes || recurringRes.ok === false) {
            submitWarnings.push("Recurring sync failed.");
          } else {
            state.recurringSyncedByDate[dateKey] = false;
            await syncRecurringFromSheets(dateKey, true);
          }
        }

        const plannerTaskIds = tasksForSubmission
          .filter((t) => String(t && t.source || "").toLowerCase() === "planner")
          .map((t) => String(t && t.taskId || "").trim())
          .filter((taskId) => taskId.length > 0);
        if (plannerTaskIds.length) {
          const consumedRes = await callApi("markPlannerConsumed", {
            workDate: dateKey,
            department: identity.dept,
            employeeName: identity.name,
            accessCode: identity.code,
            taskIds: plannerTaskIds
          });
          if (!consumedRes || consumedRes.ok === false) {
            submitWarnings.push("Planner consume sync failed.");
          } else {
            await syncPlannerFromSheets(dateKey, true);
          }
        }

        state.sodByDate[dateKey] = tasksForSubmission;
        state.sodPendingByDate[dateKey] = pendingTasksForSod;
        state.sodSubmittedFlagByDate[dateKey] = true;
        state.eodSubmittedByDate[dateKey] = false;
        // Clear stale EOD payload for this date so EOD task list is driven by fresh SOD.
        delete state.eodSubmittedUpdatesByDate[dateKey];
        if (!state.eodUnlockedWithoutSodByDate || typeof state.eodUnlockedWithoutSodByDate !== "object") {
          state.eodUnlockedWithoutSodByDate = {};
        }
        state.eodUnlockedWithoutSodByDate[dateKey] = false;
        state.submissionDetailsSyncedByDate[dateKey] = true;
        state.sodSelectedTaskIdsByDate[dateKey] = {};
        saveState();
        renderAll();
        if (result.transport === "no-cors" && submitWarnings.length) {
          setStatus(sodStatusEl, `Start-of-Day request sent. ${submitWarnings.join(" ")}`, "info");
        } else if (result.transport === "no-cors") {
          setStatus(sodStatusEl, "Start-of-Day request sent. Finalizing integrations in background.", "info");
        } else if (submitWarnings.length) {
          setStatus(sodStatusEl, `Start-of-Day submitted with warnings. ${submitWarnings.join(" ")}`, "info");
        } else {
          setStatus(sodStatusEl, "Start-of-Day submitted successfully.", "success");
        }
        pushCliqWebhook("SOD", payload).then((webhook) => {
          if (!webhook || !webhook.ok) {
            console.warn("SOD webhook failed:", String(webhook && webhook.message ? webhook.message : "Unknown error"));
          }
        }).catch(() => {
          console.warn("SOD webhook failed.");
        });
      } catch (err) {
        setStatus(sodStatusEl, `Start-of-Day submit failed: ${err.message}`, "error");
      } finally {
        isSodSubmitting = false;
        const submitted = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
        submitSodBtn.disabled = submitted.length > 0;
      }
    }

    function confirmSodDateMismatch_(selectedDateISO, todayDateISO) {
      const selectedDate = String(selectedDateISO || "").trim();
      const todayDate = String(todayDateISO || "").trim();
      const selectedLabel = formatDateLabel(selectedDate);
      const todayLabel = formatDateLabel(todayDate);
      const message = `You are trying to submit Start of Day for ${selectedLabel}, not ${todayLabel}.`;

      if (!confirmOverlayEl || !confirmBodyEl || !confirmDetailsEl || !confirmCancelBtn || !confirmProceedBtn) {
        const proceed = window.confirm(`${message}\n\nPress OK to proceed for ${selectedLabel}, or Cancel to switch to today.`);
        return Promise.resolve(proceed ? "proceed" : "switch");
      }

      return new Promise((resolve) => {
        const prevTitle = confirmTitleEl ? confirmTitleEl.textContent : "";
        const prevBody = confirmBodyEl.textContent;
        const prevCancelText = confirmCancelBtn.textContent;
        const prevProceedHtml = confirmProceedBtn.innerHTML;

        if (confirmTitleEl) confirmTitleEl.textContent = "Confirm Start of Day Date";
        confirmBodyEl.textContent = message;
        confirmDetailsEl.innerHTML = "";
        const li = document.createElement("li");
        li.textContent = "Choose one option below.";
        confirmDetailsEl.appendChild(li);
        confirmCancelBtn.textContent = "Switch To Today";
        confirmProceedBtn.innerHTML = "<i class=\"fa-solid fa-paper-plane\"></i>Proceed Anyway";

        const cleanup = () => {
          confirmOverlayEl.classList.remove("active");
          confirmOverlayEl.setAttribute("aria-hidden", "true");
          confirmCancelBtn.removeEventListener("click", onSwitch);
          confirmProceedBtn.removeEventListener("click", onProceed);
          confirmOverlayEl.removeEventListener("click", onOverlayClick);
          document.removeEventListener("keydown", onEsc);
          if (confirmTitleEl) confirmTitleEl.textContent = prevTitle;
          confirmBodyEl.textContent = prevBody;
          confirmDetailsEl.innerHTML = "";
          confirmCancelBtn.textContent = prevCancelText;
          confirmProceedBtn.innerHTML = prevProceedHtml;
        };

        const onSwitch = () => {
          cleanup();
          resolve("switch");
        };

        const onProceed = () => {
          cleanup();
          resolve("proceed");
        };

        const onOverlayClick = (event) => {
          if (event.target !== confirmOverlayEl) return;
          cleanup();
          resolve("dismiss");
        };

        const onEsc = (event) => {
          if (event.key !== "Escape") return;
          cleanup();
          resolve("dismiss");
        };

        confirmCancelBtn.addEventListener("click", onSwitch);
        confirmProceedBtn.addEventListener("click", onProceed);
        confirmOverlayEl.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onEsc);
        confirmOverlayEl.classList.add("active");
        confirmOverlayEl.setAttribute("aria-hidden", "false");
      });
    }

    function confirmLowEodSubmission_(summary) {
      const info = summary || {};
      if (!confirmOverlayEl || !confirmBodyEl || !confirmDetailsEl || !confirmCancelBtn || !confirmProceedBtn) {
        return Promise.resolve(window.confirm("Submission looks low. Do you want to submit anyway?"));
      }

      const totalSpentMinutes = Number(info.totalSpentMinutes || 0);
      const minimumMinutes = Number(info.minimumMinutes || 0);
      confirmTitleEl.textContent = "Submit with low summary?";
      confirmBodyEl.textContent = "This End-of-Day entry is below the usual expected level. Please confirm before final submit.";
      confirmDetailsEl.innerHTML = "";

      const details = [
        `Logged time: ${formatMinutes(totalSpentMinutes)}`,
        `Expected minimum time: ${formatMinutes(minimumMinutes)}`
      ];
      details.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        confirmDetailsEl.appendChild(li);
      });

      return new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          confirmOverlayEl.classList.remove("active");
          confirmOverlayEl.setAttribute("aria-hidden", "true");
          confirmCancelBtn.removeEventListener("click", onCancel);
          confirmProceedBtn.removeEventListener("click", onProceed);
          confirmOverlayEl.removeEventListener("click", onOverlayClick);
          document.removeEventListener("keydown", onKeyDown);
        };
        const onCancel = () => {
          cleanup();
          resolve(false);
        };
        const onProceed = () => {
          cleanup();
          resolve(true);
        };
        const onOverlayClick = (event) => {
          if (event.target === confirmOverlayEl) onCancel();
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") onCancel();
        };

        confirmCancelBtn.addEventListener("click", onCancel);
        confirmProceedBtn.addEventListener("click", onProceed);
        confirmOverlayEl.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeyDown);

        confirmOverlayEl.classList.add("active");
        confirmOverlayEl.setAttribute("aria-hidden", "false");
      });
    }

    function confirmMissingCheckoutForEod_(info) {
      const details = info || {};
      if (!confirmOverlayEl || !confirmBodyEl || !confirmDetailsEl || !confirmCancelBtn || !confirmProceedBtn) {
        return Promise.resolve(window.confirm("It looks like you have not checked out yet. Submit End-of-Day anyway?"));
      }

      confirmTitleEl.textContent = "Checkout not found";
      confirmBodyEl.textContent = "It seems like you have not checked out yet. You can still submit this End-of-Day entry if needed.";
      confirmDetailsEl.innerHTML = "";

      const lines = [
        `Date: ${formatDateLabel(details.workDate || "")}`,
        `Login: ${details.loginTime || "--"}`,
        "Checkout: --"
      ];
      lines.forEach((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        confirmDetailsEl.appendChild(li);
      });

      return new Promise((resolve) => {
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          confirmOverlayEl.classList.remove("active");
          confirmOverlayEl.setAttribute("aria-hidden", "true");
          confirmCancelBtn.removeEventListener("click", onCancel);
          confirmProceedBtn.removeEventListener("click", onProceed);
          confirmOverlayEl.removeEventListener("click", onOverlayClick);
          document.removeEventListener("keydown", onKeyDown);
        };
        const onCancel = () => {
          cleanup();
          resolve(false);
        };
        const onProceed = () => {
          cleanup();
          resolve(true);
        };
        const onOverlayClick = (event) => {
          if (event.target === confirmOverlayEl) onCancel();
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") onCancel();
        };

        confirmCancelBtn.addEventListener("click", onCancel);
        confirmProceedBtn.addEventListener("click", onProceed);
        confirmOverlayEl.addEventListener("click", onOverlayClick);
        document.addEventListener("keydown", onKeyDown);

        confirmOverlayEl.classList.add("active");
        confirmOverlayEl.setAttribute("aria-hidden", "false");
      });
    }

    function formatDateLabel(isoDate) {
      const raw = String(isoDate || "").trim();
      if (!raw) return "-";
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split("-");
        return `${d}-${m}-${y}`;
      }
      const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (m) {
        return `${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}-${m[3]}`;
      }
      return raw;
    }

    function getAddedDaysAgoLabel_(addedDateISO, referenceDateISO) {
      const added = parseISODate_(addedDateISO);
      const ref = parseISODate_(referenceDateISO);
      if (!added || !ref) return "";
      const msPerDay = 24 * 60 * 60 * 1000;
      const diffDays = Math.floor((ref.getTime() - added.getTime()) / msPerDay);
      if (diffDays < 0) return "";
      if (diffDays === 0) return "Added today";
      if (diffDays === 1) return "Added yesterday";
      return `Added ${diffDays} days ago`;
    }

    function getSubmitterEmailForCliq_(employeeName) {
      const full = String(employeeName || "").trim();
      if (!full) return "";
      if (full.toLowerCase() === "kainaz tata") return "kainaz.t@finnovate.in";
      if (full.toLowerCase() === "aastha tiwari") return "aasthatiwari@finnovate.in";
      if (full.toLowerCase() === "priyanka kelkar") return "accounts@finnovate.in";
      return `${full.toLowerCase().replace(/\s+/g, ".")}@finnovate.in`;
    }

    function formatCliqDate_(isoDate) {
      const raw = String(isoDate || "").trim();
      if (!raw) return "-";
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return raw;
      return `${m[3]}-${m[2]}-${m[1]}`;
    }

    function formatCliqMinutes_(totalMinutes) {
      const safe = Math.max(0, Number(totalMinutes || 0));
      const h = Math.floor(safe / 60);
      const m = safe % 60;
      return `${h}h ${m}m`;
    }

    function normalizeCliqFrequency_(value) {
      const v = normalizeRecurringFrequency(value);
      return v || "";
    }

    function simpleHash32_(value) {
      const input = String(value || "");
      let hash = 2166136261;
      for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16);
    }

    function normalizeWebhookTaskSignature_(stage, payload) {
      const normalizedStage = String(stage || "").trim().toUpperCase();
      if (normalizedStage === "EOD") {
        return ensureArray(payload && payload.updates).map((t) => {
          return [
            String(t && t.taskId || "").trim(),
            String(t && t.title || "").trim().toLowerCase(),
            normalizePriority(t && t.priority),
            Number(t && t.completionPercent || 0),
            Number(t && t.spentHours || 0),
            Number(t && t.spentMinutes || 0),
            Boolean(t && t.isExtra) ? "extra" : "base"
          ].join("|");
        }).filter((v) => v.length > 0).sort();
      }
      return ensureArray(payload && payload.tasks).map((t) => {
        return [
          String(t && t.taskId || "").trim(),
            String(t && t.title || "").trim().toLowerCase(),
            normalizePriority(t && t.priority),
            normalizeCliqFrequency_(t && t.frequency),
            Number(t && t.recurrenceWeekday != null ? t.recurrenceWeekday : -1),
            Number(t && t.recurrenceDayOfMonth != null ? t.recurrenceDayOfMonth : -1),
            Number(t && t.plannedHours || 0),
            Number(t && t.plannedMinutes || 0),
            normalizeTaskProject(t && t.project).toLowerCase()
          ].join("|");
      }).filter((v) => v.length > 0).sort();
    }

    function buildWebhookDedupKey_(stage, payload) {
      const normalizedStage = String(stage || "").trim().toUpperCase();
      const p = payload || {};
      const tasksSignature = normalizeWebhookTaskSignature_(normalizedStage, p);
      const base = JSON.stringify({
        stage: normalizedStage,
        workDate: String(p.workDate || "").trim(),
        department: String(p.department || "").trim().toLowerCase(),
        employeeName: String(p.employeeName || "").trim().toLowerCase(),
        tasksSignature
      });
      return `${normalizedStage}|${simpleHash32_(base)}`;
    }

    function shouldSkipDuplicateWebhook_(dedupKey) {
      const now = Date.now();
      const lastSentAt = Number(webhookSentAt[dedupKey] || 0);
      if (lastSentAt > 0 && (now - lastSentAt) <= WEBHOOK_DEDUP_WINDOW_MS) {
        return true;
      }
      webhookSentAt[dedupKey] = now;
      return false;
    }

    function buildCliqMessage_(stage, payload) {
      const normalizedStage = String(stage || "").trim().toUpperCase();
      const p = payload || {};
      const bullet = "•";
      const employeeName = String(payload && payload.employeeName || "").trim() || "-";
      const employeeShort = firstNameOnly(employeeName) || employeeName;
      const dateLabel = formatCliqDate_(payload && payload.workDate);
      const meta = `Date: ${dateLabel}`;
      const attendance = payload && payload.attendance && typeof payload.attendance === "object" ? payload.attendance : null;
      const loginText = attendance && attendance.loginTime ? formatAttendanceClock12h_(attendance.loginTime) : "";
      const checkoutText = attendance && attendance.logoutTime ? formatAttendanceClock12h_(attendance.logoutTime) : "";
      const workingMinutes = Number(attendance && attendance.workingMinutes);
      const hoursText = attendance && Number.isFinite(Number(attendance.workingMinutes))
        ? formatMinutesCompact_(attendance.workingMinutes)
        : "";

      if (normalizedStage === "SOD") {
        const plannedTasks = ensureArray(payload && payload.tasks);
        const plannedCount = plannedTasks.length;
        const headline = `*${plannedCount} Planned ${plannedCount === 1 ? "Task" : "Tasks"} by ${employeeShort}*`;
        const formatSodLine = (t) => {
          const title = String(t && t.title || "").trim() || "-";
          const plannedH = Number(t && t.plannedHours || 0);
          const plannedM = Number(t && t.plannedMinutes || 0);
          const plannedPart = (plannedH > 0 || plannedM > 0) ? ` - ${plannedH}h ${plannedM}m` : "";
          return `${bullet} ${title}${plannedPart}`;
        };
        const recurringTasks = plannedTasks.filter((t) => normalizeCliqFrequency_(t && t.frequency));
        const assignedTasks = plannedTasks.filter((t) => String(t && t.source || "").toLowerCase() === "assigned");
        const carryoverTasks = plannedTasks.filter((t) => String(t && t.source || "").toLowerCase() === "carryover");
        const newTasks = plannedTasks.filter((t) => {
          const source = String(t && t.source || "").toLowerCase();
          return source !== "carryover" && source !== "assigned" && !normalizeCliqFrequency_(t && t.frequency);
        });
        const newList = newTasks.map((t) => formatSodLine(t));
        const assignedList = assignedTasks.map((t) => formatSodLine(t));
        const carryoverList = carryoverTasks.map((t) => formatSodLine(t));
        const recurringList = recurringTasks.map((t) => {
          const freq = getRecurringRuleLabel_(t);
          return `${formatSodLine(t)}${freq ? ` - ${freq}` : ""}`;
        });
        const lines = [
          headline,
          meta,
          (loginText ? `Login: ${loginText}` : ""),
          "",
          "*New*",
          (newList.length ? newList.join("\n") : `${bullet} None`),
          "",
          "*Carryover Tasks*",
          (carryoverList.length ? carryoverList.join("\n") : `${bullet} None`)
        ];
        if (assignedList.length) {
          lines.push(
            "",
            "*Admin Assigned*",
            assignedList.join("\n")
          );
        }
        if (recurringList.length) {
          lines.push("", "*Recurring*", recurringList.join("\n"));
        }
        return lines.join("\n");
      }

      const updates = ensureArray(payload && payload.updates);
      const approvalPendingTasks = updates.filter((u) => String(u && u.approvalStatus || "").trim().toLowerCase() === "pending");
      const nonApprovalUpdates = updates.filter((u) => String(u && u.approvalStatus || "").trim().toLowerCase() !== "pending");
      const completed = nonApprovalUpdates.filter((u) => Number(u && u.completionPercent || 0) === 100);
      const completedPlanned = completed.filter((u) => !Boolean(u && u.isExtra) && String(u && u.source || "").toLowerCase() !== "assigned");
      const completedAssigned = completed.filter((u) => !Boolean(u && u.isExtra) && String(u && u.source || "").toLowerCase() === "assigned");
      const assignedTasks = nonApprovalUpdates.filter((u) => !Boolean(u && u.isExtra) && String(u && u.source || "").toLowerCase() === "assigned");
      const extraTasks = nonApprovalUpdates.filter((u) => Boolean(u && u.isExtra));
      const completedExtra = extraTasks.filter((u) => Number(u && u.completionPercent || 0) === 100);

      const summary = p && p.dailySummary ? p.dailySummary : {};
      const plannedDenRaw = Number(summary && summary.plannedBaseCount);
      const assignedDenRaw = Number(summary && summary.plannedAssignedCount);
      const plannedDen = Number.isFinite(plannedDenRaw)
        ? plannedDenRaw
        : updates.filter((u) => !Boolean(u && u.isExtra) && String(u && u.source || "").toLowerCase() !== "assigned").length;
      const assignedDen = Number.isFinite(assignedDenRaw)
        ? assignedDenRaw
        : updates.filter((u) => !Boolean(u && u.isExtra) && String(u && u.source || "").toLowerCase() === "assigned").length;

      const headline = `*${completed.length} Completed ${completed.length === 1 ? "Task" : "Tasks"} by ${employeeShort}*`;
      const totalSpentFromPayload = Number(p && p.totalSpentMinutes);
      const computedSpentMinutes = updates.reduce(
        (sum, u) => sum + ((Number(u && u.spentHours || 0) * 60) + Number(u && u.spentMinutes || 0)),
        0
      );
      const totalSpentMinutes = Number.isFinite(totalSpentFromPayload) ? Math.max(0, totalSpentFromPayload) : computedSpentMinutes;
      const totalSpentLabel = `Total spent: ${formatCliqMinutes_(totalSpentMinutes)}`;
      const formatEodTaskLine = (u, includePercent) => {
        const title = String(u && u.title || "").trim() || "-";
        const completion = Number(u && u.completionPercent || 0);
        const spentH = Number(u && u.spentHours || 0);
        const spentM = Number(u && u.spentMinutes || 0);
        const note = String(u && u.note || "").trim();
        const percentPart = includePercent ? ` - ${completion}%` : "";
        const notePart = note ? ` | Progress note: ${note}` : "";
        return `${bullet} ${title}${percentPart} - ${spentH}h ${spentM}m${notePart}`;
      };
      const plannedList = completedPlanned.map((u) => formatEodTaskLine(u, false));
      const areAllAssignedTasksCompleted = assignedTasks.length > 0 && completedAssigned.length === assignedTasks.length;
      const assignedList = assignedTasks.map((u) => formatEodTaskLine(u, !areAllAssignedTasksCompleted));

      const pendingCarryforward = nonApprovalUpdates.filter((u) => !Boolean(u && u.isExtra) && Number(u && u.completionPercent || 0) < 100);
      const plannedCountRaw = Number(summary && summary.plannedCount);
      const plannedCountDen = Number.isFinite(plannedCountRaw) ? plannedCountRaw : updates.filter((u) => !Boolean(u && u.isExtra)).length;
      const extraDenRaw = Number(summary && summary.extraCount);
      const extraDen = Number.isFinite(extraDenRaw)
        ? extraDenRaw
        : extraTasks.length;
      const pendingHeader = `*Pending (${pendingCarryforward.length} out of ${Math.max(0, plannedCountDen)} planned)*`;
      const pendingList = pendingCarryforward.map((u) => formatEodTaskLine(u, true));
      const areAllExtraTasksCompleted = extraDen > 0 && completedExtra.length === extraDen;
      const extraList = extraTasks.map((u) => formatEodTaskLine(u, !areAllExtraTasksCompleted));

      const sections = [
        headline,
        meta,
        (checkoutText ? `Checkout: ${checkoutText}` : ""),
        (hoursText && workingMinutes > 0 ? `Attendance Hours: ${hoursText}` : ""),
        totalSpentLabel,
        "",
        `*${completedPlanned.length}/${Math.max(0, plannedDen)} Planned Tasks Completed*`,
        (plannedList.length ? plannedList.join("\n") : `${bullet} None`)
      ];

      if (extraList.length) {
        const extraHeader = areAllExtraTasksCompleted
          ? `*Extra Tasks (${completedExtra.length}/${Math.max(0, extraDen)}) - 100% completed*`
          : `*Extra Tasks (${completedExtra.length}/${Math.max(0, extraDen)})*`;
        sections.push(
          "",
          extraHeader,
          extraList.join("\n")
        );
      }

      if (assignedList.length) {
        sections.push(
          "",
          `*Assigned: (${completedAssigned.length}/${Math.max(0, assignedDen)})*`,
          assignedList.join("\n")
        );
      }

      if (pendingList.length) {
        sections.push(
          "",
          pendingHeader,
          pendingList.join("\n")
        );
      }

      if (approvalPendingTasks.length) {
        sections.push(
          "",
          `*Sent For Approval (${approvalPendingTasks.length})*`,
          approvalPendingTasks.map((u) => {
            const approver = String(u && u.approvalApprover || "").trim();
            const baseLine = formatEodTaskLine(u, true);
            return approver ? `${baseLine} | Approver: ${approver}` : baseLine;
          }).join("\n")
        );
      }

      return sections.join("\n");
    }

    async function pushCliqWebhook(stage, payload) {
      const normalizedStage = String(stage || "").trim().toUpperCase();
      if (!ZOHO_SUBMISSION_WEBHOOK_URL) return { ok: false, message: "Submission webhook URL is not configured." };
      if (normalizedStage !== "SOD" && normalizedStage !== "EOD") return { ok: false, message: "Invalid stage." };
      const dedupKey = buildWebhookDedupKey_(normalizedStage, payload || {});
      if (shouldSkipDuplicateWebhook_(dedupKey)) return { ok: true, duplicateIgnored: true };

      const submitterEmail = getSubmitterEmailForCliq_(payload && payload.employeeName);
      const totalSpentMinutes = Number(payload && payload.totalSpentMinutes || 0);
      const flowPayload = {
        category: "submission",
        stage: normalizedStage,
        employeeName: String(payload && payload.employeeName || "").trim(),
        submitterEmail,
        department: String(payload && payload.department || "").trim(),
        workDate: String(payload && payload.workDate || "").trim(),
        taskCount: normalizedStage === "EOD" ? ensureArray(payload && payload.updates).length : ensureArray(payload && payload.tasks).length,
        totalSpentMinutes: Number.isFinite(totalSpentMinutes) ? totalSpentMinutes : 0,
        cliq_message: buildCliqMessage_(normalizedStage, payload || {}),
        payload_json: JSON.stringify(payload || {})
      };

      pendingWebhookRequests += 1;
      try {
        await fetch(ZOHO_SUBMISSION_WEBHOOK_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: toFormEncoded(flowPayload),
          keepalive: true
        });
        return { ok: true, transport: "no-cors" };
      } catch (err) {
        delete webhookSentAt[dedupKey];
        return { ok: false, message: String(err && err.message ? err.message : err) };
      } finally {
        pendingWebhookRequests = Math.max(0, pendingWebhookRequests - 1);
      }
    }

    async function logCliqFailureForUser_(meta) {
      if (!identity) return;
      try {
        await callApi("logCliqFailure", Object.assign({
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          code: identity.code,
          clientVersion: CLIENT_VERSION
        }, meta || {}), { timeoutMs: 12000 });
      } catch (err) {
        console.warn("Failed to log approval Cliq failure:", err);
      }
    }

    function buildApprovalRequestCliqMessage_(row) {
      const request = row && typeof row === "object" ? row : {};
      const taskTitle = String(request.title || "").trim() || "-";
      const approver = String(request.approvalApprover || request.approverAdmin || "").trim() || "-";
      const requestNote = String(request.requestNote || "").trim();
      const sourceNote = String(request.sourceNote || "").trim();
      return [
        `*Approval Request for ${firstNameOnly(identity && identity.name) || String(identity && identity.name || "").trim() || "Employee"}*`,
        `Department: ${String(identity && identity.dept || "").trim() || "-"}`,
        `Work Date: ${formatCliqDate_(request.workDate || workDateEl.value || todayISO())}`,
        `Approver: ${approver}`,
        "",
        `Task: ${taskTitle}`,
        request.project ? `Project: ${String(request.project).trim()}` : "",
        `Completion: ${Number(request.completionPercent || 0)}%`,
        `Spent: ${formatCliqMinutes_(request.spentMinutes || 0)}`,
        requestNote ? `Request note: ${requestNote}` : "",
        sourceNote ? `Progress note: ${sourceNote}` : ""
      ].filter(Boolean).join("\n");
    }

    async function sendApprovalRequestCliqNotifications_(requests) {
      const rows = ensureArray(requests).filter((row) => row && row.approvalApprover);
      if (!rows.length) return { ok: true, sent: 0 };
      if (!ZOHO_SUBMISSION_WEBHOOK_URL) return { ok: false, message: "Submission webhook URL is not configured." };
      for (const row of rows) {
        const approverEmail = getCliqEmailForName_(row.approvalApprover);
        if (!approverEmail) {
          const errorMessage = `Cliq recipient is not mapped for approver ${String(row.approvalApprover || "").trim() || "-"}.`;
          await logCliqFailureForUser_({
            stage: "APPROVAL_REQUEST",
            department: identity && identity.dept || "",
            employeeName: identity && identity.name || "",
            workDate: String(row.workDate || workDateEl.value || todayISO()).trim(),
            error: errorMessage,
            flowPayload: row || {}
          });
          return { ok: false, message: errorMessage };
        }
        const flowPayload = {
          category: "approval",
          stage: "APPROVAL_REQUEST",
          employeeName: String(identity && identity.name || "").trim(),
          submitterEmail: approverEmail,
          department: String(identity && identity.dept || "").trim(),
          workDate: String(row.workDate || workDateEl.value || todayISO()).trim(),
          taskCount: 1,
          totalSpentMinutes: Number(row.spentMinutes || 0),
          cliq_message: buildApprovalRequestCliqMessage_(row),
          payload_json: JSON.stringify(row || {})
        };
        try {
          await fetch(ZOHO_SUBMISSION_WEBHOOK_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: toFormEncoded(flowPayload),
            keepalive: true
          });
        } catch (err) {
          const errorMessage = String(err && err.message ? err.message : err);
          await logCliqFailureForUser_({
            stage: "APPROVAL_REQUEST",
            department: identity && identity.dept || "",
            employeeName: identity && identity.name || "",
            workDate: String(row.workDate || workDateEl.value || todayISO()).trim(),
            error: errorMessage,
            flowPayload: flowPayload
          });
          return { ok: false, message: errorMessage };
        }
      }
      return { ok: true, sent: rows.length };
    }

    function updateSummaryCardsNow_() {
      const dateKey = workDateEl.value;
      const startTasks = getOrCreateStartDraft(dateKey);
      const pending = getPendingTasksForDate(dateKey);
      const eodDraft = getOrCreateEodDraft(dateKey);

      let selectedCount = 0;
      let totalSpent = 0;

      pending.forEach((task) => {
        if (!eodDraft.selectedTaskIds[task.taskId]) return;
        selectedCount += 1;
        const upd = eodDraft.updatesByTaskId[task.taskId] || {};
        const rawDuration = String(upd.spentDuration || "").trim();
        const parsedDuration = rawDuration ? parseTimeHHMM(rawDuration) : null;
        const h = parsedDuration ? (parsedDuration.ok ? parsedDuration.hours : null) : parseHours(upd.spentHours);
        const m = parsedDuration ? (parsedDuration.ok ? parsedDuration.minutes : null) : parseMinutes(upd.spentMinutes);
        if (h !== null && m !== null) {
          totalSpent += h * 60 + m;
        }
      });

      (eodDraft.extras || []).forEach((extra) => {
        if (!(extra.title || "").trim()) return;
        selectedCount += 1;
        const rawDuration = String(extra.spentDuration || "").trim();
        const parsedDuration = rawDuration ? parseTimeHHMM(rawDuration) : null;
        const h = parsedDuration ? (parsedDuration.ok ? parsedDuration.hours : null) : parseHours(extra.spentHours);
        const m = parsedDuration ? (parsedDuration.ok ? parsedDuration.minutes : null) : parseMinutes(extra.spentMinutes);
        if (h !== null && m !== null) {
          totalSpent += h * 60 + m;
        }
      });

      startCountCardEl.textContent = String(startTasks.length);
      const submittedStartTasks = Array.isArray(state.sodByDate[dateKey]) ? state.sodByDate[dateKey] : [];
      const sodPendingTasks = Array.isArray(state.sodPendingByDate && state.sodPendingByDate[dateKey]) ? state.sodPendingByDate[dateKey] : [];
      const sodViewTasks = (isSodSubmittedForDate_(dateKey) && submittedStartTasks.length)
        ? submittedStartTasks
        : startTasks;
      updateSodSubmitMeta_(dateKey, sodViewTasks);
      if (postponedCountCardEl) postponedCountCardEl.textContent = String(sodPendingTasks.length);
      hoursSplitCardEl.textContent = formatMinutes(totalSpent);
      updateEodElapsedTime_(dateKey);
      updateEodSubmitButtonState_(dateKey);
    }

    function updateSummaryCards(forceNow) {
      const run = () => {
        summaryCardsRafId = 0;
        updateSummaryCardsNow_();
      };
      if (forceNow === true) {
        if (summaryCardsRafId) {
          if (typeof window.cancelAnimationFrame === "function") {
            window.cancelAnimationFrame(summaryCardsRafId);
          }
          clearTimeout(summaryCardsRafId);
          summaryCardsRafId = 0;
        }
        run();
        return;
      }
      if (summaryCardsRafId) return;
      if (typeof window.requestAnimationFrame === "function") {
        summaryCardsRafId = window.requestAnimationFrame(run);
      } else {
        summaryCardsRafId = setTimeout(run, 16);
      }
    }

    function validateEodBeforeSubmit(pending, eodDraft) {
      for (const task of pending) {
        if (!eodDraft.selectedTaskIds[task.taskId]) continue;
        const editorId = `pending:${task.taskId}`;
        const update = eodDraft.updatesByTaskId[task.taskId] || {};
        const allowed = getAllowedCompletionOptions(task);
        const completion = parsePercent(update.completionPercent);
        if (completion === null || !allowed.includes(completion)) {
          return {
            ok: false,
            editorId,
            field: "completionPercent",
            message: "Choose a valid completion %. Tasks with previous completion must move strictly above it."
          };
        }

        const durationRaw = String(update.spentDuration || "").trim();
        const hRaw = update.spentHours;
        const mRaw = update.spentMinutes;
        let h = parseHours(hRaw);
        let m = parseMinutes(mRaw);
        if (durationRaw) {
          const parsedDuration = parseTimeHHMM(durationRaw);
          if (!parsedDuration.ok) {
            return { ok: false, editorId, field: "spentDuration", message: "Duration must be valid (example: 2h 30m, 2:30, or 150m)." };
          }
          h = parsedDuration.hours;
          m = parsedDuration.minutes;
        } else {
          if (h === null) {
            return { ok: false, editorId, field: "spentDuration", message: "Duration must be a valid value." };
          }
          if (m === null) {
            return { ok: false, editorId, field: "spentDuration", message: "Duration must be a valid value." };
          }
        }
        const hasAnyTimeInput = durationRaw.length > 0 || String(hRaw ?? "").trim() !== "" || String(mRaw ?? "").trim() !== "";
        if (!hasAnyTimeInput || (h === 0 && m === 0)) {
          return { ok: false, editorId, field: "spentDuration", message: "Dedicated time is required. Enter duration greater than zero." };
        }

        const approvalDraft = getApprovalDraftForTask_(eodDraft, task.taskId);
        if (approvalDraft.enabled && !String(approvalDraft.approverAdmin || "").trim()) {
          return { ok: false, editorId, field: "approvalApprover", message: "Choose an approver for every task marked for approval." };
        }
      }

      for (const extra of eodDraft.extras || []) {
        const title = (extra.title || "").trim();
        if (!title) continue;
        const editorId = `extra:${extra.taskId}`;
        const completion = parsePercent(extra.completionPercent);
        if (completion === null) {
          return { ok: false, editorId, field: "completionPercent", message: "Choose a valid completion % for extra tasks." };
        }
        const durationRaw = String(extra.spentDuration || "").trim();
        const hRaw = extra.spentHours;
        const mRaw = extra.spentMinutes;
        let h = parseHours(hRaw);
        let m = parseMinutes(mRaw);
        if (durationRaw) {
          const parsedDuration = parseTimeHHMM(durationRaw);
          if (!parsedDuration.ok) {
            return { ok: false, editorId, field: "spentDuration", message: "Duration must be valid (example: 2h 30m, 2:30, or 150m)." };
          }
          h = parsedDuration.hours;
          m = parsedDuration.minutes;
        } else {
          if (h === null || m === null) {
            return { ok: false, editorId, field: "spentDuration", message: "Duration must be a valid value." };
          }
        }
        const hasAnyTimeInput = durationRaw.length > 0 || String(hRaw ?? "").trim() !== "" || String(mRaw ?? "").trim() !== "";
        if (!hasAnyTimeInput || (h === 0 && m === 0)) {
          return { ok: false, editorId, field: "spentDuration", message: "Dedicated time is required for extra tasks." };
        }

        const approvalDraft = getApprovalDraftForTask_(eodDraft, extra.taskId);
        if (approvalDraft.enabled && !String(approvalDraft.approverAdmin || "").trim()) {
          return { ok: false, editorId, field: "approvalApprover", message: "Choose an approver for every task marked for approval." };
        }
      }

      return { ok: true };
    }

    async function handleEodSubmit() {
      if (isEodSubmitting) return;
      const dateKey = workDateEl.value;
      finalizeActiveEodTimer_(dateKey);
      const isAlreadySubmitted = isEodSubmittedForDate_(dateKey);
      if (isAlreadySubmitted) {
        setStatus(eodStatusEl, "End-of-Day already submitted for this date and is locked.", "info");
        submitEodBtn.disabled = true;
        renderEodTasks();
        return;
      }
      if (!canEnableEodSubmitForDate_(dateKey)) {
        setStatus(eodStatusEl, "End of Day is disabled. Submit Start of Day first, or turn on End of Day mode.", "info");
        updateEodSubmitButtonState_(dateKey);
        return;
      }
      const pending = getPendingTasksForDate(dateKey);
      const eodDraft = getOrCreateEodDraft(dateKey);
      eodDraft.fieldErrors = {};

      const precheck = validateEodBeforeSubmit(pending, eodDraft);
      if (!precheck.ok) {
        eodDraft.activeEditorId = precheck.editorId;
        setFieldError(eodDraft, precheck.editorId, precheck.field, precheck.message);
        saveState();
        renderEodTasks();
        focusEditorField(precheck.editorId, precheck.field);
        setStatus(eodStatusEl, precheck.message, "error");
        return;
      }

      const selectedUpdates = pending
        .filter((t) => eodDraft.selectedTaskIds[t.taskId])
        .map((t) => {
          const update = eodDraft.updatesByTaskId[t.taskId] || {};
          const rawDuration = String(update.spentDuration || "").trim();
          const parsedDuration = rawDuration ? parseTimeHHMM(rawDuration) : null;
          return {
            taskId: t.taskId,
            title: t.title,
            project: normalizeTaskProject(t.project),
            completionPercent: parsePercent(update.completionPercent),
            spentHours: parsedDuration ? (parsedDuration.ok ? parsedDuration.hours : null) : parseHours(update.spentHours),
            spentMinutes: parsedDuration ? (parsedDuration.ok ? parsedDuration.minutes : null) : parseMinutes(update.spentMinutes),
            note: (update.note || "").trim(),
            priority: normalizePriority(t.priority),
            source: t.source || "sod",
            stopRecurring: isRecurringTask(t) ? Boolean(eodDraft.stopRecurringByTaskId[t.taskId]) : false,
            isExtra: false
          };
        });

      const validExtras = (eodDraft.extras || [])
        .map((e) => {
          const rawDuration = String(e.spentDuration || "").trim();
          const parsedDuration = rawDuration ? parseTimeHHMM(rawDuration) : null;
          return {
            taskId: e.taskId || createTaskId(),
            title: (e.title || "").trim(),
            project: normalizeTaskProject(e.project),
            completionPercent: parsePercent(e.completionPercent),
            spentHours: parsedDuration ? (parsedDuration.ok ? parsedDuration.hours : null) : parseHours(e.spentHours),
            spentMinutes: parsedDuration ? (parsedDuration.ok ? parsedDuration.minutes : null) : parseMinutes(e.spentMinutes),
            note: (e.note || "").trim(),
            priority: normalizePriority(e.priority),
            source: String(e.source || "").toLowerCase() === "planner" ? "planner" : "extra",
            plannerTaskId: String(e.plannerTaskId || "").trim(),
            isExtra: true
          };
        })
        .filter((e) => e.title.length > 0);

      const updates = [...selectedUpdates, ...validExtras];
      if (!updates.length) {
        setStatus(eodStatusEl, "Select at least one pending task or add an extra task.", "error");
        return;
      }

      const hasInvalid = updates.some(
        (u) => u.completionPercent === null || u.spentHours === null || u.spentMinutes === null
      );
      if (hasInvalid) {
        setStatus(eodStatusEl, "Completion % and dedicated time must be valid for every submitted task.", "error");
        return;
      }

      const approvalTaskPayloads = [];
      const existingApprovalRequests = [];
      const existingRequestIds = [];
      updates.forEach((u) => {
        const approvalDraft = getApprovalDraftForTask_(eodDraft, u.taskId);
        if (!approvalDraft.enabled) return;
        const existingRequestId = String(approvalDraft.requestId || "").trim();
        const fallbackApprover = String(approvalDraft.approvalApprover || approvalDraft.approverAdmin || "").trim();
        if (existingRequestId) {
          existingRequestIds.push(existingRequestId);
          existingApprovalRequests.push({
            requestId: existingRequestId,
            taskId: String(u.taskId || "").trim(),
            title: String(u.title || "").trim(),
            project: normalizeTaskProject(u.project),
            approvalStatus: String(approvalDraft.approvalStatus || "pending").trim() || "pending",
            approvalApprover: fallbackApprover,
            requestNote: String(approvalDraft.requestNote || "").trim(),
            sourceNote: String(u.note || "").trim(),
            priority: normalizePriority(u.priority),
            completionPercent: Number(u.completionPercent || 0),
            spentMinutes: ((Number(u.spentHours || 0) * 60) + Number(u.spentMinutes || 0)),
            isExtra: Boolean(u.isExtra),
            source: String(u.source || "").trim().toLowerCase()
          });
          return;
        }
        approvalTaskPayloads.push({
          requestId: createRequestId(),
          taskId: String(u.taskId || "").trim(),
          title: String(u.title || "").trim(),
          project: normalizeTaskProject(u.project),
          priority: normalizePriority(u.priority),
          completionPercent: Number(u.completionPercent || 0),
          spentMinutes: ((Number(u.spentHours || 0) * 60) + Number(u.spentMinutes || 0)),
          sourceNote: String(u.note || "").trim(),
          requestNote: String(approvalDraft.requestNote || "").trim(),
          approverAdmin: String(approvalDraft.approverAdmin || "").trim(),
          isExtra: Boolean(u.isExtra),
          source: String(u.source || "").trim().toLowerCase()
        });
      });

      setStatus(eodStatusEl, "Submitting End-of-Day...", "");
      submitEodBtn.disabled = true;
      isEodSubmitting = true;
      try {
        await syncAttendanceForDate_(dateKey, true);
        const attendanceForSubmit = getAttendancePayloadForDate_(dateKey);
        const loginTimeForSubmit = String(attendanceForSubmit && attendanceForSubmit.loginTime || "").trim();
        const logoutTimeForSubmit = String(attendanceForSubmit && attendanceForSubmit.logoutTime || "").trim();
        if (loginTimeForSubmit && !logoutTimeForSubmit) {
          const shouldProceedWithoutCheckout = await confirmMissingCheckoutForEod_({
            workDate: dateKey,
            loginTime: formatAttendanceClock12h_(loginTimeForSubmit)
          });
          if (!shouldProceedWithoutCheckout) {
            setStatus(eodStatusEl, "End-of-Day submission canceled.", "info");
            return;
          }
        }
        const submitWarnings = [];
        const totalSpentMinutes = updates.reduce(
          (sum, u) => sum + ((u.spentHours || 0) * 60) + (u.spentMinutes || 0),
          0
        );
        const minimumExpectedMinutes = (8 * 60) + 30;
        const hasLowHours = totalSpentMinutes < minimumExpectedMinutes;
        if (hasLowHours) {
          const shouldProceed = await confirmLowEodSubmission_({
            totalSpentMinutes,
            minimumMinutes: minimumExpectedMinutes
          });
          if (!shouldProceed) {
            setStatus(eodStatusEl, "End-of-Day submission canceled.", "info");
            return;
          }
        }

        const stopRecurringTaskIds = selectedUpdates
          .filter((u) => Boolean(u.stopRecurring))
          .map((u) => String(u.taskId || "").trim())
          .filter((id) => id.length > 0);
        const completed100Count = updates.filter((u) => u.completionPercent === 100).length;
        const carryForwardCount = updates.filter((u) => u.completionPercent < 100).length;
        const extraCount = updates.filter((u) => u.isExtra).length;
        const plannedAssignedCount = pending.filter((t) => String(t && t.source || "").toLowerCase() === "assigned").length;
        const plannedBaseCount = Math.max(0, pending.length - plannedAssignedCount);
        const completedAssignedCount = updates.filter((u) => !u.isExtra && u.completionPercent === 100 && String(u.source || "").toLowerCase() === "assigned").length;
        const completedBaseCount = updates.filter((u) => !u.isExtra && u.completionPercent === 100 && String(u.source || "").toLowerCase() !== "assigned").length;
        const dailySummary = {
          plannedCount: pending.length,
          plannedBaseCount,
          plannedAssignedCount,
          submittedCount: updates.length,
          completed100Count,
          completedBaseCount,
          completedAssignedCount,
          carryForwardCount,
          extraCount,
          totalSpentMinutes
        };

        let createdApprovalRequests = [];
        let newlyCreatedApprovalRequests = [];
        let newlySubmittedApprovalCount = 0;
        if (existingRequestIds.length) {
          await syncUserApprovals_(true).catch(() => {});
        }
        if (existingApprovalRequests.length) {
          createdApprovalRequests = existingApprovalRequests.map((row) => {
            const serverRow = findUserApprovalByRequestId_(row.requestId);
            return Object.assign({}, row, {
              approvalStatus: String((serverRow && serverRow.status) || row.approvalStatus || "pending").trim() || "pending",
              approvalApprover: String(
                (serverRow && serverRow.approverAdmin) || row.approvalApprover || row.approverAdmin || ""
              ).trim()
            });
          });
        }
        if (approvalTaskPayloads.length) {
          const approvalRes = await callApi("submitApprovalRequests", {
            workDate: dateKey,
            department: identity.dept,
            employeeName: identity.name,
            accessCode: identity.code,
            tasks: approvalTaskPayloads,
            clientVersion: CLIENT_VERSION
          }, { timeoutMs: 15000 });
          if (!approvalRes || approvalRes.ok === false) {
            throw new Error(approvalRes && approvalRes.message ? approvalRes.message : "Approval request submit rejected.");
          }
          const approvalRows = Array.isArray(approvalRes.requests) ? approvalRes.requests : [];
          const requestMap = {};
          approvalRows.forEach((row) => {
            const key = String(row && row.taskId || "").trim() || String(row && row.title || "").trim().toLowerCase();
            if (key) requestMap[key] = row;
          });
          newlyCreatedApprovalRequests = approvalTaskPayloads.map((row) => {
            const lookupKey = String(row.taskId || "").trim() || String(row.title || "").trim().toLowerCase();
            const created = requestMap[lookupKey] || {};
            return Object.assign({}, row, {
              requestId: String(created.requestId || row.requestId || "").trim(),
              approvalStatus: String(created.approvalStatus || "pending").trim() || "pending",
              approvalApprover: String(created.approvalApprover || row.approverAdmin || "").trim()
            });
          });
          newlySubmittedApprovalCount = newlyCreatedApprovalRequests.length;
          createdApprovalRequests = createdApprovalRequests.concat(newlyCreatedApprovalRequests);
          const createdMap = {};
          createdApprovalRequests.forEach((row) => {
            const key = String(row.taskId || "").trim() || String(row.title || "").trim().toLowerCase();
            if (key) createdMap[key] = row;
          });
          updates.forEach((u) => {
            const key = String(u.taskId || "").trim() || String(u.title || "").trim().toLowerCase();
            const approvalRow = createdMap[key];
            if (!approvalRow) return;
            u.approvalRequestId = approvalRow.requestId;
            u.approvalStatus = approvalRow.approvalStatus;
            u.approvalApprover = approvalRow.approvalApprover;
            const approvalDraft = getApprovalDraftForTask_(eodDraft, u.taskId);
            approvalDraft.requestId = String(approvalRow.requestId || "").trim();
            approvalDraft.approvalStatus = String(approvalRow.approvalStatus || "").trim();
            approvalDraft.approvalApprover = String(approvalRow.approvalApprover || "").trim();
          });
        } else if (createdApprovalRequests.length) {
          const createdMap = {};
          createdApprovalRequests.forEach((row) => {
            const key = String(row.taskId || "").trim() || String(row.title || "").trim().toLowerCase();
            if (key) createdMap[key] = row;
          });
          updates.forEach((u) => {
            const key = String(u.taskId || "").trim() || String(u.title || "").trim().toLowerCase();
            const approvalRow = createdMap[key];
            if (!approvalRow) return;
            u.approvalRequestId = approvalRow.requestId;
            u.approvalStatus = approvalRow.approvalStatus;
            u.approvalApprover = approvalRow.approvalApprover;
          });
        }

        const payload = {
          stage: "EOD",
          requestId: createRequestId(),
          payloadVersion: "v2",
          submittedAt: new Date().toISOString(),
          workDate: dateKey,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          attendance: getAttendancePayloadForDate_(dateKey),
          dayStatus: getDayStatusForDate_(dateKey) || "",
          totalSpentMinutes,
          dailySummary,
          approvalRequests: createdApprovalRequests.map((row) => ({
            requestId: row.requestId,
            taskId: row.taskId,
            title: row.title,
            project: normalizeTaskProject(row.project),
            approvalStatus: row.approvalStatus,
            approvalApprover: row.approvalApprover,
            requestNote: row.requestNote
          })),
          updates,
          stopRecurringTaskIds,
          clientVersion: CLIENT_VERSION
        };

        const result = await callApi("submitEOD", payload);
        if (!result || result.ok === false) {
          throw new Error(result && result.message ? result.message : "End-of-Day submit rejected.");
        }
        const attendanceExceptionSummary = result && result.attendanceException && typeof result.attendanceException === "object"
          ? result.attendanceException
          : null;
        if (result.streak && typeof result.streak === "object") {
          applyStreakResult_(result.streak, { animate: true });
        }
        refreshUserStreak_({ timeoutMs: 5000, animate: false });
        refreshStreakLeaderboard_({ timeoutMs: 5000 });

        if (stopRecurringTaskIds.length) {
          const recurringStopRes = await callApi("completeRecurringTasks", {
            workDate: dateKey,
            department: identity.dept,
            employeeName: identity.name,
            accessCode: identity.code,
            taskIds: stopRecurringTaskIds
          });
          if (!recurringStopRes || recurringStopRes.ok === false) {
            throw new Error(recurringStopRes && recurringStopRes.message ? recurringStopRes.message : "Recurring stop update failed.");
          }
        }

        const plannerTaskIdsFromEodExtras = validExtras
          .filter((e) => String(e.source || "").toLowerCase() === "planner")
          .map((e) => String(e.plannerTaskId || "").trim())
          .filter((id) => id.length > 0);
        if (plannerTaskIdsFromEodExtras.length) {
          const consumeRes = await callApi("markPlannerConsumed", {
            workDate: dateKey,
            department: identity.dept,
            employeeName: identity.name,
            accessCode: identity.code,
            taskIds: plannerTaskIdsFromEodExtras
          });
          if (!consumeRes || consumeRes.ok === false) {
            submitWarnings.push("Planner consume sync failed.");
          } else {
            await syncPlannerFromSheets(dateKey, true);
          }
        }

        const nextDate = nextDateISO(dateKey);
        state.eodSubmittedByDate[dateKey] = true;
        state.sodSubmittedFlagByDate[dateKey] = true;
        state.submissionCheckByDate[dateKey] = true;
        state.submissionDetailsSyncedByDate[dateKey] = true;
        state.eodSubmittedUpdatesByDate[dateKey] = updates.map((u) => ({
          taskId: u.taskId,
          title: u.title,
          project: normalizeTaskProject(u.project),
          completionPercent: Number(u.completionPercent || 0),
          spentHours: Number(u.spentHours || 0),
          spentMinutes: Number(u.spentMinutes || 0),
          note: String(u.note || "").trim(),
          priority: normalizePriority(u.priority),
          source: String(u.source || "").trim().toLowerCase(),
          isExtra: Boolean(u.isExtra),
          approvalRequestId: String(u.approvalRequestId || "").trim(),
          approvalStatus: String(u.approvalStatus || "").trim(),
          approvalApprover: String(u.approvalApprover || "").trim()
        }));
        state.carryoverSyncedByDate[nextDate] = false;
        state.carryoverSyncedByDate[dateKey] = true;
        state.recurringSyncedByDate[nextDate] = false;
        state.recurringSyncedByDate[dateKey] = true;
        delete state.carryoverByDate[dateKey];
        delete state.carryoverSourceByDate[dateKey];

        state.eodDraftByDate[dateKey] = { selectedTaskIds: {}, updatesByTaskId: {}, stopRecurringByTaskId: {}, extras: [], activeEditorId: "", fieldErrors: {}, approvalByTaskId: {} };
        state.workDate = dateKey;
        workDateEl.value = dateKey;
        getOrCreateEodDraft(dateKey);
        saveState();
        renderAll();
        if (result.transport === "no-cors" && submitWarnings.length) {
          setStatus(eodStatusEl, `End-of-Day request sent. ${submitWarnings.join(" ")}`, "info");
        } else if (result.transport === "no-cors") {
          setStatus(eodStatusEl, "End-of-Day request sent. Syncing next day in background.", "info");
        } else if (submitWarnings.length) {
          setStatus(eodStatusEl, `End-of-Day submitted with warnings. ${submitWarnings.join(" ")}`, "info");
        } else if (attendanceExceptionSummary && attendanceExceptionSummary.missingCheckout) {
          const usedCount = Number(attendanceExceptionSummary.usedCount || 0);
          const limitCount = Number(attendanceExceptionSummary.limit || 2);
          const remainingCount = Number(attendanceExceptionSummary.remainingCount || 0);
          const overrideUsed = Boolean(attendanceExceptionSummary.overrideUsed);
          setStatus(
            eodStatusEl,
            overrideUsed
              ? "End-of-Day submitted using admin-approved missing checkout override."
              : `End-of-Day submitted without checkout. Missing-checkout exception used ${usedCount}/${limitCount} for this month. Remaining: ${remainingCount}.`,
            "info"
          );
        } else {
          setStatus(
            eodStatusEl,
            newlySubmittedApprovalCount
              ? `End-of-Day submitted successfully. ${newlySubmittedApprovalCount} task(s) sent for approval.`
              : "End-of-Day submitted successfully.",
            "success"
          );
        }
        scheduleAttendanceRefreshAfterEod_(dateKey, {
          initialDelayMs: 4000,
          intervalMs: 15000,
          maxAttempts: 8
        });

        Promise.allSettled([
          syncCarryoverFromSheets(nextDate, true),
          syncRecurringFromSheets(nextDate, true),
          syncAssignmentsFromAdmin(nextDate, true),
          syncPlannerFromSheets(nextDate, true),
          pushCliqWebhook("EOD", payload),
          createdApprovalRequests.length ? syncUserApprovals_(true) : Promise.resolve(),
          newlyCreatedApprovalRequests.length ? sendApprovalRequestCliqNotifications_(newlyCreatedApprovalRequests) : Promise.resolve({ ok: true })
        ]).then((settled) => {
          const webhookRes = settled[4];
          if (webhookRes && webhookRes.status === "fulfilled") {
            const webhook = webhookRes.value;
            if (webhook && !webhook.ok) {
              console.warn("EOD webhook failed:", String(webhook.message || "Unknown error"));
            }
          } else if (webhookRes && webhookRes.status === "rejected") {
            console.warn("EOD webhook failed.");
          }
          const approvalWebhookRes = settled[6];
          if (approvalWebhookRes && approvalWebhookRes.status === "fulfilled") {
            const approvalWebhook = approvalWebhookRes.value;
            if (approvalWebhook && approvalWebhook.ok === false) {
              console.warn("Approval request webhook failed:", String(approvalWebhook.message || "Unknown error"));
            }
          } else if (approvalWebhookRes && approvalWebhookRes.status === "rejected") {
            console.warn("Approval request webhook failed.");
          }
          renderAll();
        });
      } catch (err) {
        setStatus(eodStatusEl, `End-of-Day submit failed: ${err.message}`, "error");
      } finally {
        isEodSubmitting = false;
        updateEodSubmitButtonState_(workDateEl.value);
      }
    }

    async function handleDayStatusToggle_() {
      if (!identity || !dayStatusBtnEl) return;
      const dateKey = String(workDateEl.value || "").trim() || todayISO();
      const hasSubmission = isSodSubmittedForDate_(dateKey) || isEodSubmittedForDate_(dateKey);
      if (hasSubmission) return;
      const current = getDayStatusForDate_(dateKey);
      const nextStatus = String(current || "").toLowerCase() === "leave" ? "Clear" : "Leave";
      const normalLabel = dayStatusBtnEl.innerHTML;
      setButtonLoading(dayStatusBtnEl, true, nextStatus === "Clear" ? "Clearing..." : "Saving...", normalLabel);
      try {
        const res = await callApi("setUserDayStatus", {
          workDate: dateKey,
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          status: nextStatus,
          reason: "",
          markedBy: identity.name
        }, { timeoutMs: 12000 });
        if (!res || res.ok === false) {
          throw new Error(res && res.message ? res.message : "Day status save failed.");
        }
        const status = String(res.status || "").trim();
        if (status) state.dayStatusByDate[dateKey] = status;
        else delete state.dayStatusByDate[dateKey];
        if (res.streak && typeof res.streak === "object") {
          applyStreakResult_(res.streak, { animate: false });
        }
        saveState();
        renderDayStatusControls_(dateKey);
      } catch (err) {
        setStatus(sodStatusEl, `Day status save failed: ${String(err && err.message ? err.message : err)}`, "error");
      } finally {
        setButtonLoading(dayStatusBtnEl, false, "", normalLabel);
        renderDayStatusControls_(dateKey);
      }
    }

    async function validateAccessOrBlock() {
      const params = getAccessParams();
      if (!params.dept || !params.name || !params.code) {
        showBlocked("Missing URL parameters. Please use a full link with dept, name, and code.");
        return false;
      }
      const localVerified = resolveIdentityFromParams_(params);
      const localResolved = localVerified || {
        dept: String(params.dept || "").trim(),
        name: String(params.name || "").trim(),
        code: String(params.code || "").trim()
      };
      try {
        const candidates = accessCodeCandidates_(localResolved.code);
        for (let i = 0; i < candidates.length; i += 1) {
          const candidateCode = candidates[i];
          const result = await callApiJsonp("validateAccess", {
            dept: localResolved.dept,
            name: localResolved.name,
            code: candidateCode,
            clientVersion: CLIENT_VERSION
          }, 10000);
          if (result && result.ok !== false) {
            identity = {
              dept: String(result.dept || localResolved.dept || "").trim(),
              name: String(result.name || localResolved.name || "").trim(),
              code: candidateCode
            };
            setStatus(sodStatusEl, "", "");
            return true;
          }
        }
        showBlocked("Invalid access link. Please use the latest link.");
        return false;
      } catch (err) {
        if ((isCorsLikeNetworkError(err) || isTimeoutLikeError(err)) && localVerified) {
          identity = {
            dept: String(localVerified.dept || "").trim(),
            name: String(localVerified.name || "").trim(),
            code: String(localVerified.code || "").trim()
          };
          setStatus(sodStatusEl, "", "");
          return true;
        }
        const msg = String(err && err.message ? err.message : err || "Access validation failed.");
        showBlocked(`Could not validate access link. ${msg}`);
        return false;
      }
    }

    function wireEvents() {
      if (prevMonthBtn) {
        prevMonthBtn.addEventListener("click", () => {
          setWorkDateAndRefresh_(shiftISODateByMonths_(workDateEl.value, -1));
        });
      }
      if (nextMonthBtn) {
        nextMonthBtn.addEventListener("click", () => {
          setWorkDateAndRefresh_(shiftISODateByMonths_(workDateEl.value, 1));
        });
      }
      if (prevDayBtn) {
        prevDayBtn.addEventListener("click", () => {
          setWorkDateAndRefresh_(shiftISODateByDays_(workDateEl.value, -1));
        });
      }
      if (nextDayBtn) {
        nextDayBtn.addEventListener("click", () => {
          setWorkDateAndRefresh_(shiftISODateByDays_(workDateEl.value, 1));
        });
      }
      workDateEl.addEventListener("change", async () => {
        state.workDate = workDateEl.value;
        renderDateNavigator_();
        await loadRemoteStartDraft_(workDateEl.value);
        getOrCreateStartDraft(workDateEl.value);
        getOrCreateEodDraft(workDateEl.value);
        await ensurePreviousDraftAvailableForCarryover_(workDateEl.value);
        hydrateCarryoverFromUnsubmittedSod(workDateEl.value);
        renderAll();
        Promise.allSettled([
          syncSubmittedDetailsFromSheets(workDateEl.value, true, { fast: true }),
          syncCarryoverFromSheets(workDateEl.value, false, { fast: true }),
          syncRecurringFromSheets(workDateEl.value, true),
          syncAssignmentsFromAdmin(workDateEl.value, false),
          syncAttendanceForDate_(workDateEl.value, true)
        ]).then(() => {
          saveState();
          setStatus(sodStatusEl, "", "");
          setStatus(eodStatusEl, "", "");
          renderAll();
        });
        syncPlannerFromSheets(workDateEl.value, true).then(() => {
          renderPlannerTasks();
        }).catch(() => {});
      });
      if (dayStatusBtnEl) {
        dayStatusBtnEl.addEventListener("click", handleDayStatusToggle_);
      }

      addTaskBtn.addEventListener("click", addTaskToStartDraft);
      if (addPlannerTaskBtn) {
        addPlannerTaskBtn.addEventListener("click", addPlannerDraftTask_);
      }
      if (plannerTaskTitleEl) {
        plannerTaskTitleEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          addPlannerDraftTask_();
        });
      }
      if (movePlannerToSodBtn) {
        movePlannerToSodBtn.addEventListener("click", moveSelectedPlannerToSod_);
      }
      if (addPlannerToExtraBtn) {
        addPlannerToExtraBtn.addEventListener("click", moveSelectedPlannerToEodExtras_);
      }
      if (plannerComposeHeaderEl) {
        plannerComposeHeaderEl.addEventListener("click", togglePlannerCompose_);
        plannerComposeHeaderEl.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          togglePlannerCompose_();
        });
      }
      if (submitPlannerTasksBtn) {
        submitPlannerTasksBtn.addEventListener("click", submitPlannerDraftTasks_);
      }
      if (clearPlannerDraftBtn) {
        clearPlannerDraftBtn.addEventListener("click", clearPlannerDraftTasks_);
      }
      taskTabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          setTaskTab_(String(btn.dataset.taskTab || "submissions").trim() || "submissions");
        });
      });
      if (plannerToggleBtn) {
        plannerToggleBtn.hidden = true;
      }
      if (plannerCloseBtn) {
        plannerCloseBtn.addEventListener("click", () => {
          state.plannerCollapsed = true;
          saveState();
          setTaskTab_("submissions");
        });
      }
      if (plannerFocusOverlayEl) {
        plannerFocusOverlayEl.hidden = true;
      }
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!state || state.taskTab !== "planner") return;
        state.plannerCollapsed = true;
        saveState();
        setTaskTab_("submissions");
      });
      if (newTaskPriorityGroupEl && newTaskPriorityEl) {
        newTaskPriorityGroupEl.addEventListener("click", (event) => {
          const btn = event.target.closest(".priority-segment-btn");
          if (!btn || btn.disabled) return;
          const nextPriority = normalizePriority(btn.getAttribute("data-priority") || "");
          newTaskPriorityEl.value = nextPriority;
          renderSodPrioritySegment_();
          setStatus(sodStatusEl, "", "");
        });
      }
      newTaskTitleEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          addTaskToStartDraft();
        }
      });
      if (newTaskFrequencyEl) {
        newTaskFrequencyEl.addEventListener("change", () => {
          renderNewTaskRecurrenceControls_();
          setStatus(sodStatusEl, "", "");
        });
      }
      if (newTaskWeeklyDayEl) {
        newTaskWeeklyDayEl.addEventListener("change", () => {
          setStatus(sodStatusEl, "", "");
        });
      }
      if (newTaskMonthlyDateEl) {
        newTaskMonthlyDateEl.addEventListener("input", () => {
          setStatus(sodStatusEl, "", "");
        });
        newTaskMonthlyDateEl.addEventListener("blur", () => {
          const day = normalizeRecurringDayOfMonth(newTaskMonthlyDateEl.value);
          if (day === null && String(newTaskMonthlyDateEl.value || "").trim() !== "") return;
          newTaskMonthlyDateEl.value = day === null ? "" : String(day);
        });
      }
      if (plannedQuickChipsEl) {
        plannedQuickChipsEl.addEventListener("click", (event) => {
          const chip = event.target.closest(".quick-time-chip");
          if (!chip || chip.disabled) return;
          const minutes = Number(chip.dataset.minutes || 0);
          applyQuickMinutesToPlanned_(minutes);
        });
      }
      if (taskEditQuickChipsEl) {
        taskEditQuickChipsEl.addEventListener("click", (event) => {
          const chip = event.target.closest(".quick-time-chip");
          if (!chip || chip.disabled) return;
          const minutes = Number(chip.dataset.minutes || 0);
          applyQuickMinutesToTaskEditPlanned_(minutes);
        });
      }
      newTaskPlannedTimeEl.addEventListener("blur", () => {
        const raw = String(newTaskPlannedTimeEl.value || "").trim();
        if (!raw) return;
        const parsed = parseTimeHHMM(raw);
        if (!parsed.ok) return;
        newTaskPlannedTimeEl.value = formatDurationInput_(parsed.hours, parsed.minutes);
      });

      submitSodBtn.addEventListener("click", handleSodSubmit);
      submitEodBtn.addEventListener("click", handleEodSubmit);
      submitEodBtn.title = "Submit End of Day (Ctrl/Cmd + Enter)";
      syncCarryoverBtn.addEventListener("click", async () => {
        const dateKey = workDateEl.value;
        setButtonLoading(syncCarryoverBtn, true, "Syncing...", "<i class=\"fa-solid fa-rotate\"></i>Sync Now");
        try {
          state.carryoverSyncedByDate[dateKey] = false;
          state.assignmentSyncedByDate[dateKey] = false;
          state.recurringSyncedByDate[dateKey] = false;
          await withTimeout_(
            Promise.allSettled([
              syncSubmittedDetailsFromSheets(dateKey, true),
              syncCarryoverFromSheets(dateKey, true),
              syncRecurringFromSheets(dateKey, true),
              syncAssignmentsFromAdmin(dateKey, true),
              syncPlannerFromSheets(dateKey, true),
              syncAttendanceForDate_(dateKey, true)
            ]),
            30000
          );
          const status = state.syncMetaByDate[dateKey] && state.syncMetaByDate[dateKey].status;
          if (status === "success") {
            showToast("Sync complete.", "success");
          } else if (status === "fallback") {
            showToast("Google carryover sync failed. Using local fallback.", "info");
          } else if (status === "error") {
            showToast("Carryover sync failed.", "error");
          } else {
            showToast("Sync finished.", "info");
          }
          renderAll();
        } catch (err) {
          const msg = String(err && err.message ? err.message : err || "Sync failed.");
          if (String(msg).toLowerCase().includes("timed out")) {
            setSyncMeta(dateKey, { status: "error", message: "Sync timed out. Network/security may be blocking Supabase." });
            renderSyncMeta();
            showToast("Sync timed out. Check VPN/antivirus/firewall on this laptop.", "error");
          } else {
            showToast(`Sync failed: ${msg}`, "error");
          }
        } finally {
          setButtonLoading(syncCarryoverBtn, false, "", "<i class=\"fa-solid fa-rotate\"></i>Sync Now");
        }
      });
      if (openAdminBtn) {
        openAdminBtn.addEventListener("click", () => {
          const url = openAdminBtn.dataset.adminUrl || "";
          if (!url) return;
          window.open(url, "_blank", "noopener");
        });
      }

      document.addEventListener("keydown", (event) => {
        if (!(event.metaKey || event.ctrlKey)) return;
        if (String(event.key || "").toLowerCase() !== "enter") return;
        if (isEodSubmitting || submitEodBtn.disabled) return;
        event.preventDefault();
        handleEodSubmit();
      });
      window.addEventListener("beforeunload", (event) => {
        if (hasPendingSubmitOrWebhook_()) {
          event.preventDefault();
          event.returnValue = "";
        }
        saveState(true);
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          saveState(true);
        }
      });

      addExtraBtn.addEventListener("click", () => {
        const dateKey = workDateEl.value;
        const eodDraft = getOrCreateEodDraft(dateKey);
        const newExtra = {
          taskId: createTaskId(),
          title: "",
          project: "",
          completionPercent: "",
          spentHours: "",
          spentMinutes: "",
          spentDuration: "",
          note: "",
          priority: "Medium"
        };
        eodDraft.extras.unshift(newExtra);
        eodDraft.activeEditorId = `extra:${newExtra.taskId}`;
        saveState();
        renderEodTasks();
        updateSummaryCards();
      });
    }

    async function init() {
      const ok = await validateAccessOrBlock();
      if (!ok) return;

      configureAdminButtonForIdentity();
      nameLineEl.textContent = identity.name;
      deptLineEl.textContent = `Department: ${identity.dept}`;
      renderStreak_();
      await refreshStreakLeaderboard_({ timeoutMs: 6000 });
      renderStreakLeaderboard_();
      if (plannerToggleBtn) plannerToggleBtn.hidden = true;
      if (plannerFocusOverlayEl) plannerFocusOverlayEl.hidden = true;
      if (plannerSidebarEl) plannerSidebarEl.hidden = false;
      state = loadState();
      state.workDate = resolveInitialWorkDate_(state.workDate);
      workDateEl.value = state.workDate;

      await enforceStartupWorkDateRule_();

      await loadRemoteStartDraft_(workDateEl.value);
      getOrCreateStartDraft(workDateEl.value);
      getOrCreateEodDraft(workDateEl.value);
      await ensurePreviousDraftAvailableForCarryover_(workDateEl.value);
      hydrateCarryoverFromUnsubmittedSod(workDateEl.value);
      wireEvents();
      startEodElapsedInterval_();
      appEl.hidden = false;
      renderAll();
      saveState();
      if (state.taskTab === "approvals") {
        syncUserApprovals_(true).then(() => {
          renderApprovalsPanel_();
        }).catch(() => {});
      }

      Promise.allSettled([
        syncSubmittedDetailsFromSheets(workDateEl.value, true, { fast: true }),
        syncCarryoverFromSheets(workDateEl.value, false, { fast: true }),
        syncRecurringFromSheets(workDateEl.value, true),
        syncAssignmentsFromAdmin(workDateEl.value, false),
        syncAttendanceForDate_(workDateEl.value, true),
        refreshUserStreak_({ timeoutMs: 6000 }),
        refreshStreakLeaderboard_({ timeoutMs: 6000 })
      ]).then(() => {
        renderAll();
      });
      syncPlannerFromSheets(workDateEl.value, true).then(() => {
        renderPlannerTasks();
      }).catch(() => {});
    }

    init().catch((err) => {
      const msg = String(err && err.message ? err.message : err || "Initialization failed.");
      showBlocked(`Task page failed to load: ${msg}`);
    });
