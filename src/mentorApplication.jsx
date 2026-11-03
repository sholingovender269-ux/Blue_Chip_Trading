import React, { useEffect, useState } from "react";
import emailjs from "@emailjs/browser";
import "./mentorApplication.css";
import { supabase } from "./supabaseClient";

// ── EmailJS config ───────────────────────────────────────────
// Service ID + Public Key: EmailJS dashboard → Email Services / Account → General
const EMAILJS_SERVICE_ID = "service_6e2lrip";
const EMAILJS_TEMPLATE_ID = "template_y633ecs";
const EMAILJS_PUBLIC_KEY = "iJf91K9SaKpnpTDzB";

const MARKET_OPTIONS = ["Forex", "Indices", "Crypto", "Commodities", "Stocks"];
const STYLE_OPTIONS = ["Price Action", "SMC / ICT", "Supply & Demand", "Swing", "Scalping", "Other"];
const AVAILABILITY_OPTIONS = ["Weekdays", "Evenings", "Weekends", "Flexible"];

const EMPTY_FORM = {
  full_name: "",
  email: "",
  phone: "",
  id_number: "",
  country: "",
  years_trading: "",
  markets: [],
  trading_style: "",
  track_record: "",
  proof_url: "",
  social_url: "",
  availability: "",
  bio: "",
  motivation: "",
  agreed: false,
};

function toggleInList(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Validates a South African ID number (YYMMDDSSSSCAZ).
 * Returns an error string if invalid, or "" if valid.
 *  - 13 digits
 *  - first 6 digits are a real date of birth (not in the future)
 *  - 11th digit (citizenship) is 0 or 1
 *  - 13th digit passes the Luhn checksum
 * The database runs the same checks again before storing anything.
 */
function validateSAId(id) {
  if (!/^\d{13}$/.test(id)) return "ID must be 13 digits";

  const yy = parseInt(id.slice(0, 2), 10);
  const mm = parseInt(id.slice(2, 4), 10);
  const dd = parseInt(id.slice(4, 6), 10);

  let year = 2000 + yy;
  if (new Date(year, mm - 1, dd) > new Date()) year = 1900 + yy;

  const dob = new Date(year, mm - 1, dd);
  const validDate =
    dob.getFullYear() === year && dob.getMonth() === mm - 1 && dob.getDate() === dd;
  if (!validDate) return "ID contains an invalid date of birth";

  if (id[10] !== "0" && id[10] !== "1") return "Invalid ID number";

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[12 - i], 10);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  if (sum % 10 !== 0) return "Invalid ID number";

  return "";
}

