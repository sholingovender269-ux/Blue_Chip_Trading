import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import Homepage from "./homepage.jsx";
import LoginPage from "./login.jsx";
import Signup from "./Signup.jsx";
import Payment from "./Payment.jsx";
import Verification from "./Verification.jsx";
import Landing from "./landing.jsx";
import ForgotPasswordPage from "./fPassword.jsx";
import ResetPasswordPage from "./resetPassword.jsx";
import Admin from "./admin.jsx";
import AdminLogin from "./adminLogin.jsx";
import MentorApplication from "./mentorApplication.jsx";
import { supabase } from "./supabaseClient";

const isResetLink =
  new URLSearchParams(window.location.search).has("mentor_reset") ||
  (window.location.hash || "").includes("type=recovery");

const isAdminHash = () => (window.location.hash || "") === "#admin";

const clearAdminHash = () => {
  try {
    if (isAdminHash()) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  } catch {
  }
};

const MentorApp = lazy(() => import("./Mdashboard.jsx"));

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
  const [page, setPage] = useState(
    isResetLink ? "reset-password" : isAdminHash() ? "admin-login" : "home"
  );
  const [forgotRole, setForgotRole] = useState("client");
  const [user, setUser] = useState(null);
  const [checkedStorage, setCheckedStorage] = useState(false);
  const [paymentSessionId, setPaymentSessionId] = useState(() =>
    new URLSearchParams(window.location.search).get("session_id")
  );

  const userRef = useRef(null);
  userRef.current = user;

  const pageForRole = (role) =>
    role === "admin" ? "admin" : role === "mentor" ? "mentor-portal" : "dashboard";

  useEffect(() => {
    const restore = async () => {
      try {
        if (isResetLink) return; // don't auto-login over a reset link
        const stored = localStorage.getItem("bct_user");
        if (stored) {
          const parsed = JSON.parse(stored);
          let valid = false;

          if (parsed && parsed.id) {
            if (parsed.role === "mentor") {
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
            if (isAdminHash() && parsed.role !== "admin") {
              setPage("admin-login");
            } else {
              clearAdminHash();
              setPage(pageForRole(parsed.role));
            }
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

  useEffect(() => {
    const onHashChange = () => {
      if (!isAdminHash()) return;
      if (userRef.current?.role === "admin") {
        clearAdminHash();
        setPage("admin");
      } else {
        setPage("admin-login");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const hash = window.location.hash || "";
    const isExpiredOrInvalidLink =
      hash.includes("error=access_denied") || hash.includes("otp_expired");
    if (isExpiredOrInvalidLink) {
      setPage("forgot-password"); // let them request a fresh link
    }
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPage("reset-password");
      }
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    const wasMentor = user?.role === "mentor";
    setUser(null);
    localStorage.removeItem("bct_user");
    clearAdminHash();
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out failed:", err);
    }
    if (wasMentor) {
      window.location.reload();
    } else {
      setPage("home");
    }
  };

  const renderAdminLogin = () => (
    <AdminLogin
      onLogin={(adminUser) => {
        setUser(adminUser);
        setPage("admin");
      }}
      onGoToAdmin={() => setPage("admin")}
      onGoToForgotPassword={(role) => {
        setForgotRole(role || "admin");
        setPage("forgot-password");
      }}
      onBack={() => setPage("home")}
    />
  );

  if (paymentSessionId) {
    return (
      <Verification
        sessionId={paymentSessionId}
        onComplete={() => {
          setPaymentSessionId(null);
          setPage("login");
        }}
      />
    );
  }

  if (!checkedStorage) {
    return null;
  }

  if (page === "login") {
    return (
      <LoginPage
        onBack={() => setPage("home")}
        onGoToSignup={() => setPage("signup")}
        onGoToForgotPassword={(r) => { setForgotRole(r); setPage("forgot-password"); }}
        onGoToAdmin={() => setPage("admin-login")}
        onLogin={(userData) => {
          setUser(userData);
          setPage(pageForRole(userData.role));
        }}
      />
    );
  }

  if (page === "admin-login") {
    return renderAdminLogin();
  }

  if (page === "mentor-portal") {
    if (!user || user.role !== "mentor") {
      return (
        <LoginPage
          onBack={() => setPage("home")}
          onGoToSignup={() => setPage("signup")}
          onGoToForgotPassword={(r) => { setForgotRole(r); setPage("forgot-password"); }}
          onGoToAdmin={() => setPage("admin-login")}
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
    if (!user || user.role !== "admin") {
      return renderAdminLogin();
    }
    return <Admin user={user} onLogout={handleLogout} />;
  }

  if (page === "forgot-password") {
    return (
      <ForgotPasswordPage
        initialRole={forgotRole}
        onBack={() => setPage(forgotRole === "admin" ? "admin-login" : "login")}
      />
    );
  }

  if (page === "reset-password") {
    return <ResetPasswordPage onDone={() => setPage("login")} />;
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
      onAdminClick={() => setPage("admin-login")}
    />
  );
}

export default App;