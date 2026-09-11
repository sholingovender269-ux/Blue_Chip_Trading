import { useState } from "react";
import "./Login.css";
import { supabase } from "./supabaseClient";

export default function LoginPage({ onLogin, onBack, onGoToSignup, onGoToForgotPassword, onGoToAdmin }) {
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
      // Step 1: Sign in with Supabase Auth (all roles, including admin)
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.log("Auth error:", authError.message, authError.status);
        setError(authError.message);
        return;
      }

      if (role === "admin") {
        // Step 2 (admin): look them up in the admins table
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
        if (onLogin) onLogin(user);
        if (onGoToAdmin) onGoToAdmin();
        return;
      }

      // Step 2 (client/mentor): look them up in the clients table
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("email", email)
        .single();

      if (clientError || !clientData) {
        setError("Account not found.");
        return;
      }

      const user = {
        id: authData.user.id,
        firstName: clientData.first_name,
        lastName: clientData.last_name,
        name: `${clientData.first_name} ${clientData.last_name}`,
        email: clientData.email,
        idNumber: clientData.id_number,
        role,
      };

      localStorage.setItem("bct_user", JSON.stringify(user));
      if (onLogin) onLogin(user);

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
            <div className="login-badge">Member Access</div>
            <h1>Welcome Back</h1>
            <p>Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">

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
              <button
                type="button"
                className="forgot-link"
                onClick={onGoToForgotPassword}
              >
                Forgot password?
              </button>
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
            <button className="signup-link" onClick={onGoToSignup}>Sign Up</button>
            <br /><br />
            <button className="demo-btn" onClick={onBack}>← Back to Home</button>
          </div>
        </div>
      </div>
    </div>
  );
}