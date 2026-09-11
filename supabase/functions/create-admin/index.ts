// supabase/functions/create-admin/index.ts
//
// Creates a Supabase Auth user AND the matching row in public.admins,
// in one call, using the service-role key (server-side only — never
// ship this key to the browser).
//
// Deploy:
//   supabase functions deploy create-admin
//
// Required secrets (set once per project):
//   supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are also auto-injected by
// the platform in most setups — the explicit secrets above are a fallback
// if your project doesn't expose them by default.)
//
// This function should only be callable by people who are already admins.
// It checks the caller's JWT against public.admins before doing anything,
// so calling it with just the anon key does nothing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Client bound to the CALLER's JWT — used only to check "is this
    // person already an admin?" via RLS, before we do anything privileged.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerErr,
    } = await callerClient.auth.getUser();

    if (callerErr || !callerUser) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    // Service-role client — used for the actual privileged work below.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerAdminRow } = await adminClient
      .from("admins")
      .select("id")
      .eq("id", callerUser.id)
      .maybeSingle();

    if (!callerAdminRow) {
      return json({ error: "Only existing admins can create new admins" }, 403);
    }

    // ── Inputs ──────────────────────────────────────────────────
    const body = await req.json();
    const { email, password, name, surname } = body ?? {};

    if (!email || !password || !name || !surname) {
      return json(
        { error: "email, password, name, and surname are all required" },
        400
      );
    }

    // ── 1. Create the auth user ─────────────────────────────────
    const { data: created, error: createErr } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // set false if you want them to verify by email
      });

    if (createErr || !created?.user) {
      return json({ error: createErr?.message ?? "Failed to create auth user" }, 400);
    }

    const newUserId = created.user.id;

    // ── 2. Insert the admins row for that new user ──────────────
    const { data: adminRow, error: insertErr } = await adminClient
      .from("admins")
      .insert([{ id: newUserId, name, surname, email }])
      .select()
      .single();

    if (insertErr) {
      // Roll back the auth user so we don't end up with an orphaned
      // login that has no admin row behind it.
      await adminClient.auth.admin.deleteUser(newUserId);
      return json({ error: insertErr.message }, 400);
    }

    return json({ admin: adminRow }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}