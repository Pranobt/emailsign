import { createClient } from "npm:@supabase/supabase-js@2";

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return json(405, { ok: false, message: "Method not allowed" });
    }

    const webhookSecret = Deno.env.get("ZOHO_PEOPLE_WEBHOOK_SECRET") || "";
    if (webhookSecret) {
      const provided =
        req.headers.get("x-webhook-secret") ||
        req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";
      if (!provided || provided !== webhookSecret) {
        return json(401, { ok: false, message: "Unauthorized" });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, {
        ok: false,
        message: "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
      });
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = await req.json();
    } catch {
      return json(400, { ok: false, message: "Invalid JSON payload" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("internal_ingest_zoho_people_attendance", {
      p_payload: payload,
    });
    if (error) {
      return json(500, {
        ok: false,
        message: `Ingest failed: ${error.message}`,
      });
    }

    return json(200, data || { ok: true });
  } catch (err) {
    return json(500, {
      ok: false,
      message: String(err instanceof Error ? err.message : err),
    });
  }
});
