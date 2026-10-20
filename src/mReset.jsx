import React, { useState } from "react";
import "./mReset.css";
import { supabase } from "./supabaseClient";

// Change-password page for mentors.
// Mentors approved in reviewApplication.jsx get a generated password emailed to them and
// are created with must_change_password = true (see mentor_reset.sql). While that flag is
// set, Mdashboard.jsx shows only this page. Saving a new password clears the flag.
// The database function mentor_change_password checks the current password and hashes the new one.

export default function MentorReset({ user, forced, onDone }) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (next.length < 8) return setError("New password must be at least 8 characters.");
        if (next !== confirm) return setError("Passwords do not match.");
        if (next === current) return setError("New password must be different from the current one.");
        if (!user?.email) return setError("Could not find your account email. Please log in again.");

        setBusy(true);
        try {
            const { data, error: rpcErr } = await supabase.rpc("mentor_change_password", {
                p_email: user.email.trim().toLowerCase(),
                p_current: current,
                p_new: next,
            });

            if (rpcErr) {
                console.error("Change password error:", rpcErr);
                throw new Error("Could not change password. Please try again.");
            }
            if (!data) throw new Error("Current password is incorrect.");

            setSuccess("Password changed successfully.");
            setCurrent("");
            setNext("");
            setConfirm("");
            onDone?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="main">
            <section className="section reset-wrap">
                <div className="section-heading reset-heading">
                    <p className="label">{forced ? "FIRST LOGIN" : "SECURITY"}</p>
                    <h2>{forced ? "Set your new password" : "Reset password"}</h2>
                    {forced && (
                        <p className="reset-sub">
                            You are using a generated password. Choose a new one to continue.
                        </p>
                    )}
                </div>

                <form onSubmit={submit} className="reset-card">
                    <input
                        type="password"
                        className="reset-input"
                        placeholder={forced ? "Generated password (from your email)" : "Current password"}
                        value={current}
                        onChange={(e) => setCurrent(e.target.value)}
                        required
                        autoComplete="current-password"
                    />
                    <input
                        type="password"
                        className="reset-input"
                        placeholder="New password"
                        value={next}
                        onChange={(e) => setNext(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <input
                        type="password"
                        className="reset-input"
                        placeholder="Confirm new password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        autoComplete="new-password"
                    />

                    {error && <p className="reset-error">{error}</p>}
                    {success && <p className="reset-success">{success}</p>}

                    <button type="submit" className="reset-button" disabled={busy}>
                        {busy ? "SAVING..." : "CHANGE PASSWORD"}
                    </button>
                </form>
            </section>
        </main>
    );
}