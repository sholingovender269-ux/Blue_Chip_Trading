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

const POLL_MS = 60000;

const store = {
  prices: {},
  error: null,
  loading: true,
  listeners: new Set(),
};

function notify() {
  store.listeners.forEach((fn) => fn());
}

let pollTimer = null;
let backoffTimer = null;

async function fetchAllPrices() {
  try {
    const symbolParam = SYMBOLS.map(toTwelveDataSymbol).join(",");
    const res = await fetch(
      `${TWELVEDATA_URL}?symbol=${encodeURIComponent(symbolParam)}&apikey=${TWELVEDATA_API_KEY}`
    );
    const data = await res.json();

    if (data?.status === "error") {
      if (data?.code === 429) {
        const resetSeconds = 60;
        store.error = `Rate limited — retrying in ${resetSeconds}s`;
        store.loading = false;
        notify();

        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (backoffTimer) clearTimeout(backoffTimer);
        backoffTimer = setTimeout(() => {
          backoffTimer = null;
          fetchAllPrices();
          if (store.listeners.size > 0 && !pollTimer) {
            pollTimer = setInterval(fetchAllPrices, POLL_MS);
          }
        }, (resetSeconds + 2) * 1000);
        return;
      }
      store.error = data?.message || "Price feed error";
      store.loading = false;
      notify();
      return;
    }

    const isMultiSymbolShape = SYMBOLS.some(
      (s) => data?.[toTwelveDataSymbol(s)] !== undefined
    );

    const next = {};
    if (isMultiSymbolShape) {
      for (const s of SYMBOLS) {
        const entry = data?.[toTwelveDataSymbol(s)];
        if (!entry || entry.status === "error") continue;
        const parsed = parseFloat(entry?.close);
        if (Number.isFinite(parsed)) next[s] = parsed;
      }
    } else if (data?.symbol && data?.close) {
      const internalSymbol = fromTwelveDataSymbol(data.symbol);
      const parsed = parseFloat(data.close);
      if (Number.isFinite(parsed)) next[internalSymbol] = parsed;
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
    notify();
  } catch (err) {
    store.error = err.message || "Price fetch failed";
    store.loading = false;
    notify();
  }
}

let lastFetchAt = 0;
const MIN_GAP_MS = 5000;

function startPolling() {
  if (pollTimer || backoffTimer) return;
  const sinceLast = Date.now() - lastFetchAt;
  if (sinceLast >= MIN_GAP_MS) {
    lastFetchAt = Date.now();
    fetchAllPrices();
  }
  pollTimer = setInterval(() => {
    lastFetchAt = Date.now();
    fetchAllPrices();
  }, POLL_MS);
}

function stopPollingIfIdle() {
  if (store.listeners.size === 0) {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (backoffTimer) {
      clearTimeout(backoffTimer);
      backoffTimer = null;
    }
  }
}

export function useLivePrice(symbol) {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    store.listeners.add(listener);
    startPolling();

    return () => {
      store.listeners.delete(listener);
      stopPollingIfIdle();
    };
  }, []);

  return {
    price: symbol ? store.prices[symbol] ?? null : null,
    loading: store.loading,
    error: store.error,
  };
}

export function useLivePrices() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const listener = () => forceRender((n) => n + 1);
    store.listeners.add(listener);
    startPolling();

    return () => {
      store.listeners.delete(listener);
      stopPollingIfIdle();
    };
  }, []);

  return {
    prices: store.prices,
    loading: store.loading,
    error: store.error,
  };
}