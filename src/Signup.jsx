import { useState } from "react";
import "./Signup.css";
import { supabase } from "./supabaseClient";

export default function Signup({ onGoToPayment }) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = "Invalid email";
    if (!/^\d{13}$/.test(form.idNumber)) newErrors.idNumber = "ID must be 13 digits";
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
      });

      if (authError) {
        alert(authError.message || "Signup failed");
        return;
      }

      // Step 2: Insert into clients table
      const { error: insertError } = await supabase
        .from("clients")
        .insert([{
          first_name: form.firstName,
          last_name: form.lastName,
          email: form.email,
          id_number: form.idNumber,
        }])
        .select();

      if (insertError) {
        alert(insertError.message || "Failed to save client details");
        return;
      }

      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        name: `${form.firstName} ${form.lastName}`,
        email: form.email,
        idNumber: form.idNumber,
      };

      localStorage.setItem("bct_user", JSON.stringify(payload));

      if (onGoToPayment) {
        onGoToPayment(payload);
      }

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
              I agree to the <a href="#" className="terms-link">Terms & Conditions</a>
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
          <p>Already have an account? <button className="login-link" onClick={() => {}}>Sign In</button></p>
        </div>

      </div>
    </div>
  );
}