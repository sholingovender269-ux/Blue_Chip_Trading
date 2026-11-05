import { useState } from "react";
import "./Signup.css";

// File lives in /public, so it is served from the site root.
const TERMS_PDF_URL = encodeURI(
  `${import.meta.env.BASE_URL}Terms and conditions contract for project.pdf`
);

/**
 * Validates a South African ID number (YYMMDDSSSSCAZ).
 * Returns an error string if invalid, or "" if valid.
 *  - 13 digits
 *  - first 6 digits are a real date of birth (not in the future)
 *  - 11th digit (citizenship) is 0 or 1
 *  - 13th digit passes the Luhn checksum
 */
const validateSAId = (id) => {
  if (!/^\d{13}$/.test(id)) return "ID must be 13 digits";

  // --- Date of birth (YYMMDD) ---
  const yy = parseInt(id.slice(0, 2), 10);
  const mm = parseInt(id.slice(2, 4), 10);
  const dd = parseInt(id.slice(4, 6), 10);

  // Assume 20YY; if that's in the future, it must be 19YY
  let year = 2000 + yy;
  if (new Date(year, mm - 1, dd) > new Date()) year = 1900 + yy;

  const dob = new Date(year, mm - 1, dd);
  const validDate =
    dob.getFullYear() === year &&
    dob.getMonth() === mm - 1 &&
    dob.getDate() === dd;
  if (!validDate) return "ID contains an invalid date of birth";

  // --- Citizenship digit (11th): 0 = citizen, 1 = permanent resident ---
  if (id[10] !== "0" && id[10] !== "1") return "Invalid ID number";

  // --- Luhn checksum ---
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[12 - i], 10); // walk from the right
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  if (sum % 10 !== 0) return "Invalid ID number";

  return "";
};

