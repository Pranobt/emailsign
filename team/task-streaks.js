(function initTaskAppStreaks(global) {
  function createManager(options) {
    const opts = options || {};
    const callApi = opts.callApi;
    const getIdentity = typeof opts.getIdentity === "function" ? opts.getIdentity : function() { return null; };
    const clientVersion = String(opts.clientVersion || "");
    const dom = opts.dom || {};
    const escapeHtml = typeof opts.escapeHtml === "function" ? opts.escapeHtml : function(value) { return String(value == null ? "" : value); };
    const formatCliqDate = typeof opts.formatCliqDate === "function" ? opts.formatCliqDate : function(value) { return String(value || ""); };
    const showToast = typeof opts.showToast === "function" ? opts.showToast : function() {};

    let streakState = {
      current: 0,
      best: 0,
      lastCountedDate: "",
      sodSubmittedDays: 0,
      eodSubmittedDays: 0,
      isBroken: false,
      brokenSinceDate: "",
      brokenReason: ""
    };
    let streakLeaders = [];
    let streakLeaderboardError = "";
    let streakLeaderboardFetchInFlight = false;
    let streakLeaderboardLoaded = false;

    function renderStreak() {
      const current = Math.max(0, Number(streakState && streakState.current || 0));
      const best = Math.max(current, Number(streakState && streakState.best || 0));
      if (dom.streakTextEl) dom.streakTextEl.textContent = `Streak: ${current} | Best: ${best}`;
      if (dom.streakChipEl) {
        dom.streakChipEl.title = "Streak counts consecutive working days with both SOD and EOD submitted.";
      }
      if (dom.streakNoteEl) {
        if (streakState && streakState.isBroken && streakState.brokenSinceDate) {
          const reason = String(streakState.brokenReason || "SOD or EOD was not submitted");
          const sinceText = formatCliqDate(streakState.brokenSinceDate);
          dom.streakNoteEl.textContent = `Your streak is broken since ${sinceText}: ${reason}. To regain streak continuity, submit both SOD and EOD for ${sinceText}.`;
        } else {
          dom.streakNoteEl.textContent = "";
        }
      }
    }

    function renderStreakLeaderboard() {
      if (!dom.streakLeaderboardEl) return;
      if (!streakLeaderboardLoaded && streakLeaders.length === 0 && !streakLeaderboardError) {
        dom.streakLeaderboardEl.innerHTML = `
          <div class="streak-leaderboard-title">Top 3 Streaks (Organization-wide)</div>
          <div>Loading leaderboard...</div>
        `;
        if (!streakLeaderboardFetchInFlight) {
          streakLeaderboardFetchInFlight = true;
          refreshStreakLeaderboard({ timeoutMs: 8000 })
            .finally(() => {
              streakLeaderboardFetchInFlight = false;
            });
        }
        return;
      }
      if (streakLeaderboardError) {
        dom.streakLeaderboardEl.innerHTML = `
          <div class="streak-leaderboard-title">Top 3 Streaks (Organization-wide)</div>
          <div>${escapeHtml(streakLeaderboardError)}</div>
        `;
        return;
      }
      const rows = Array.isArray(streakLeaders) ? streakLeaders.slice(0, 3) : [];
      if (!rows.length) {
        dom.streakLeaderboardEl.innerHTML = `
          <div class="streak-leaderboard-title">Top 3 Streaks (Organization-wide)</div>
          <div>No leaderboard data yet.</div>
        `;
        return;
      }
      const items = rows.map((r) => {
        const name = escapeHtml(String(r.employeeName || "-"));
        const dept = escapeHtml(String(r.department || "-"));
        const current = Math.max(0, Number(r.current || 0));
        const best = Math.max(current, Number(r.best || 0));
        return `<li>${name} (${dept}) - ${current} current | ${best} best</li>`;
      }).join("");
      dom.streakLeaderboardEl.innerHTML = `
        <div class="streak-leaderboard-title">Top 3 Streaks (Organization-wide)</div>
        <ol class="streak-leaderboard-list">${items}</ol>
      `;
    }

    function playStreakConfetti(count) {
      const total = Number(count || 36);
      if (!dom.streakConfettiEl) return;
      dom.streakConfettiEl.innerHTML = "";
      const colors = ["#ff7a00", "#ffd166", "#1b8dff", "#5dd39e", "#ff4f64"];
      for (let i = 0; i < total; i += 1) {
        const piece = document.createElement("span");
        piece.className = "streak-confetti-piece";
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDuration = `${1.6 + Math.random() * 1.1}s`;
        piece.style.animationDelay = `${Math.random() * 0.28}s`;
        dom.streakConfettiEl.appendChild(piece);
      }
      global.setTimeout(() => {
        dom.streakConfettiEl.innerHTML = "";
      }, 2600);
    }

    function playStreakIncrementFx(streak) {
      if (dom.streakChipEl) {
        dom.streakChipEl.classList.remove("pulse");
        void dom.streakChipEl.offsetWidth;
        dom.streakChipEl.classList.add("pulse");
      }
      if (dom.streakPopEl) {
        dom.streakPopEl.textContent = "+1 day";
        dom.streakPopEl.classList.remove("show");
        void dom.streakPopEl.offsetWidth;
        dom.streakPopEl.classList.add("show");
      }
      if (Number(streak && streak.milestone || 0) > 0) {
        playStreakConfetti(48);
        showToast(`Streak milestone: ${Number(streak.milestone)} days`, "success", 3000);
      }
    }

    function applyStreakResult(incoming, options) {
      const opts2 = options || {};
      const s = incoming && typeof incoming === "object" ? incoming : {};
      const prevCurrent = Math.max(0, Number(streakState && streakState.current || 0));
      const nextCurrent = Math.max(0, Number(s.current || 0));
      const nextBest = Math.max(nextCurrent, Number(s.best || 0));
      streakState.current = nextCurrent;
      streakState.best = nextBest;
      streakState.lastCountedDate = String(s.lastCountedDate || s.countedDate || streakState.lastCountedDate || "");
      streakState.sodSubmittedDays = Math.max(0, Number(s.sodSubmittedDays != null ? s.sodSubmittedDays : streakState.sodSubmittedDays));
      streakState.eodSubmittedDays = Math.max(0, Number(s.eodSubmittedDays != null ? s.eodSubmittedDays : streakState.eodSubmittedDays));
      streakState.isBroken = s.isBroken != null ? Boolean(s.isBroken) : streakState.isBroken;
      streakState.brokenSinceDate = s.brokenSinceDate != null ? String(s.brokenSinceDate || "") : streakState.brokenSinceDate;
      streakState.brokenReason = s.brokenReason != null ? String(s.brokenReason || "") : streakState.brokenReason;
      renderStreak();
      if (Boolean(opts2.animate) && (Boolean(s.incremented) || nextCurrent > prevCurrent)) {
        playStreakIncrementFx(s);
      }
    }

    async function refreshUserStreak(options) {
      const opts2 = options || {};
      const identity = getIdentity();
      if (!identity || typeof callApi !== "function") return;
      try {
        const result = await callApi("getUserStreak", {
          department: identity.dept,
          employeeName: identity.name,
          accessCode: identity.code,
          clientVersion: clientVersion
        }, { timeoutMs: Number(opts2.timeoutMs || 8000) });
        if (!result || result.ok === false) return;
        applyStreakResult(result, { animate: Boolean(opts2.animate) });
      } catch (err) {}
    }

    async function refreshStreakLeaderboard(options) {
      const opts2 = options || {};
      const identity = getIdentity();
      if (!identity) {
        streakLeaderboardError = "Leaderboard is initializing. Try again in 1-2 seconds.";
        streakLeaderboardLoaded = true;
        renderStreakLeaderboard();
        return;
      }
      if (typeof callApi !== "function") return;
      try {
        const result = await callApi("getStreakLeaderboard", {
          dept: identity.dept,
          department: "All",
          name: identity.name,
          accessCode: identity.code,
          limit: 3,
          clientVersion: clientVersion
        }, { timeoutMs: Number(opts2.timeoutMs || 8000) });
        if (!result || result.ok === false) {
          streakLeaderboardError = result && result.message
            ? String(result.message)
            : "Leaderboard unavailable right now.";
          streakLeaderboardLoaded = true;
          renderStreakLeaderboard();
          return;
        }
        streakLeaderboardError = "";
        streakLeaders = Array.isArray(result.leaders) ? result.leaders : [];
        streakLeaderboardLoaded = true;
        renderStreakLeaderboard();
      } catch (err) {
        streakLeaderboardError = String(err && err.message ? err.message : err || "Leaderboard unavailable right now.");
        streakLeaderboardLoaded = true;
        renderStreakLeaderboard();
      }
    }

    return {
      renderStreak,
      renderStreakLeaderboard,
      applyStreakResult,
      refreshUserStreak,
      refreshStreakLeaderboard
    };
  }

  global.TaskAppStreaks = {
    createManager
  };
})(window);
