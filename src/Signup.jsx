import { useState } from "react";
import "./Signup.css";

const passwordRules = [
  { id: "length", icon: "8+", label: "8 characters", test: (p) => p.length >= 8 },
  { id: "upper", icon: "A", label: "1 uppercase", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", icon: "a", label: "1 lowercase", test: (p) => /[a-z]/.test(p) },
  { id: "number", icon: "1", label: "1 number", test: (p) => /\d/.test(p) },
  { id: "special", icon: "_", label: "1 special (!@#$_)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const strengthMap = [
  { label: "Too Weak",  cls: "strength-weak" },
  { label: "Weak",      cls: "strength-weak" },
  { label: "Fair",      cls: "strength-fair" },
  { label: "Good",      cls: "strength-good" },
  { label: "Strong",    cls: "strength-strong" },
  { label: "V. Strong", cls: "strength-vstrong" },
];

function formatSAPhone(value) {
  let digits = value.replace(/[^\d]/g, "");
  digits = digits.replace(/^27/, "").replace(/^0/, "");
  digits = digits.slice(0, 9);
  const p1 = digits.slice(0, 2);
  const p2 = digits.slice(2, 5);
  const p3 = digits.slice(5, 9);
  let result = "+27";
  if (p1) result += " " + p1;
  if (p2) result += " " + p2;
  if (p3) result += " " + p3;
  return result;
}

export default function Signup({ onGoToLogin, onGoToPayment, onBack }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "+27 ",
    idNumber: "",
    password: "",
    confirmPassword: "",
    agreeTerms: false,
  });

  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const passwordStrength = passwordRules.filter((r) => r.test(form.password)).length;
  const strength = strengthMap[passwordStrength];

  const validate = () => {
    const newErrors = {};
    if (!form.firstName.trim()) newErrors.firstName = "First name is required.";
    if (!form.lastName.trim()) newErrors.lastName = "Last name is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      newErrors.email = "Enter a valid email address.";
    if (!form.idNumber || !/^\d{13}$/.test(form.idNumber))
      newErrors.idNumber = "ID number is required and must be exactly 13 digits.";
    if (passwordStrength < 5)
      newErrors.password = "Please meet all password requirements.";
    if (form.password !== form.confirmPassword)
      newErrors.confirmPassword = "Passwords do not match.";
    if (!form.agreeTerms)
      newErrors.agreeTerms = "You must agree to the Terms of Service.";
    return newErrors;
  };

  const handleChange = (e) => {
    let { name, value, type, checked } = e.target;
    if (name === "phone") value = formatSAPhone(value);
    if (name === "idNumber") value = value.replace(/[^\d]/g, "").slice(0, 13);
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);

    const userData = {
      name: `${form.firstName} ${form.lastName}`,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      idNumber: form.idNumber,
      password: form.password,
    };

    localStorage.setItem("bct_user", JSON.stringify(userData));
    if (onGoToPayment) onGoToPayment(userData);
  };

  return (
    <div className="signup-page">
      <div className="signup-card">

        <div className="signup-header">
          <h1>Join Blue Chip Trading</h1>
          <p>Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="signup-form">

          <div className="input-row">
            <div className="input-group">
              <label>First Name</label>
              <input
                name="firstName"
                placeholder="John"
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
              placeholder="john@example.com"
              value={form.email}
              onChange={handleChange}
              className={errors.email ? "input-error" : ""}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="input-group">
            <label>Phone <span className="optional-tag">(optional)</span></label>
            <input
              name="phone"
              placeholder="+27 82 123 4567"
              value={form.phone}
              onChange={handleChange}
            />
          </div>

          <div className="input-group">
            <label>ID Number</label>
            <input
              name="idNumber"
              placeholder="8001015009087"
              value={form.idNumber}
              onChange={handleChange}
              maxLength={13}
              className={errors.idNumber ? "input-error" : ""}
            />
            {errors.idNumber && <span className="field-error">{errors.idNumber}</span>}
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={form.password}
                onChange={handleChange}
                className={errors.password ? "input-error" : ""}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && <span className="field-error">{errors.password}</span>}

            {form.password.length > 0 && (
              <div className="strength-meter">
                <div className="strength-bars">
                  {passwordRules.map((_, i) => (
                    <div
                      key={i}
                      className={`strength-bar ${i < passwordStrength ? strength.cls : ""}`}
                    />
                  ))}
                </div>
                <span className={`strength-label ${strength.cls}`}>{strength.label}</span>
              </div>
            )}

            <ul className="password-requirements">
              {passwordRules.map((r) => {
                const met = r.test(form.password);
                return (
                  <li key={r.id} className={met ? "req-met" : "req-unmet"}>
                    <span className="req-pill">{met ? "✓" : r.icon}</span>
                    {r.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="input-group">
            <label>Confirm Password</label>
            <div className="password-wrapper">
              <input
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChange={handleChange}
                className={errors.confirmPassword ? "input-error" : ""}
              />
              <button
                type="button"
                className="toggle-visibility"
                onClick={() => setShowConfirm((v) => !v)}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
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
              I agree to the <a href="#" className="terms-link">Terms of Service</a>
            </label>
            {errors.agreeTerms && <span className="field-error">{errors.agreeTerms}</span>}
          </div>

          <button type="submit" className="signup-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" /> Creating Account...
              </span>
            ) : (
              "Create Account"
            )}
          </button>

        </form>

        <div className="signup-footer">
          <hr />
          <p>
            Already have an account?{" "}
            <button className="login-link" onClick={onGoToLogin}>Log in</button>
          </p>
          <button className="demo-btn" onClick={onBack}>← Back to Home</button>
        </div>

      </div>
    </div>
  );
}