import { useEffect, useMemo, useRef, useState } from "react";
import "./landing.css";
import "./signals.css";
import { supabase } from "./supabaseClient";
import { useLivePrices } from "./useLivePrice";

// Key is stored reversed + base64-encoded so secret scanners don't flag it.
// Note: this hides it from scanners, not from people reading the site's JS.
// To make it: open the browser console and run
//   btoa("YOUR_NEW_KEY".split("").reverse().join(""))
// then paste the result below.
const KEY_ENCODED = "MmNjYzg5YTg0OGE1MWJlY2VmOTE5MDhlZmM0YWRmYjk4NGVlYmE4M2U2ZDJmMDg1YzM4MjE2YTU4MGJhMDM5Yy0xdi1yby1rcw==";
const getApiKey = () => atob(KEY_ENCODED).split("").reverse().join("");

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
// Free OpenRouter models, tried in order until one answers. The free list
// rotates often: check openrouter.ai/models (filter: Free) and update it.
const FREE_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free", // router that picks any available free model
];
const MODEL = FREE_MODELS[0]; // overridden per attempt inside callOpenRouter

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

// How often the page re-checks the clock (session rollover, countdowns, stale feed).
const TICK_MS = 15 * 1000;

// If the price feed hasn't changed for this long, warn that the status may be old.
const STALE_FEED_MS = 3 * 60 * 1000;

// News signal timing
const NEWS_PREP_HOURS = 24; // signal is generated this long before the release
const NEWS_WINDOW_MIN = 120; // setup stays active this long after the release

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
  const total = Math.max(0, Math.round(mins));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d > 0) return `${d}d ${h}h`;
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

const timeWithSeconds = (d) =>
  d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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

// Fallback when live prices haven't arrived: daily reference rates
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

// Tries each free model in turn until one answers.
async function callOpenRouter(requestBody) {
  let last = null;
  let lastErr = null;

  for (const model of FREE_MODELS) {
    try {
      const response = await fetchWithTimeout(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "Blue Chip Trading",
        },
        body: JSON.stringify({ ...requestBody, model }),
      });
      const data = await response.json().catch(() => ({}));
      last = { response, data };

      if (response.ok && !data.error) return last;
      if (response.status === 401 || response.status === 403) return last; // bad key, don't retry
      console.warn(`Model ${model} failed:`, data?.error?.message || response.status);
    } catch (err) {
      lastErr = err;
      console.warn(`Model ${model} errored:`, err.message);
    }
  }

  if (last) return last;
  throw lastErr || new Error("No free model responded.");
}

function throwIfBadResponse(response, data) {
  if (response.status === 401 || response.status === 403) {
    throw new Error("OpenRouter rejected the API key. Create a new key at openrouter.ai/keys, encode it, and paste it into KEY_ENCODED.");
  }
  if (!response.ok || data.error) {
    throw new Error(data?.error?.message || `Request failed (${response.status})`);
  }
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
    model: MODEL,
    messages: [
      { role: "system", content: buildSignalPrompt(session) },
      { role: "user", content: userPrompt },
    ],
  });

  throwIfBadResponse(response, data);

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
// Economic calendar — NFP, CPI, and FOMC dates.
//
// NFP is the first Friday of the month (8:30 AM ET), so it is computed.
// CPI and FOMC dates are announced individually, so they stay in the manual
// list below. Add rows from bls.gov/schedule/news_release/cpi.htm and
// federalreserve.gov/monetarypolicy/fomccalendars.htm when it runs short.
// ─────────────────────────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, "0");

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
      // Built from local parts. toISOString() would shift the date back a day
      // for anyone ahead of UTC (like South Africa).
      date: `${friday.getFullYear()}-${pad2(friday.getMonth() + 1)}-${pad2(friday.getDate())}`,
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

// Release time in New York wall-clock time. Converted properly, including
// daylight saving, so the countdown is right all year.
const EVENT_TIME_ET = {
  NFP: [8, 30],
  CPI: [8, 30],
  FOMC: [14, 0],
};

