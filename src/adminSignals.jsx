import React, { useEffect, useState, useCallback } from "react";
import "./admin.css";
import { supabase } from "./supabaseClient";

const dangerBtn = {
  background: "rgba(255, 90, 90, 0.12)",
  color: "#ff6b6b",
  border: "1px solid rgba(255, 90, 90, 0.45)",
};

// CSV cells starting with = + - @ can run as formulas in Excel, so prefix them with '
const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export default function SignalsAdminPage() {
  const [signals, setSignals] = useState([]);
  const [total, setTotal] = useState(0); // every signal in the table, not just the 50 shown
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null); // row waiting for delete confirmation
  const [confirmAll, setConfirmAll] = useState(false);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error, count } = await supabase
      .from("signals")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) setError(error.message);
    else {
      setSignals(data || []);
      setTotal(count ?? (data || []).length);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const showNotice = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  // ── Delete one signal ──
  const deleteOne = async (s) => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from("signals").delete().eq("id", s.id).select();
    setBusy(false);
    setConfirmId(null);

    if (error || !data || data.length === 0) {
      setError(error?.message || "Couldn't delete the signal. Check your delete policy in Supabase.");
      return;
    }
    setSignals((list) => list.filter((x) => x.id !== s.id));
    setTotal((t) => Math.max(0, t - 1));
    showNotice("Signal deleted.");
  };

  // ── Delete ALL signals (every row in the table) ──
  const deleteAll = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.from("signals").delete().not("id", "is", null).select("id");
    setBusy(false);
    setConfirmAll(false);

    if (error) {
      setError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setError("Nothing was deleted. Check your delete policy in Supabase.");
      return;
    }
    setSignals([]);
    setTotal(0);
    showNotice(`${data.length} signals deleted.`);
  };

  // ── Export the shown signals to CSV ──
  const exportCsv = () => {
    const header = ["Date", "Session", "Pair", "Direction", "Entry", "Stop Loss", "Take Profit", "Confidence"];
    const rows = signals.map((s) => [
      s.date, s.session, s.pair, s.direction, s.entry, s.stop_loss, s.take_profit, s.confidence,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signals-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dashboard-card users-card">
      <div className="card-header">
        <h2>Signals</h2>
        <span className="live-badge">
          ● {signals.length} shown{total > signals.length ? ` of ${total}` : ""}
        </span>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}
      {notice && (
        <div className="admin-error-banner" style={{ color: "#4ade80", borderColor: "rgba(74,222,128,0.4)" }}>
          {notice}
        </div>
      )}

      <div className="table-toolbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="admin-btn ghost" onClick={fetchSignals} disabled={loading || busy}>
          Refresh
        </button>
        <button className="admin-btn ghost" onClick={exportCsv} disabled={loading || signals.length === 0}>
          Export CSV
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {confirmAll ? (
            <>
              <span style={{ color: "#ff6b6b", fontSize: 13 }}>
                Permanently delete all {total} signals? This can't be undone.
              </span>
              <button className="admin-btn" style={dangerBtn} onClick={deleteAll} disabled={busy}>
                {busy ? "Deleting…" : "Yes, delete all"}
              </button>
              <button className="admin-btn ghost" onClick={() => setConfirmAll(false)} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="admin-btn"
              style={dangerBtn}
              onClick={() => setConfirmAll(true)}
              disabled={loading || busy || total === 0}
            >
              Delete all signals
            </button>
          )}
        </div>
      </div>

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Session</th>
              <th>Pair</th>
              <th>Direction</th>
              <th>Entry</th>
              <th>SL</th>
              <th>TP</th>
              <th>Confidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="empty-row">Loading signals…</td></tr>
            )}
            {!loading && signals.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.date}</td>
                <td>{s.session}</td>
                <td>{s.pair}</td>
                <td>{s.direction}</td>
                <td className="mono">{s.entry}</td>
                <td className="mono">{s.stop_loss}</td>
                <td className="mono">{s.take_profit}</td>
                <td>{s.confidence}</td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  {confirmId === s.id ? (
                    <>
                      <button className="admin-btn" style={dangerBtn} onClick={() => deleteOne(s)} disabled={busy}>
                        {busy ? "…" : "Confirm"}
                      </button>{" "}
                      <button className="admin-btn ghost" onClick={() => setConfirmId(null)} disabled={busy}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="admin-btn"
                      style={dangerBtn}
                      onClick={() => setConfirmId(s.id)}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && signals.length === 0 && (
              <tr><td colSpan={9} className="empty-row">No signals yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}