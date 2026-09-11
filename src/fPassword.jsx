import { useState, useEffect } from "react";
import "./Login.css";
import { supabase } from "./supabaseClient";

// One page, two internal steps:
//   1. "request"  — user types their email, we email them a reset link
//   2. "reset"    — user clicked that link, Supabase attaches a temporary
//                   recovery session, and they set a new password right here
//
// The step switches automatically: the reset link points back at this same
// page, and Supabase fires a PASSWORD_RECOVERY auth event when the link's
// token is present in the URL, which flips us into step 2 with no extra
// navigation needed.
export default function ForgotPasswordPage({ onBack, onDone }) {
  const [step, setStep] = useState("request"); // "request" | "reset"
  const [linkExpired, setLinkExpired] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If we got routed here because of an expired/invalid recovery link
    // (see App.jsx), surface that clearly instead of showing a blank
    // "enter your email" form with no explanation of why we're here.
    const hash = window.location.hash || "";
    if (hash.includes("error=access_denied") || hash.includes("otp_expired")) {
      setLinkExpired(true);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setError("");
        setLinkExpired(false);
        setStep("reset");
      }
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  const handleSendLink = async (e) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo: window.location.href }
      );

      if (resetError) {
        console.log("Reset request error:", resetError.message, resetError.status);
        setError(resetError.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError("Please fill in both fields.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        console.log("Password update error:", updateError.message, updateError.status);
        setError(updateError.message);
        return;
      }

      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
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
            <div className="login-badge">Account Recovery</div>

            {step === "request" ? (
              <>
                <h1>Reset Password</h1>
                <p>
                  {success
                    ? "Check your inbox for the reset link"
                    : "Enter your email and we'll send you a reset link"}
                </p>
              </>
            ) : (
              <>
                <h1>Set New Password</h1>
                <p>
                  {success
                    ? "Your password has been updated"
                    : "Choose a new password for your account"}
                </p>
              </>
            )}
          </div>

          {/* Step 1: request the reset email */}
          {step === "request" && !success && (
            <form onSubmit={handleSendLink} className="login-form">
              {linkExpired && (
                <div className="error-message">
                  That reset link has expired or was already used. Enter your
                  email below to get a new one.
                </div>
              )}

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

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? (
                  <span className="btn-loading">
                    <span className="spinner" /> Sending...
                  </span>
                ) : (
                  "Send Reset Link"
                )}
              </button>
            </form>
          )}

          {step === "request" && success && (
            <div className="success-message">
              If an account exists for <strong>{email}</strong>, a password
              reset link is on its way. Open it from this device to continue
              here and set a new password.
            </div>
          )}

          {/* Step 2: set the new password, reached via the emailed link */}
          {step === "reset" && !success && (
            <form onSubmit={handleSetPassword} className="login-form">
              <div className="input-group">
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? (
                  <span className="btn-loading">
                    <span className="spinner" /> Updating...
                  </span>
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          )}

          {step === "reset" && success && (
            <>
              <div className="success-message">
                Your password was updated successfully. You can now log in
                with your new password.
              </div>
              <button className="login-btn" style={{ marginTop: 25 }} onClick={onDone}>
                Back to Log In
              </button>
            </>
          )}

          {!(step === "reset" && success) && (
            <div className="login-footer">
              Remembered your password?{" "}
              <button className="signup-link" onClick={onBack}>Log In</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}