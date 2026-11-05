import { useState, useEffect } from "react";

const TWELVEDATA_API_KEY = "7e8e49017af942f8aa39b1928ce16288";
const TWELVEDATA_URL = "https://api.twelvedata.com/quote";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD"];

function toTwelveDataSymbol(s) {
  return `${s.slice(0, 3)}/${s.slice(3)}`;
}
function fromTwelveDataSymbol(s) {
  return s.replace("/", "");
}

const POLL_MS = 120000;
const CACHE_KEY = "bluechip-live-prices";
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function isForexMarketClosed(date) {
  const utcDay = date.getUTCDay();
  const utcHour = date.getUTCHours();
  if (utcDay === 6) return true;
  if (utcDay === 0 && utcHour < 22) return true;
  if (utcDay === 5 && utcHour >= 22) return true;
  return false;
}

function isHidden() {
  return typeof document !== "undefined" && document.hidden;
}

function nextUtcMidnight() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 30);
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.prices || !cached?.at) return null;
    const fresh = Date.now() - cached.at < CACHE_MAX_AGE_MS;
    if (fresh || isForexMarketClosed(new Date())) return cached;
  } catch {
  }
  return null;
}

function saveCache(prices) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ prices, at: Date.now() }));
  } catch {
  }
}

const cached = loadCache();

const store = {
  prices: cached?.prices || {},
  error: null,
  loading: !cached,
  listeners: new Map(),
};

function notify() {
  store.listeners.forEach((_, fn) => fn());
}

function wantedSymbols() {
  const set = new Set();
  store.listeners.forEach((syms) => syms.forEach((s) => set.add(s)));
  return [...set].filter((s) => SYMBOLS.includes(s));
}

let timer = null;
let inFlight = false;
let lastFetchAt = cached?.at || 0;
let blockedUntil = 0; // no requests are sent before this time (rate limit)

async function fetchPrices() {
  const wanted = wantedSymbols();
  if (wanted.length === 0) return;

  inFlight = true;
  lastFetchAt = Date.now();
  try {
    const symbolParam = wanted.map(toTwelveDataSymbol).join(",");
    const res = await fetch(
      `${TWELVEDATA_URL}?symbol=${encodeURIComponent(symbolParam)}&apikey=${TWELVEDATA_API_KEY}`
    );
    const data = await res.json();

    if (data?.status === "error") {
      if (data?.code === 429) {
        const dailyLimit = /day/i.test(data?.message || "");
        if (dailyLimit) {
          blockedUntil = nextUtcMidnight();
          store.error = "Daily price limit reached — resumes at midnight UTC (02:00 SAST)";
        } else {
          blockedUntil = Date.now() + 62 * 1000;
          store.error = "Rate limited — retrying in 60s";
        }
        store.loading = false;
        notify();
        return;
      }
      store.error = data?.message || "Price feed error";
      store.loading = false;
      notify();
      return;
    }

    const next = {};
    if (data?.symbol && data?.close !== undefined) {
      const parsed = parseFloat(data.close);
      if (Number.isFinite(parsed)) next[fromTwelveDataSymbol(data.symbol)] = parsed;
    } else {
      for (const s of wanted) {
        const entry = data?.[toTwelveDataSymbol(s)];
        if (!entry || entry.status === "error") continue;
        const parsed = parseFloat(entry?.close);
        if (Number.isFinite(parsed)) next[s] = parsed;
      }
    }

    if (Object.keys(next).length === 0) {
      store.error = "No price data returned";
      store.loading = false;
      notify();
      return;
    }

    store.prices = { ...store.prices, ...next };
    store.error = null;
    store.loading = false;
    saveCache(store.prices);
    notify();
  } catch (err) {
    store.error = err.message || "Price fetch failed";
    store.loading = false;
    notify();
  } finally {
    inFlight = false;
  }
}

function schedule(ms) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

function tick() {
  timer = null;
  if (store.listeners.size === 0 || inFlight || isHidden()) return;

  const wanted = wantedSymbols();
  if (wanted.length === 0) return;

  const blockedFor = blockedUntil - Date.now();
  if (blockedFor > 0) {
    schedule(blockedFor + 1000);
    return;
  }

  const haveAll = wanted.every((s) => store.prices[s] != null);
  if (isForexMarketClosed(new Date()) && haveAll) {
    schedule(10 * 60 * 1000);
    return;
  }

  fetchPrices().finally(() => {
    if (store.listeners.size > 0 && !timer && !isHidden()) {
      schedule(Math.max(POLL_MS, blockedUntil - Date.now() + 1000));
    }
  });
}

function startPolling() {
  if (inFlight) return;
  const wanted = wantedSymbols();
  if (wanted.length === 0) return;
  const missing = wanted.some((s) => store.prices[s] == null);
  const since = Date.now() - lastFetchAt;

  if (missing) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    tick();
  } else if (!timer) {
    if (since < POLL_MS) schedule(POLL_MS - since);
    else tick();
  }
}

function stopPollingIfIdle() {
  if (store.listeners.size === 0 && timer) {
    clearTimeout(timer);
    timer = null;
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    } else if (store.listeners.size > 0) {
      startPolling();
    }
  });
}

function useSubscription(symbols) {
  const [, forceRender] = useState(0);
  const key = symbols.join(",");

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    store.listeners.set(listener, key ? key.split(",") : []);
    startPolling();

    return () => {
      store.listeners.delete(listener);
      stopPollingIfIdle();
    };
  }, [key]);
}

export function useLivePrice(symbol) {
  useSubscription(symbol ? [symbol] : []);

  return {
    price: symbol ? store.prices[symbol] ?? null : null,
    loading: store.loading,
    error: store.error,
  };
}

export function useLivePrices(symbols = []) {
  useSubscription(symbols);

  return {
    prices: store.prices,
    loading: store.loading,
    error: store.error,
  };
}