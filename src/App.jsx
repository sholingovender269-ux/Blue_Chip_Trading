import React, { useState } from "react";
import Homepage from "./homepage.jsx";
import LoginPage from "./login.jsx";
import Signup from "./Signup.jsx";
import Payment from "./Payment.jsx";
import Landing from "./landing.jsx";

function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);

  if (page === "login") {
    return (
      <LoginPage
        onBack={() => setPage("home")}
        onGoToSignup={() => setPage("signup")}
        onLogin={(userData) => {
          setUser(userData);
          setPage("dashboard");
        }}
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
        onLogout={() => { setUser(null); setPage("home"); }}
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