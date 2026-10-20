import React, { useEffect, useMemo, useState } from "react";
import "./adminTrades.css";
import { supabase } from "./supabaseClient";

// ── Helpers ─────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(n, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-ZA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pnlClass(pnl) {
  if (pnl === null || pnl === undefined) return "";
  return Number(pnl) > 0 ? "positive" : Number(pnl) < 0 ? "negative" : "";
}

const SORT_OPTIONS = [
  { value: "opened_at_desc", label: "Opened (Newest)" },
  { value: "opened_at_asc", label: "Opened (Oldest)" },
  { value: "closed_at_desc", label: "Closed (Newest)" },
  { value: "closed_at_asc", label: "Closed (Oldest)" },
  { value: "pnl_desc", label: "PnL (High → Low)" },
  { value: "pnl_asc", label: "PnL (Low → High)" },
  { value: "lot_size_desc", label: "Lot Size (High → Low)" },
  { value: "lot_size_asc", label: "Lot Size (Low → High)" },
];

// ── Main page ───────────────────────────────────────────────────

export default function AdminTradesPage() {
  const [positions, setPositions] = useState([]);
  const [accounts, setAccounts] = useState({}); // account_id -> { balance, user_id }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all"); // all | open | closed
  const [sideFilter, setSideFilter] = useState("all"); // all | buy | sell
  const [symbolFilter, setSymbolFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("opened_at_desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const [{ data: pos, error: posErr }, { data: accs, error: accErr }] = await Promise.all([
        supabase
          .from("demo_positions")
          .select("*")
          .order("opened_at", { ascending: false }),
        supabase.from("demo_accounts").select("id, user_id, balance"),
      ]);

      if (cancelled) return;

      if (posErr || accErr) {
        setError(posErr?.message || accErr?.message || "Failed to load trades.");
        setLoading(false);
        return;
      }

      const accMap = {};
      (accs || []).forEach((a) => {
        accMap[a.id] = a;
      });

      setPositions(pos || []);
      setAccounts(accMap);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const symbols = useMemo(() => {
    const s = new Set(positions.map((p) => p.symbol).filter(Boolean));
    return Array.from(s).sort();
  }, [positions]);

  const stats = useMemo(() => {
    const open = positions.filter((p) => p.status === "open");
    const closed = positions.filter((p) => p.status === "closed");
    const closedPnl = closed.reduce((sum, p) => sum + (Number(p.pnl) || 0), 0);
    return {
      total: positions.length,
      open: open.length,
      closed: closed.length,
      closedPnl,
    };
  }, [positions]);

  const filtered = useMemo(() => {
    let rows = [...positions];

    if (statusFilter !== "all") {
      rows = rows.filter((p) => p.status === statusFilter);
    }
    if (sideFilter !== "all") {
      rows = rows.filter((p) => p.side === sideFilter);
    }
    if (symbolFilter !== "all") {
      rows = rows.filter((p) => p.symbol === symbolFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) => {
        const acc = accounts[p.account_id];
        return (
          p.symbol?.toLowerCase().includes(q) ||
          p.id?.toLowerCase().includes(q) ||
          p.user_id?.toLowerCase().includes(q) ||
          p.account_id?.toLowerCase().includes(q) ||
          acc?.user_id?.toLowerCase().includes(q)
        );
      });
    }

    rows.sort((a, b) => {
      switch (sortBy) {
        case "opened_at_asc":
          return new Date(a.opened_at) - new Date(b.opened_at);
        case "opened_at_desc":
          return new Date(b.opened_at) - new Date(a.opened_at);
        case "closed_at_asc":
          return new Date(a.closed_at || 0) - new Date(b.closed_at || 0);
        case "closed_at_desc":
          return new Date(b.closed_at || 0) - new Date(a.closed_at || 0);
        case "pnl_desc":
          return (Number(b.pnl) || 0) - (Number(a.pnl) || 0);
        case "pnl_asc":
          return (Number(a.pnl) || 0) - (Number(b.pnl) || 0);
        case "lot_size_desc":
          return Number(b.lot_size) - Number(a.lot_size);
        case "lot_size_asc":
          return Number(a.lot_size) - Number(b.lot_size);
        default:
          return 0;
      }
    });

    return rows;
  }, [positions, accounts, statusFilter, sideFilter, symbolFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sideFilter, symbolFilter, search, sortBy]);

  const closePosition = async (id) => {
    if (!window.confirm("Force-close this position? This won't recalculate live PnL.")) return;
    const { error: closeErr } = await supabase
      .from("demo_positions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", id);
    if (closeErr) {
      alert("Failed to close position: " + closeErr.message);
      return;
    }
    setPositions((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "closed", closed_at: new Date().toISOString() } : p
      )
    );
  };

  return (
    <div className="admin-trades-page">
      <div className="dashboard-stats">
        <div className="stat-card" style={{ "--accent": "var(--cyan)" }}>
          <div className="stat-card-icon">📊</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Total Trades</span>
            <span className="stat-card-value">{loading ? "…" : stats.total}</span>
            <span className="stat-card-change neutral">All accounts</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--purple)" }}>
          <div className="stat-card-icon">🟢</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Open Positions</span>
            <span className="stat-card-value">{loading ? "…" : stats.open}</span>
            <span className="stat-card-change neutral">Live</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--pink, #e879f9)" }}>
          <div className="stat-card-icon">✅</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Closed Trades</span>
            <span className="stat-card-value">{loading ? "…" : stats.closed}</span>
            <span className="stat-card-change neutral">Total</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--cyan)" }}>
          <div className="stat-card-icon">💰</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Closed PnL</span>
            <span className={`stat-card-value ${pnlClass(stats.closedPnl)}`}>
              {loading ? "…" : formatNumber(stats.closedPnl)}
            </span>
            <span className="stat-card-change neutral">Sum of closed</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card trades-card">
        <div className="card-header trades-header">
          <h2>Demo Trades</h2>

          <div className="trades-toolbar">
            <input
              type="text"
              className="trades-search"
              placeholder="Search symbol, trade id, user id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="trades-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>

            <select
              className="trades-select"
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
            >
              <option value="all">All Sides</option>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>

            <select
              className="trades-select"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
            >
              <option value="all">All Symbols</option>
              {symbols.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <select
              className="trades-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="trades-error">{error}</div>}

        <div className="trades-table-wrap">
          <table className="trades-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Lot Size</th>
                <th>Entry</th>
                <th>Exit</th>
                <th>SL</th>
                <th>TP</th>
                <th>PnL</th>
                <th>Opened</th>
                <th>Closed</th>
                <th>User / Account</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={13} className="trades-empty">Loading trades…</td>
                </tr>
              )}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={13} className="trades-empty">No trades match your filters.</td>
                </tr>
              )}

              {!loading && pageRows.map((p) => {
                const acc = accounts[p.account_id];
                return (
                  <tr key={p.id}>
                    <td>
                      <span className={`status-pill ${p.status === "open" ? "status-open" : "status-closed"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="mono">{p.symbol}</td>
                    <td>
                      <span className={`side-pill ${p.side === "buy" ? "side-buy" : "side-sell"}`}>
                        {p.side}
                      </span>
                    </td>
                    <td className="mono">{formatNumber(p.lot_size)}</td>
                    <td className="mono">{formatNumber(p.entry_price, 4)}</td>
                    <td className="mono">{formatNumber(p.exit_price, 4)}</td>
                    <td className="mono">{formatNumber(p.stop_loss, 4)}</td>
                    <td className="mono">{formatNumber(p.take_profit, 4)}</td>
                    <td className={`mono ${pnlClass(p.pnl)}`}>{formatNumber(p.pnl)}</td>
                    <td className="mono small">{formatDateTime(p.opened_at)}</td>
                    <td className="mono small">{formatDateTime(p.closed_at)}</td>
                    <td className="mono small" title={p.user_id}>
                      {acc?.user_id ? acc.user_id.slice(0, 8) : p.user_id?.slice(0, 8)}…
                      <br />
                      <span className="muted">Bal: {formatNumber(acc?.balance)}</span>
                    </td>
                    <td>
                      {p.status === "open" && (
                        <button className="trades-close-btn" onClick={() => closePosition(p.id)}>
                          Force Close
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="trades-pagination">
            <span className="trades-page-info">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="trades-page-controls">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}