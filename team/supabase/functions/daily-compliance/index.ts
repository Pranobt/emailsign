import { createClient } from "npm:@supabase/supabase-js@2";
const MESSAGE_FORMAT_VERSION = "compact-v2";

type UserRow = {
  department: string | null;
  employee_name: string | null;
};

type SubmissionRow = {
  department: string | null;
  employee_name: string | null;
  stage: string | null;
};

type LeaveRow = {
  department: string | null;
  employee_name: string | null;
  leave_status: string | null;
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

function buildMessage(
  department: string,
  workDate: string,
  rows: Array<{ name: string; sod: boolean; eod: boolean; leave: boolean }>,
): string {
  const total = rows.length;
  const leaveCount = rows.filter((r) => r.leave).length;
  const activeRows = rows.filter((r) => !r.leave);
  const sodSubmitted = activeRows.filter((r) => r.sod).length;
  const eodSubmitted = activeRows.filter((r) => r.eod).length;
  const sodMissing = Math.max(0, activeRows.length - sodSubmitted);
  const eodMissing = Math.max(0, activeRows.length - eodSubmitted);
  const statusLines = rows.length
    ? rows.map((r) => (r.leave
      ? `🟡🟡 ${r.name} (Leave)`
      : `${r.sod ? "✅" : "❌"}${r.eod ? "✅" : "❌"} ${r.name}`))
    : ["-"];
  const dmy = (() => {
    const m = workDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return workDate;
    return `${m[3]}-${m[2]}-${m[1]}`;
  })();
  return [
    `*Daily Compliance - ${department}*`,
    `Date: ${dmy}`,
    `Total Members: ${total}`,
    "",
    "*Legend:* SOD | EOD (🟡 = Leave)",
    `Format: ${MESSAGE_FORMAT_VERSION}`,
    statusLines.join("\n"),
    "",
    "*Summary*",
    `Leave: ${leaveCount}`,
    `SOD Submitted: ${sodSubmitted} | Missing: ${sodMissing}`,
    `EOD Submitted: ${eodSubmitted} | Missing: ${eodMissing}`,
  ].join("\n");
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

    const { data: usersData, error: usersErr } = await supabase
      .from("users_directory")
      .select("department, employee_name")
      .eq("active", true);
    if (usersErr) throw new Error(`users_directory fetch failed: ${usersErr.message}`);

    const { data: subsData, error: subsErr } = await supabase
      .from("task_submissions")
      .select("department, employee_name, stage")
      .eq("work_date", workDate)
      .in("stage", ["SOD", "EOD"]);
    if (subsErr) throw new Error(`task_submissions fetch failed: ${subsErr.message}`);

    const { data: leaveData, error: leaveErr } = await supabase
      .from("leave_days")
      .select("department, employee_name, leave_status")
      .eq("leave_date", workDate)
      .eq("leave_status", "Leave");
    const ignoreMissingLeaveTable = Boolean(
      leaveErr && (
        String((leaveErr as { code?: string }).code || "") === "42P01"
        || String((leaveErr as { message?: string }).message || "").toLowerCase().includes("relation")
      )
    );
    if (leaveErr && !ignoreMissingLeaveTable) {
      throw new Error(`leave_days fetch failed: ${leaveErr.message}`);
    }

    const users = (usersData || []) as UserRow[];
    const submissions = (subsData || []) as SubmissionRow[];
    const leaves = ignoreMissingLeaveTable ? [] as LeaveRow[] : (leaveData || []) as LeaveRow[];

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
    const leaveSet = new Set<string>();
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
      const status = key(l.leave_status);
      if (status === "leave") {
        leaveSet.add(`${dep}|${name}`);
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
        return {
          name,
          sod: onLeave ? false : sodSet.has(composite),
          eod: onLeave ? false : eodSet.has(composite),
          leave: onLeave,
        };
      });
      const deptRows = rows.map((r) => ({
        department,
        employeeName: r.name,
        sodSubmittedDays: r.sod ? 1 : 0,
        eodSubmittedDays: r.eod ? 1 : 0,
        leave: r.leave,
      }));

      const message = buildMessage(department, workDate, rows);
      const payloadJson = JSON.stringify({
        kind: "department_compliance",
        department,
        workDate,
        rows: deptRows,
      });
      const body = formBody({
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
        if (!webhookRes.ok) {
          throw new Error(`HTTP ${webhookRes.status}`);
        }
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
      JSON.stringify({
        ok: true,
        workDate,
        sent,
        failedCount: failed.length,
        failed,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: String(err instanceof Error ? err.message : err),
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