export default function Signup({ onGoToPayment, onGoToLogin }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    idNumber: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = "First name required";
    if (!form.lastName.trim()) newErrors.lastName = "Last name required";
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(form.email)) newErrors.email = "Invalid email";

    const idError = validateSAId(form.idNumber);
    if (idError) newErrors.idNumber = idError;

    if (form.password.length < 6) newErrors.password = "Password too short";
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Passwords do not match";
    if (!form.agreeTerms) newErrors.agreeTerms = "You must agree to terms";
    return newErrors;
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Cap ID number at 13 digits
    if (name === "idNumber") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 13);
      setForm((prev) => ({ ...prev, idNumber: digitsOnly }));
      if (errors.idNumber) setErrors((prev) => ({ ...prev, idNumber: "" }));
      return;
    }

    // Names: letters (incl. accented), spaces, hyphens and apostrophes only
    if (name === "firstName" || name === "lastName") {
      const lettersOnly = value.replace(/[^\p{L}\s'’-]/gu, "");
      setForm((prev) => ({ ...prev, [name]: lettersOnly }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
      return;
    }

    // Email: live feedback while typing if "@" or "." is missing
    if (name === "email") {
      setForm((prev) => ({ ...prev, email: value }));
      let hint = "";
      if (value) {
        const domain = value.slice(value.indexOf("@") + 1);
        if (!value.includes("@")) hint = "Email is missing an @";
        else if (!domain.includes(".")) hint = "Email is missing a . after the @";
        else if (domain.startsWith(".") || domain.endsWith(".") || domain.includes(".."))
          hint = "Email can't end with a . or have an empty part after it";
      }
      setErrors((prev) => ({ ...prev, email: hint }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // Password strength logic
  const getPasswordStrength = (pwd) => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    if (pwd.length >= 12) score++;
    return score;
  };

  const strengthScore = getPasswordStrength(form.password);
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  const strengthClasses = ["", "strength-weak", "strength-fair", "strength-good", "strength-strong", "strength-vstrong"];

  const requirements = [
    { label: "8+ chars",   met: form.password.length >= 8 },
    { label: "Uppercase",  met: /[A-Z]/.test(form.password) },
    { label: "Number",     met: /[0-9]/.test(form.password) },
    { label: "Symbol",     met: /[^A-Za-z0-9]/.test(form.password) },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      // Nothing is saved to the database yet. The account is only created
      // after Stripe confirms payment. Keep the details in this tab until then.
      sessionStorage.setItem(
        "bct_pending",
        JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          idNumber: form.idNumber,
          password: form.password,
        })
      );

      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        name: `${form.firstName} ${form.lastName}`,
        email: form.email,
        idNumber: form.idNumber,
      };

      if (onGoToPayment) onGoToPayment(payload);
    } catch (err) {
      console.error("Error:", err);
      alert("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-card">

        <div className="signup-header">
          <div className="signup-logo">BLUE<span>CHIP</span></div>
          <div className="signup-badge">Create Account</div>
          <h1>Get Started</h1>
          <p>Join Blue Chip Trading today</p>
        </div>

        <form className="signup-form" onSubmit={handleSubmit}>

          <div className="input-row">
            <div className="input-group">
              <label>First Name</label>
              <input
                name="firstName"
                placeholder="Jane"
                value={form.firstName}
                onChange={handleChange}
                className={errors.firstName ? "input-error" : ""}
              />
              {errors.firstName && <span className="field-error">{errors.firstName}</span>}
            </div>

            <div className="input-group">
              <label>Last Name</label>
              <input
                name="lastName"
                placeholder="Doe"
                value={form.lastName}
                onChange={handleChange}
                className={errors.lastName ? "input-error" : ""}
              />
              {errors.lastName && <span className="field-error">{errors.lastName}</span>}
            </div>
          </div>

          <div className="input-group">
            <label>Email</label>
            <input
              name="email"
              placeholder="jane@example.com"
              value={form.email}
              onChange={handleChange}
              className={errors.email ? "input-error" : ""}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="input-group">
            <label>ID Number <span className="optional-tag">({form.idNumber.length}/13)</span></label>
            <input
              name="idNumber"
              placeholder="13-digit SA ID"
              value={form.idNumber}
              onChange={handleChange}
              maxLength={13}
              inputMode="numeric"
              className={errors.idNumber ? "input-error" : ""}
            />
            {errors.idNumber && <span className="field-error">{errors.idNumber}</span>}
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                type="password"
                name="password"
                placeholder="Min. 6 characters"
                value={form.password}
                onChange={handleChange}
                className={errors.password ? "input-error" : ""}
              />
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}

            {/* Strength meter — only shows when typing */}
            {form.password.length > 0 && (
              <>
                <div className="strength-meter">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`strength-bar ${i <= strengthScore ? strengthClasses[strengthScore] : ""}`}
                      />
                    ))}
                  </div>
                  <span className={`strength-label ${strengthClasses[strengthScore]}`}>
                    {strengthLabels[strengthScore]}
                  </span>
                </div>

                <ul className="password-requirements">
                  {requirements.map((req) => (
                    <li key={req.label} className={req.met ? "req-met" : "req-unmet"}>
                      <span className="req-pill">{req.met ? "✓" : "×"}</span>
                      {req.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="input-group">
            <label>Confirm Password</label>
            <div className="password-wrapper">
              <input
                type="password"
                name="confirmPassword"
                placeholder="Repeat password"
                value={form.confirmPassword}
                onChange={handleChange}
                className={errors.confirmPassword ? "input-error" : ""}
              />
            </div>
            {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
          </div>

          <div className="terms-row">
            <label className="checkbox">
              <input
                type="checkbox"
                name="agreeTerms"
                checked={form.agreeTerms}
                onChange={handleChange}
              />
              I agree to the{" "}
              <a
                href={TERMS_PDF_URL}
                download="Terms and Conditions.pdf"
                className="terms-link"
                onClick={(e) => e.stopPropagation()}
              >
                Terms & Conditions
              </a>
            </label>
            {errors.agreeTerms && <span className="field-error">{errors.agreeTerms}</span>}
          </div>

          <button type="submit" className="signup-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" /> Continuing...
              </span>
            ) : (
              "Continue to Payment"
            )}
          </button>

        </form>

        <div className="signup-footer">
          <p>
            Already have an account?{" "}
            <button
              type="button"
              className="login-link"
              onClick={() => onGoToLogin && onGoToLogin()}
            >
              Log In
            </button>
          </p>
        </div>

      </div>
    </div>
  );
}