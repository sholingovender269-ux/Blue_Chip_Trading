import React, { useCallback, useEffect, useMemo, useState } from "react";
import emailjs from "@emailjs/browser";
import "./reviewApplication.css";
import { supabase } from "./supabaseClient";

// ── EmailJS (mentor login email) ─────────────────────────────
const EMAILJS_SERVICE_ID = "service_4b2fz1k";
const EMAILJS_MENTOR_TEMPLATE_ID = "template_etls1p7"; // ← paste your new template ID
const EMAILJS_PUBLIC_KEY = "6DOd8MA5teVeCoE26";

async function sendMentorEmail(name, email, password) {
  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_MENTOR_TEMPLATE_ID,
      { to_name: name, to_email: email, temp_password: password },
      { publicKey: EMAILJS_PUBLIC_KEY }
    );
    return true;
  } catch (err) {
    console.error("Mentor email failed:", err);
    return false;
  }
}

const FILTERS = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Only allow http(s) links so a malicious applicant can't inject javascript: URLs
function safeUrl(url) {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

// Splits "John Michael Smith" → first: "John", last: "Michael Smith"
function splitName(fullName) {
  const parts = (fullName || "").trim().split(/\s+/);
  const first = parts.shift() || "";
  return { first, last: parts.join(" ") };
}

// Random temporary password (no look-alike characters like 0/O or 1/l)
function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function Detail({ label, children }) {
  if (!children) return null;
  return (
    <div className="ra-detail">
      <span className="ra-detail-label">{label}</span>
      <div className="ra-detail-value">{children}</div>
    </div>
  );
}

function LinkOrText({ url }) {
  const safe = safeUrl(url);
  if (!url) return null;
  return safe ? (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="ra-link">
      {safe}
    </a>
  ) : (
    <span>{url}</span>
  );
}

export default function ReviewApplication() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }
  const [credentials, setCredentials] = useState(null); // { name, email, password }
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase
      .from("mentor_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Load applications error:", error);
      setLoadError("Couldn't load applications. Check your Supabase policies.");
      setApplications([]);
    } else {
      setApplications(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: applications.length,
      pending: applications.filter((a) => a.status === "pending").length,
      approved: applications.filter((a) => a.status === "approved").length,
    }),
    [applications]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (!q) return true;
      return (
        (a.full_name || "").toLowerCase().includes(q) ||
        (a.email || "").toLowerCase().includes(q) ||
        (a.country || "").toLowerCase().includes(q)
      );
    });
  }, [applications, filter, search]);

  const showNotice = (type, text) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 4000);
  };

  // ── Accept: approve → create mentor (hashed temp password) → email login details ──
  const handleAccept = async (app) => {
    setBusyId(app.id);

    // 1. Mark application approved
    const { data, error } = await supabase
      .from("mentor_applications")
      .update({ status: "approved" })
      .eq("id", app.id)
      .select();

    if (error || !data || data.length === 0) {
      setBusyId(null);
      console.error("Accept error:", error);
      showNotice("error", "Couldn't accept the application. Check your update policy in Supabase.");
      return;
    }

    // 2. Create the mentor (the database hashes the temporary password)
    const { first, last } = splitName(app.full_name);
    const tempPassword = generatePassword();

    const { error: mentorErr } = await supabase.rpc("admin_create_mentor", {
      p_application_id: app.id,
      p_first: first,
      p_last: last,
      p_email: (app.email || "").trim().toLowerCase(),
      p_style: app.trading_style,
      p_years: app.years_trading,
      p_password: tempPassword,
    });

    if (mentorErr) {
      // Roll back so nothing is left half-done
      await supabase.from("mentor_applications").update({ status: "pending" }).eq("id", app.id);
      setBusyId(null);
      console.error("Create mentor error:", mentorErr);
      showNotice(
        "error",
        mentorErr.code === "23505"
          ? "A mentor with this email already exists."
          : "Couldn't create the mentor account. Did you run mentors_table.sql?"
      );
      return;
    }

    // 3. Email the login details
    const emailed = await sendMentorEmail(first, app.email, tempPassword);

    setBusyId(null);
    setApplications((list) => list.map((a) => (a.id === app.id ? { ...a, status: "approved" } : a)));

    if (emailed) {
      showNotice("ok", `${app.full_name} accepted. Login details were emailed to ${app.email}.`);
    } else {
      // Email failed → show the password so you can send it manually
      setCopied(false);
      setCredentials({ name: app.full_name, email: app.email, password: tempPassword });
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // ── Deny: delete the row ──
  const handleDeny = async (app) => {
    setBusyId(app.id);
    const { data, error } = await supabase
      .from("mentor_applications")
      .delete()
      .eq("id", app.id)
      .select();
    setBusyId(null);
    setConfirmDeleteId(null);

    if (error || !data || data.length === 0) {
      console.error("Delete error:", error);
      showNotice("error", "Couldn't delete the application. Check your delete policy in Supabase.");
      return;
    }
    setApplications((list) => list.filter((a) => a.id !== app.id));
    showNotice("ok", `${app.full_name}'s application was removed.`);
  };

  return (
    <div className="ra-page">
      {/* ── Stats ── */}
      <div className="ra-stats">
        <div className="ra-stat" style={{ "--ra-accent": "var(--cyan, #22d3ee)" }}>
          <span className="ra-stat-label">Total</span>
          <span className="ra-stat-value">{loading ? "…" : counts.total}</span>
        </div>
        <div className="ra-stat" style={{ "--ra-accent": "var(--orange, #ff9f40)" }}>
          <span className="ra-stat-label">Pending</span>
          <span className="ra-stat-value">{loading ? "…" : counts.pending}</span>
        </div>
        <div className="ra-stat" style={{ "--ra-accent": "var(--up, #00e5a0)" }}>
          <span className="ra-stat-label">Approved</span>
          <span className="ra-stat-value">{loading ? "…" : counts.approved}</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="ra-toolbar">
        <div className="ra-filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`ra-filter ${filter === f.value ? "active" : ""}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ra-toolbar-right">
          <input
            className="ra-search"
            placeholder="Search name, email, country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="ra-btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {notice && <div className={`ra-notice ${notice.type}`}>{notice.text}</div>}
      {loadError && <div className="ra-notice error">{loadError}</div>}

      {/* ── List ── */}
      <div className="ra-list">
        {loading && <div className="ra-empty">Loading applications…</div>}

        {!loading && !loadError && visible.length === 0 && (
          <div className="ra-empty">
            {applications.length === 0 ? "No applications yet." : "No applications match this filter."}
          </div>
        )}

        {!loading &&
          visible.map((app) => {
            const isOpen = expandedId === app.id;
            const isBusy = busyId === app.id;
            const isConfirming = confirmDeleteId === app.id;

            return (
              <div className={`ra-card ${isOpen ? "open" : ""}`} key={app.id}>
                {/* Summary row */}
                <div className="ra-card-top">
                  <div className="ra-avatar">{(app.full_name || "?").charAt(0).toUpperCase()}</div>

                  <div className="ra-who">
                    <div className="ra-name">{app.full_name}</div>
                    <div className="ra-sub">
                      {app.email}
                      {app.country ? ` · ${app.country}` : ""}
                    </div>
                  </div>

                  <div className="ra-meta">
                    <span className="ra-meta-item">{app.years_trading} yrs</span>
                    <span className="ra-meta-item">{formatDate(app.created_at)}</span>
                  </div>

                  <span className={`ra-status ${app.status}`}>● {app.status}</span>
                </div>

                {/* Quick tags */}
                <div className="ra-tags">
                  {app.trading_style && <span className="ra-tag style">{app.trading_style}</span>}
                  {(app.markets || []).map((m) => (
                    <span className="ra-tag" key={m}>{m}</span>
                  ))}
                  {app.availability && <span className="ra-tag avail">{app.availability}</span>}
                </div>

                {/* Expanded details */}
                {isOpen && (
                  <div className="ra-details">
                    <div className="ra-detail-grid">
                      <Detail label="Phone">{app.phone}</Detail>
                      <Detail label="Verified Results">
                        <LinkOrText url={app.proof_url} />
                      </Detail>
                      <Detail label="Social / Portfolio">
                        <LinkOrText url={app.social_url} />
                      </Detail>
                    </div>
                    <Detail label="Track Record">
                      {app.track_record && <p className="ra-text">{app.track_record}</p>}
                    </Detail>
                    <Detail label="About">
                      <p className="ra-text">{app.bio}</p>
                    </Detail>
                    <Detail label="Why they want to mentor">
                      <p className="ra-text">{app.motivation}</p>
                    </Detail>
                  </div>
                )}

                {/* Actions */}
                <div className="ra-actions">
                  <button className="ra-btn ghost" onClick={() => setExpandedId(isOpen ? null : app.id)}>
                    {isOpen ? "Hide details" : "View details"}
                  </button>

                  <div className="ra-actions-right">
                    {isConfirming ? (
                      <>
                        <span className="ra-confirm-text">
                          {app.status === "approved" ? "Delete application and mentor account?" : "Delete permanently?"}
                        </span>
                        <button className="ra-btn danger" onClick={() => handleDeny(app)} disabled={isBusy}>
                          {isBusy ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button className="ra-btn" onClick={() => setConfirmDeleteId(null)} disabled={isBusy}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        {app.status !== "approved" && (
                          <button className="ra-btn accept" onClick={() => handleAccept(app)} disabled={isBusy}>
                            {isBusy ? "Saving…" : "Accept"}
                          </button>
                        )}
                        <button className="ra-btn danger-outline" onClick={() => setConfirmDeleteId(app.id)} disabled={isBusy}>
                          {app.status === "approved" ? "Remove" : "Deny"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* ── Mentor credentials modal (shown once after accepting) ── */}
      {credentials && (
        <div className="ra-modal-overlay">
          <div className="ra-modal">
            <div className="ra-modal-icon">✓</div>
            <h3>Email not sent</h3>
            <p className="ra-modal-text">
              {credentials.name} was accepted and their account exists, but the email couldn't be
              sent. Send them these login details yourself. The password is only shown once.
            </p>

            <div className="ra-cred">
              <span className="ra-detail-label">Email</span>
              <div className="ra-cred-value">{credentials.email}</div>
            </div>
            <div className="ra-cred">
              <span className="ra-detail-label">Temporary password</span>
              <div className="ra-cred-value mono">{credentials.password}</div>
            </div>

            <div className="ra-modal-actions">
              <button className="ra-btn" onClick={copyPassword}>
                {copied ? "Copied ✓" : "Copy password"}
              </button>
              <button className="ra-btn accept" onClick={() => setCredentials(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}