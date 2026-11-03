import Stripe from "https://esm.sh/stripe@16?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { sessionId, form } = await req.json();
    if (!sessionId || !form?.email || !form?.password) {
      return json({ error: "Missing signup details." }, 400);
    }

    // 1. Verify payment with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete" || session.payment_status !== "paid") {
      return json({ paid: false }, 402);
    }

    // 2. The paid session must belong to this email
    const paidEmail = (session.customer_details?.email ?? session.customer_email ?? "").toLowerCase();
    if (paidEmail !== String(form.email).toLowerCase()) {
      return json({ error: "Email does not match the payment." }, 400);
    }

    const address = session.metadata?.address ?? "";
    const name = `${form.firstName} ${form.lastName}`.trim();

    // 3. Create the auth user (safe to repeat if the page is refreshed)
    const { error: createErr } = await admin.auth.admin.createUser({
      email: form.email,
      password: form.password,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      return json({ error: createErr.message }, 400);
    }

    // 4. Save the client row
    const { data: existing } = await admin
      .from("clients")
      .select("email")
      .eq("email", form.email)
      .maybeSingle();

    if (existing) {
      await admin.from("clients").update({ address }).eq("email", form.email);
    } else {
      const { error: insertErr } = await admin.from("clients").insert([{
        first_name: form.firstName,
        last_name: form.lastName,
        email: form.email,
        id_number: form.idNumber,
        address,
      }]);
      if (insertErr) return json({ error: insertErr.message }, 400);
    }

    return json({ paid: true, email: form.email, name });
  } catch (e) {
    return json({ error: String(e) }, 400);
  }
});