import React, { useState, useEffect, useRef } from "react";
import emailjs from "@emailjs/browser";
import "./Verification.css";
import { supabase } from "./supabaseClient";

const EMAILJS_SERVICE_ID = "service_6e2lrip";
const EMAILJS_TEMPLATE_ID = "template_5d2o1yi";
const EMAILJS_PUBLIC_KEY = "iJf91K9SaKpnpTDzB";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWelcomeEmail(params) {
  let lastError = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await emailjs.send(
        EMAILJS_SERVICE_ID.trim(),
        EMAILJS_TEMPLATE_ID.trim(),
        params,
        { publicKey: EMAILJS_PUBLIC_KEY.trim() }
      );
      console.log("EmailJS success:", res.status, res.text);
      return { ok: true };
    } catch (err) {
      const status = err?.status;
      const text = err?.text || err?.message || String(err);
      lastError = status ? `${status}: ${text}` : "Blocked or network error (check ad-blocker)";
      console.error(`EmailJS attempt ${attempt} failed:`, status, text, err);
      if (status && status >= 400 && status < 500 && status !== 429) break;
      await sleep(1000 * attempt);
    }
  }
  return { ok: false, error: lastError };
}

export default function Verification({ sessionId, onComplete }) {
  const [status, setStatus] = useState("Processing");
  const [message, setMessage] = useState("Confirming your payment...");
  const [info, setInfo] = useState({ name: "", email: "" });
  const [emailStatus, setEmailStatus] = useState("—");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const fail = (msg) => {
      setStatus("Failed");
      setMessage(msg);
    };

    (async () => {
      let form = null;
      try {
        form = JSON.parse(sessionStorage.getItem("bct_pending"));
      } catch {}

      if (!form) {
        return fail("Signup details not found. Please sign up again in the same browser tab.");
      }

      setMessage("Payment received. Creating your account...");

      const { data, error } = await supabase.functions.invoke("confirm-payment", {
        body: { sessionId, form },
      });

      if (error || !data?.paid) {
        let detail = data?.error || error?.message || "Payment could not be confirmed.";
        try { detail = await error.context.text(); } catch {}
        console.error("Confirm error:", detail);
        return fail(detail);
      }

      const formCopy = { ...form };
      sessionStorage.removeItem("bct_pending");

      const name =
        data.name ||
        `${formCopy.firstName || ""} ${formCopy.lastName || ""}`.trim() ||
        "there";
      const email = (data.email || formCopy.email || "").trim();

      setInfo({ name, email });
      setMessage("Account created. Sending confirmation email...");
      setEmailStatus("Sending...");

      const today = new Date();
      const next = new Date(today);
      next.setDate(today.getDate() + 30);
      const fmt = (d) =>
        d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });

      if (!email) {
        console.error("No recipient email available.", data, Object.keys(formCopy));
        setEmailStatus("Not sent (no email address)");
      } else {
        const result = await sendWelcomeEmail({
          to_name: name,
          to_email: email,
          payment_date: fmt(today),
          next_billing_date: fmt(next),
        });
        setEmailStatus(result.ok ? "Sent ✓" : `Failed (${result.error})`);
      }

      setStatus("Processed");
      setMessage("Verification complete.");

      window.history.replaceState({}, "", window.location.pathname);

      setTimeout(() => onComplete && onComplete(), 4000);
    })();
  }, [sessionId]);

  return (
    <div className="bank-container">
      <div className="confirmation-card">
        <div className="bank-header">
          <div className="bank-logo">Blue Chip Trading</div>
          <span className="secure-badge">Secure Verification</span>
        </div>
        <hr className="divider" />
        <div className="status-visual">
          {status === "Processing" ? (
            <div className="spinner"></div>
          ) : (
            <div className="success-icon">{status === "Failed" ? "✕" : "✓"}</div>
          )}
        </div>
        <div className="transaction-info">
          <h2>{status}</h2>
          <p className={status === "Processing" ? "timer-alert" : "success-msg"}>{message}</p>
        </div>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Name</span>
            <span className="detail-value">{info.name || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Email</span>
            <span className="detail-value">{info.email || "—"}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Confirmation email</span>
            <span className="detail-value">{emailStatus}</span>
          </div>
        </div>
      </div>
    </div>
  );
}