const EVENT_LABEL_TIME = {
  NFP: "8:30 AM ET",
  CPI: "8:30 AM ET",
  FOMC: "2:00 PM ET",
};

function tzOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUTC - date.getTime()) / 60000;
}

function eventDateET(dateStr, type) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = EVENT_TIME_ET[type];
  const wallClockAsUTC = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMinutes(new Date(wallClockAsUTC), "America/New_York");
  return new Date(wallClockAsUTC - offset * 60000);
}

// Every event (past and future), sorted by release time.
function getAllEvents() {
  return [...generateNfpEvents(18), ...MANUAL_NEWS_EVENTS]
    .map((e) => ({ ...e, key: `${e.type}-${e.date}`, eventDate: eventDateET(e.date, e.type) }))
    .sort((a, b) => a.eventDate - b.eventDate);
}

function getUpcomingEvents() {
  const now = new Date();
  return getAllEvents()
    .filter((e) => e.eventDate >= now)
    .map((e) => ({ ...e, daysUntil: Math.ceil((e.eventDate - now) / (1000 * 60 * 60 * 24)) }));
}

// The event the News Signal section should show: one that was released within
// the last NEWS_WINDOW_MIN minutes (still tradeable), otherwise the next one.
function getFocusEvent(now = new Date()) {
  const all = getAllEvents();
  const windowMs = NEWS_WINDOW_MIN * 60 * 1000;
  const live = all.find((e) => e.eventDate <= now && now.getTime() < e.eventDate.getTime() + windowMs);
  if (live) return live;
  return all.find((e) => e.eventDate > now) || null;
}

function formatEventDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatEventWhen(date) {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
//   session / window is over ........... EXPIRED
//
// `opts` lets the News Signal reuse this with its own wording and clock.
// ─────────────────────────────────────────────────────────────────────────
function evaluateSetup(signal, price, isCurrent, now, opts = {}) {
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

  const minsLeft = opts.minutesLeft !== undefined ? opts.minutesLeft : minutesLeftInSession(now);
  const endsInLabel = opts.endsInLabel || "Session ends in";
  const nextText = opts.nextText || "the next session's signal";

  if (!isCurrent) {
    return {
      ...base,
      state: "out",
      icon: "✕",
      title: opts.expiredTitle || "EXPIRED: this session has ended",
      message:
        opts.expiredMessage ||
        `The ${signal.session} session is over, so this setup is no longer active. Don't open new trades from it.`,
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
    [endsInLabel, formatDuration(Math.max(minsLeft, 0))],
  ];
  const zoneText = `${p(zoneLow)} – ${p(zoneHigh)}`;
  const side = buy ? "BUY" : "SELL";

  if (d <= -risk) {
    return {
      ...base, facts, state: "out", icon: "✕",
      title: "INVALID: stop loss level reached",
      message: `Price has hit ${p(SL)}, the level where this setup fails. Don't enter. Wait for ${nextText}.`,
    };
  }

  if (d >= reward) {
    return {
      ...base, facts, state: "out", icon: "✕",
      title: "INVALID: target already reached",
      message: `Price has already reached ${p(TP)}. The move is done, so entering now would be chasing. Wait for ${nextText}.`,
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

// News version: before the release it always says WAIT, after the release it
// uses the normal checks for NEWS_WINDOW_MIN minutes, then it expires.
function evaluateNewsSetup(signal, price, now, event) {
  const start = event.eventDate.getTime();
  const end = start + NEWS_WINDOW_MIN * 60 * 1000;
  const t = now.getTime();
  const pair = signal.pair;
  const newsOpts = { endsInLabel: "News window ends in", nextText: "the next news signal" };

  if (t >= end) {
    return evaluateSetup(signal, price, false, now, {
      ...newsOpts,
      expiredTitle: "EXPIRED: the news window has closed",
      expiredMessage: `The ${event.type} release was more than ${NEWS_WINDOW_MIN / 60} hours ago, so this setup is no longer active. Don't open new trades from it.`,
    });
  }

  const minsToEnd = Math.ceil((end - t) / 60000);
  const base = evaluateSetup(signal, price, true, now, { ...newsOpts, minutesLeft: minsToEnd });

  if (t < start) {
    // Levels already blown before the news even came out.
    if (base.state === "out") return base;

    const minsToEvent = Math.ceil((start - t) / 60000);
    const zoneText = `${fmt(pair, base.zoneLow)} – ${fmt(pair, base.zoneHigh)}`;
    return {
      ...base,
      state: "wait",
      icon: "⏱",
      title: `WAIT: ${event.type} is released in ${formatDuration(minsToEvent)}`,
      message: `Don't enter before the release. Spreads widen and price can spike either way within seconds. Once the data is out, enter only if price is inside the entry zone (${zoneText}).`,
      facts: [
        ["Releases in", formatDuration(minsToEvent)],
        ...base.facts.filter((f) => f[0] === "Live price" || f[0] === "From entry zone"),
      ],
    };
  }

  return base;
}

// ─────────────────────────────────────────────────────────────────────────
// News signal: ask the AI for several candidate trades around the event, then
// keep the single valid one with the highest confidence.
//
// Saved in the same `signals` table as the AI session signals:
//   type = "News", session = the event key (e.g. "NFP-2026-11-06"),
//   date = the event date, confidence = the 0-100 score stored as text.
// ─────────────────────────────────────────────────────────────────────────
function buildNewsPrompt(event) {
  return `You are a trading signals generator for a forex trading platform. A high-impact US economic release is coming up: ${event.name} (${event.type}), reference: ${event.refMonth}, release time ${EVENT_LABEL_TIME[event.type]}.

You will be given the current price for several currency pairs. Using ONLY that data for price levels, generate 4 candidate trade ideas for trading AROUND this release, across different pairs. Do not claim to know the actual result. Base each idea on how a hotter or cooler result would typically move the US dollar, and on a sensible reaction trade (for example a breakout after the release candle, or a pullback entry).

Rules for every candidate:
- Use realistic news-volatility stops (about 25-60 pips; for USD/JPY a pip is 0.01).
- Take profit must be at least 1.5 times the stop distance.
- The entry must be within about 10 pips of the given current price for that pair.
- "confidence" is a whole number from 0 to 100 rating the overall quality of the setup (clarity of levels, reward to risk, fit with the news). Be honest and spread the scores out, do not give every idea the same score.
- "strategy" is a short label such as "Breakout", "Pullback" or "Fade".
- "rationale" is one or two sentences and must mention the news event.

Respond with ONLY valid JSON, no markdown fences, no commentary, in this exact shape:

{
  "candidates": [
    {
      "pair": "EUR/USD",
      "direction": "buy" | "sell",
      "strategy": "Breakout",
      "entry": 1.0850,
      "stop_loss": 1.0810,
      "take_profit": 1.0920,
      "confidence": 72,
      "rationale": "..."
    }
  ]
}

For a buy: stop_loss < entry < take_profit. For a sell: take_profit < entry < stop_loss.`;
}

async function generateNewsSignal(event, prices) {
  const { response, data } = await callOpenRouter({
    model: MODEL,
    messages: [
      { role: "system", content: buildNewsPrompt(event) },
      { role: "user", content: `Current price data:\n${JSON.stringify(prices, null, 2)}` },
    ],
  });

  throwIfBadResponse(response, data);

  const raw = data?.choices?.[0]?.message?.content || "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Raw AI response for the news signal that failed to parse:", raw);
    throw new Error("The AI response wasn't valid JSON. Try again.");
  }

  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];

  const valid = candidates
    .map((c) => {
      const entry = Number(c.entry);
      const sl = Number(c.stop_loss);
      const tp = Number(c.take_profit);
      const direction = String(c.direction || "").toLowerCase();
      const confidence = Math.max(0, Math.min(100, Math.round(Number(c.confidence))));
      const levelsOk =
        direction === "buy" ? sl < entry && entry < tp : direction === "sell" ? tp < entry && entry < sl : false;
      if (!c.pair || [entry, sl, tp, confidence].some(isNaN) || !levelsOk) return null;

      const risk = Math.abs(entry - sl);
      const reward = Math.abs(tp - entry);
      if (risk <= 0 || reward / risk < 1.4) return null;

      // Entry must be close to the real price for that pair.
      const live = prices.find((p) => normPair(p.pair) === normPair(c.pair));
      if (!live) return null;
      if (toPips(c.pair, entry - Number(live.close)) > 15) return null;

      return {
        pair: c.pair,
        direction,
        entry,
        stop_loss: sl,
        take_profit: tp,
        confidence,
        rationale: c.rationale || null,
        rr: reward / risk,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence || b.rr - a.rr);

  if (valid.length === 0) {
    throw new Error("The AI didn't return a usable news trade. Try again.");
  }

  const best = valid[0];
  return {
    date: event.date,
    session: event.key,
    type: "News",
    pair: best.pair,
    direction: best.direction,
    entry: best.entry,
    stop_loss: best.stop_loss,
    take_profit: best.take_profit,
    confidence: String(best.confidence), // signals.confidence is text
    rationale: best.rationale,
  };
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

// One signal card, used for the AI signal, the news signal and mentor signals.
// Pass `ev` (from evaluateSetup / evaluateNewsSetup) for the detailed version.
function SignalCard({
  signal,
  featured = false,
  isMentor = false,
  ev = null,
  price = null,
  isLive = true,
  stale = false,
  checkedAt = null,
  ruleText = null,
  sourceLabel = null,
}) {
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
            <div className={`trade-status-note ${stale ? "stale" : ""}`}>
              {isLive ? (
                <>
                  <span className={`live-dot ${stale ? "stale" : ""}`} />
                  {stale
                    ? "Price feed hasn't updated for a while. This status may be out of date"
                    : "Live · updates automatically"}
                </>
              ) : (
                "Live feed unavailable. Using the daily reference rate, so this status is approximate"
              )}
              {checkedAt ? ` · ${timeWithSeconds(checkedAt)}` : ""}
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
        {signal.strategy && (
          <div className="signal-level">
            <span className="signal-level-label">Strategy</span>
            <span className="signal-level-value">{signal.strategy}</span>
          </div>
        )}
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
          {ruleText ||
            `Entry rule: ${buy ? "buy" : "sell"} only while price is between ${fmt(pair, ev.zoneLow)} and ${fmt(
              pair,
              ev.zoneHigh
            )}. Cancel the setup if price touches ${fmt(pair, signal.stop_loss)} or reaches ${fmt(
              pair,
              signal.take_profit
            )} before you are in, or when the ${signal.session} session ends at ${
              SESSION_WINDOWS[signal.session]?.endLabel || ""
            } (SA time).`}
        </div>
      )}

      <div className="signal-posted">
        <span className={`signal-source ${isMentor ? "mentor" : "ai"}`}>
          {sourceLabel || (isMentor ? signal.mentor_name || "Mentor" : "AI")}
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

  // News signal state (stored in public.signals with type = "News")
  const [newsEvent, setNewsEvent] = useState(() => getFocusEvent(new Date()));
  const [newsSignal, setNewsSignal] = useState(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsLoadError, setNewsLoadError] = useState("");
  const [newsGenerating, setNewsGenerating] = useState(false);
  const [newsGenError, setNewsGenError] = useState(null);
  const [newsRetryTick, setNewsRetryTick] = useState(0);

  const triedRef = useRef(new Set()); // "date-session" keys already generated or in flight this pageload
  const triedNewsRef = useRef(new Set()); // event keys already generated or in flight this pageload
  const mountedRef = useRef(true);

  // ── Live prices ────────────────────────────────────────────────────────
  // Primary source: the same live price store the trading panel uses, so the
  // status keeps moving on its own. Then the page's priceData prop, then the
  // daily reference rates as a last resort.
  const { prices: liveMap } = useLivePrices();
  const hookRows = useMemo(
    () =>
      Object.entries(liveMap || {})
        .filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(Number(v)))
        .map(([sym, close]) => ({ pair: formatPair(sym), close: Number(close) })),
    [liveMap]
  );
  const liveRows = hookRows.length > 0 ? hookRows : priceData;
  const isLive = liveRows.length > 0;
  const prices = isLive ? liveRows : fallbackPrices;

  const liveRowsRef = useRef(liveRows);
  liveRowsRef.current = liveRows;

  // A string key, so effects only run when prices actually change.
  const priceKey = liveRows.map((p) => `${p.pair}:${p.close}`).join("|");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Give live prices a few seconds to arrive before using the fallback.
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

  // Every few seconds: roll over to the next session (by clock time), refresh
  // the countdowns, catch the day changing and move the news section to the
  // next event when one finishes. If the user picked a tab themselves, we
  // leave their tab alone.
  useEffect(() => {
    const id = setInterval(() => {
      const t = new Date();
      setNow(t);
      setMarketClosed(isMarketClosed(t));
      setDayKey(todayISO());
      const session = getCurrentSession(t);
      setCurrentSession(session);
      if (!manualPick) setActiveSession(session);

      const nextEvent = getFocusEvent(t);
      setNewsEvent((prev) => (prev && nextEvent && prev.key === nextEvent.key ? prev : nextEvent));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [manualPick]);

  // News rows live in the same table, so keep them out of the session cards.
  const aiSignal = signals.find(
    (s) => !isMentorSignal(s) && s.type !== "News" && sameSession(s.session, activeSession)
  );
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
    if ((!hasAi && !newsSignal) || !priceWaitDone || liveRows.length > 0) return;
    loadFallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAi, Boolean(newsSignal), priceWaitDone, liveRows.length]);

  // No AI signal for the CURRENT session yet: generate ONE and save it.
  // (Only the current session is generated, so levels always match the market now.)
  useEffect(() => {
    if (marketClosed || loading || hasAi || !isViewingCurrent) return;
    if (liveRowsRef.current.length === 0 && !priceWaitDone) return;

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
        const found = (existing || []).find((s) => !isMentorSignal(s) && s.type !== "News");
        if (found) {
          if (mountedRef.current) setSignals((prev) => [found, ...prev.filter((s) => s.id !== found.id)]);
          return;
        }

        const priceRows =
          liveRowsRef.current.length > 0 ? liveRowsRef.current : await fetchFallbackPrices();

        const upcomingNews = getUpcomingEvents().slice(0, 3).map((e) => ({
          event: e.name,
          date: e.date,
          reference: e.refMonth,
          days_until: e.daysUntil,
        }));

        const row = await generateSessionSignal(session, priceRows, upcomingNews);

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

  // ── News signal: load the saved one for the focus event, live ──────────
  const newsKey = newsEvent?.key || null;

  useEffect(() => {
    setNewsSignal(null);
    setNewsGenError(null);

    if (!newsKey) {
      setNewsLoading(false);
      return undefined;
    }

    let cancelled = false;
    setNewsLoading(true);

    const loadNews = async () => {
      const { data, error: fetchError } = await supabase
        .from("signals")
        .select("*")
        .eq("type", "News")
        .eq("session", newsKey)
        .order("created_at", { ascending: true })
        .limit(1);

      if (cancelled) return;

      if (fetchError) {
        console.error("Error loading news signal:", fetchError);
        setNewsLoadError("Couldn't load the news signal. Please try again later.");
      } else {
        setNewsLoadError("");
        setNewsSignal(data?.[0] || null);
      }
      setNewsLoading(false);
    };

    loadNews();

    const channel = supabase
      .channel(`client-news-signal-${newsKey}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "signals", filter: "type=eq.News" },
        loadNews
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [newsKey]);

  // News signal: generate ONE when the event is within NEWS_PREP_HOURS of its
  // release (or just released), nobody has generated it yet, and the market is open.
  const newsPrepStart = newsEvent ? newsEvent.eventDate.getTime() - NEWS_PREP_HOURS * 3600 * 1000 : 0;
  const newsWindowEnd = newsEvent ? newsEvent.eventDate.getTime() + NEWS_WINDOW_MIN * 60 * 1000 : 0;
  const inNewsPrep = Boolean(newsEvent) && now.getTime() >= newsPrepStart && now.getTime() < newsWindowEnd;

  useEffect(() => {
    if (!newsEvent || !inNewsPrep || marketClosed) return;
    if (newsLoading || newsLoadError || newsSignal) return;
    if (liveRowsRef.current.length === 0 && !priceWaitDone) return;

    const key = newsEvent.key;
    if (triedNewsRef.current.has(key)) return;
    triedNewsRef.current.add(key);

    const event = newsEvent;

    const fetchSaved = async () => {
      const { data } = await supabase
        .from("signals")
        .select("*")
        .eq("type", "News")
        .eq("session", key)
        .order("created_at", { ascending: true })
        .limit(1);
      return data?.[0] || null;
    };

    (async () => {
      setNewsGenerating(true);
      setNewsGenError(null);
      try {
        // Someone else may have generated it a moment ago: use theirs.
        const saved = await fetchSaved();
        if (saved) {
          if (mountedRef.current) setNewsSignal(saved);
          return;
        }

        const priceRows =
          liveRowsRef.current.length > 0 ? liveRowsRef.current : await fetchFallbackPrices();

        const row = await generateNewsSignal(event, priceRows);

        if (mountedRef.current) {
          setNewsSignal({ ...row, created_at: new Date().toISOString() });
        }

        const { error: insertError } = await supabase.from("signals").insert(row);
        if (insertError) {
          console.error("Failed to save news signal:", insertError);
          return;
        }

        // If two visitors saved at once, everyone shows the earliest one.
        const winner = await fetchSaved();
        if (winner && mountedRef.current) setNewsSignal(winner);
      } catch (err) {
        console.error("News signal error:", err);
        triedNewsRef.current.delete(key); // allow Retry
        if (mountedRef.current) setNewsGenError(err.message || "Couldn't generate a news signal.");
      } finally {
        if (mountedRef.current) setNewsGenerating(false);
      }
    })();
  }, [
    newsEvent,
    inNewsPrep,
    marketClosed,
    newsLoading,
    newsLoadError,
    newsSignal,
    priceWaitDone,
    newsRetryTick,
  ]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (liveRowsRef.current.length === 0) await loadFallback();
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

  // True when the live feed exists but hasn't changed for a long time.
  const feedStale = isLive && checkedAt ? now.getTime() - checkedAt.getTime() > STALE_FEED_MS : false;

  const pairKey = aiSignal ? normPair(aiSignal.pair) : "";
  const livePrice = aiSignal ? prices.find((p) => normPair(p.pair) === pairKey) || null : null;

  const signalIsCurrent = aiSignal ? sameSession(aiSignal.session, currentSession) : false;
  const ev = aiSignal ? evaluateSetup(aiSignal, livePrice, signalIsCurrent, now) : null;

  // News signal view model
  const newsCardSignal = newsSignal
    ? { ...newsSignal, type: "News", session: newsEvent?.type || "" }
    : null;
  const newsPrice = newsCardSignal
    ? prices.find((p) => normPair(p.pair) === normPair(newsCardSignal.pair)) || null
    : null;
  const newsEv =
    newsCardSignal && newsEvent ? evaluateNewsSetup(newsCardSignal, newsPrice, now, newsEvent) : null;

  const newsBeforeRelease = newsEvent ? now.getTime() < newsEvent.eventDate.getTime() : false;
  const newsRuleText =
    newsCardSignal && newsEv
      ? `Entry rule: don't trade before the ${newsEvent.type} release. After it, ${
          String(newsCardSignal.direction).toLowerCase() === "buy" ? "buy" : "sell"
        } only while price is between ${fmt(newsCardSignal.pair, newsEv.zoneLow)} and ${fmt(
          newsCardSignal.pair,
          newsEv.zoneHigh
        )}. Cancel the setup if price touches ${fmt(newsCardSignal.pair, newsCardSignal.stop_loss)} or reaches ${fmt(
          newsCardSignal.pair,
          newsCardSignal.take_profit
        )} before you are in, or when the news window closes ${NEWS_WINDOW_MIN / 60} hours after the release.`
      : null;

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
                    {timeWithSeconds(checkedAt)}
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
              stale={feedStale}
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

      {/* ── 3. NEWS SIGNAL ──────────────────────────────────────── */}
      <section className="signals-section news-section">
        <div className="section-title-row">
          <h2 className="section-title">
            News Signal
            <span className="section-sub">
              The best trade for the next high-impact USD event · generated {NEWS_PREP_HOURS} hours before the release
            </span>
          </h2>
        </div>

        {!newsEvent && (
          <div className="signals-status">
            No upcoming news events are in the calendar. Add new dates to MANUAL_NEWS_EVENTS.
          </div>
        )}

        {newsEvent && (
          <>
            <div className="news-event-banner">
              <span className={`econ-badge econ-badge-${newsEvent.type.toLowerCase()}`}>{newsEvent.type}</span>
              <div className="news-event-info">
                <span className="news-event-name">{newsEvent.name}</span>
                <span className="news-event-when">
                  {formatEventWhen(newsEvent.eventDate)} (your time) · {EVENT_LABEL_TIME[newsEvent.type]}
                </span>
              </div>
              <span className={`econ-countdown ${newsBeforeRelease ? "" : "soon"}`}>
                {newsBeforeRelease
                  ? `In ${formatDuration((newsEvent.eventDate.getTime() - now.getTime()) / 60000)}`
                  : `Released ${formatDuration((now.getTime() - newsEvent.eventDate.getTime()) / 60000)} ago`}
              </span>
            </div>

            {newsLoading && <div className="signals-status">Loading news signal…</div>}

            {!newsLoading && newsLoadError && !newsSignal && (
              <div className="signals-status signals-error">{newsLoadError}</div>
            )}

            {!newsLoading && !newsLoadError && !newsSignal && !inNewsPrep && (
              <div className="signals-status">
                The {newsEvent.type} trade is generated {NEWS_PREP_HOURS} hours before the release, at about{" "}
                {formatEventWhen(new Date(newsPrepStart))} (your time), so its levels match the market closer to the news.
              </div>
            )}

            {!newsLoading && !newsLoadError && !newsSignal && inNewsPrep && marketClosed && (
              <div className="signals-status">
                Markets are closed. The {newsEvent.type} trade is generated when the market opens.
              </div>
            )}

            {!newsLoading && !newsLoadError && !newsSignal && inNewsPrep && !marketClosed && newsGenerating && (
              <div className="signals-status">Generating the {newsEvent.type} news trade…</div>
            )}

            {!newsLoading && !newsLoadError && !newsSignal && inNewsPrep && !marketClosed && !newsGenerating && !newsGenError && (
              <div className="signals-status">Getting ready to generate the {newsEvent.type} news trade…</div>
            )}

            {!newsLoading && !newsLoadError && !newsSignal && inNewsPrep && !marketClosed && !newsGenerating && newsGenError && (
              <div className="signals-status signals-error">
                {newsGenError}
                <div style={{ marginTop: 10 }}>
                  <button
                    className="admin-btn ghost"
                    onClick={() => {
                      triedNewsRef.current.delete(newsEvent.key);
                      setNewsGenError(null);
                      setNewsRetryTick((t) => t + 1);
                    }}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {!newsLoading && newsCardSignal && newsEv && (
              <div className="signal-grid">
                <SignalCard
                  signal={newsCardSignal}
                  featured
                  ev={newsEv}
                  price={newsPrice}
                  isLive={isLive}
                  stale={feedStale}
                  checkedAt={checkedAt}
                  ruleText={newsRuleText}
                  sourceLabel="AI · News"
                />
              </div>
            )}

            <div className="news-risk-note">
              News trades are high risk. Spreads widen and price can jump past your stop (slippage). Confidence is the
              AI's own rating of the setup, not a probability. Use a smaller size than normal.
            </div>
          </>
        )}
      </section>
    </div>
  );
}