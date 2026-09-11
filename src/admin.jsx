import React, { useEffect, useState } from "react";
import "./admin.css";
import { supabase } from "./supabaseClient";
import ClientsPage from "./adminClients.jsx";
import SignalsAdminPage from "./adminSignals.jsx";

// ── Nav config ──────────────────────────────────────────────────

const ADMIN_NAV_ITEMS = [
  { label: "Overview",  value: "overview"  },
  { label: "Clients",   value: "clients"   },
  { label: "Signals",   value: "signals"   },
  { label: "Live",      value: "live"      },
  { label: "Partners",  value: "partners"  },
  { label: "Community", value: "community" },
  { label: "Settings",  value: "settings"  },
];

// ── Shared bits ───────────────────────────────────────────────────

function AdminNav({ admin, onLogout, activeNavItem, setActiveNavItem }) {
  return (
    <nav className="admin-nav">
      <div className="nav-logo">Blue <span>Chip</span> Admin</div>

      <div className="nav-menu">
        {ADMIN_NAV_ITEMS.map((item) => (
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
          <div className="user-avatar">{admin?.name?.charAt(0) || "A"}</div>
          <span className="user-name">{admin?.name || "Admin"}</span>
        </div>
        <button className="logout-btn" onClick={onLogout}>Log Out</button>
      </div>
    </nav>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ── Placeholder page (sections with no table/backing yet) ─────────

function PlaceholderPage({ title }) {
  return (
    <div className="dashboard-card placeholder-card">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      <div className="placeholder-body">
        <p>This section isn't built yet — drop the real {title} page in here.</p>
      </div>
    </div>
  );
}

// ── Overview page ───────────────────────────────────────────────

function OverviewPage() {
  const [totalClients, setTotalClients] = useState(null);
  const [signalsToday, setSignalsToday] = useState(null);
  const [recentClients, setRecentClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      setLoading(true);

      const [{ count: clientCount }, { data: recent }, { count: signalCount }] = await Promise.all([
        supabase.from("clients").select("*", { count: "exact", head: true }),
        supabase.from("clients").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("signals").select("*", { count: "exact", head: true }).eq("date", new Date().toISOString().slice(0, 10)),
      ]);

      if (cancelled) return;
      setTotalClients(clientCount ?? 0);
      setRecentClients(recent || []);
      setSignalsToday(signalCount ?? 0);
      setLoading(false);
    };

    loadStats();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="dashboard-stats">
        <div className="stat-card" style={{ "--accent": "var(--cyan)" }}>
          <div className="stat-card-icon">👥</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Total Clients</span>
            <span className="stat-card-value">{loading ? "…" : totalClients}</span>
            <span className="stat-card-change neutral">Live from Supabase</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--purple)" }}>
          <div className="stat-card-icon">📡</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Signals Today</span>
            <span className="stat-card-value">{loading ? "…" : signalsToday}</span>
            <span className="stat-card-change positive">Updated live</span>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-card recent-signups">
          <div className="card-header">
            <h2>Recent Signups</h2>
          </div>
          <div className="market-list">
            {loading && <div className="market-row"><span>Loading…</span></div>}
            {!loading && recentClients.map((c) => (
              <div className="market-row" key={c.id}>
                <span className="market-name">{c.first_name} {c.last_name}</span>
                <span className="market-price mono">{formatDate(c.created_at)}</span>
              </div>
            ))}
            {!loading && recentClients.length === 0 && (
              <div className="market-row"><span>No clients yet.</span></div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────

export default function Admin({ admin, onLogout }) {
  const [activeNavItem, setActiveNavItem] = useState("overview");

  const renderPage = () => {
    switch (activeNavItem) {
      case "overview": return <OverviewPage />;
      case "clients":  return <ClientsPage />;
      case "signals":  return <SignalsAdminPage />;
      case "live":     return <PlaceholderPage title="Live" />;
      case "partners": return <PlaceholderPage title="Partners" />;
      case "community":return <PlaceholderPage title="Community" />;
      case "settings": return <PlaceholderPage title="Settings" />;
      default: return <OverviewPage />;
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-grid" />

      <AdminNav
        admin={admin}
        onLogout={onLogout}
        activeNavItem={activeNavItem}
        setActiveNavItem={setActiveNavItem}
      />

      <div className="admin-welcome-banner">
        <div className="welcome-text">
          <h1>Admin <span>Control Center</span></h1>
          <p>Manage clients, signals, and platform activity.</p>
        </div>
        <div className="welcome-badge">Admin Access</div>
      </div>

      <div className="admin-body">
        {renderPage()}
      </div>

      <footer className="dashboard-footer">
        <p>© 2026 Blue Chip Trading. Admin Panel.</p>
      </footer>
    </div>
  );
}