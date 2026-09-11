import { useEffect, useState, useRef } from "react";
import "./landing.css";
import "./signals.css";
import { supabase } from "./supabaseClient";

// Same OpenRouter setup as AIAssistant.jsx — same key, same endpoint, same
// retry-on-429 pattern — so this doesn't introduce a second config to keep
// in sync.
//
// ⚠️ SECURITY NOTE: this key is hardcoded and shipped to the browser.
// Anyone can pull it from dev tools / the built JS bundle and use your
// quota. Move key usage behind a backend/serverless function when you can.
const API_KEY = "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";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ─────────────────────────────────────────────────────────────────────────
// This page no longer talks to TwelveData at all. Landing.jsx is the
// single source of truth — it fetches all pairs once, keeps the 3 majors
// in `rawQuotes`, and passes them down as the `priceData` prop below.
// ─────────────────────────────────────────────────────────────────────────

const SESSIONS = ["Asia", "London", "New York"];
const TRADE_TYPES = ["Scalp", "Short-Term", "Daily", "Long-Term"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function todayISO() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// fetch() with a hard timeout — plain fetch() never times out on its own,
// so a stalled request (rate-limited API, dropped connection, etc.) would
// leave the page stuck forever.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Economic calendar — NFP, CPI, and FOMC dates.
//
// NFP (the "Employment Situation" report) is ALWAYS the first Friday of
// the month, published by the Bureau of Labor Statistics at 8:30 AM ET.
// That's a fixed rule, so instead of hand-typing dates that eventually run
// out, we compute them algorithmically — this list never goes stale.
//
// CPI and FOMC dates are NOT on a fixed formula — BLS and the Federal
// Reserve announce them individually, typically about a year ahead. So
// those two stay as a manually-maintained list below. When you notice the
// list getting short (check the "In Xd" countdown on the live page), just
// add more rows from bls.gov/schedule/news_release/cpi.htm and
// federalreserve.gov/monetarypolicy/fomccalendars.htm — no other code
// needs to change.
// ─────────────────────────────────────────────────────────────────────────

// Computes the first Friday of the given month/year, at 8:30 AM ET.
function firstFridayOfMonth(year, monthIndexZeroBased) {
  const d = new Date(year, monthIndexZeroBased, 1);
  const dayOfWeek = d.getDay(); // 0 = Sun ... 5 = Fri
  const offsetToFriday = (5 - dayOfWeek + 7) % 7;
  d.setDate(1 + offsetToFriday);
  return d;
}

// Generates NFP events for the next `monthsAhead` months from today,
// formatted the same way as the manual CPI/FOMC entries below so they can
// be merged into one list.
function generateNfpEvents(monthsAhead = 18) {
  const events = [];
  const now = new Date();
  for (let i = 0; i < monthsAhead; i++) {
    const targetMonth = now.getMonth() + i;
    const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
    const monthIndex = ((targetMonth % 12) + 12) % 12;
    const friday = firstFridayOfMonth(targetYear, monthIndex);

    // NFP reports the PRIOR month's data (e.g. the report released the
    // first Friday of September covers August's numbers).
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

// CPI and FOMC — hand-maintained, sourced from bls.gov/schedule and
// federalreserve.gov/monetarypolicy as of Aug 2026. Add more rows here as
// BLS/the Fed publish further-out dates; nothing else needs to change.
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

// Merges computed NFP dates with the manual CPI/FOMC list, drops anything
// already in the past, and sorts by date — so the calendar always shows
// the next upcoming events with zero manual upkeep for NFP specifically.
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
    // Refresh once an hour — this naturally rolls the calendar forward to
    // the next event the moment the current one passes, with no manual
    // "advance to next" step needed for NFP, and minimal upkeep for CPI/FOMC.
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

async function callOpenRouter(requestBody, attempt = 1) {
  const response = await fetchWithTimeout(
    API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Blue Chip Trading",
      },
      body: JSON.stringify(requestBody),
    },
    20000
  );

  const data = await response.json();

  if (response.status === 429 && attempt < 2) {
    await sleep(1200);
    return callOpenRouter(requestBody, attempt + 1);
  }

  return { response, data };
}

// System prompt is now parameterized by session so we can generate ONE
// session's 4 signals at a time (fast, ~4-6s) instead of all 12 up front
// (slow, ~15-20s) before the user sees anything.
function buildSignalPrompt(session) {
  return `You are a trading signals generator for a forex trading platform. You will be given today's live price snapshot for several currency pairs, plus a list of upcoming high-impact US economic news events (NFP, CPI, and FOMC rate decisions) with their exact dates. Using ONLY that real data as your reference for current price levels, generate trade ideas.

Generate exactly ONE signal for EACH of these 4 trade types, all for the "${session}" trading session: Scalp, Short-Term, Daily, Long-Term. That is 4 signals total.

If a signal's likely holding period would span one of the given news events, factor that into your confidence rating (NFP, CPI, and FOMC releases can cause sharp, unpredictable volatility) and mention it briefly in the rationale — e.g. "FOMC decision in 3 days; sizing/confidence adjusted accordingly."

Respond with ONLY valid JSON, no markdown fences, no commentary, matching this exact shape:

{
  "signals": [
    {
      "session": "${session}",
      "type": "Scalp" | "Short-Term" | "Daily" | "Long-Term",
      "pair": "EUR/USD",
      "direction": "buy" | "sell",
      "entry": 1.0850,
      "stop_loss": 1.0820,
      "take_profit": 1.0910,
      "confidence": "low" | "medium" | "high",
      "rationale": "One or two sentence explanation grounded in the given price data and any relevant upcoming news event."
    }
  ]
}

Base entry/SL/TP levels on the actual close/high/low values provided — do not invent price levels unrelated to the given data. If you cannot justify a confident setup for a slot, still provide your best reasoned idea but mark confidence as "low" and say so in the rationale.`;
}

async function generateSignalsForSession(session, priceData, upcomingNews) {
  const userPrompt = `Today's live price data:\n${JSON.stringify(
    priceData,
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

  if (!response.ok || data.error) {
    const msg = data?.error?.message || `Request failed (${response.status})`;
    throw new Error(msg);
  }

  const raw = data?.choices?.[0]?.message?.content || "";
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error(`Raw AI response for ${session} that failed to parse:`, raw);
    throw new Error(`AI response for ${session} wasn't valid JSON.`);
  }

  const today = todayISO();
  return (parsed.signals || []).map((s) => ({
    date: today,
    session,
    type: s.type,
    pair: s.pair,
    direction: s.direction,
    entry: s.entry,
    stop_loss: s.stop_loss,
    take_profit: s.take_profit,
    confidence: s.confidence,
    rationale: s.rationale,
  }));
}

