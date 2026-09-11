import React, { useEffect, useState, useCallback } from "react";
import "./admin.css";
import { supabase } from "./supabaseClient";

export default function SignalsAdminPage() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) setError(error.message);
    else setSignals(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  return (
    <div className="dashboard-card users-card">
      <div className="card-header">
        <h2>Signals</h2>
        <span className="live-badge">● {signals.length} shown</span>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}

      <div className="table-toolbar">
        <button className="admin-btn ghost" onClick={fetchSignals}>Refresh</button>
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
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="empty-row">Loading signals…</td></tr>
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
              </tr>
            ))}
            {!loading && signals.length === 0 && (
              <tr><td colSpan={8} className="empty-row">No signals yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}