import React, { useState, useEffect } from "react";
import Homepage from "./homepage.jsx";
import LoginPage from "./login.jsx";
import Signup from "./Signup.jsx";
import Payment from "./Payment.jsx";
import Landing from "./landing.jsx";
import ForgotPasswordPage from "./fPassword.jsx";
import Admin from "./admin.jsx";
import { supabase } from "./supabaseClient";

function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  // On first mount, try to restore a previous session from localStorage
  // so refreshing the page doesn't drop the user back to the homepage.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("bct_user");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id) {
          setUser(parsed);
          setPage(parsed.role === "admin" ? "admin" : "dashboard");
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
          if (userData.role !== "admin") {
            setPage("dashboard");
          }
        }}
      />
    );
  }

  if (page === "admin") {
    return (
      <Admin
        user={user}
        onLogout={() => {
          setUser(null);
          localStorage.removeItem("bct_user");
          setPage("home");
        }}
      />
    );
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
        onLogout={() => {
          setUser(null);
          localStorage.removeItem("bct_user");
          setPage("home");
        }}
      />
    );
  }

  return (
    <Homepage
      onLoginClick={() => setPage("login")}
      onSignupClick={() => setPage("signup")}
    />
  );
}

export default App;