// `priceData` comes from Landing.jsx's single TwelveData poller, already
// shaped as [{ pair, close, high, low, percent_change }, ...] for the 3
// majors. An empty array means Landing hasn't gotten its first successful
// fetch back yet — we just wait for it instead of fetching independently.
export default function SignalsPage({ priceData = [] }) {
  const [signals, setSignals] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(new Set());
  const [errorsBySessions, setErrorsBySessions] = useState({});
  const [activeSession, setActiveSession] = useState("Asia");
  const [checkedCache, setCheckedCache] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const generatedRef = useRef(new Set()); // sessions already generated or in flight this pageload

  // 1. Once we have live prices, check Supabase ONCE for anything already
  // generated today (by an earlier visitor). This never blocks on the AI.
  useEffect(() => {
    if (!priceData || priceData.length === 0 || checkedCache) return;

    let cancelled = false;

    (async () => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from("signals")
          .select("*")
          .eq("date", todayISO());

        if (fetchError) throw fetchError;

        if (!cancelled && existing && existing.length > 0) {
          setSignals(existing);
          // Mark whichever sessions already came back as cache-covered so
          // we don't re-generate them below.
          existing.forEach((s) => generatedRef.current.add(s.session));
        }
      } catch (err) {
        console.error("Error checking cached signals:", err);
      } finally {
        if (!cancelled) setCheckedCache(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [priceData, checkedCache]);

  // 2. Once the cache check is done, generate ONLY the active session if
  // it isn't already covered — one request at a time, triggered per tab,
  // instead of firing 3 calls up front. This makes it obvious which
  // session (if any) is slow or failing, and means switching to a tab you
  // haven't opened yet is the only thing that costs an AI call.
  useEffect(() => {
    if (!checkedCache || priceData.length === 0) return;
    if (generatedRef.current.has(activeSession)) return;

    generatedRef.current.add(activeSession);
    let cancelled = false;

    const run = async () => {
      setLoadingSessions((prev) => new Set(prev).add(activeSession));
      setErrorsBySessions((prev) => ({ ...prev, [activeSession]: null }));

      try {
        const upcomingNews = getUpcomingEvents().slice(0, 3).map((e) => ({
          event: e.name,
          date: e.date,
          reference: e.refMonth,
          days_until: e.daysUntil,
        }));

        const rows = await generateSignalsForSession(activeSession, priceData, upcomingNews);

        if (rows.length === 0) throw new Error("AI returned no signals for this session.");

        if (!cancelled) {
          setSignals((prev) => [...prev, ...rows]);
        }

        // Cache in Supabase so later visitors (and later tab switches)
        // read instead of regenerating.
        const { error: insertError } = await supabase.from("signals").insert(rows);
        if (insertError) console.error("Failed to cache signals:", insertError);
      } catch (err) {
        console.error(`Signals generation error for ${activeSession}:`, err);
        if (!cancelled) {
          setErrorsBySessions((prev) => ({
            ...prev,
            [activeSession]: err.message || "Something went wrong generating this session.",
          }));
        }
        // Allow retrying this session (e.g. via a refresh) instead of
        // permanently marking it as done.
        generatedRef.current.delete(activeSession);
      } finally {
        if (!cancelled) {
          setLoadingSessions((prev) => {
            const next = new Set(prev);
            next.delete(activeSession);
            return next;
          });
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [activeSession, checkedCache, priceData, retryTick]);

  const sessionSignals = signals
    .filter((s) => s.session === activeSession)
    .sort((a, b) => TRADE_TYPES.indexOf(a.type) - TRADE_TYPES.indexOf(b.type));

  const activeSessionLoading = loadingSessions.has(activeSession);
  const activeSessionError = errorsBySessions[activeSession];

  return (
    <div className="signals-page">
      <div className="signals-header">
        <h1>Daily Signals</h1>
        <span className="live-badge">● Generated Today</span>
      </div>

      <div className="disclaimer-banner">
        ⚠️ These signals are AI-generated from live price data for educational
        purposes only. They are not financial advice and are not guaranteed
        to be accurate or profitable. Trade at your own risk.
      </div>

      <EconomicCalendar />

      <div className="session-tabs">
        {SESSIONS.map((s) => (
          <button
            key={s}
            className={`session-tab ${activeSession === s ? "active" : ""}`}
            onClick={() => setActiveSession(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {priceData.length === 0 && (
        <div className="signals-status">Waiting on live prices…</div>
      )}

      {priceData.length > 0 && !checkedCache && (
        <div className="signals-status">Checking today's signals…</div>
      )}

      {priceData.length > 0 && checkedCache && activeSessionLoading && sessionSignals.length === 0 && (
        <div className="signals-status">Generating {activeSession} signals…</div>
      )}

      {activeSessionError && sessionSignals.length === 0 && !activeSessionLoading && (
        <div className="signals-status signals-error">
          {activeSessionError}
          <div style={{ marginTop: 10 }}>
            <button
              className="admin-btn ghost"
              onClick={() => {
                generatedRef.current.delete(activeSession);
                setErrorsBySessions((prev) => ({ ...prev, [activeSession]: null }));
                setRetryTick((t) => t + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {sessionSignals.length > 0 && (
        <div className="signal-grid">
          {TRADE_TYPES.map((type) => {
            const signal = sessionSignals.find((s) => s.type === type);
            if (!signal) return null;
            return (
              <div className="signal-card" key={type}>
                <div className="signal-card-header">
                  <span className="signal-type-badge">{type}</span>
                  <span className={`signal-direction ${signal.direction}`}>
                    {signal.direction === "buy" ? "▲ BUY" : "▼ SELL"}
                  </span>
                </div>
                <div className="signal-pair">{signal.pair}</div>
                <div className="signal-levels">
                  <div className="signal-level">
                    <span className="signal-level-label">Entry</span>
                    <span className="signal-level-value">{signal.entry}</span>
                  </div>
                  <div className="signal-level">
                    <span className="signal-level-label">Stop Loss</span>
                    <span className="signal-level-value sl">{signal.stop_loss}</span>
                  </div>
                  <div className="signal-level">
                    <span className="signal-level-label">Take Profit</span>
                    <span className="signal-level-value tp">{signal.take_profit}</span>
                  </div>
                </div>
                <div className={`signal-confidence ${signal.confidence}`}>
                  Confidence: {signal.confidence}
                </div>
                <p className="signal-rationale">{signal.rationale}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}