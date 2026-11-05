import { useEffect, useState } from "react";
import "./Login.css";
import { supabase } from "./supabaseClient";


const getPasswordStrength = (pwd) => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (pwd.length >= 12) score++;
  return score;
};

const strengthLabels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
const strengthClasses = ["", "pw-weak", "pw-fair", "pw-good", "pw-strong", "pw-vstrong"];

export default function ResetPasswordPage({ onDone }) {
  const params = new URLSearchParams(window.location.search);
  const mentorToken = params.get("mentor_reset");
  const isMentor = !!mentorToken;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(isMentor);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const strengthScore = getPasswordStrength(password);
  const requirements = [
    { label: "8+ chars",  met: password.length >= 8 },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Number",    met: /[0-9]/.test(password) },
    { label: "Symbol",    met: /[^A-Za-z0-9]/.test(password) },
  ];

  useEffect(() => {
    if (isMentor) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [isMentor]);

  const finish = async () => {
    window.history.replaceState({}, "", window.location.pathname);
    if (!isMentor) await supabase.auth.signOut();
    setTimeout(() => onDone && onDone(), 1500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setLoading(true);
    try {
      if (isMentor) {
        const { data, error: rpcErr } = await supabase.rpc("mentor_reset_with_token", {
          p_token: mentorToken,
          p_new: password,
        });
        if (rpcErr) throw rpcErr;
        if (!data) {
          setError("This reset link is invalid or has expired. Please request a new one.");
          return;
        }
      } else {
        const { error: updErr } = await supabase.auth.updateUser({ password });
        if (updErr) throw updErr;
      }
      setSuccess("Password updated. Redirecting to login...");
      await finish();
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not reset password. Please try again.");
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
            <div className="login-badge">{isMentor ? "Mentor" : "Client"} Reset</div>
            <h1>Set New Password</h1>
            <p>Choose a new password for your account</p>
          </div>

          {!ready ? (
            <div className="error-message">
              This reset link is invalid or has expired. Please request a new one.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="login-form">
              <div className="input-group">
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />

                {password.length > 0 && (
                  <div className="pw-meter">
                    <div className="pw-bars">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={i}
                          className={`pw-bar ${i <= strengthScore ? strengthClasses[strengthScore] : ""}`}
                        />
                      ))}
                    </div>
                    <span className={`pw-label ${strengthClasses[strengthScore]}`}>
                      {strengthLabels[strengthScore]}
                    </span>
                  </div>
                )}

                <ul className="pw-requirements">
                  {requirements.map((req) => (
                    <li key={req.label} className={req.met ? "pw-met" : "pw-unmet"}>
                      <span className="pw-pill">{req.met ? "✓" : "×"}</span>
                      {req.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="input-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div className="success-message">{success}</div>}

              <button type="submit" className="login-btn" disabled={loading || !!success}>
                {loading ? (
                  <span className="btn-loading"><span className="spinner" /> Saving...</span>
                ) : (
                  "Update Password"
                )}
              </button>
            </form>
          )}

          <div className="login-footer">
            <button className="demo-btn" onClick={onDone}>← Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}