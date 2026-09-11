import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AccessToken } from "npm:livekit-server-sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const room = url.searchParams.get("room");
  const username = url.searchParams.get("username");
  const role = url.searchParams.get("role");

  const apiKey = Deno.env.get("LIVEKIT_API_KEY")!;
  const apiSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

  const at = new AccessToken(apiKey, apiSecret, { identity: username! });
  at.addGrant({
    roomJoin: true,
    room: room!,
    canPublish: role === "broadcaster",
    canSubscribe: true,
  });

  const token = await at.toJwt();

  return new Response(token, {
    headers: { ...corsHeaders, "Content-Type": "text/plain" },
  });
});