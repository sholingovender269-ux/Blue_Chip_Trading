import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import "./mentorProfile.css";

const STYLES = ["Scalping", "Day Trading", "Swing Trading", "Position Trading", "Price Action", "SMC / ICT", "Other"];

export default function MentorProfile({ user, onUserUpdate }) {
  const [firstName, setFirstName] = useState(user?.first_name || user?.firstName || user?.name?.split(" ")[0] || "");
  const [lastName, setLastName] = useState(user?.last_name || user?.lastName || user?.name?.split(" ").slice(1).join(" ") || "");
  const [tradingStyle, setTradingStyle] = useState(user?.trading_style || "");
  const [years, setYears] = useState(user?.years_trading ?? "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.profile_picture_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ text: "", error: false });

  const initials = `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "M";

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setStatus({ text: "", error: false });
    try {
      const ext = file.name.split(".").pop();
      const path = `mentors/${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${data.publicUrl}?t=${Date.now()}`; // cache-bust

      const { error: dbError } = await supabase
        .from("mentors")
        .update({ profile_picture_url: newUrl })
        .eq("id", user.id);
      if (dbError) throw dbError;

      setAvatarUrl(newUrl);
      onUserUpdate?.({ ...user, profile_picture_url: newUrl });
      setStatus({ text: "Photo updated.", error: false });
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setStatus({ text: "Photo upload failed. Please try again.", error: true });
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!firstName.trim()) {
      setStatus({ text: "First name is required.", error: true });
      return;
    }
    setSaving(true);
    setStatus({ text: "", error: false });
    try {
      const yearsValue = years === "" ? null : Number(years);
      const updates = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        trading_style: tradingStyle || null,
        years_trading: yearsValue,
        bio,
      };

      const { error } = await supabase.from("mentors").update(updates).eq("id", user.id);
      if (error) throw error;

      onUserUpdate?.({
        ...user,
        ...updates,
        name: `${updates.first_name} ${updates.last_name || ""}`.trim(),
      });
      setStatus({ text: "Profile saved.", error: false });
    } catch (err) {
      console.error("Profile save failed:", err);
      setStatus({ text: "Save failed. Please try again.", error: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="main">
      <section className="welcome">
        <div>
          <p className="label">MENTOR PORTAL</p>
          <h1>My Profile</h1>
          <p className="welcome-text">This is how students see you across the platform.</p>
        </div>
      </section>

      <section className="section">
        <div className="mp-card">
          <div className="mp-avatar-row">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="mp-avatar" />
            ) : (
              <div className="mp-avatar mp-avatar-fallback">{initials}</div>
            )}
            <div className="mp-avatar-actions">
              <label className="mp-btn mp-btn-outline">
                {uploading ? "Uploading..." : "Change photo"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                  style={{ display: "none" }}
                />
              </label>
              <span className="mp-hint">JPG or PNG, square images look best.</span>
            </div>
          </div>

          <div className="mp-grid">
            <div className="mp-field">
              <label className="mp-label">First Name</label>
              <input className="mp-input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="mp-field">
              <label className="mp-label">Last Name</label>
              <input className="mp-input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="mp-field">
              <label className="mp-label">Email</label>
              <input className="mp-input" type="email" value={user?.email || ""} disabled />
            </div>
            <div className="mp-field">
              <label className="mp-label">Years Trading</label>
              <input
                className="mp-input"
                type="number"
                min="0"
                step="0.5"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              />
            </div>
            <div className="mp-field mp-full">
              <label className="mp-label">Trading Style</label>
              <select className="mp-input" value={tradingStyle} onChange={(e) => setTradingStyle(e.target.value)}>
                <option value="">Select a style</option>
                {tradingStyle && !STYLES.includes(tradingStyle) && (
                  <option value={tradingStyle}>{tradingStyle}</option>
                )}
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="mp-field mp-full">
              <label className="mp-label">Bio</label>
              <textarea
                className="mp-input mp-textarea"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell students about your experience and approach..."
                rows={5}
                maxLength={500}
              />
              <span className="mp-count">{bio.length}/500</span>
            </div>
          </div>

          <div className="mp-actions">
            <button className="mp-btn mp-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Profile"}
            </button>
            {status.text && (
              <span className={`mp-status ${status.error ? "mp-status-error" : ""}`}>{status.text}</span>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}