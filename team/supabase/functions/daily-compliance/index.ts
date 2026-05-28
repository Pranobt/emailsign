import { createClient } from "npm:@supabase/supabase-js@2";
type UserRow = {
  department: string | null;
  employee_name: string | null;
  created_at: string | null;
};

type SubmissionRow = {
  department: string | null;
  employee_name: string | null;
  stage: string | null;
};

type MonthlySubRow = {
  department: string | null;
  employee_name: string | null;
  stage: string | null;
  work_date: string | null;
};

type LeaveRow = {
  department: string | null;
  employee_name: string | null;
  leave_status: string | null;
  leave_date: string | null;
};

function istDateISO(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function key(v: string | null | undefined): string {
  return String(v || "").trim().toLowerCase();
}

const RED_FLAG_THRESHOLD = 0.60;

function buildMessage(
  department: string,
  workDate: string,
  rows: Array<{ name: string; sod: boolean; eod: boolean; leave: boolean; eodCount: number; personalDays: number }>,
): string {
  const total = rows.length;

  // Sort non-leave rows by % descending, leave rows at bottom
  const sorted = [
    ...rows
      .filter((r) => !r.leave)
      .sort((a, b) => {
        const pctA = a.personalDays > 0 ? a.eodCount / a.personalDays : 0;
        const pctB = b.personalDays > 0 ? b.eodCount / b.personalDays : 0;
        return pctB - pctA;
      }),
    ...rows.filter((r) => r.leave),
  ];

  const statusLines = sorted.map((r) => {
    if (r.leave) return `🟡🟡 ${r.name} (On Leave)`;
    const pct = r.personalDays > 0 ? Math.round((r.eodCount / r.personalDays) * 100) : 0;
    return `${r.sod ? "✅" : "❌"}${r.eod ? "✅" : "❌"} ${r.name} (${r.eodCount}/${r.personalDays}) = ${pct}%`;
  });

  const redFlags = rows
    .filter((r) => !r.leave && r.personalDays > 0 && r.eodCount / r.personalDays < RED_FLAG_THRESHOLD)
    .sort((a, b) => {
      const pctA = a.eodCount / a.personalDays;
      const pctB = b.eodCount / b.personalDays;
      return pctA - pctB;
    });

  const dmy = (() => {
    const m = workDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return workDate;
    return `${m[3]}-${m[2]}-${m[1]}`;
  })();

  const lines = [
    `*Daily Compliance - ${department}*`,
    `Date: ${dmy}`,
    `Total Members: ${total}`,
    "",
    ...statusLines,
  ];

  if (redFlags.length > 0) {
    lines.push(
      "",
      `*Warnings Triggered*`,
      ...redFlags.map((r) => {
        const missed = r.personalDays - r.eodCount;
        return `${r.name} - Missed ${missed} submission${missed !== 1 ? "s" : ""}`;
      }),
    );
  }

  return lines.join("\n");
}

function formBody(payload: Record<string, string | number>): string {
  const sp = new URLSearchParams();
  Object.entries(payload).forEach(([k, v]) => sp.set(k, String(v ?? "")));
  return sp.toString();
}

Deno.serve(async (req) => {
  try {
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    if (cronSecret) {
      const got = req.headers.get("x-cron-secret") || "";
      if (got !== cronSecret) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const webhookUrl = Deno.env.get("COMPLIANCE_WEBHOOK_URL") || "";
    const submitterEmail = Deno.env.get("COMPLIANCE_SENDER_EMAIL") || "pranob.thachanthara@finnovate.in";
    const senderName = Deno.env.get("COMPLIANCE_SENDER_NAME") || "System Auto";
    if (!supabaseUrl || !serviceRoleKey || !webhookUrl) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMPLIANCE_WEBHOOK_URL",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }

    let workDate = istDateISO();
    if (req.method === "POST") {
      try {
        const body = await req.json();
        const d = String(body?.workDate || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) workDate = d;
      } catch {
        // ignore non-json body
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: workingDay, error: workingErr } = await supabase.rpc("is_org_working_day", {
      p_date: workDate,
      p_department: null,
    });
    if (workingErr) throw new Error(`is_org_working_day failed: ${workingErr.message}`);
    if (!workingDay) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "non_working_day", workDate }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const monthStart = workDate.substring(0, 8) + "01"; // YYYY-MM-01

    const [usersRes, subsRes, monthlySubsRes, leaveRes] = await Promise.all([
      supabase.from("users_directory").select("department, employee_name, created_at").eq("active", true),
      supabase.from("task_submissions").select("department, employee_name, stage")
        .eq("work_date", workDate).in("stage", ["SOD", "EOD"]),
      supabase.from("task_submissions").select("department, employee_name, stage, work_date")
        .in("stage", ["SOD", "EOD"]).gte("work_date", monthStart).lte("work_date", workDate),
      supabase.from("leave_days").select("department, employee_name, leave_status, leave_date")
        .gte("leave_date", monthStart).lte("leave_date", workDate).eq("leave_status", "Leave"),
    ]);

    if (usersRes.error) throw new Error(`users_directory fetch failed: ${usersRes.error.message}`);
    if (subsRes.error) throw new Error(`task_submissions fetch failed: ${subsRes.error.message}`);
    if (monthlySubsRes.error) throw new Error(`monthly submissions fetch failed: ${monthlySubsRes.error.message}`);

    const ignoreMissingLeaveTable = Boolean(
      leaveRes.error && (
        String((leaveRes.error as { code?: string }).code || "") === "42P01"
        || String((leaveRes.error as { message?: string }).message || "").toLowerCase().includes("relation")
      ),
    );
    if (leaveRes.error && !ignoreMissingLeaveTable) {
      throw new Error(`leave_days fetch failed: ${leaveRes.error.message}`);
    }

    const users = (usersRes.data || []) as UserRow[];
    const submissions = (subsRes.data || []) as SubmissionRow[];
    const monthlySubs = (monthlySubsRes.data || []) as MonthlySubRow[];
    const leaves = ignoreMissingLeaveTable ? [] as LeaveRow[] : (leaveRes.data || []) as LeaveRow[];

    // Working days this month = distinct dates where ≥3 different employees submitted
    const submittersByDate = new Map<string, Set<string>>();
    monthlySubs.forEach((s) => {
      if (!s.work_date) return;
      if (!submittersByDate.has(s.work_date)) submittersByDate.set(s.work_date, new Set());
      submittersByDate.get(s.work_date)!.add(key(s.employee_name));
    });
    // Sorted list of org working days this month
    const orgWorkingDays = Array.from(submittersByDate.entries())
      .filter(([, v]) => v.size >= 3)
      .map(([date]) => date)
      .sort();

    // Build month-to-date EOD count per employee (distinct work_dates)
    const eodCountMap = new Map<string, Set<string>>();
    monthlySubs.forEach((s) => {
      if (key(s.stage) !== "eod" || !s.work_date) return;
      const composite = `${key(s.department)}|${key(s.employee_name)}`;
      if (!eodCountMap.has(composite)) eodCountMap.set(composite, new Set());
      eodCountMap.get(composite)!.add(s.work_date);
    });

    // Build employee created_at map (date only, YYYY-MM-DD)
    const userCreatedMap = new Map<string, string>();
    users.forEach((u) => {
      const composite = `${key(u.department)}|${key(u.employee_name)}`;
      const createdDate = u.created_at ? String(u.created_at).substring(0, 10) : null;
      if (createdDate) userCreatedMap.set(composite, createdDate);
    });

    const deptUsers = new Map<string, string[]>();
    users.forEach((u) => {
      const dep = String(u.department || "").trim();
      const name = String(u.employee_name || "").trim();
      if (!dep || !name) return;
      const arr = deptUsers.get(dep) || [];
      arr.push(name);
      deptUsers.set(dep, arr);
    });

    const sodSet = new Set<string>();
    const eodSet = new Set<string>();
    const leaveSet = new Set<string>(); // today's leave
    const leaveMonthMap = new Map<string, Set<string>>(); // composite -> Set of leave dates this month
    submissions.forEach((s) => {
      const dep = key(s.department);
      const name = key(s.employee_name);
      const stage = key(s.stage);
      if (!dep || !name) return;
      const composite = `${dep}|${name}`;
      if (stage === "sod") sodSet.add(composite);
      if (stage === "eod") eodSet.add(composite);
    });
    leaves.forEach((l) => {
      const dep = key(l.department);
      const name = key(l.employee_name);
      if (!dep || !name) return;
      const composite = `${dep}|${name}`;
      if (key(l.leave_status) === "leave") {
        if (l.leave_date === workDate) leaveSet.add(composite);
        if (l.leave_date) {
          if (!leaveMonthMap.has(composite)) leaveMonthMap.set(composite, new Set());
          leaveMonthMap.get(composite)!.add(l.leave_date);
        }
      }
    });

    const departments = Array.from(deptUsers.keys()).sort((a, b) => a.localeCompare(b));
    let sent = 0;
    const failed: Array<{ department: string; error: string }> = [];

    for (const department of departments) {
      const people = Array.from(new Set((deptUsers.get(department) || []).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      if (!people.length) continue;

      const rows = people.map((name) => {
        const composite = `${key(department)}|${key(name)}`;
        const onLeave = leaveSet.has(composite);
        const eodCount = eodCountMap.get(composite)?.size ?? 0;

        // Personal start: if account created this month, count working days from that date
        const createdDate = userCreatedMap.get(composite);
        const personalStart = createdDate && createdDate > monthStart ? createdDate : monthStart;
        const employeeLeaveDates = leaveMonthMap.get(composite) || new Set<string>();
        const personalDays = orgWorkingDays.filter((d) => d >= personalStart && !employeeLeaveDates.has(d)).length;

        return {
          name,
          sod: onLeave ? false : sodSet.has(composite),
          eod: onLeave ? false : eodSet.has(composite),
          leave: onLeave,
          eodCount,
          personalDays,
        };
      });

      const deptRows = rows.map((r) => ({
        department,
        employeeName: r.name,
        sodSubmittedDays: r.sod ? 1 : 0,
        eodSubmittedDays: r.eod ? 1 : 0,
        leave: r.leave,
        eodCount: r.eodCount,
        personalDays: r.personalDays,
      }));

      const message = buildMessage(department, workDate, rows);
      const payloadJson = JSON.stringify({
        kind: "department_compliance",
        department,
        workDate,
        rows: deptRows,
      });
      const body = formBody({
        category: "compliance",
        stage: "DAILY_COMPLIANCE",
        employeeName: senderName,
        submitterEmail,
        from: submitterEmail,
        department,
        workDate,
        taskCount: deptRows.length,
        totalSpentMinutes: 0,
        cliq_message: message,
        payload_json: payloadJson,
      });

      try {
        const webhookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body,
        });
        if (!webhookRes.ok) throw new Error(`HTTP ${webhookRes.status}`);
        sent += 1;
      } catch (err) {
        const messageErr = String(err instanceof Error ? err.message : err);
        failed.push({ department, error: messageErr });
        await supabase.rpc("rpc_log_cliq_failure", {
          p_payload: {
            stage: "DAILY_COMPLIANCE",
            department,
            employeeName: senderName,
            workDate,
            error: messageErr,
            flowPayload: {
              category: "compliance",
              stage: "DAILY_COMPLIANCE",
              employeeName: senderName,
              submitterEmail,
              from: submitterEmail,
              department,
              workDate,
              taskCount: deptRows.length,
              totalSpentMinutes: 0,
              cliq_message: message,
              payload_json: payloadJson,
            },
          },
        });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, workDate, sent, failedCount: failed.length, failed }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, message: String(err instanceof Error ? err.message : err) }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
