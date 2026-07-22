// ─────────────────────────────────────────────────────────────────
//  admin-users — Supabase Edge Function (service role)
//
//  Account management for the SMP admin console: create login accounts
//  for teachers/students, reset passwords and (de)activate them. The
//  browser can't do this with the anon key (Supabase's Auth admin API
//  needs the service-role key), so it lives here.
//
//  The service-role key is read from the function's runtime env
//  (SUPABASE_SERVICE_ROLE_KEY, injected by Supabase) — it never reaches
//  the client. Every request is authorized: the caller's JWT must map
//  to a profiles row with role = 'admin'.
//
//  Deploy to each real (non-demo) school project — NEVER the shared demo
//  project. In demo mode the console simulates account creation and does
//  not call this function.
//
//  Actions (POST JSON { action, ... }):
//    create     { email, password, role, name?, linkType?, linkId? }
//    reset      { email }                       → returns a recovery link
//    setActive  { userId, active }              → ban / unban the login
// ─────────────────────────────────────────────────────────────────

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Authorize: the caller must be an admin ──────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing bearer token" }, 401);
  }
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await caller.auth.getUser();
  if (userErr || !user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return json({ error: "Admin role required" }, 403);
  }

  // ── Dispatch ────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const action = String(body.action ?? "");

  try {
    if (action === "create") {
      const email = String(body.email ?? "").trim();
      const password = String(body.password ?? "");
      const role = String(body.role ?? "student");
      const name = body.name ? String(body.name) : undefined;
      const linkType = body.linkType ? String(body.linkType) : null;
      const linkId = body.linkId != null ? Number(body.linkId) : null;

      if (!email || !password) {
        return json({ error: "email and password are required" }, 400);
      }
      if (!["admin", "teacher", "student"].includes(role)) {
        return json({ error: "invalid role" }, 400);
      }

      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: name ? { name } : {},
        });
      if (createErr || !created.user) {
        return json({ error: createErr?.message ?? "create failed" }, 400);
      }
      const newId = created.user.id;

      // handle_new_user() already inserted a profiles row (default role
      // 'student'); set the intended role.
      await admin.from("profiles").update({ role }).eq("id", newId);

      if (linkType === "teacher" && linkId) {
        await admin
          .from("teachers")
          .update({ auth_user_id: newId })
          .eq("id", linkId);
      } else if (linkType === "student" && linkId) {
        await admin
          .from("students")
          .update({ auth_user_id: newId })
          .eq("id", linkId);
      }

      return json({ userId: newId, email });
    }

    if (action === "reset") {
      const email = String(body.email ?? "").trim();
      if (!email) return json({ error: "email is required" }, 400);
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ actionLink: data.properties?.action_link ?? null });
    }

    if (action === "setActive") {
      const userId = String(body.userId ?? "");
      const active = Boolean(body.active);
      if (!userId) return json({ error: "userId is required" }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, {
        // A far-future ban disables sign-in; "none" restores it.
        ban_duration: active ? "none" : "876600h",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ userId, active });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
