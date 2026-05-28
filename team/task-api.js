(function initTaskAppApi(global) {
  function toFormEncoded(payload) {
    const params = new URLSearchParams();
    Object.keys(payload || {}).forEach((key) => {
      const val = payload[key];
      if (val == null) {
        params.append(key, "");
      } else if (typeof val === "object") {
        params.append(key, JSON.stringify(val));
      } else {
        params.append(key, String(val));
      }
    });
    return params.toString();
  }

  function isCorsLikeNetworkError(err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    return msg.includes("networkerror")
      || msg.includes("failed to fetch")
      || msg.includes("load failed")
      || msg.includes("cors");
  }

  function isTimeoutLikeError(err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    return msg.includes("timed out") || msg.includes("timeout");
  }

  function normalizeApiPayload_(payload) {
    const out = Object.assign({}, payload || {});
    ["tasks", "updates", "taskIds", "titles", "approvalRequests"].forEach((k) => {
      if (typeof out[k] === "string" && out[k].trim()) {
        try {
          out[k] = JSON.parse(out[k]);
        } catch (err) {}
      }
    });
    return out;
  }

  function withTimeout_(promise, timeoutMs) {
    const ms = Math.max(1000, Number(timeoutMs || 10000));
    return new Promise((resolve, reject) => {
      const timer = global.setTimeout(() => reject(new Error("Request timed out.")), ms);
      promise.then((res) => {
        global.clearTimeout(timer);
        resolve(res);
      }).catch((err) => {
        global.clearTimeout(timer);
        reject(err);
      });
    });
  }

  function rpcNameForAction_(action) {
    const map = {
      validateAccess: "rpc_validate_user_access",
      getUserStreak: "rpc_get_user_streak",
      getStreakLeaderboard: "rpc_get_streak_leaderboard",
      getUserAttendance: "rpc_get_user_attendance",
      getUserDayStatus: "rpc_get_user_day_status",
      setUserDayStatus: "rpc_set_user_day_status",
      getStartDraft: "rpc_get_start_draft",
      saveStartDraft: "rpc_save_start_draft",
      submitSOD: "rpc_submit_sod",
      submitEOD: "rpc_submit_eod",
      getDepartmentApprovers: "rpc_get_department_approvers",
      submitApprovalRequests: "rpc_submit_approval_requests",
      getUserApprovals: "rpc_get_user_approvals",
      resubmitApprovalRequest: "rpc_resubmit_approval_request",
      cancelApprovalRequest: "rpc_cancel_approval_request",
      logCliqFailure: "rpc_log_cliq_failure",
      getCarryover: "rpc_get_carryover",
      getAssignments: "rpc_get_assignments",
      getRecurringTasks: "rpc_get_recurring_tasks",
      getSubmittedDayDetails: "rpc_get_submitted_day_details",
      syncRecurringTasks: "rpc_sync_recurring_tasks",
      completeRecurringTasks: "rpc_complete_recurring_tasks",
      getPlannerTasks: "rpc_get_planner_tasks",
      addPlannerTasks: "rpc_planner_add_tasks",
      movePlannerToSOD: "rpc_planner_move_to_sod",
      returnPlannerTasks: "rpc_planner_return_tasks",
      markPlannerConsumed: "rpc_planner_mark_consumed",
      updatePlannerTask: "rpc_planner_update_task",
      deletePlannerTask: "rpc_planner_delete_task"
    };
    return map[String(action || "").trim()] || "";
  }

  function createClient(options) {
    const opts = options || {};
    const supabaseClient = opts.supabaseClient;

    async function callApi(action, payload, options2) {
      const reqOpts = options2 || {};
      if (!supabaseClient) throw new Error("Supabase client is not configured.");
      const rpc = rpcNameForAction_(action);
      if (!rpc) throw new Error(`Unknown action: ${action}`);
      const body = normalizeApiPayload_(Object.assign({ action: action }, payload || {}));
      const timeoutMs = Math.max(1000, Number(reqOpts.timeoutMs || 15000));
      const maxAttempts = Math.max(1, Number(reqOpts.maxAttempts || 1));
      let lastErr = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const controller = new AbortController();
          const timer = global.setTimeout(() => controller.abort(), timeoutMs);
          const op = supabaseClient.rpc(rpc, { p_payload: body }).abortSignal(controller.signal);
          const { data, error } = await op;
          global.clearTimeout(timer);
          if (error) throw new Error(String(error.message || error));
          return (data && typeof data === "object") ? data : { ok: true, data: data };
        } catch (err) {
          const isAbort = err && (err.name === "AbortError" || String(err.message || err).toLowerCase().includes("aborted"));
          lastErr = isAbort ? new Error("Request timed out.") : err;
        }
      }
      throw lastErr || new Error("Request failed.");
    }

    function callApiJsonp(action, payload, timeoutMs) {
      return callApi(action, payload, { timeoutMs: timeoutMs, maxAttempts: 2 });
    }

    return {
      callApi,
      callApiJsonp
    };
  }

  function isUnsupportedActionError_(err) {
    const msg = String(err && err.message ? err.message : err).toLowerCase();
    return msg.includes("unknown action")
      || msg.includes("invalid action")
      || msg.includes("not implemented")
      || msg.includes("could not find the function");
  }

  global.TaskAppApi = {
    toFormEncoded,
    isCorsLikeNetworkError,
    isTimeoutLikeError,
    normalizeApiPayload_,
    withTimeout_,
    rpcNameForAction_,
    createClient,
    isUnsupportedActionError_
  };
})(window);
