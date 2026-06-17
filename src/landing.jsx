import React from "react";
import "./landing.css";

export default function Landing({ user, onLogout }) {
  return (
    <div className="dashboard-page">
      <div className="dashboard-grid" />

      {/* Navbar */}
      <nav className="dashboard-nav">
        <div className="nav-logo">Blue <span>Chip</span> Trading</div>
        <div className="nav-right">
          <div className="nav-user">
            <div className="user-avatar">{user?.name?.charAt(0) || "U"}</div>
            <span className="user-name">{user?.name || "Trader"}</span>
          </div>
          <button className="logout-btn" onClick={onLogout}>Log Out</button>
        </div>
      </nav>

      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-text">
          <h1>Welcome back, <span>{user?.name?.split(" ")[0] || "Trader"}</span> 👋</h1>
          <p>Here's your trading overview for today.</p>
        </div>
        <div className="welcome-badge">Client Dashboard</div>
      </div>

      {/* Stats Cards */}
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Account Balance</span>
            <span className="stat-card-value">R 24,350.00</span>
            <span className="stat-card-change positive">+2.4% today</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📈</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Open Positions</span>
            <span className="stat-card-value">3</span>
            <span className="stat-card-change positive">2 in profit</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Total Trades</span>
            <span className="stat-card-value">128</span>
            <span className="stat-card-change neutral">This month</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon">🎯</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Win Rate</span>
            <span className="stat-card-value">67%</span>
            <span className="stat-card-change positive">Above average</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dashboard-content">

        {/* Market Watch */}
        <div className="dashboard-card market-watch">
          <div className="card-header">
            <h2>Market Watch</h2>
            <span className="live-badge">● LIVE</span>
          </div>
          <div className="market-list">
            {[
              { name: "NAS100", price: "19,842.50", change: "+1.23%", up: true },
              { name: "US30",   price: "39,105.00", change: "+0.87%", up: true },
              { name: "DAX",    price: "18,234.75", change: "-0.32%", up: false },
              { name: "GOLD",   price: "2,341.10",  change: "+0.54%", up: true },
              { name: "OIL",    price: "78.45",     change: "-1.12%", up: false },
            ].map((m) => (
              <div className="market-row" key={m.name}>
                <span className="market-name">{m.name}</span>
                <span className="market-price">{m.price}</span>
                <span className={`market-change ${m.up ? "up" : "down"}`}>
                  {m.up ? "▲" : "▼"} {m.change}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="dashboard-card activity">
          <div className="card-header">
            <h2>Recent Activity</h2>
          </div>
          <div className="activity-list">
            {[
              { action: "BUY",  asset: "NAS100", time: "09:32 AM", result: "+R420",  win: true  },
              { action: "SELL", asset: "US30",   time: "10:15 AM", result: "-R120",  win: false },
              { action: "BUY",  asset: "DAX",    time: "11:04 AM", result: "+R680",  win: true  },
              { action: "SELL", asset: "GOLD",   time: "12:30 PM", result: "+R210",  win: true  },
              { action: "BUY",  asset: "NAS100", time: "02:10 PM", result: "Open",   win: null  },
            ].map((a, i) => (
              <div className="activity-row" key={i}>
                <span className={`action-badge ${a.action === "BUY" ? "buy" : "sell"}`}>
                  {a.action}
                </span>
                <span className="activity-asset">{a.asset}</span>
                <span className="activity-time">{a.time}</span>
                <span className={`activity-result ${a.win === true ? "win" : a.win === false ? "loss" : "open"}`}>
                  {a.result}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Account Info */}
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
    </div>
  );
}