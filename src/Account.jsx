import React, { useEffect, useRef, useState } from "react";
import "./Account.css";
import { supabase } from "./supabaseClient"; 
import { fetchClosedPositions, getOrCreateDemoAccount } from "./demoTradingApi";

const DELETION_DELAY_MS = 5 * 60 * 1000;

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

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// onAccountDeleted: called after the account is deleted and the user is signed out
export default function Account({ user, onUserUpdate, onAccountDeleted }) {
  const [activeTab, setActiveTab] = useState("profile");

  // Profile
  const [firstName, setFirstName] = useState(user?.first_name || user?.name?.split(" ")[0] || "");
  const [lastName, setLastName] = useState(
    user?.last_name || user?.name?.split(" ").slice(1).join(" ") || ""
  );
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.profile_picture_url || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  // deadline
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [countdownError, setCountdownError] = useState(null);
  const finalizeStarted = useRef(false);

  //  Trade history 
  const [closedPositions, setClosedPositions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(null);

  useEffect(() => {
  setFirstName(user?.first_name || user?.name?.split(" ")[0] || "");
  setLastName(user?.last_name || user?.name?.split(" ").slice(1).join(" ") || "");
  setBio(user?.bio || "");
}, [user?.first_name, user?.last_name, user?.name, user?.bio]);

// Load the profile picture directly from the clients table.
useEffect(() => {
  let cancelled = false;

  const loadProfilePicture = async () => {
    if (!user?.email) {
      setAvatarUrl("");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("clients")
        .select("profile_picture_url")
        .eq("email", user.email)
        .maybeSingle();

      if (error) throw error;

      if (!cancelled) {
        setAvatarUrl(data?.profile_picture_url || "");
      }
    } catch (err) {
      console.error("Profile picture loading failed:", err);
    }
  };

  loadProfilePicture();

  return () => {
    cancelled = true;
  };
}, [user?.email]);

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


  useEffect(() => {
    let cancelled = false;
    const loadDeletionStatus = async () => {
      try {
        const { data, error } = await supabase.rpc("get_deletion_status");
        if (error) throw error;
        if (!cancelled && data !== null && data !== undefined) {
          setDeadline(Date.now() + Number(data) * 1000);
        }
      } catch (err) {
        console.warn("Could not load deletion status:", err.message || err);
      }
    };
    loadDeletionStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick every second while a deletion is scheduled
  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  // When the countdown reaches zero, finish the deletion
  const remainingMs = deadline ? Math.max(0, deadline - now) : null;

  useEffect(() => {
    if (deadline && remainingMs === 0 && !finalizeStarted.current) {
      finalizeDeletion();
    }
    
  }, [deadline, remainingMs]);

  
  useEffect(() => {
    if (!showDeleteModal) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !scheduling) closeDeleteModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDeleteModal, scheduling]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !user?.email) return;

    if (file.size > 5 * 1024 * 1024) {
      setProfileMessage({ type: "error", text: "Image must be smaller than 5 MB." });
      e.target.value = "";
      return;
    }

    setUploadingAvatar(true);
    setProfileMessage(null);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      
      const safeKey = user.email.toLowerCase();
      const path = `${safeKey}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`; 

      // clients.id is its own generated UUID, NOT the auth user id, so we
      // match on email  instead of id.
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
      e.target.value = "";
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (savingProfile || !user?.email) return;

    setSavingProfile(true);
    setProfileMessage(null);
    try {
      const fullName = `${firstName} ${lastName}`.trim();

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
      // Re-authenticate with the current password first
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

  // ── Delete account ──
  const openDeleteModal = () => {
    setDeletePassword("");
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (scheduling) return;
    setShowDeleteModal(false);
    setDeletePassword("");
    setDeleteError(null);
  };

  // Step 1: verify the password and start the 5 minute countdown.
  const handleScheduleDeletion = async (e) => {
    e.preventDefault();
    if (scheduling) return;

    if (!deletePassword) {
      setDeleteError("Enter your password to confirm.");
      return;
    }

    setScheduling(true);
    setDeleteError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;
      if (!email) throw new Error("Not signed in");

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: deletePassword,
      });
      if (reauthError) throw new Error("Password is incorrect");

      const { data: secondsLeft, error: rpcError } = await supabase.rpc(
        "request_account_deletion"
      );
      if (rpcError) throw rpcError;

      finalizeStarted.current = false;
      setCountdownError(null);
      setDeadline(Date.now() + Number(secondsLeft ?? DELETION_DELAY_MS / 1000) * 1000);
      setShowDeleteModal(false);
      setDeletePassword("");
    } catch (err) {
      console.error("Schedule deletion failed:", err);
      setDeleteError(err.message || "Failed to start account deletion");
    } finally {
      setScheduling(false);
    }
  };

  // Cancel during the countdown
  const handleCancelDeletion = async () => {
    if (cancelling || finalizing) return;
    setCancelling(true);
    setCountdownError(null);
    try {
      const { error } = await supabase.rpc("cancel_account_deletion");
      if (error) throw error;
      setDeadline(null);
    } catch (err) {
      console.error("Cancel deletion failed:", err);
      setCountdownError(err.message || "Could not cancel deletion. Try again.");
    } finally {
      setCancelling(false);
    }
  };

  // Step 2: countdown reached zero
  const finalizeDeletion = async () => {
    finalizeStarted.current = true;
    setFinalizing(true);
    setCountdownError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email;

      // Remove the profile picture files (best effort, don't block deletion).
      if (email) {
        try {
          const folder = email.toLowerCase();
          const { data: files } = await supabase.storage.from("avatars").list(folder);
          if (files && files.length > 0) {
            await supabase.storage
              .from("avatars")
              .remove(files.map((f) => `${folder}/${f.name}`));
          }
        } catch (storageErr) {
          console.warn("Avatar cleanup failed:", storageErr);
        }
      }

      const { error: rpcError } = await supabase.rpc("delete_my_account");
      if (rpcError) throw rpcError;

      await supabase.auth.signOut();
      onAccountDeleted?.();
    } catch (err) {
      console.error("Final deletion failed:", err);
      setCountdownError(err.message || "Failed to delete account");
      setFinalizing(false);
    }
  };

  const deletionScheduled = deadline !== null;
  const progressPct =
    remainingMs !== null ? Math.min(100, (remainingMs / DELETION_DELAY_MS) * 100) : 0;

  return (
    <div className="account-page">
      <div className="account-header">
        <h1>Account</h1>
        <p>Manage your profile, security, and trade history.</p>
      </div>

      {deletionScheduled && (
        <div className="account-deletion-banner" role="alert">
          <div className="account-deletion-info">
            <div className="account-deletion-title">
              {finalizing ? "Deleting your account…" : "Your account is scheduled for deletion"}
            </div>
            <div className="account-deletion-sub">
              {finalizing
                ? "Please wait."
                : "Cancel before the timer ends to keep your account and data."}
            </div>
            {countdownError && (
              <div className="account-message error account-deletion-error">{countdownError}</div>
            )}
          </div>

          <div className="account-deletion-timer" aria-live="polite">
            {formatCountdown(remainingMs ?? 0)}
          </div>

          <button
            type="button"
            className="account-btn account-btn-primary account-deletion-cancel"
            onClick={handleCancelDeletion}
            disabled={cancelling || finalizing}
          >
            {cancelling ? "Cancelling…" : "Cancel deletion"}
          </button>

          <div className="account-deletion-progress">
            <div className="account-deletion-progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

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
        <>
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

          <div className="account-card account-card-danger">
            <div className="account-card-header">
              <h2>Delete Account</h2>
            </div>
            <p className="account-danger-text">
              {deletionScheduled
                ? "Deletion is scheduled. Use the timer at the top of the page to cancel it."
                : "Permanently delete your account, profile, and photo. You'll have 5 minutes to cancel after you confirm."}
            </p>
            <button
              type="button"
              className="account-btn account-btn-danger"
              onClick={openDeleteModal}
              disabled={deletionScheduled}
            >
              {deletionScheduled ? "Deletion scheduled" : "Delete my account"}
            </button>
          </div>
        </>
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

      {showDeleteModal && (
        <div className="account-modal-backdrop" onClick={closeDeleteModal}>
          <div
            className="account-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="delete-account-title">Delete your account?</h3>
            <p>
              Enter your password to start a 5 minute countdown. Your account is deleted when it
              reaches zero. You can cancel any time before then to keep it.
            </p>

            <form className="account-form account-modal-form" onSubmit={handleScheduleDeletion}>
              <div className="account-field">
                <label>Password</label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => {
                    setDeletePassword(e.target.value);
                    if (deleteError) setDeleteError(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  autoFocus
                  disabled={scheduling}
                />
              </div>

              {deleteError && <div className="account-message error">{deleteError}</div>}

              <div className="account-modal-actions">
                <button
                  type="button"
                  className="account-btn account-btn-secondary"
                  onClick={closeDeleteModal}
                  disabled={scheduling}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="account-btn account-btn-danger-solid"
                  disabled={scheduling || !deletePassword}
                >
                  {scheduling ? "Starting…" : "Start 5 minute countdown"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}