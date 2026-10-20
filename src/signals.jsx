import { useEffect, useRef, useState } from "react";
import "./landing.css";
import "./signals.css";
import { supabase } from "./supabaseClient";

// Two sections:
// 1. AI Signal: ONE signal per session (Asia, London, New York). It is
//    generated once per session per day, saved to Supabase, then just read by
//    everyone else. The card shows a detailed entry zone and a LIVE status that
//    tells the trader whether the setup is still valid right now.
// 2. Mentor Signals: everything mentors posted in the last 24 hours.
//
// Sessions are decided by TIME (South African time, UTC+2, no daylight saving):
//   Asia      02:00 - 09:00
//   London    09:00 - 15:30
//   New York  15:30 - 00:00
// 00:00 - 02:00 counts as Asia (market is open, nothing else is running).
// Change TZ_OFFSET_HOURS / SESSION_WINDOWS below if you ever need different ones.

const API_KEY = "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";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const SESSIONS = ["Asia", "London", "New York"];
const PRICE_WAIT_MS = 3000;

const TZ_OFFSET_HOURS = 2; // Johannesburg
const SESSION_WINDOWS = {
  Asia: { start: 2 * 60, end: 9 * 60, startLabel: "02:00", endLabel: "09:00" },
  London: { start: 9 * 60, end: 15 * 60 + 30, startLabel: "09:00", endLabel: "15:30" },
  "New York": { start: 15 * 60 + 30, end: 24 * 60, startLabel: "15:30", endLabel: "00:00" },
};

// The entry zone is the ideal entry +/- this fraction of the stop distance.
const ZONE_FRACTION = 0.25;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Date/time in session time (UTC+2) regardless of the visitor's own time zone.
function localParts(date = new Date()) {
  const d = new Date(date.getTime() + TZ_OFFSET_HOURS * 3600 * 1000);
  return {
    day: d.getUTCDay(), // 0 = Sun ... 6 = Sat
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    iso: d.toISOString().slice(0, 10),
  };
}

function todayISO() {
  return localParts().iso; // YYYY-MM-DD in session time
}

function getCurrentSession(date = new Date()) {
  const m = localParts(date).minutes;
  if (m >= SESSION_WINDOWS.London.start && m < SESSION_WINDOWS.London.end) return "London";
  if (m >= SESSION_WINDOWS["New York"].start) return "New York";
  return "Asia"; // 00:00 - 09:00
}

