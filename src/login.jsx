import { useState } from "react";
import "./Login.css";

export default function LoginPage({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState("client");
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
      const res = await fetch("https://blue-chip.infinityfree.me/login.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role }),
        }
      );

      const data = await res.json();

      if (data.success) {
        localStorage.setItem("bct_user", JSON.stringify(data.user));
        if (onLogin) onLogin(data.user);
      } else {
        setError(data.error || "Login failed. Please try again.");
      }
    } catch (err) {
      setError("Could not connect to server. Make sure XAMPP is running.");
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
            <div className="login-badge">Member Access</div>
            <h1>Welcome Back</h1>
            <p>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">

            {/* Role Selector */}
            <div className="role-selector">
              {[
                { id: "client", icon: "📈", label: "Client"  },
                { id: "mentor", icon: "🎓", label: "Mentor"  },
                { id: "admin",  icon: "⚙️",  label: "Admin"   },
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

            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="login-options">
              <label className="checkbox">
                <input type="checkbox" /> Remember me
              </label>
              <a href="#" className="forgot-link">Forgot password?</a>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? (
                <span className="btn-loading">
                  <span className="spinner" /> Signing in...
                </span>
              ) : (
                "Log In"
              )}
            </button>

          </form>

          <div className="login-footer">
            Don't have an account?{" "}
            <button className="signup-link">Sign Up</button>
            <br /><br />
            <button className="demo-btn" onClick={onBack}>← Back to Home</button>
          </div>
        </div>
      </div>
    </div>
  );
}