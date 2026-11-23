// Edge Function send-push: recebe {event_id} do gatilho do banco e envia Web Push
// para os aparelhos certos. Nunca confia no corpo da requisição: relê o evento
// no banco e só envia uma vez (pushed_at).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

type Ev = {
  id: string;
  circle_id: string;
  type: string;
  user_id: string;
  name: string;
  place_name: string | null;
  due_at: string | null;
  target_user_id: string | null;
};

const first = (n: string) => (n || "").trim().split(/\s+/)[0] || "Alguém";
const hm = (ts: string | null) => {
  if (!ts) return "--:--";
  const d = new Date(ts);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};

function text(e: Ev): { title: string; body: string; url: string; urgent: boolean } {
  const who = first(e.name);
  const place = e.place_name ?? "um lugar";
  switch (e.type) {
    case "ping":
      return { title: `${who} pediu sua localização`, body: "Toque para abrir o mapa. Sua posição é atualizada e enviada.", url: "/?ping=1", urgent: true };
    case "sos":
      return { title: `🚨 ${who} pediu ajuda (SOS)`, body: "Abra o mapa para ver onde está e ligue.", url: "/alertas", urgent: true };
    case "checkin_late":
      return { title: `⚠️ ${who} não chegou em ${place} no horário`, body: `Combinado até ${hm(e.due_at)}. Veja a última posição e tente ligar.`, url: "/alertas", urgent: true };
    case "checkin_ok":
      return { title: `✅ ${who} chegou bem em ${place}`, body: "", url: "/alertas", urgent: false };
    case "checkin_start":
      return { title: `${who} está indo para ${place}`, body: `Chega até ${hm(e.due_at)}.`, url: "/", urgent: false };
    case "arrive":
      return { title: `${who} chegou em ${place}`, body: "", url: "/", urgent: false };
    default:
      return { title: `${who} saiu de ${place}`, body: "", url: "/", urgent: false };
  }
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: secret } = await sb.rpc("push_secret", { p_name: "push_webhook_secret" });
  if (!secret || req.headers.get("x-push-secret") !== secret) return json({ error: "forbidden" }, 403);

  let eventId = "";
  try {
    eventId = String((await req.json())?.event_id ?? "");
  } catch {
    return json({ error: "bad_body" }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json({ error: "bad_id" }, 400);

  // Reivindica o evento: só quem conseguir marcar pushed_at envia.
  const { data: ev, error: claimErr } = await sb
    .from("events")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("pushed_at", null)
    .select("id,circle_id,type,user_id,name,place_name,due_at,target_user_id")
    .maybeSingle();
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!ev) return json({ skipped: "already_sent_or_missing" });

  let uids: string[] = [];
  if (ev.type === "ping") {
    uids = ev.target_user_id ? [ev.target_user_id] : [];
  } else {
    const { data: members } = await sb.from("circle_members").select("user_id").eq("circle_id", ev.circle_id);
    uids = (members ?? []).map((m: { user_id: string }) => m.user_id).filter((u: string) => u !== ev.user_id);
  }
  if (uids.length === 0) return json({ sent: 0, reason: "no_recipients" });

  const { data: subs } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth,user_id,failures").in("user_id", uids);
  if (!subs || subs.length === 0) return json({ sent: 0, reason: "no_subscriptions" });

  const [{ data: priv }, { data: pub }] = await Promise.all([
    sb.rpc("push_secret", { p_name: "vapid_private_key" }),
    sb.rpc("push_secret", { p_name: "vapid_public_key" }),
  ]);
  if (!priv || !pub) return json({ error: "vapid_missing" }, 500);
  webpush.setVapidDetails("mailto:vooflight5@gmail.com", pub, priv);

  const t = text(ev as Ev);
  const payload = JSON.stringify({ title: t.title, body: t.body, url: t.url, urgent: t.urgent, tag: ev.id, type: ev.type });
  let sent = 0, removed = 0, failed = 0;
  await Promise.all(
    subs.map(async (s: { endpoint: string; p256dh: string; auth: string; failures: number }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: t.urgent ? 3600 : 900, urgency: t.urgent ? "high" : "normal", topic: ev.type },
        );
        sent++;
        await sb.from("push_subscriptions").update({ last_ok_at: new Date().toISOString(), failures: 0 }).eq("endpoint", s.endpoint);
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode ?? 0;
        if (code === 404 || code === 410 || s.failures >= 9) {
          removed++;
          await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          failed++;
          await sb.from("push_subscriptions").update({ failures: s.failures + 1 }).eq("endpoint", s.endpoint);
        }
        console.error("push_failed", { code, endpoint_host: new URL(s.endpoint).host, msg: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }),
  );
  return json({ sent, removed, failed, recipients: uids.length });
});
