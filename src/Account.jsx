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

  // ── Profile (name, bio, avatar) ──
  const [firstName, setFirstName] = useState(user?.first_name || user?.name?.split(" ")[0] || "");
  const [lastName, setLastName] = useState(
    user?.last_name || user?.name?.split(" ").slice(1).join(" ") || ""
  );
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.profile_picture_url || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

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
    setFirstName(user?.first_name || user?.name?.split(" ")[0] || "");
    setLastName(user?.last_name || user?.name?.split(" ").slice(1).join(" ") || "");
    setBio(user?.bio || "");
    setAvatarUrl(user?.profile_picture_url || "");
  }, [user?.first_name, user?.last_name, user?.name, user?.bio, user?.profile_picture_url]);

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

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !user?.email) return;

    setUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const ext = file.name.split(".").pop();
      // Use email rather than user.id as the storage path key, since
      // user.id (the Supabase Auth uid) does not match clients.id.
      const safeKey = user.email.toLowerCase();
      const path = `${safeKey}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust

      // clients.id is its own generated UUID, NOT the auth user id, so we
      // match on email (unique in the clients table) instead of id.
      const { data: updatedRows, error: dbError } = await supabase
        .from("clients")
        .update({ profile_picture_url: newUrl })
        .eq("email", user.email)
        .select();
      if (dbError) throw dbError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("No matching client row found for this email — nothing was saved.");
      }

      setAvatarUrl(newUrl);
      onUserUpdate?.({ ...user, profile_picture_url: newUrl });
      setProfileMessage({ type: "success", text: "Photo updated." });
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setProfileMessage({ type: "error", text: err.message || "Photo upload failed." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (savingProfile || !user?.email) return;

    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const fullName = `${firstName} ${lastName}`.trim();

      // clients.id is its own generated UUID, NOT the auth user id, so we
      // match on email (unique in the clients table) instead of id.
      const { data: updatedRows, error: dbError } = await supabase
        .from("clients")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          bio: bio.trim(),
        })
        .eq("email", user.email)
        .select();
      if (dbError) throw dbError;
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error("No matching client row found for this email — nothing was saved.");
      }

      // Keep auth metadata's display name in sync too, if used elsewhere.
      const { error: authError } = await supabase.auth.updateUser({
        data: { name: fullName },
      });
      if (authError) {
        console.warn("Auth metadata update failed:", authError.message);
      }

      onUserUpdate?.({
        ...user,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        name: fullName,
        bio: bio.trim(),
      });
      setProfileMessage({ type: "success", text: "Profile updated." });
    } catch (err) {
      console.error(err);
      setProfileMessage({ type: "error", text: err.message || "Failed to update profile" });
    } finally {
      setSavingProfile(false);
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

          <div className="account-avatar-row">
            <img
              src={avatarUrl || "/default-avatar.png"}
              alt="Profile"
              className="account-avatar-img"
            />
            <div className="account-avatar-actions">
              <label className="account-btn account-btn-secondary account-upload-btn">
                {uploadingAvatar ? "Uploading…" : "Change photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  disabled={uploadingAvatar}
                  style={{ display: "none" }}
                />
              </label>
              <span className="account-field-hint">JPG or PNG, square images look best.</span>
            </div>
          </div>

          <form className="account-form" onSubmit={handleSaveProfile}>
            <div className="account-field-row">
              <div className="account-field">
                <label>First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="account-field">
                <label>Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
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

            <div className="account-field">
              <label>Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
                rows={4}
                maxLength={500}
              />
              <span className="account-field-hint">{bio.length}/500</span>
            </div>

            {profileMessage && (
              <div className={`account-message ${profileMessage.type}`}>{profileMessage.text}</div>
            )}

            <button
              className="account-btn account-btn-primary"
              type="submit"
              disabled={savingProfile}
            >
              {savingProfile ? "Saving…" : "Save Changes"}
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