// Minutes left until the current session ends.
function minutesLeftInSession(date = new Date()) {
  const m = localParts(date).minutes;
  const end = SESSION_WINDOWS[getCurrentSession(date)].end;
  return end - m;
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Forex closes Friday 22:00 UTC and reopens Sunday 22:00 UTC. In session time
// (UTC+2) that is exactly all of Saturday and Sunday.
function isMarketClosed(date = new Date()) {
  const day = localParts(date).day;
  return day === 6 || day === 0;
}

// Monday 00:00 session time, shown in the visitor's own time zone.
function nextOpenLabel(now = new Date()) {
  const shifted = new Date(now.getTime() + TZ_OFFSET_HOURS * 3600 * 1000);
  const addDays = shifted.getUTCDay() === 6 ? 2 : 1;
  const open = new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + addDays,
      -TZ_OFFSET_HOURS,
      0,
      0
    )
  );
  return open.toLocaleString("en-US", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// "Asia" and "Asian" both match the Asia tab
const sameSession = (a, b) =>
  String(a || "").toLowerCase().slice(0, 4) === String(b || "").toLowerCase().slice(0, 4);

// Mentors post confidence as 0-100; AI signals use the text "high".
const isMentorSignal = (s) =>
  s.confidence !== null && s.confidence !== "" && !isNaN(Number(s.confidence));

function confidenceInfo(value) {
  const n = Number(value);
  if (value !== null && value !== "" && !isNaN(n)) {
    return { score: n, label: `${n}%`, level: n >= 70 ? "high" : n >= 40 ? "medium" : "low" };
  }
  const text = String(value || "").toLowerCase();
  const levels = { low: 33, medium: 66, high: 100 };
  return { score: levels[text] || 0, label: text || "—", level: text || "low" };
}

function formatPair(pair) {
  const p = String(pair || "").toUpperCase();
  if (!p.includes("/") && p.length === 6) return `${p.slice(0, 3)}/${p.slice(3)}`;
  return p;
}

const normPair = (pair) => String(pair || "").replace("/", "").toUpperCase();
const pipSize = (pair) => (normPair(pair).includes("JPY") ? 0.01 : 0.0001);
const fmt = (pair, v) => Number(v).toFixed(normPair(pair).includes("JPY") ? 3 : 5);
const toPips = (pair, diff) => Math.abs(diff) / pipSize(pair);

const timeOf = (s) =>
  s.created_at
    ? new Date(s.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : null;

// fetch() with a hard timeout so a stalled request can't hang the page.
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// Fallback when Landing's live prices haven't arrived: daily reference rates
// for the same 5 pairs. Free, no key. Good enough for rough levels only.
async function fetchFallbackPrices() {
  const res = await fetchWithTimeout(
    "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,GBP,JPY,CHF,AUD",
    {},
    8000
  );
  const json = await res.json();
  const r = json.rates;
  if (!r) throw new Error("Couldn't load prices.");
  const row = (pair, close) => ({ pair, close: Number(close.toFixed(pair.includes("JPY") ? 3 : 5)) });
  return [
    row("EUR/USD", 1 / r.EUR),
    row("GBP/USD", 1 / r.GBP),
    row("USD/JPY", r.JPY),
    row("USD/CHF", r.CHF),
    row("AUD/USD", 1 / r.AUD),
  ];
}

async function callOpenRouter(requestBody, attempt = 1) {
  const response = await fetchWithTimeout(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Blue Chip Trading",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  if (response.status === 429 && attempt < 2) {
    await sleep(1200);
    return callOpenRouter(requestBody, attempt + 1);
  }

  return { response, data };
}

const SESSION_STYLE = {
  Asia: "The Asia session is usually quieter and range-bound, so favour range or mean-reversion setups with tighter targets.",
  London: "The London session is the most liquid, with strong breakouts and trends, so favour momentum or breakout setups.",
  "New York": "The New York session is news-driven and volatile (especially around US data), so favour clean setups and be careful around news events.",
};

function buildSignalPrompt(session) {
  return `You are a trading signals generator for a forex trading platform. You will be given the current price for several currency pairs, plus upcoming high-impact US news events (NFP, CPI, FOMC). Using ONLY that data for price levels, generate exactly ONE trade idea for the "${session}" trading session.

${SESSION_STYLE[session] || ""}

Choose the single highest-confidence setup across the given pairs. Use realistic stop distances (about 15-40 pips; for USD/JPY a pip is 0.01). Take profit should be at least 1.5 times the stop distance. The entry must be within about 10 pips of the given current price. If the trade would run into one of the news events, mention it briefly in the rationale.

Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:

{
  "type": "Scalp" | "Short-Term" | "Daily",
  "pair": "EUR/USD",
  "direction": "buy" | "sell",
  "entry": 1.0850,
  "stop_loss": 1.0820,
  "take_profit": 1.0910,
  "confidence": "high",
  "rationale": "One or two sentence explanation grounded in the given price data."
}

For a buy: stop_loss < entry < take_profit. For a sell: take_profit < entry < stop_loss. Entry must be close to the given price for that pair.`;
}

async function generateSessionSignal(session, prices, upcomingNews) {
  const userPrompt = `Current price data:\n${JSON.stringify(
    prices,
    null,
    2
  )}\n\nUpcoming high-impact news events:\n${JSON.stringify(upcomingNews, null, 2)}`;

  const { response, data } = await callOpenRouter({
    model: "openai/gpt-3.5-turbo",
    messages: [
      { role: "system", content: buildSignalPrompt(session) },
      { role: "user", content: userPrompt },
    ],
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("OpenRouter rejected the API key. Create a new key at openrouter.ai/keys and paste it into API_KEY.");
  }

  if (!response.ok || data.error) {
    throw new Error(data?.error?.message || `Request failed (${response.status})`);
  }

  const raw = data?.choices?.[0]?.message?.content || "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let s;
  try {
    s = JSON.parse(cleaned);
  } catch {
    console.error(`Raw AI response for ${session} that failed to parse:`, raw);
    throw new Error("The AI response wasn't valid JSON. Try again.");
  }

  const entry = Number(s.entry);
  const sl = Number(s.stop_loss);
  const tp = Number(s.take_profit);
  const direction = String(s.direction || "").toLowerCase();
  const valid =
    direction === "buy" ? sl < entry && entry < tp : direction === "sell" ? tp < entry && entry < sl : false;

  if (!s.pair || [entry, sl, tp].some(isNaN) || !valid) {
    throw new Error("The AI returned an invalid trade setup. Try again.");
  }

  return {
    date: todayISO(),
    session,
    type: s.type || "Daily",
    pair: s.pair,
    direction,
    entry,
    stop_loss: sl,
    take_profit: tp,
    confidence: "high",
    rationale: s.rationale || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Is the setup still valid? Compares the live price with the saved levels.
//
// Entry zone = entry +/- 25% of the stop distance. Then:
//   in the zone ........................ ENTER   (setup is active)
//   moved past the zone toward target .. WAIT    (don't chase, wait for pullback)
//                                        ...or INVALID if reward:risk from here < 1:1
//   moved past the zone toward the stop  WAIT    (wait for price to come back)
//                                        ...or INVALID if 60%+ of the way to the stop
//   stop level touched ................. INVALID
//   target already reached ............. INVALID
//   session is over .................... EXPIRED
// ─────────────────────────────────────────────────────────────────────────
function evaluateSetup(signal, price, isCurrent, now) {
  const pair = signal.pair;
  const buy = String(signal.direction).toLowerCase() === "buy";
  const dir = buy ? 1 : -1;
  const E = Number(signal.entry);
  const SL = Number(signal.stop_loss);
  const TP = Number(signal.take_profit);
  const risk = Math.abs(E - SL);
  const reward = Math.abs(TP - E);
  const zone = risk * ZONE_FRACTION;
  const zoneLow = E - zone;
  const zoneHigh = E + zone;
  const p = (v) => fmt(pair, v);
  const base = { zoneLow, zoneHigh, risk, reward };

  if (!isCurrent) {
    return {
      ...base,
      state: "out",
      icon: "✕",
      title: "EXPIRED: this session has ended",
      message: `The ${signal.session} session is over, so this setup is no longer active. Don't open new trades from it.`,
      facts: [],
    };
  }

  if (!price) {
    return {
      ...base,
      state: "wait",
      icon: "…",
      title: "CHECKING: waiting for a live price",
      message: "We can't tell yet whether the setup is still valid. This updates as soon as a price arrives.",
      facts: [],
    };
  }

  const P = Number(price.close);
  const d = dir * (P - E); // + = price moved toward target, - = toward stop
  const inZone = Math.abs(d) <= zone;
  const pipsAway = inZone ? 0 : toPips(pair, Math.abs(d) - zone);
  const facts = [
    ["Live price", p(P)],
    ["From entry zone", inZone ? "In zone" : `${pipsAway.toFixed(1)} pips`],
    ["Session ends in", formatDuration(Math.max(minutesLeftInSession(now), 0))],
  ];
  const zoneText = `${p(zoneLow)} – ${p(zoneHigh)}`;
  const side = buy ? "BUY" : "SELL";

  if (d <= -risk) {
    return {
      ...base, facts, state: "out", icon: "✕",
      title: "INVALID: stop loss level reached",
      message: `Price has hit ${p(SL)}, the level where this setup fails. Don't enter. Wait for the next session's signal.`,
    };
  }

  if (d >= reward) {
    return {
      ...base, facts, state: "out", icon: "✕",
      title: "INVALID: target already reached",
      message: `Price has already reached ${p(TP)}. The move is done, so entering now would be chasing. Wait for the next signal.`,
    };
  }

  if (inZone) {
    return {
      ...base, facts, state: "enter", icon: "✓",
      title: `VALID: price is in the entry zone, ${side} now`,
      message: `Price is inside the entry zone (${zoneText}). The setup is active. Enter with the stop at ${p(SL)} and the target at ${p(TP)}.`,
    };
  }

  if (d > zone) {
    const remReward = reward - d;
    const remRisk = risk + d;
    if (remReward / remRisk < 1) {
      return {
        ...base, facts, state: "out", icon: "✕",
        title: "INVALID: too late to enter",
        message: `Price has run ${pipsAway.toFixed(1)} pips past the entry zone. From here the risk is bigger than the reward, so the setup no longer makes sense. Skip it.`,
      };
    }
    return {
      ...base, facts, state: "wait", icon: "!",
      title: "WAIT: price has moved away from entry",
      message: `Price is ${pipsAway.toFixed(1)} pips ${buy ? "above" : "below"} the entry zone. Don't chase it. The setup stays valid if price pulls back into ${zoneText} before reaching ${p(TP)}.`,
    };
  }

  // d < -zone: price is on the wrong side of the entry zone
  if (d <= -0.6 * risk) {
    return {
      ...base, facts, state: "out", icon: "✕",
      title: "INVALID: price is too close to the stop",
      message: `Price has moved ${pipsAway.toFixed(1)} pips against the setup and is close to ${p(SL)}. The idea is failing. Skip it.`,
    };
  }
  return {
    ...base, facts, state: "wait", icon: "!",
    title: "WAIT: price is on the wrong side of entry",
    message: `Price is ${pipsAway.toFixed(1)} pips ${buy ? "below" : "above"} the entry zone. Wait for it to return to ${zoneText} before entering. If it reaches ${p(SL)} the setup is cancelled.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Economic calendar — NFP, CPI, and FOMC dates.
//
// NFP is ALWAYS the first Friday of the month (8:30 AM ET), so it is
// computed and never goes stale. CPI and FOMC dates are announced
// individually, so they stay in the manual list below. Add rows from
// bls.gov/schedule/news_release/cpi.htm and
// federalreserve.gov/monetarypolicy/fomccalendars.htm when it runs short.
// ─────────────────────────────────────────────────────────────────────────

function firstFridayOfMonth(year, monthIndexZeroBased) {
  const d = new Date(year, monthIndexZeroBased, 1);
  const dayOfWeek = d.getDay();
  const offsetToFriday = (5 - dayOfWeek + 7) % 7;
  d.setDate(1 + offsetToFriday);
  return d;
}

function generateNfpEvents(monthsAhead = 18) {
  const events = [];
  const now = new Date();
  for (let i = 0; i < monthsAhead; i++) {
    const targetMonth = now.getMonth() + i;
    const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
    const monthIndex = ((targetMonth % 12) + 12) % 12;
    const friday = firstFridayOfMonth(targetYear, monthIndex);

    const refDate = new Date(targetYear, monthIndex - 1, 1);
    const refMonth = refDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    events.push({
      name: "NFP (Jobs Report)",
      type: "NFP",
      date: friday.toISOString().slice(0, 10),
      refMonth,
    });
  }
  return events;
}

const MANUAL_NEWS_EVENTS = [
  // CPI (8:30 AM ET, ~second week of the month)
  { name: "CPI (Inflation)", type: "CPI", date: "2026-08-12", refMonth: "July 2026" },
  { name: "CPI (Inflation)", type: "CPI", date: "2026-09-11", refMonth: "August 2026" },
  { name: "CPI (Inflation)", type: "CPI", date: "2026-10-14", refMonth: "September 2026" },
  { name: "CPI (Inflation)", type: "CPI", date: "2026-11-10", refMonth: "October 2026" },
  { name: "CPI (Inflation)", type: "CPI", date: "2026-12-10", refMonth: "November 2026" },
  { name: "CPI (Inflation)", type: "CPI", date: "2027-01-13", refMonth: "December 2026" },
  { name: "CPI (Inflation)", type: "CPI", date: "2027-02-11", refMonth: "January 2027" },

  // FOMC rate decision (2:00 PM ET, second day of the meeting)
  { name: "FOMC Rate Decision", type: "FOMC", date: "2026-09-16", refMonth: "Sep 15–16 meeting" },
  { name: "FOMC Rate Decision", type: "FOMC", date: "2026-10-28", refMonth: "Oct 27–28 meeting" },
  { name: "FOMC Rate Decision", type: "FOMC", date: "2026-12-09", refMonth: "Dec 8–9 meeting" },
  { name: "FOMC Rate Decision", type: "FOMC", date: "2027-01-27", refMonth: "Jan 26–27 meeting" },
  { name: "FOMC Rate Decision", type: "FOMC", date: "2027-03-17", refMonth: "Mar 16–17 meeting" },
];

const EVENT_TIME_ET = {
  NFP: "08:30:00-05:00",
  CPI: "08:30:00-05:00",
  FOMC: "14:00:00-05:00",
};

const EVENT_LABEL_TIME = {
  NFP: "8:30 AM ET",
  CPI: "8:30 AM ET",
  FOMC: "2:00 PM ET",
};

function getUpcomingEvents() {
  const now = new Date();
  const allEvents = [...generateNfpEvents(18), ...MANUAL_NEWS_EVENTS];

  return allEvents
    .map((e) => {
      const eventDate = new Date(`${e.date}T${EVENT_TIME_ET[e.type]}`);
      const diffMs = eventDate - now;
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return { ...e, eventDate, daysUntil };
    })
    .filter((e) => e.eventDate >= now)
    .sort((a, b) => a.eventDate - b.eventDate);
}

function formatEventDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function EconomicCalendar() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    setEvents(getUpcomingEvents().slice(0, 4));
    const id = setInterval(() => {
      setEvents(getUpcomingEvents().slice(0, 4));
    }, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="econ-calendar">
      <div className="econ-calendar-header">
        <h2>Economic Calendar</h2>
        <span className="econ-calendar-sub">NFP, CPI &amp; FOMC — high-impact USD events</span>
      </div>
      <div className="econ-calendar-list">
        {events.map((e) => {
          const isHighImpact = e.daysUntil <= 2;
          return (
            <div
              className={`econ-event ${isHighImpact ? "econ-event-soon" : ""}`}
              key={`${e.type}-${e.date}`}
            >
              <span className={`econ-badge econ-badge-${e.type.toLowerCase()}`}>
                {e.type}
              </span>
              <div className="econ-event-info">
                <span className="econ-event-name">{e.name}</span>
                <span className="econ-event-ref">
                  {e.type === "FOMC" ? e.refMonth : `Data for ${e.refMonth}`}
                </span>
              </div>
              <div className="econ-event-date">
                <span className="econ-event-day">{formatEventDate(e.eventDate)}</span>
                <span className="econ-event-time">{EVENT_LABEL_TIME[e.type]}</span>
              </div>
              <span className={`econ-countdown ${isHighImpact ? "soon" : ""}`}>
                {e.daysUntil === 0
                  ? "Today"
                  : e.daysUntil === 1
                  ? "Tomorrow"
                  : `In ${e.daysUntil}d`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Price ladder: stop, entry zone, target and where the live price is now.
function Ladder({ signal, price, ev }) {
  const SL = Number(signal.stop_loss);
  const TP = Number(signal.take_profit);
  const E = Number(signal.entry);
  const P = price ? Number(price.close) : null;

  const values = [SL, TP, ev.zoneLow, ev.zoneHigh, ...(P !== null ? [P] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08 || 0.0001;
  const lo = min - pad;
  const hi = max + pad;
  const pct = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  return (
    <div className="ladder">
      <div className="ladder-track">
        <div
          className="ladder-zone"
          style={{ left: `${pct(ev.zoneLow)}%`, width: `${pct(ev.zoneHigh) - pct(ev.zoneLow)}%` }}
        />
        <div className="ladder-tick sl" style={{ left: `${pct(SL)}%` }} />
        <div className="ladder-tick tp" style={{ left: `${pct(TP)}%` }} />
        {P !== null && (
          <div className={`ladder-price ${ev.state}`} style={{ left: `${pct(P)}%` }}>
            <b>{fmt(signal.pair, P)}</b>
          </div>
        )}
      </div>
      <div className="ladder-labels">
        <span className="sl" style={{ left: `${pct(SL)}%` }}>SL</span>
        <span className="zone" style={{ left: `${pct(E)}%` }}>ENTRY</span>
        <span className="tp" style={{ left: `${pct(TP)}%` }}>TP</span>
      </div>
    </div>
  );
}

// One signal card, used for both the AI signal and mentor signals.
// Pass `ev` (from evaluateSetup) for the detailed AI version.
function SignalCard({ signal, featured = false, isMentor = false, ev = null, price = null, isLive = true, checkedAt = null }) {
  const direction = String(signal.direction || "").toLowerCase();
  const conf = confidenceInfo(signal.confidence);
  const at = timeOf(signal);
  const pair = signal.pair;
  const detailed = Boolean(ev);
  const buy = direction === "buy";

  const slPips = detailed ? toPips(pair, ev.risk) : 0;
  const tpPips = detailed ? toPips(pair, ev.reward) : 0;
  const rr = detailed && ev.risk > 0 ? ev.reward / ev.risk : 0;

  return (
    <div className={`signal-card ${featured ? "signal-featured" : ""} ${detailed ? `status-${ev.state}` : ""}`}>
      <div className="signal-card-header">
        <span className="signal-type-badge">
          {signal.type ? `${signal.type} · ` : ""}{signal.session}
        </span>
        <span className={`signal-direction ${direction}`}>
          {buy ? "▲ BUY" : "▼ SELL"}
        </span>
      </div>

      <div className="signal-pair">{formatPair(pair)}</div>

      {detailed && (
        <div className={`trade-status ${ev.state}`}>
          <div className="trade-status-top">
            <span className="trade-status-icon">{ev.icon}</span>
            <div>
              <div className="trade-status-title">{ev.title}</div>
              <div className="trade-status-msg">{ev.message}</div>
            </div>
          </div>
          {ev.facts.length > 0 && (
            <div className="trade-status-facts">
              {ev.facts.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <b>{value}</b>
                </div>
              ))}
            </div>
          )}
          {ev.facts.length > 0 && (
            <div className="trade-status-note">
              {isLive
                ? "Checked against the live price feed"
                : "Live feed unavailable. Using the daily reference rate, so this status is approximate"}
              {checkedAt
                ? ` · ${checkedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </div>
          )}
        </div>
      )}

      {detailed && <Ladder signal={signal} price={price} ev={ev} />}

      <div className="signal-levels">
        {detailed && (
          <div className="signal-level">
            <span className="signal-level-label">Entry zone</span>
            <span className="signal-level-value">
              {fmt(pair, ev.zoneLow)} – {fmt(pair, ev.zoneHigh)}
            </span>
          </div>
        )}
        <div className="signal-level">
          <span className="signal-level-label">{detailed ? "Ideal entry" : "Entry"}</span>
          <span className="signal-level-value">{detailed ? fmt(pair, signal.entry) : signal.entry}</span>
        </div>
        <div className="signal-level">
          <span className="signal-level-label">Stop Loss</span>
          <span className="signal-level-value sl">{detailed ? fmt(pair, signal.stop_loss) : signal.stop_loss}</span>
        </div>
        <div className="signal-level">
          <span className="signal-level-label">Take Profit</span>
          <span className="signal-level-value tp">{detailed ? fmt(pair, signal.take_profit) : signal.take_profit}</span>
        </div>
      </div>

      {detailed && (
        <div className="trade-stats">
          <div><span>Risk</span><b>{slPips.toFixed(1)} pips</b></div>
          <div><span>Reward</span><b>{tpPips.toFixed(1)} pips</b></div>
          <div><span>Reward : Risk</span><b>1 : {rr.toFixed(1)}</b></div>
        </div>
      )}

      <div className={`signal-confidence ${conf.level}`}>Confidence: {conf.label}</div>
      <div className="signal-conf-bar">
        <i className={conf.level} style={{ width: `${Math.min(conf.score, 100)}%` }} />
      </div>

      {signal.rationale && <p className="signal-rationale">{signal.rationale}</p>}

      {detailed && (
        <div className="trade-rule">
          Entry rule: {buy ? "buy" : "sell"} only while price is between {fmt(pair, ev.zoneLow)} and{" "}
          {fmt(pair, ev.zoneHigh)}. Cancel the setup if price touches {fmt(pair, signal.stop_loss)} or reaches{" "}
          {fmt(pair, signal.take_profit)} before you are in, or when the {signal.session} session ends at{" "}
          {SESSION_WINDOWS[signal.session]?.endLabel || ""} (SA time).
        </div>
      )}

      <div className="signal-posted">
        <span className={`signal-source ${isMentor ? "mentor" : "ai"}`}>
          {isMentor ? signal.mentor_name || "Mentor" : "AI"}
        </span>
        {at ? ` · ${at}` : ""}
      </div>
    </div>
  );
}

export default function SignalsPage({ priceData = [] }) {
  const [signals, setSignals] = useState([]); // AI signals (public.signals)
  const [loading, setLoading] = useState(true);
  const [mentorSignals, setMentorSignals] = useState([]); // public.mentor_signals
  const [mentorLoading, setMentorLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentSession, setCurrentSession] = useState(getCurrentSession());
  const [activeSession, setActiveSession] = useState(getCurrentSession());
  const [manualPick, setManualPick] = useState(false);
  const [marketClosed, setMarketClosed] = useState(isMarketClosed());
  const [generatingFor, setGeneratingFor] = useState(null);
  const [genErrors, setGenErrors] = useState({});
  const [priceWaitDone, setPriceWaitDone] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [dayKey, setDayKey] = useState(todayISO());
  const [fallbackPrices, setFallbackPrices] = useState([]);
  const [checkedAt, setCheckedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const triedRef = useRef(new Set()); // "date-session" keys already generated or in flight this pageload
  const priceDataRef = useRef(priceData);
  const mountedRef = useRef(true);

  priceDataRef.current = priceData;

  // A string key, so the effect below only runs when prices actually change.
  const priceKey = priceData.map((p) => `${p.pair}:${p.close}`).join("|");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Give Landing's live prices a few seconds to arrive before using the fallback.
  useEffect(() => {
    const id = setTimeout(() => setPriceWaitDone(true), PRICE_WAIT_MS);
    return () => clearTimeout(id);
  }, []);

  // Every time a fresh price arrives, note when the setup was last checked.
  useEffect(() => {
    if (priceKey) setCheckedAt(new Date());
  }, [priceKey]);

  // Load today's signals, and reload whenever one is posted or deleted.
  useEffect(() => {
    let cancelled = false;

    const fetchSignals = async () => {
      const { data, error: fetchError } = await supabase
        .from("signals")
        .select("*")
        .eq("date", todayISO())
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) {
        console.error("Error loading signals:", fetchError);
        setError("Couldn't load signals. Please try again.");
      } else {
        setError("");
        setSignals(data || []);
      }
      setLoading(false);
    };

    fetchSignals();

    const channel = supabase
      .channel("client-signals-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "signals" }, fetchSignals)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [dayKey]);

  // Load mentor-posted signals from the last 24 hours (own table), live.
  useEffect(() => {
    let cancelled = false;

    const fetchMentorSignals = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error: fetchError } = await supabase
        .from("mentor_signals")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (fetchError) console.error("Error loading mentor signals:", fetchError);
      else {
        // Anything posted while the market was closed (weekend) never shows
        setMentorSignals((data || []).filter((s) => !isMarketClosed(new Date(s.created_at))));
      }
      setMentorLoading(false);
    };

    fetchMentorSignals();

    const channel = supabase
      .channel("client-mentor-signals-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "mentor_signals" }, fetchMentorSignals)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Every minute: roll over to the next session (by clock time), refresh the
  // "session ends in" countdown and catch the day changing. If the user picked
  // a tab themselves, we leave their tab alone.
  useEffect(() => {
    const id = setInterval(() => {
      const t = new Date();
      setNow(t);
      setMarketClosed(isMarketClosed(t));
      setDayKey(todayISO());
      const session = getCurrentSession(t);
      setCurrentSession(session);
      if (!manualPick) setActiveSession(session);
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [manualPick]);

  const aiSignal = signals.find((s) => !isMentorSignal(s) && sameSession(s.session, activeSession));
  const hasAi = Boolean(aiSignal);
  const isViewingCurrent = activeSession === currentSession;

  // Daily reference rates, only used for the status when live prices are missing.
  const loadFallback = async () => {
    try {
      const rows = await fetchFallbackPrices();
      if (mountedRef.current) {
        setFallbackPrices(rows);
        setCheckedAt(new Date());
      }
    } catch (err) {
      console.error("Fallback prices failed:", err);
    }
  };

  useEffect(() => {
    if (!hasAi || !priceWaitDone || priceData.length > 0) return;
    loadFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAi, priceWaitDone, priceData.length]);

  // No AI signal for the CURRENT session yet: generate ONE and save it.
  // (Only the current session is generated, so levels always match the market now.)
  useEffect(() => {
    if (marketClosed || loading || hasAi || !isViewingCurrent) return;
    if (priceDataRef.current.length === 0 && !priceWaitDone) return;

    const session = activeSession;
    const key = `${todayISO()}-${session}`;
    if (triedRef.current.has(key)) return;
    triedRef.current.add(key);

    (async () => {
      setGeneratingFor(session);
      setGenErrors((prev) => ({ ...prev, [session]: null }));
      try {
        // Someone else may have generated it a moment ago: use theirs.
        const { data: existing } = await supabase
          .from("signals")
          .select("*")
          .eq("date", todayISO())
          .ilike("session", `${session.slice(0, 4)}%`);
        const found = (existing || []).find((s) => !isMentorSignal(s));
        if (found) {
          if (mountedRef.current) setSignals((prev) => [found, ...prev.filter((s) => s.id !== found.id)]);
          return;
        }

        const prices =
          priceDataRef.current.length > 0 ? priceDataRef.current : await fetchFallbackPrices();

        const upcomingNews = getUpcomingEvents().slice(0, 3).map((e) => ({
          event: e.name,
          date: e.date,
          reference: e.refMonth,
          days_until: e.daysUntil,
        }));

        const row = await generateSessionSignal(session, prices, upcomingNews);

        if (mountedRef.current) setSignals((prev) => [row, ...prev]);

        const { error: insertError } = await supabase.from("signals").insert(row);
        if (insertError) console.error("Failed to save AI signal:", insertError);
      } catch (err) {
        console.error(`AI signal error for ${session}:`, err);
        triedRef.current.delete(key); // allow Retry
        if (mountedRef.current) {
          setGenErrors((prev) => ({
            ...prev,
            [session]: err.message || "Couldn't generate a signal.",
          }));
        }
      } finally {
        if (mountedRef.current) setGeneratingFor((cur) => (cur === session ? null : cur));
      }
    })();
  }, [marketClosed, loading, hasAi, activeSession, isViewingCurrent, priceWaitDone, retryTick]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (priceDataRef.current.length === 0) await loadFallback();
      else await sleep(500);
    } finally {
      if (mountedRef.current) {
        setCheckedAt(new Date());
        setRefreshing(false);
      }
    }
  };

  const generating = generatingFor === activeSession;
  const genError = genErrors[activeSession];

  const isLive = priceData.length > 0;
  const prices = isLive ? priceData : fallbackPrices;
  const pairKey = aiSignal ? normPair(aiSignal.pair) : "";
  const livePrice = aiSignal ? prices.find((p) => normPair(p.pair) === pairKey) || null : null;

  const signalIsCurrent = aiSignal ? sameSession(aiSignal.session, currentSession) : false;
  const ev = aiSignal ? evaluateSetup(aiSignal, livePrice, signalIsCurrent, now) : null;

  const activeIdx = SESSIONS.indexOf(activeSession);
  const currentIdx = SESSIONS.indexOf(currentSession);

  return (
    <div className="signals-page">
      <div className="signals-header">
        <h1>Daily Signals</h1>
        <span className="live-badge">● Generated Today</span>
      </div>

      <div className="disclaimer-banner">
        ⚠️ Signals come from Blue Chip mentors or are AI-generated, for
        educational purposes only. They are not financial advice and are not
        guaranteed to be accurate or profitable. Trade at your own risk.
      </div>

      <EconomicCalendar />

      {marketClosed ? (
        <div className="market-closed">
          <div className="market-closed-icon">🌙</div>
          <h2>Markets are closed</h2>
          <p>
            Forex is closed for the weekend, so there are no signals right now.
            Signals return when the market opens on {nextOpenLabel()}.
          </p>
        </div>
      ) : (
      <>
      {/* ── 1. AI SIGNAL ─────────────────────────────────────────── */}
      <section className="signals-section">
        <div className="section-title-row">
          <h2 className="section-title">
            AI Signal
            <span className="section-sub">
              One setup per session · Asia 02:00–09:00 · London 09:00–15:30 · New York 15:30–00:00 (SA time)
            </span>
          </h2>

          <div className="signal-controls">
            <div className="session-tabs">
              {SESSIONS.map((s) => (
                <button
                  key={s}
                  className={`session-tab ${activeSession === s ? "active" : ""}`}
                  title={`${SESSION_WINDOWS[s].startLabel} – ${SESSION_WINDOWS[s].endLabel}`}
                  onClick={() => {
                    setActiveSession(s);
                    setManualPick(s !== currentSession);
                  }}
                >
                  {s}
                  {s === currentSession && <span className="session-now"> · Now</span>}
                </button>
              ))}
            </div>

            {aiSignal && signalIsCurrent && (
              <div className="refresh-wrap">
                <button
                  className={`refresh-btn ${refreshing ? "spinning" : ""}`}
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <span className="refresh-icon">↻</span>
                  <span className="refresh-text">{refreshing ? "Checking…" : "Check status"}</span>
                </button>
                {checkedAt && (
                  <span className="refresh-time">
                    {checkedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {loading && <div className="signals-status">Loading signal…</div>}

        {!loading && error && !aiSignal && (
          <div className="signals-status signals-error">{error}</div>
        )}

        {/* Other tabs: no signal saved */}
        {!loading && !aiSignal && !isViewingCurrent && activeIdx > currentIdx && (
          <div className="signals-status">
            The {activeSession} session opens at {SESSION_WINDOWS[activeSession].startLabel} (SA time).
            Its signal is generated when the session starts.
          </div>
        )}

        {!loading && !aiSignal && !isViewingCurrent && activeIdx < currentIdx && (
          <div className="signals-status">
            No signal was generated for the {activeSession} session today.
          </div>
        )}

        {/* Current session: generating */}
        {!loading && !aiSignal && isViewingCurrent && generating && (
          <div className="signals-status">Generating {activeSession} signal…</div>
        )}

        {!loading && !aiSignal && isViewingCurrent && !generating && !genError && (
          <div className="signals-status">Getting ready to generate the {activeSession} signal…</div>
        )}

        {!loading && !aiSignal && isViewingCurrent && !generating && genError && (
          <div className="signals-status signals-error">
            {genError}
            <div style={{ marginTop: 10 }}>
              <button
                className="admin-btn ghost"
                onClick={() => {
                  triedRef.current.delete(`${todayISO()}-${activeSession}`);
                  setGenErrors((prev) => ({ ...prev, [activeSession]: null }));
                  setRetryTick((t) => t + 1);
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && aiSignal && (
          <div className="signal-grid">
            <SignalCard
              signal={aiSignal}
              featured
              ev={ev}
              price={livePrice}
              isLive={isLive}
              checkedAt={checkedAt}
            />
          </div>
        )}
      </section>

      {/* ── 2. MENTOR SIGNALS ───────────────────────────────────── */}
      <section className="signals-section">
        <div className="section-title-row">
          <h2 className="section-title">
            Mentor Signals
            <span className="section-sub">Posted by our mentors in the last 24 hours</span>
          </h2>
        </div>

        {mentorLoading && <div className="signals-status">Loading mentor signals…</div>}

        {!mentorLoading && mentorSignals.length === 0 && (
          <div className="signals-status">No mentor signals posted yet. Check back soon.</div>
        )}

        {!mentorLoading && mentorSignals.length > 0 && (
          <div className="mentor-grid">
            {mentorSignals.map((s) => (
              <SignalCard key={s.id} signal={s} isMentor />
            ))}
          </div>
        )}
      </section>
      </>
      )}
    </div>
  );
}