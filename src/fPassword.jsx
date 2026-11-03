import { useState } from "react";
import "./Login.css";
import { supabase } from "./supabaseClient";

export default function ForgotPasswordPage({ initialRole = "client", onBack }) {
  const [role, setRole] = useState(initialRole === "mentor" ? "mentor" : "client");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    setLoading(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("quick-responder", {
        body: { email: email.trim(), role },
      });
      if (fnError) throw fnError;
      // Same message whether or not the account exists (prevents email enumeration)
      setSuccess("If that email is registered, a reset link has been sent. Check your inbox.");
    } catch (err) {
      console.error(err);
      setError("Could not send the reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">Blue <span>Chip</span> Trading</div>
            <div className="login-badge">Password Recovery</div>
            <h1>Forgot Password?</h1>
            <p>Enter your email and we'll send you a reset link</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            <div className="role-selector">
              {[
                { id: "client", icon: "📈", label: "Client" },
                { id: "mentor", icon: "🎓", label: "Mentor" },
              ].map(({ id, icon, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`role-btn ${role === id ? "active" : ""}`}
                  onClick={() => setRole(id)}
                >
                  <span className="role-icon">{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && <div className="error-message">{error}</div>}
            {success && <div className="success-message">{success}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading"><span className="spinner" /> Sending...</span>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>

          <div className="login-footer">
            <button className="demo-btn" onClick={onBack}>← Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}