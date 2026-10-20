import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function ProfileEditor({ user, onUserUpdate }) {
  const [firstName, setFirstName] = useState(user?.first_name || user?.name?.split(" ")[0] || "");
  const [lastName, setLastName] = useState(user?.last_name || user?.name?.split(" ").slice(1).join(" ") || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user?.profile_picture_url || "");
  const [status, setStatus] = useState("");

  async function handleAvatarChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setStatus("");
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      const newUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`; // cache-bust

      const { error: dbError } = await supabase
        .from("clients")
        .update({ profile_picture_url: newUrl })
        .eq("id", user.id);

      if (dbError) throw dbError;

      setAvatarUrl(newUrl);
      onUserUpdate?.({ ...user, profile_picture_url: newUrl });
      setStatus("Photo updated.");
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setStatus("Photo upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveProfile() {
    setSaving(true);
    setStatus("");
    try {
      const { error } = await supabase
        .from("clients")
        .update({
          first_name: firstName,
          last_name: lastName,
          bio,
        })
        .eq("id", user.id);

      if (error) throw error;

      onUserUpdate?.({
        ...user,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`.trim(),
        bio,
      });
      setStatus("Profile saved.");
    } catch (err) {
      console.error("Profile save failed:", err);
      setStatus("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dashboard-card profile-card">
      <div className="card-header">
        <h2>Profile</h2>
      </div>

      <div className="profile-avatar-row">
        <img
          src={avatarUrl || "/default-avatar.png"}
          alt="Profile"
          className="profile-avatar-img"
        />
        <div className="profile-avatar-actions">
          <label className="logout-btn profile-upload-btn">
            {uploading ? "Uploading..." : "Change photo"}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={uploading}
              style={{ display: "none" }}
            />
          </label>
          <span className="profile-hint">JPG or PNG, square images look best.</span>
        </div>
      </div>

      <div className="profile-fields">
        <div className="profile-field">
          <label className="account-label">First Name</label>
          <input
            className="profile-input"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div className="profile-field">
          <label className="account-label">Last Name</label>
          <input
            className="profile-input"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
      </div>

      <div className="profile-field profile-field-full">
        <label className="account-label">Bio</label>
        <textarea
          className="profile-textarea"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          rows={4}
          maxLength={500}
        />
        <span className="profile-char-count">{bio.length}/500</span>
      </div>

      <div className="profile-actions">
        <button className="logout-btn profile-save-btn" onClick={handleSaveProfile} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </button>
        {status && <span className="profile-status">{status}</span>}
      </div>
    </div>
  );
}