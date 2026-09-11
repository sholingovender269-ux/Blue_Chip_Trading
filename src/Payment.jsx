import { useState } from "react";
import "./payment.css";
import Verification from "./Verification.jsx";

const formatCardNumber = (val) =>
  val.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();

const formatExpiry = (val) => {
  const digits = val.replace(/\D/g, "").slice(0, 4);
  return digits.length >= 3 ? digits.slice(0, 2) + "/" + digits.slice(2) : digits;
};

export default function Payment({ user = {}, onSuccess, onBack }) {
  const [form, setForm] = useState({
    cardNumber: "",
    cardName: user.name || "",
    expiry: "",
    cvv: "",
    address: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showVerification, setShowVerification] = useState(false);

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (name === "cardNumber") value = formatCardNumber(value);
    if (name === "expiry") value = formatExpiry(value);
    if (name === "cvv") value = value.replace(/\D/g, "").slice(0, 4);
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const errs = {};
    const raw = form.cardNumber.replace(/\s/g, "");
    if (raw.length !== 16) errs.cardNumber = "Card number must be 16 digits.";
    if (!form.cardName.trim()) errs.cardName = "Name on card is required.";
    const [mm, yy] = form.expiry.split("/");
    const now = new Date();
    const expiryDate = new Date(2000 + parseInt(yy, 10), parseInt(mm, 10) - 1, 1);
    if (!mm || !yy || parseInt(mm, 10) < 1 || parseInt(mm, 10) > 12)
      errs.expiry = "Enter a valid expiry date (MM/YY).";
    else if (expiryDate < now) errs.expiry = "This card has expired.";
    if (form.cvv.length < 3) errs.cvv = "CVV must be 3–4 digits.";
    if (!form.address.trim()) errs.address = "Address is required.";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1400));
    setLoading(false);
    setShowVerification(true);
  };

  const fullName = user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim();

  if (showVerification) {
    return (
      <Verification
        name={fullName}
        email={user?.email}
        user={user}
        address={form.address}
        onComplete={() => {
          if (onSuccess) onSuccess();
        }}
      />
    );
  }

  return (
    <div className="payment-page">
      <div className="payment-card">

        <div className="payment-header">
          <div className="payment-logo">KI<span>NETIC</span></div>
          <div className="payment-badge">Secure Checkout</div>
          <h1>Complete your plan</h1>
          <p>Your information is encrypted end-to-end</p>
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

        {user.idNumber && (
          <div className="id-display">
            <span className="id-label">ID Number</span>
            <span className="id-value">{user.idNumber}</span>
          </div>
        )}

        <div className="card-brands">
          <span className="card-brand-label">Accepted:</span>
          <div className="card-chip visa-chip chip-active">
            <span className="visa-text">VISA</span>
          </div>
          <div className="card-chip mc-chip chip-active">
            <svg viewBox="0 0 36 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
              <circle cx="13" cy="12" r="10" fill="#EB001B" />
              <circle cx="23" cy="12" r="10" fill="#F79E1B" />
              <path d="M18 4.8a10 10 0 0 1 0 14.4A10 10 0 0 1 18 4.8z" fill="#FF5F00" />
            </svg>
          </div>
        </div>

        <form className="payment-form" onSubmit={handleSubmit} noValidate>

          <div className="input-group">
            <label htmlFor="cardNumber">Card Number</label>
            <div className="card-input-wrapper">
              <input
                id="cardNumber"
                name="cardNumber"
                type="text"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={form.cardNumber}
                onChange={handleChange}
                className={errors.cardNumber ? "input-error" : ""}
                autoComplete="cc-number"
              />
            </div>
            {errors.cardNumber && <span className="field-error">{errors.cardNumber}</span>}
          </div>

          <div className="input-group">
            <label htmlFor="cardName">Name on Card</label>
            <input
              id="cardName"
              name="cardName"
              type="text"
              placeholder="Jane Doe"
              value={form.cardName}
              onChange={handleChange}
              className={errors.cardName ? "input-error" : ""}
              autoComplete="cc-name"
            />
            {errors.cardName && <span className="field-error">{errors.cardName}</span>}
          </div>

          <div className="payment-row">
            <div className="input-group">
              <label htmlFor="expiry">Expiry Date</label>
              <input
                id="expiry"
                name="expiry"
                type="text"
                inputMode="numeric"
                placeholder="MM/YY"
                value={form.expiry}
                onChange={handleChange}
                className={errors.expiry ? "input-error" : ""}
                autoComplete="cc-exp"
              />
              {errors.expiry && <span className="field-error">{errors.expiry}</span>}
            </div>
            <div className="input-group">
              <label htmlFor="cvv">CVV
                <span className="cvv-hint" title="3 digits on back of card"> ⓘ</span>
              </label>
              <input
                id="cvv"
                name="cvv"
                type="password"
                inputMode="numeric"
                placeholder="•••"
                value={form.cvv}
                onChange={handleChange}
                className={errors.cvv ? "input-error" : ""}
                autoComplete="cc-csc"
              />
              {errors.cvv && <span className="field-error">{errors.cvv}</span>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              name="address"
  type="text"
              placeholder="e.g. 12 Main Street, Johannesburg"
              value={form.address}
              onChange={handleChange}
              className={errors.address ? "input-error" : ""}
              autoComplete="street-address"
            />
            {errors.address && <span className="field-error">{errors.address}</span>}
          </div>

          <div className="security-note">
            <span className="lock-icon">🔒</span>
            256-bit SSL encryption. We never store raw card data.
          </div>

          <button type="submit" className="payment-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" /> Processing…
              </span>
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