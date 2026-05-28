(function initTaskAppAttendance(global) {
  function createManager(options) {
    const opts = options || {};
    const getState = typeof opts.getState === "function" ? opts.getState : function() { return null; };
    const getIdentity = typeof opts.getIdentity === "function" ? opts.getIdentity : function() { return null; };
    const callApiJsonp = opts.callApiJsonp;
    const saveState = typeof opts.saveState === "function" ? opts.saveState : function() {};
    const renderAll = typeof opts.renderAll === "function" ? opts.renderAll : function() {};
    const escapeHtml = typeof opts.escapeHtml === "function" ? opts.escapeHtml : function(v) { return String(v == null ? "" : v); };
    const setButtonLoading = typeof opts.setButtonLoading === "function" ? opts.setButtonLoading : function() {};
    const isSodSubmittedForDate_ = typeof opts.isSodSubmittedForDate_ === "function" ? opts.isSodSubmittedForDate_ : function() { return false; };
    const isEodSubmittedForDate_ = typeof opts.isEodSubmittedForDate_ === "function" ? opts.isEodSubmittedForDate_ : function() { return false; };
    const todayISO = typeof opts.todayISO === "function" ? opts.todayISO : function() { return ""; };
    const isTruthyDebugFlag_ = typeof opts.isTruthyDebugFlag_ === "function" ? opts.isTruthyDebugFlag_ : function(v) { return Boolean(v); };
    const attendanceDebugStorageKey = String(opts.attendanceDebugStorageKey || "taskApp:attendanceDebug");
    const dom = opts.dom || {};
    const clientVersion = String(opts.clientVersion || "");
    const attendanceRefreshTimerByDate = {};

    function isAttendanceDebugEnabled_() {
      try {
        const qs = new URLSearchParams(global.location.search || "");
        if (qs.has("attendanceDebug")) return isTruthyDebugFlag_(qs.get("attendanceDebug"));
      } catch (err) {}
      try {
        return isTruthyDebugFlag_(global.localStorage.getItem(attendanceDebugStorageKey));
      } catch (err) {
        return false;
      }
    }

    function attendanceDebugLog_() {
      if (!isAttendanceDebugEnabled_()) return;
      const args = Array.prototype.slice.call(arguments);
      args.unshift("[attendance-debug]");
      console.debug.apply(console, args);
    }

    function attendanceDebugError_() {
      if (!isAttendanceDebugEnabled_()) return;
      const args = Array.prototype.slice.call(arguments);
      args.unshift("[attendance-debug]");
      console.error.apply(console, args);
    }

    function formatAttendanceClock12h_(hhmm) {
      const raw = String(hhmm || "").trim();
      const m = raw.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return "--";
      const h24 = Number(m[1]);
      const min = Number(m[2]);
      if (!Number.isFinite(h24) || !Number.isFinite(min) || h24 < 0 || h24 > 23 || min < 0 || min > 59) return "--";
      const period = h24 >= 12 ? "PM" : "AM";
      const h12 = h24 % 12 || 12;
      return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${period}`;
    }

    function formatMinutesCompact_(minutes) {
      const total = Math.max(0, Number(minutes || 0));
      const h = Math.floor(total / 60);
      const m = Math.floor(total % 60);
      return `${h}h ${String(m).padStart(2, "0")}m`;
    }

    function getDayStatusForDate_(dateKey) {
      const state = getState();
      return String(state && state.dayStatusByDate && state.dayStatusByDate[dateKey] || "").trim();
    }

    function updateAttendanceMetaForDate_(dateKey) {
      const state = getState();
      const rec = state && state.attendanceByDate ? state.attendanceByDate[dateKey] : null;
      const loginLabel = rec && rec.loginTime ? formatAttendanceClock12h_(rec.loginTime) : "--";
      const checkoutLabel = rec && rec.logoutTime ? formatAttendanceClock12h_(rec.logoutTime) : "--";
      const hoursText = rec && Number.isFinite(Number(rec.workingMinutes)) ? `${formatMinutesCompact_(rec.workingMinutes)}` : "--";
      if (dom.sodLoginTimeMetaEl) {
        dom.sodLoginTimeMetaEl.innerHTML = `<span class="chip-label">Login</span><span class="chip-value">${escapeHtml(loginLabel)}</span>`;
      }
      if (dom.eodCheckoutTimeMetaEl) {
        const checkoutValue = `${checkoutLabel}${hoursText !== "--" ? ` · ${hoursText}` : ""}`;
        dom.eodCheckoutTimeMetaEl.innerHTML = `<span class="chip-label">Checkout</span><span class="chip-value">${escapeHtml(checkoutValue)}</span>`;
      }
    }

    function getAttendancePayloadForDate_(dateKey) {
      const state = getState();
      const rec = state && state.attendanceByDate ? state.attendanceByDate[dateKey] : null;
      if (!rec || typeof rec !== "object") return null;
      return {
        loginTime: String(rec.loginTime || "").trim(),
        logoutTime: String(rec.logoutTime || "").trim(),
        workingMinutes: Number.isFinite(Number(rec.workingMinutes)) ? Number(rec.workingMinutes) : null
      };
    }

    function renderDayStatusControls_(dateKey) {
      if (!dom.dayStatusRowEl || !dom.dayStatusBtnEl || !dom.dayStatusMetaEl) return;
      const hasSubmission = isSodSubmittedForDate_(dateKey) || isEodSubmittedForDate_(dateKey);
      if (hasSubmission) {
        dom.dayStatusRowEl.hidden = true;
        dom.dayStatusMetaEl.textContent = "";
        return;
      }
      dom.dayStatusRowEl.hidden = false;
      const status = getDayStatusForDate_(dateKey);
      const isLeave = status.toLowerCase() === "leave";
      dom.dayStatusBtnEl.classList.toggle("is-active", isLeave);
      dom.dayStatusBtnEl.innerHTML = isLeave ? "<i class=\"fa-solid fa-check\"></i>Leave Marked" : "<i class=\"fa-solid fa-umbrella-beach\"></i>Mark Leave";
      dom.dayStatusMetaEl.textContent = isLeave ? "Leave is marked for this day. This day will not break your streak." : "";
    }

    async function syncAttendanceForDate_(dateKey, force) {
      const state = getState();
      const identity = getIdentity();
      if (!identity || !dateKey) return;
      if (!force && state.attendanceSyncedByDate && state.attendanceSyncedByDate[dateKey]) return;
      const basePayload = { workDate: dateKey, department: identity.dept, employeeName: identity.name, accessCode: identity.code, clientVersion };
      attendanceDebugLog_("sync start", { dateKey, force, identity: { dept: identity.dept, name: identity.name } });
      try {
        attendanceDebugLog_("request getUserAttendance", basePayload);
        const attendanceRes = await callApiJsonp("getUserAttendance", basePayload, 12000);
        attendanceDebugLog_("response getUserAttendance", attendanceRes);
        if (attendanceRes && attendanceRes.ok !== false && attendanceRes.attendance && typeof attendanceRes.attendance === "object") {
          const a = attendanceRes.attendance;
          state.attendanceByDate[dateKey] = {
            loginTime: String(a.loginTime || "").trim(),
            logoutTime: String(a.logoutTime || "").trim(),
            workingMinutes: Number.isFinite(Number(a.workingMinutes)) ? Number(a.workingMinutes) : null
          };
          const fromAttendance = String(attendanceRes.dayStatus || (a && a.dayStatus) || "").trim();
          if (fromAttendance) state.dayStatusByDate[dateKey] = fromAttendance;
          attendanceDebugLog_("stored attendance", { dateKey, attendance: state.attendanceByDate[dateKey], dayStatus: fromAttendance || "" });
        } else {
          delete state.attendanceByDate[dateKey];
          attendanceDebugLog_("cleared attendance for date", dateKey);
        }
      } catch (err) {
        attendanceDebugError_("getUserAttendance failed", err);
      }
      try {
        attendanceDebugLog_("request getUserDayStatus", basePayload);
        const dayStatusRes = await callApiJsonp("getUserDayStatus", basePayload, 10000);
        attendanceDebugLog_("response getUserDayStatus", dayStatusRes);
        if (dayStatusRes && dayStatusRes.ok !== false) {
          const status = String(dayStatusRes.status || "").trim();
          if (status) state.dayStatusByDate[dateKey] = status;
          else delete state.dayStatusByDate[dateKey];
          attendanceDebugLog_("stored day status", { dateKey, status });
        }
      } catch (err) {
        attendanceDebugError_("getUserDayStatus failed", err);
      }
      state.attendanceSyncedByDate[dateKey] = true;
      attendanceDebugLog_("sync complete", { dateKey, attendance: state.attendanceByDate[dateKey] || null, dayStatus: state.dayStatusByDate[dateKey] || "" });
      saveState();
    }

    function clearScheduledAttendanceRefresh_(dateKey) {
      const key = String(dateKey || "").trim();
      if (!key) return;
      if (attendanceRefreshTimerByDate[key]) {
        global.clearTimeout(attendanceRefreshTimerByDate[key]);
        delete attendanceRefreshTimerByDate[key];
      }
    }

    function scheduleAttendanceRefreshAfterEod_(dateKey, options) {
      const state = getState();
      const identity = getIdentity();
      const key = String(dateKey || "").trim();
      if (!key || !identity) return;
      const opts2 = options && typeof options === "object" ? options : {};
      const maxAttempts = Math.max(1, Number(opts2.maxAttempts || 8));
      const intervalMs = Math.max(3000, Number(opts2.intervalMs || 15000));
      const initialDelayMs = Math.max(0, Number(opts2.initialDelayMs || 4000));
      clearScheduledAttendanceRefresh_(key);
      let attempt = 0;
      const runAttempt = async () => {
        clearScheduledAttendanceRefresh_(key);
        attempt += 1;
        try {
          await syncAttendanceForDate_(key, true);
        } catch (err) {
          attendanceDebugError_("post-EOD attendance refresh failed", { dateKey: key, attempt, err });
        }
        if (String(dom.workDateEl.value || "").trim() === key) renderAll();
        const rec = state && state.attendanceByDate ? state.attendanceByDate[key] : null;
        const hasLogout = Boolean(rec && String(rec.logoutTime || "").trim());
        if (hasLogout || attempt >= maxAttempts) {
          clearScheduledAttendanceRefresh_(key);
          return;
        }
        attendanceRefreshTimerByDate[key] = global.setTimeout(runAttempt, intervalMs);
      };
      attendanceRefreshTimerByDate[key] = global.setTimeout(runAttempt, initialDelayMs);
    }

    return {
      isAttendanceDebugEnabled_,
      attendanceDebugLog_,
      attendanceDebugError_,
      formatAttendanceClock12h_,
      formatMinutesCompact_,
      getDayStatusForDate_,
      updateAttendanceMetaForDate_,
      getAttendancePayloadForDate_,
      renderDayStatusControls_,
      syncAttendanceForDate_,
      clearScheduledAttendanceRefresh_,
      scheduleAttendanceRefreshAfterEod_
    };
  }

  global.TaskAppAttendance = { createManager };
})(window);
