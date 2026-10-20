import React, { useState } from "react";
import "./Mdashboard.css";
import "./mReset.css";
import MyStudents from "./Mystudents.jsx";
import MentorSignals from "./Mentorsignals.jsx";
import MentorCourses from "./Mcourses.jsx";
import Community from "./community.jsx";
import GoLive from "./glive.jsx";
import MentorProfile from "./mentorProfile.jsx";
import MentorReset from "./mReset.jsx";

// Mentor portal. The top navbar stays on screen and swaps the page below it.
// Connected: My Students, Signals, Courses, Community, Go Live, Profile, Reset Password.

const NAV = [
    { key: "dashboard", label: "Dashboard" },
    { key: "students", label: "My Students" },
    { key: "signals", label: "Signals" },
    { key: "courses", label: "Courses" },
    { key: "community", label: "Community" },
    { key: "profile", label: "Profile" },
    { key: "mentorReset", label: "Reset Password" },
];

const CARDS = [
    { key: "students", icon: "👥", title: "My Students", text: "View your students, their courses and learning progress." },
    { key: "golive", icon: "🔴", title: "Go Live", text: "Start or manage a live trading and teaching session." },
    { key: "signals", icon: "📊", title: "Trading Signals", text: "Create, manage and share trading signals with students." },
    { key: "courses", icon: "📚", title: "My Courses", text: "View and manage your assigned courses and learning material." },
    { key: "community", icon: "💬", title: "Community", text: "Interact with students and participate in discussions." },
    { key: "profile", icon: "👤", title: "My Profile", text: "Update your photo, bio, trading style and experience." },
];

// True only until the user changes the auto-generated password once.
const needsReset = (u) =>
    !!(u?.must_change_password ?? u?.mustChangePassword ?? u?.first_login ?? u?.firstLogin);

export default function MentorPortal({ user, onLogout }) {
    // Local copy so profile edits show up straight away (name, photo).
    const [currentUser, setCurrentUser] = useState(user);
    const forced = needsReset(currentUser);
    const [pageState, setPage] = useState("dashboard");
    // While the first-login reset is pending, the reset page is the only page.
    const page = forced ? "mentorReset" : pageState;

    const go = (key) => (e) => {
        e.preventDefault();
        if (forced) return;
        setPage(key);
    };

    const handlePasswordChanged = () => {
        setCurrentUser((u) => ({
            ...u,
            must_change_password: false,
            mustChangePassword: false,
            first_login: false,
            firstLogin: false,
        }));
        setPage("dashboard");
    };

    const firstName =
        currentUser?.first_name || currentUser?.firstName || currentUser?.name?.split(" ")[0] || "";

    return (
        <>
            {/* NAVBAR */}
            <nav className="navbar">
                <a href="#" className="logo" onClick={go("dashboard")} style={{ textDecoration: "none" }}>
                    Blue Chip <span>Trading</span>
                </a>

                <div className="nav-links">
                    {NAV.map((item) => (
                        <a
                            key={item.key}
                            href="#"
                            onClick={go(item.key)}
                            className={`nav-link ${page === item.key ? "active" : ""} ${
                                forced && item.key !== "mentorReset" ? "nav-locked" : ""
                            }`}
                        >
                            {item.label}
                        </a>
                    ))}

                    <a href="#" onClick={go("golive")} className={`go-live-nav ${forced ? "nav-locked" : ""}`}>
                        Go Live
                    </a>

                    <a
                        href="#"
                        className="nav-link"
                        onClick={(e) => {
                            e.preventDefault();
                            onLogout?.();
                        }}
                    >
                        Log out
                    </a>
                </div>
            </nav>

            {/* DASHBOARD */}
            {page === "dashboard" && (
                <main className="main">
                    <section className="welcome">
                        <div>
                            <p className="label">MENTOR PORTAL</p>
                            <h1>Welcome back{firstName ? `, ${firstName}` : ""}</h1>
                            <p className="welcome-text">
                                Manage your students, trading sessions and
                                educational content from your dashboard.
                            </p>
                        </div>
                    </section>

                    <section className="section">
                        <div className="section-heading">
                            <p className="label">QUICK ACCESS</p>
                            <h2>Mentor Tools</h2>
                        </div>

                        <div className="cards">
                            {CARDS.map((c) => (
                                <a
                                    key={c.key}
                                    href="#"
                                    onClick={go(c.key)}
                                    className="dashboard-card"
                                >
                                    <div className="card-icon">{c.icon}</div>
                                    <h3>{c.title}</h3>
                                    <p>{c.text}</p>
                                    <div className="arrow">→</div>
                                </a>
                            ))}
                        </div>
                    </section>
                </main>
            )}

            {/* CONNECTED PAGES (each one renders under the same top navbar) */}
            {page === "students" && <MyStudents onNavigate={setPage} />}
            {page === "signals" && <MentorSignals onNavigate={setPage} user={currentUser} />}
            {page === "courses" && <MentorCourses onNavigate={setPage} user={currentUser} />}
            {page === "golive" && <GoLive />}
            {page === "profile" && <MentorProfile user={currentUser} onUserUpdate={setCurrentUser} />}
            {page === "mentorReset" && (
                <MentorReset user={currentUser} forced={forced} onDone={handlePasswordChanged} />
            )}
            {page === "community" && (
                // Same community.jsx the clients use. The wrapper gives it the
                // screen height that is left under the 72px navbar.
                <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 72px)" }}>
                    <Community user={currentUser} />
                </div>
            )}
        </>
    );
}