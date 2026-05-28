(function initTaskAppUtils(global) {
  const TaskAppUtils = {
    parseISODate_: function(iso) {
      const match = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return null;
      const dt = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isNaN(dt.getTime()) ? null : dt;
    },

    toISODate_: function(dt) {
      const y = String(dt.getFullYear());
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    },

    shiftISODateByDays_: function(iso, days) {
      const base = TaskAppUtils.parseISODate_(iso) || new Date();
      const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      dt.setDate(dt.getDate() + Number(days || 0));
      return TaskAppUtils.toISODate_(dt);
    },

    shiftISODateByMonths_: function(iso, months) {
      const base = TaskAppUtils.parseISODate_(iso) || new Date();
      const targetMonth = base.getMonth() + Number(months || 0);
      const dt = new Date(base.getFullYear(), targetMonth, 1);
      const maxDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      const day = Math.min(base.getDate(), maxDay);
      dt.setDate(day);
      return TaskAppUtils.toISODate_(dt);
    },

    createRequestId: function() {
      return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    },

    formatDateTime: function(ts) {
      if (!ts) return "-";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "-";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      return `${dd}-${mm}-${yyyy}`;
    },

    formatStatusTimestamp_: function(ts) {
      if (!ts) return "-";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "-";
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = String(d.getFullYear());
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
    },

    createTaskId: function() {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return global.crypto.randomUUID();
      }
      return `task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    },

    escapeHtml: function(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    parsePercent: function(value, allowedValues) {
      const n = Number(value);
      const allowed = new Set(Array.isArray(allowedValues) ? allowedValues : []);
      if (!Number.isFinite(n)) return null;
      return allowed.has(n) ? n : null;
    },

    parseHours: function(value) {
      if (value == null || String(value).trim() === "") return 0;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return null;
      return Math.floor(n);
    },

    parseMinutes: function(value) {
      if (value == null || String(value).trim() === "") return 0;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 59) return null;
      return Math.floor(n);
    },

    parseTimeHHMM: function(value) {
      const raw = String(value || "").trim();
      if (!raw) return { ok: true, empty: true, hours: 0, minutes: 0 };
      const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
      const hms = raw.match(/^(\d{1,3})\s*:\s*([0-5]?\d)\s*:\s*([0-5]?\d)$/);
      if (hms) {
        const hh = Number(hms[1]);
        const mm = Number(hms[2]);
        const ss = Number(hms[3]);
        const totalMinutes = Math.floor(((hh * 3600) + (mm * 60) + ss) / 60);
        return {
          ok: true,
          empty: false,
          hours: Math.floor(totalMinutes / 60),
          minutes: totalMinutes % 60
        };
      }
      const hm = raw.match(/^(\d{1,3})\s*:\s*([0-5]?\d)$/);
      if (hm) {
        return {
          ok: true,
          empty: false,
          hours: Number(hm[1]),
          minutes: Number(hm[2])
        };
      }
      const hOnly = normalized.match(/^(\d{1,3})\s*(h|hr|hrs|hour|hours)$/i);
      if (hOnly) {
        return {
          ok: true,
          empty: false,
          hours: Number(hOnly[1]),
          minutes: 0
        };
      }
      const hAndM = normalized.match(/^(\d{1,3})\s*(h|hr|hrs|hour|hours)\s*([0-5]?\d)\s*(m|min|mins|minute|minutes)$/i);
      if (hAndM) {
        return {
          ok: true,
          empty: false,
          hours: Number(hAndM[1]),
          minutes: Number(hAndM[3])
        };
      }
      const minOnly = raw.match(/^(\d{1,4})\s*(m|min|mins|minute|minutes)?$/i);
      if (!minOnly) return { ok: false, empty: false, hours: 0, minutes: 0 };
      const totalMinutes = Number(minOnly[1]);
      if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
        return { ok: false, empty: false, hours: 0, minutes: 0 };
      }
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return {
        ok: true,
        empty: false,
        hours,
        minutes
      };
    },

    formatMinutes: function(totalMinutes) {
      const safe = Math.max(0, totalMinutes || 0);
      const h = Math.floor(safe / 60);
      const m = safe % 60;
      return `${h}h ${m}m`;
    },

    formatDurationInput_: function(hours, minutes) {
      const h = Number(hours);
      const m = Number(minutes);
      const safeH = Number.isFinite(h) && h > 0 ? Math.floor(h) : 0;
      const safeM = Number.isFinite(m) && m > 0 ? Math.floor(m) : 0;
      if (!safeH && !safeM) return "";
      if (safeH && safeM) return `${safeH}h ${safeM}m`;
      if (safeH) return `${safeH}h`;
      return `${safeM}m`;
    }
  };

  global.TaskAppUtils = TaskAppUtils;
})(window);
