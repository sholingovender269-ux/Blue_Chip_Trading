import { useState } from "react";
import "./AdminLogin.css";
import { supabase } from "./supabaseClient";

// Standalone admin sign-in page. Same logic as the old "Admin" option on the
// login page: Supabase Auth sign-in, then a lookup in the `admins` table.
// Reached via the #admin URL (see the App.jsx snippet), not from any public button.

function clearAdminHash() {
  try {
    if (window.location.hash === "#admin") {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {
    // ignore
  }
}

export default function AdminLogin({ onLogin, onBack, onGoToForgotPassword, onGoToAdmin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // Step 1 - sign in with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.log("Auth error:", authError.message, authError.status);
        setError(authError.message);
        return;
      }

      // Step 2 - look them up in the admins table
      const { data: adminData, error: adminError } = await supabase
        .from("admins")
        .select("*")
        .eq("id", authData.user.id)
        .single();

      if (adminError || !adminData) {
        setError("This account is not registered as an admin.");
        await supabase.auth.signOut();
        return;
      }

      const user = {
        id: adminData.id,
        firstName: adminData.name,
        lastName: adminData.surname,
        name: `${adminData.name} ${adminData.surname}`,
        email: adminData.email,
        role: "admin",
      };

      localStorage.setItem("bct_user", JSON.stringify(user));
      clearAdminHash();
      if (onLogin) onLogin(user);
      if (onGoToAdmin) onGoToAdmin();
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    clearAdminHash();
    if (onBack) onBack();
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <div className="admin-login-logo">
            Blue <span>Chip</span> Trading
          </div>
          <div className="admin-login-badge">🔒 Restricted Area</div>
          <h1>Admin Sign In</h1>
          <p>Authorized personnel only</p>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-login-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="admin@example.com"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="admin-login-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="admin-login-options">
            <button
              type="button"
              className="admin-login-forgot"
              onClick={() => onGoToForgotPassword && onGoToForgotPassword("admin")}
            >
              Forgot password?
            </button>
          </div>

          {error && <div className="admin-login-error">{error}</div>}

          <button type="submit" className="admin-login-btn" disabled={loading}>
            {loading ? (
              <span className="admin-login-loading">
                <span className="admin-login-spinner" /> Signing in...
              </span>
            ) : (
              "Log In"
            )}
          </button>
        </form>

        <div className="admin-login-footer">
          <button type="button" className="admin-login-back" onClick={handleBack}>
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}