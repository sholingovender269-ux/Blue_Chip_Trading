import React, { useState, useEffect, lazy, Suspense } from "react";
import Homepage from "./homepage.jsx";
import LoginPage from "./login.jsx";
import Signup from "./Signup.jsx";
import Payment from "./Payment.jsx";
import Landing from "./landing.jsx";
import ForgotPasswordPage from "./fPassword.jsx";
import Admin from "./admin.jsx";
import MentorApplication from "./mentorApplication.jsx";
import { supabase } from "./supabaseClient";

// Lazy-loaded so the mentor portal's CSS (global, generic class names like
// .main / .section / .error-message) is only loaded for mentors and can't
// restyle the login, homepage or client pages.
const MentorApp = lazy(() => import("./Mdashboard.jsx"));

// Shows the real error on screen instead of a blank/black page if the
// mentor portal fails to load or crashes while rendering.
class PortalErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Mentor portal crashed:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, color: "#fff", background: "#1a0b0b", minHeight: "100vh", fontFamily: "monospace" }}>
        <h2 style={{ marginTop: 0 }}>Mentor portal failed to load</h2>
        <p style={{ whiteSpace: "pre-wrap", color: "#ff9a9a" }}>
          {String(this.state.error?.message || this.state.error)}
        </p>
        <button onClick={this.props.onLogout} style={{ padding: "8px 16px", cursor: "pointer" }}>
          Log out
        </button>
      </div>
    );
  }
}

function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  const pageForRole = (role) =>
    role === "admin" ? "admin" : role === "mentor" ? "mentor-portal" : "dashboard";

  // On first mount, restore a previous session so refreshing doesn't drop
  // the user back to the homepage. The stored user is only trusted if
  // there is still a matching Supabase Auth session.
  useEffect(() => {
    const restore = async () => {
      try {
        const stored = localStorage.getItem("bct_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          let valid = false;

          if (parsed && parsed.id) {
            if (parsed.role === "mentor") {
              // Mentors have no Supabase Auth session; confirm they still exist.
              const { data } = await supabase.rpc("mentor_exists", {
                p_id: parsed.id,
              });
              valid = data === true;
            } else {
              const { data } = await supabase.auth.getSession();
              valid = data?.session?.user?.id === parsed.id;
            }
          }

          if (valid) {
            setUser(parsed);
            setPage(pageForRole(parsed.role));
          } else {
            localStorage.removeItem("bct_user");
          }
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
        localStorage.removeItem("bct_user");
      } finally {
        setCheckedStorage(true);
      }
    };
    restore();
  }, []);

  // Handle password recovery links
  useEffect(() => {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const isRecoveryLink =
      hash.includes("type=recovery") ||
      new URLSearchParams(search).get("type") === "recovery";
    const isExpiredOrInvalidLink =
      hash.includes("error=access_denied") || hash.includes("otp_expired");
    if (isRecoveryLink || isExpiredOrInvalidLink) {
      setPage("forgot-password");
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPage("forgot-password");
      }
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const wasMentor = user?.role === "mentor";
    setUser(null);
    localStorage.removeItem("bct_user");
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
    // Reload after a mentor logs out so the mentor portal's global CSS is
    // dropped before the public pages show again.
    if (wasMentor) {
      window.location.reload();
    } else {
      setPage("home");
    }
  };

  if (!checkedStorage) {
    return null;
  }

  if (page === "login") {
    return (
      <LoginPage
        onBack={() => setPage("home")}
        onGoToSignup={() => setPage("signup")}
        onGoToForgotPassword={() => setPage("forgot-password")}
        onGoToAdmin={() => setPage("admin")}
        onLogin={(userData) => {
          setUser(userData);
          if (userData.role === "mentor") {
            setPage("mentor-portal");
          } else if (userData.role !== "admin") {
            setPage("dashboard");
          }
        }}
      />
    );
  }

  if (page === "mentor-portal") {
    // Guard: only a logged-in mentor can see the portal
    if (!user || user.role !== "mentor") {
      return (
        <LoginPage
          onBack={() => setPage("home")}
          onGoToSignup={() => setPage("signup")}
          onGoToForgotPassword={() => setPage("forgot-password")}
          onGoToAdmin={() => setPage("admin")}
          onLogin={(userData) => {
            setUser(userData);
            setPage(pageForRole(userData.role));
          }}
        />
      );
    }
    return (
      <PortalErrorBoundary onLogout={handleLogout}>
        <Suspense
          fallback={<div style={{ padding: 32, color: "#fff" }}>Loading mentor portal…</div>}
        >
          <MentorApp user={user} onLogout={handleLogout} />
        </Suspense>
      </PortalErrorBoundary>
    );
  }

  if (page === "admin") {
    return <Admin user={user} onLogout={handleLogout} />;
  }

  if (page === "forgot-password") {
    return (
      <ForgotPasswordPage
        onBack={() => setPage("login")}
        onDone={() => setPage("login")}
      />
    );
  }

  if (page === "signup") {
    return (
      <Signup
        onGoToLogin={() => setPage("login")}
        onGoToPayment={(userData) => {
          setUser(userData);
          setPage("payment");
        }}
        onBack={() => setPage("home")}
      />
    );
  }

  if (page === "payment") {
    return (
      <Payment
        user={user}
        onBack={() => setPage("signup")}
        onSuccess={() => setPage("login")}
      />
    );
  }

  // Public mentor application (opened from the homepage buttons)
  if (page === "mentor") {
    return (
      <div className="dashboard-page">
        <div className="dashboard-grid" />
        <div style={{ position: "relative", zIndex: 1, padding: "20px 24px 0" }}>
          <button
            type="button"
            onClick={() => setPage(user ? pageForRole(user.role) : "home")}
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "inherit",
              padding: "8px 16px",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
        </div>
        <MentorApplication user={user} />
      </div>
    );
  }

  if (page === "dashboard") {
    return (
      <Landing
        user={user}
        onUserUpdate={(updatedUser) => {
          setUser(updatedUser);
          try {
            localStorage.setItem("bct_user", JSON.stringify(updatedUser));
          } catch (err) {
            console.error("Failed to persist updated user:", err);
          }
        }}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <Homepage
      onLoginClick={() => setPage("login")}
      onSignupClick={() => setPage("signup")}
      onMentorClick={() => setPage("mentor")}
    />
  );
}

export default App;