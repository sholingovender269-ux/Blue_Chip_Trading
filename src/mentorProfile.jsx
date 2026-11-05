import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./mentorProfile.css";

const STYLES = [
  "Scalping",
  "Day Trading",
  "Swing Trading",
  "Position Trading",
  "Price Action",
  "SMC / ICT",
  "Other",
];

export default function MentorProfile({ user, onUserUpdate }) {
  const [firstName, setFirstName] = useState(
    user?.first_name || user?.firstName || user?.name?.split(" ")[0] || ""
  );
  const [lastName, setLastName] = useState(
    user?.last_name ||
      user?.lastName ||
      user?.name?.split(" ").slice(1).join(" ") ||
      ""
  );
  const [tradingStyle, setTradingStyle] = useState(
    user?.trading_style || user?.tradingStyle || ""
  );
  const [years, setYears] = useState(user?.years_trading ?? "");
  const [bio, setBio] = useState(user?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(
    user?.profile_picture_url || ""
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ text: "", error: false });

  const mentorId = user?.id ?? user?.mentor_id ?? user?.user_id;

  const initials =
    `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "M";

  useEffect(() => {
    if (!mentorId) return;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select(
          "id, first_name, last_name, email, trading_style, years_trading, bio, profile_picture_url"
        )
        .eq("id", mentorId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Profile load failed:", error);
        return;
      }

      if (!data) return;

      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setTradingStyle(data.trading_style || "");
      setYears(data.years_trading ?? "");
      setBio(data.bio || "");
      setAvatarUrl(data.profile_picture_url || "");

      onUserUpdate?.({
        ...user,
        id: data.id,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        firstName: data.first_name,
        lastName: data.last_name,
        trading_style: data.trading_style,
        tradingStyle: data.trading_style,
        years_trading: data.years_trading,
        bio: data.bio,
        profile_picture_url: data.profile_picture_url,
        name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
        role: "mentor",
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mentorId]);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!mentorId) {
      setStatus({
        text: "Could not find your mentor ID. Please log in again.",
        error: true,
      });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStatus({ text: "Please select an image file.", error: true });
      return;
    }

    setUploading(true);
    setStatus({ text: "", error: false });

    try {
      const ext = file.name.split(".").pop();
      const path = `mentors/${mentorId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${data.publicUrl}?t=${Date.now()}`;

      const { data: updated, error: dbError } = await supabase
        .from("mentors")
        .update({ profile_picture_url: newUrl })
        .eq("id", mentorId)
        .select("id");

      if (dbError) throw dbError;

      if (!updated || updated.length === 0) {
        throw new Error(
          "No mentor row was updated. Check the ID and the table's update policy (RLS)."
        );
      }

      setAvatarUrl(newUrl);

      onUserUpdate?.({
        ...user,
        profile_picture_url: newUrl,
      });

      setStatus({ text: "Photo updated.", error: false });
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setStatus({
        text: `Photo upload failed: ${err.message || "unknown error"}`,
        error: true,
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSave() {
    if (!firstName.trim()) {
      setStatus({ text: "First name is required.", error: true });
      return;
    }

    if (!mentorId) {
      setStatus({
        text: "Could not find your mentor ID. Please log in again.",
        error: true,
      });
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

      const { data: updated, error } = await supabase
        .from("mentors")
        .update(updates)
        .eq("id", mentorId)
        .select("id");

      if (error) throw error;

      if (!updated || updated.length === 0) {
        throw new Error(
          "No mentor row was updated. Check the ID and the table's update policy (RLS)."
        );
      }

      onUserUpdate?.({
        ...user,
        ...updates,
        first_name: updates.first_name,
        last_name: updates.last_name,
        firstName: updates.first_name,
        lastName: updates.last_name,
        trading_style: updates.trading_style,
        tradingStyle: updates.trading_style,
        profile_picture_url: avatarUrl || user?.profile_picture_url,
        name: `${updates.first_name} ${updates.last_name || ""}`.trim(),
        role: "mentor",
      });

      setStatus({ text: "Profile saved.", error: false });
    } catch (err) {
      console.error("Profile save failed:", err);
      setStatus({
        text: `Save failed: ${err.message || "unknown error"}`,
        error: true,
      });
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
          <p className="welcome-text">
            This is how students see you across the platform.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="mp-card">
          <div className="mp-avatar-row">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile"
                className="mp-avatar"
                onError={() => setAvatarUrl("")}
              />
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
              <span className="mp-hint">
                JPG or PNG, square images look best.
              </span>
            </div>
          </div>

          <div className="mp-grid">
            <div className="mp-field">
              <label className="mp-label">First Name</label>
              <input
                className="mp-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div className="mp-field">
              <label className="mp-label">Last Name</label>
              <input
                className="mp-input"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>

            <div className="mp-field">
              <label className="mp-label">Email</label>
              <input
                className="mp-input"
                type="email"
                value={user?.email || ""}
                disabled
              />
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
              <select
                className="mp-input"
                value={tradingStyle}
                onChange={(e) => setTradingStyle(e.target.value)}
              >
                <option value="">Select a style</option>
                {tradingStyle && !STYLES.includes(tradingStyle) && (
                  <option value={tradingStyle}>{tradingStyle}</option>
                )}
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
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
            <button
              className="mp-btn mp-btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>

            {status.text && (
              <span
                className={`mp-status ${
                  status.error ? "mp-status-error" : ""
                }`}
              >
                {status.text}
              </span>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}