export default function MentorApplication({ user }) {
  const [view, setView] = useState("intro"); // intro | form | done | existing
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    full_name: user?.name || "",
    email: user?.email || "",
    id_number: (user?.idNumber || "").replace(/\D/g, "").slice(0, 13),
  });
  const [idTouched, setIdTouched] = useState(false);
  const [existing, setExisting] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Check if this user already applied
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!user?.email) return;
      const { data, error: err } = await supabase
        .from("mentor_applications")
        .select("id, status, created_at")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled || err || !data || data.length === 0) return;
      setExisting(data[0]);
      setView("existing");
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // ID number: digits only, capped at 13
  const handleIdChange = (e) => {
    const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, 13);
    set("id_number", digitsOnly);
  };

  const idError =
    form.id_number.length === 0
      ? idTouched
        ? "ID number is required"
        : ""
      : form.id_number.length === 13 || idTouched
      ? validateSAId(form.id_number)
      : "";

  const validate = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return "Enter a valid email address.";
    const idProblem = validateSAId(form.id_number);
    if (idProblem) return `ID number: ${idProblem.charAt(0).toLowerCase()}${idProblem.slice(1)}.`;
    if (!form.country.trim()) return "Country is required.";
    if (form.years_trading === "" || Number(form.years_trading) < 0) return "Enter your years of trading experience.";
    if (form.markets.length === 0) return "Select at least one market you trade.";
    if (!form.trading_style) return "Select your trading style.";
    if (!form.availability) return "Select your availability.";
    if (form.bio.trim().length < 50) return "Your bio needs at least 50 characters.";
    if (form.motivation.trim().length < 30) return "Tell us a bit more about why you want to mentor (30+ characters).";
    if (!form.agreed) return "You must confirm the details are accurate.";
    return "";
  };

  // Sends the confirmation email. Never blocks the application if it fails.
  const sendConfirmationEmail = async (name, email) => {
    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_name: name.split(" ")[0],
          to_email: email,
          application_date: new Date().toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
    } catch (err) {
      console.error("Confirmation email failed:", err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIdTouched(true);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setSubmitting(true);
    const name = form.full_name.trim();
    const email = form.email.trim().toLowerCase();

    // The database validates the ID, hashes it (HMAC-SHA256 + secret pepper)
    // and stores only the hash. The raw ID number is never saved.
    const { error: err } = await supabase.rpc("submit_mentor_application", {
      p_user_id: user?.id ?? null,
      p_full_name: name,
      p_email: email,
      p_phone: form.phone.trim() || null,
      p_country: form.country.trim(),
      p_years_trading: Number(form.years_trading),
      p_markets: form.markets,
      p_trading_style: form.trading_style,
      p_track_record: form.track_record.trim() || null,
      p_proof_url: form.proof_url.trim() || null,
      p_social_url: form.social_url.trim() || null,
      p_availability: form.availability,
      p_bio: form.bio.trim(),
      p_motivation: form.motivation.trim(),
      p_id_number: form.id_number,
    });

    if (err) {
      setSubmitting(false);
      // Never log the form: it contains the ID number.
      console.error("Mentor application error:", err.message);
      const msg = err.message || "";
      if (msg.includes("duplicate_id_number")) {
        setError("An application with this ID number has already been submitted.");
      } else if (msg.includes("invalid_id_number")) {
        setError("That ID number is not valid. Please check it and try again.");
      } else {
        setError("Something went wrong submitting your application. Please try again.");
      }
      return;
    }

    // Application saved → send the confirmation email
    await sendConfirmationEmail(name, email);

    // Don't keep the ID number in memory once it has been submitted
    set("id_number", "");
    setSubmitting(false);
    setView("done");
  };

  // ── Intro ──
  if (view === "intro") {
    return (
      <div className="mentor-page-wrap">
        <div className="dashboard-card mentor-card mentor-intro">
          <div className="card-header">
            <h2>Become a Mentor</h2>
          </div>
          <p className="mentor-lead">
            Share your trading knowledge with the Blue Chip community. Apply to become a mentor and
            our team will review your application.
          </p>
          <ul className="mentor-perks">
            <li>Guide traders through live sessions and reviews</li>
            <li>Build your reputation inside the community</li>
            <li>Applications are reviewed by our team</li>
          </ul>
          <button className="mentor-btn primary" onClick={() => setView("form")}>
            Apply Now
          </button>
        </div>
      </div>
    );
  }

  // ── Already applied ──
  if (view === "existing" && existing) {
    return (
      <div className="mentor-page-wrap">
        <div className="dashboard-card mentor-card">
          <div className="card-header">
            <h2>Your Application</h2>
          </div>
          <p className="mentor-lead">
            You submitted a mentor application on{" "}
            {new Date(existing.created_at).toLocaleDateString()}.
          </p>
          <span className={`mentor-status ${existing.status}`}>● {existing.status}</span>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (view === "done") {
    return (
      <div className="mentor-page-wrap">
        <div className="dashboard-card mentor-card mentor-success">
          <div className="mentor-success-icon">✓</div>
          <h3>Application submitted</h3>
          <p className="mentor-lead">
            Thanks, {form.full_name.split(" ")[0]}. Your application is now pending review. We've
            sent a confirmation to {form.email}.
          </p>
          <span className="mentor-status pending">● pending</span>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="mentor-page-wrap">
      <form className="dashboard-card mentor-card" onSubmit={handleSubmit} noValidate>
        <div className="card-header">
          <h2>Mentor Application</h2>
        </div>

        <div className="mentor-grid">
          <label className="mentor-field">
            <span className="mentor-label">Full Name *</span>
            <input className="mentor-input" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </label>
          <label className="mentor-field">
            <span className="mentor-label">Email *</span>
            <input type="email" className="mentor-input" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="mentor-field">
            <span className="mentor-label">Phone</span>
            <input className="mentor-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label className="mentor-field">
            <span className="mentor-label">Country *</span>
            <input className="mentor-input" value={form.country} onChange={(e) => set("country", e.target.value)} />
          </label>
          <label className="mentor-field">
            <span className="mentor-label">Years Trading *</span>
            <input type="number" min="0" step="0.5" className="mentor-input" value={form.years_trading} onChange={(e) => set("years_trading", e.target.value)} />
          </label>
          <label className="mentor-field">
            <span className="mentor-label">Trading Style *</span>
            <select className="mentor-input" value={form.trading_style} onChange={(e) => set("trading_style", e.target.value)}>
              <option value="">Select…</option>
              {STYLE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mentor-field mentor-full">
          <span className="mentor-label">
            ID Number *
            <span className="mentor-label-count">({form.id_number.length}/13)</span>
          </span>
          <input
            name="id_number"
            className={`mentor-input ${idError ? "invalid" : ""}`}
            placeholder="13-digit SA ID"
            value={form.id_number}
            onChange={handleIdChange}
            onBlur={() => setIdTouched(true)}
            maxLength={13}
            inputMode="numeric"
            autoComplete="off"
          />
          {idError && <span className="mentor-field-error">{idError}</span>}
          <span className="mentor-secure">
             Your ID number is converted to a one-way hash before it is saved. We never store the number itself.
          </span>
        </label>

        <div className="mentor-field mentor-full">
          <span className="mentor-label">Markets You Trade *</span>
          <div className="mentor-chips">
            {MARKET_OPTIONS.map((m) => (
              <button
                type="button"
                key={m}
                className={`mentor-chip ${form.markets.includes(m) ? "active" : ""}`}
                onClick={() => set("markets", toggleInList(form.markets, m))}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="mentor-field mentor-full">
          <span className="mentor-label">Availability *</span>
          <div className="mentor-chips">
            {AVAILABILITY_OPTIONS.map((a) => (
              <button
                type="button"
                key={a}
                className={`mentor-chip ${form.availability === a ? "active" : ""}`}
                onClick={() => set("availability", a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="mentor-grid">
          <label className="mentor-field">
            <span className="mentor-label">Verified Results Link (Myfxbook, FTMO, etc.)</span>
            <input className="mentor-input" placeholder="https://" value={form.proof_url} onChange={(e) => set("proof_url", e.target.value)} />
          </label>
          <label className="mentor-field">
            <span className="mentor-label">Social / Portfolio Link</span>
            <input className="mentor-input" placeholder="https://" value={form.social_url} onChange={(e) => set("social_url", e.target.value)} />
          </label>
        </div>

        <label className="mentor-field mentor-full">
          <span className="mentor-label">Track Record</span>
          <textarea className="mentor-input mentor-textarea" placeholder="Funded accounts, results, notable achievements…" value={form.track_record} onChange={(e) => set("track_record", e.target.value)} />
        </label>

        <label className="mentor-field mentor-full">
          <span className="mentor-label">About You *</span>
          <textarea className="mentor-input mentor-textarea" placeholder="Your background and trading approach (50+ characters)" value={form.bio} onChange={(e) => set("bio", e.target.value)} />
          <span className="mentor-count">{form.bio.trim().length} chars</span>
        </label>

        <label className="mentor-field mentor-full">
          <span className="mentor-label">Why Do You Want To Mentor? *</span>
          <textarea className="mentor-input mentor-textarea" value={form.motivation} onChange={(e) => set("motivation", e.target.value)} />
        </label>

        <label className="mentor-check">
          <input type="checkbox" checked={form.agreed} onChange={(e) => set("agreed", e.target.checked)} />
          <span>I confirm the information above is accurate.</span>
        </label>

        {error && <div className="mentor-error">{error}</div>}

        <div className="mentor-actions">
          <button type="submit" className="mentor-btn primary" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Application"}
          </button>
          <button type="button" className="mentor-btn" onClick={() => setView("intro")} disabled={submitting}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}