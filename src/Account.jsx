import React, { useEffect, useState } from "react";
import "./Account.css";
import { supabase } from "./supabaseClient"; // adjust path if different
import { fetchClosedPositions, getOrCreateDemoAccount } from "./demoTradingApi";

function formatMoney(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function Account({ user, onUserUpdate }) {
  const [activeTab, setActiveTab] = useState("profile");

  // ── Profile (name) ──
  const [name, setName] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState(null);

  // ── Password ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  // ── Trade history ──
  const [closedPositions, setClosedPositions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  useEffect(() => {
    setName(user?.name || "");
  }, [user?.name]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        const acct = await getOrCreateDemoAccount();
        const closed = await fetchClosedPositions(acct.id);
        if (!cancelled) {
          setClosedPositions(closed);
          setHistoryError(null);
        }
      } catch (err) {
        console.error("Trade history fetch error:", err);
        if (!cancelled) setHistoryError(err.message || "Failed to load trade history");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!name.trim() || savingName) return;

    setSavingName(true);
    setNameMessage(null);
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      const authUser = userData?.user;
      if (authError || !authUser) throw new Error("Not signed in");

      const { error: updateError } = await supabase.auth.updateUser({
        data: { name: name.trim() },
      });
      if (updateError) throw updateError;

      // Keep the profiles table (if you have one) in sync too.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", authUser.id);
      if (profileError) {
        // Not fatal — auth metadata already updated — but surface it.
        console.warn("Profile table update failed:", profileError.message);
      }

      onUserUpdate?.({ ...user, name: name.trim() });
      setNameMessage({ type: "success", text: "Name updated." });
    } catch (err) {
      console.error(err);
      setNameMessage({ type: "error", text: err.message || "Failed to update name" });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (savingPassword) return;

    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "New passwords don't match." });
      return;
    }

    setSavingPassword(true);
    try {
      // Re-authenticate with the current password first, so a person who
      // walks away from an unlocked session can't change the password
      // without knowing it.
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) throw new Error("Not signed in");

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) throw new Error("Current password is incorrect");

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ type: "success", text: "Password updated." });
    } catch (err) {
      console.error(err);
      setPasswordMessage({ type: "error", text: err.message || "Failed to update password" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="account-page">
      <div className="account-header">
        <h1>Account</h1>
        <p>Manage your profile, security, and trade history.</p>
      </div>

      <div className="account-tabs">
        <button
          className={`account-tab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Profile
        </button>
        <button
          className={`account-tab ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          Security
        </button>
        <button
          className={`account-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          Trade History
        </button>
      </div>

      {activeTab === "profile" && (
        <div className="account-card">
          <div className="account-card-header">
            <h2>Profile</h2>
          </div>

          <form className="account-form" onSubmit={handleSaveName}>
            <div className="account-field">
              <label>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="account-field">
              <label>Email</label>
              <input type="email" value={user?.email || ""} disabled />
              <span className="account-field-hint">Email can't be changed here.</span>
            </div>

            <div className="account-field">
              <label>ID Number</label>
              <input type="text" value={user?.idNumber || ""} disabled />
            </div>

            {nameMessage && (
              <div className={`account-message ${nameMessage.type}`}>{nameMessage.text}</div>
            )}

            <button className="account-btn account-btn-primary" type="submit" disabled={savingName}>
              {savingName ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "security" && (
        <div className="account-card">
          <div className="account-card-header">
            <h2>Change Password</h2>
          </div>

          <form className="account-form" onSubmit={handleChangePassword}>
            <div className="account-field">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <div className="account-field">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>

            <div className="account-field">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>

            {passwordMessage && (
              <div className={`account-message ${passwordMessage.type}`}>
                {passwordMessage.text}
              </div>
            )}

            <button
              className="account-btn account-btn-primary"
              type="submit"
              disabled={savingPassword}
            >
              {savingPassword ? "Updating…" : "Update Password"}
            </button>
          </form>
        </div>
      )}

      {activeTab === "history" && (
        <div className="account-card">
          <div className="account-card-header">
            <h2>Trade History</h2>
            <span className="account-history-count">{closedPositions.length} trades</span>
          </div>

          {historyError && <div className="account-message error">{historyError}</div>}

          {historyLoading ? (
            <div className="account-empty">Loading trade history…</div>
          ) : closedPositions.length === 0 ? (
            <div className="account-empty">No closed trades yet.</div>
          ) : (
            <div className="account-table-wrap">
              <table className="account-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map((pos) => (
                    <tr key={pos.id}>
                      <td>{formatDate(pos.closed_at || pos.created_at)}</td>
                      <td>{pos.symbol}</td>
                      <td className={pos.side === "buy" ? "side-buy" : "side-sell"}>
                        {pos.side?.toUpperCase()}
                      </td>
                      <td>{pos.lot_size}</td>
                      <td>{pos.entry_price}</td>
                      <td>{pos.exit_price}</td>
                      <td className={pos.pnl >= 0 ? "positive" : "negative"}>
                        {formatMoney(pos.pnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}