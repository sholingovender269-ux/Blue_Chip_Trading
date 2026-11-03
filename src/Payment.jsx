import { useState } from "react";
import "./payment.css";
import { supabase } from "./supabaseClient";

export default function Payment({ user = {}, onBack }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fullName = user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim();

  const handlePay = async (e) => {
    e.preventDefault();
    if (!address.trim()) return setError("Address is required.");
    setError("");
    setLoading(true);

    const { data, error: fnError } = await supabase.functions.invoke("create-checkout", {
      body: { email: user.email, name: fullName, address },
    });

    if (fnError || !data?.url) {
      let detail = fnError?.message || data?.error || "no URL returned";
      try { detail = await fnError.context.text(); } catch {}
      console.error("Checkout error:", detail);
      setLoading(false);
      return setError("Checkout failed: " + detail);
    }
    window.location.href = data.url; // Stripe's hosted payment page
  };

  return (
    <div className="payment-page">
      <div className="payment-card">
        <div className="payment-header">
          <div className="payment-logo">KI<span>NETIC</span></div>
          <div className="payment-badge">Secure Checkout</div>
          <h1>Complete your plan</h1>
          <p>Payment is handled securely by Stripe</p>
        </div>

        <div className="order-summary">
          <div className="order-left">
            <span className="order-label">All in access</span>
            <span className="order-desc">Unlimited access, all features</span>
          </div>
          <div className="order-price">
            <span className="price-amount">R420</span>
            <span className="price-period">/mo</span>
          </div>
        </div>

        <form className="payment-form" onSubmit={handlePay} noValidate>
          <div className="input-group">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              type="text"
              placeholder="e.g. 12 Main Street, Johannesburg"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setError(""); }}
              className={error ? "input-error" : ""}
              autoComplete="street-address"
            />
            {error && <span className="field-error">{error}</span>}
          </div>

          <div className="security-note">
            <span className="lock-icon">🔒</span>
            You'll be redirected to Stripe to enter your card details.
          </div>

          <button type="submit" className="payment-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading"><span className="spinner" /> Redirecting…</span>
            ) : (
              "Pay R420"
            )}
          </button>
        </form>

        <div className="payment-footer">
          <hr />
          <button className="back-btn" onClick={onBack}>← Back to Signup</button>
        </div>
      </div>
    </div>
  );
}