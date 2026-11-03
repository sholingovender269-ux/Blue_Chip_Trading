import Stripe from "https://esm.sh/stripe@16?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Sites that are allowed to receive customers after payment
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://sholingovender269-ux.github.io",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// Builds a safe base URL like https://user.github.io/repo-name/
function getBaseUrl(returnUrl: unknown, originHeader: string | null): string {
  try {
    if (typeof returnUrl === "string" && returnUrl) {
      const u = new URL(returnUrl);
      if (ALLOWED_ORIGINS.includes(u.origin)) {
        const path = u.pathname.endsWith("/") ? u.pathname : u.pathname + "/";
        return u.origin + path;
      }
    }
  } catch {
    // fall through to the fallback below
  }
  const origin = originHeader ?? "http://localhost:5173";
  return origin + "/";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, name, address, returnUrl } = await req.json();
    const base = getBaseUrl(returnUrl, req.headers.get("origin"));

    const { data: existing } = await admin
      .from("clients")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (existing) return json({ error: "This email is already registered." }, 409);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "zar",
            unit_amount: 42000,
            recurring: { interval: "month" },
            product_data: { name: "All in access" },
          },
        },
      ],
      metadata: { name: name ?? "", address: address ?? "" },
      success_url: `${base}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}?canceled=1`,
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: String(e) }, 400);
  }
});