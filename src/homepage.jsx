import { useState, useEffect, useRef } from "react";
import { useTranslation, Trans } from "react-i18next";
import LanguageSwitcher from "./Lgswitcher";
import "./homepage.css";

const MODULES = [
  { label: "COURSE_LIBRARY", status: "LOADED", tone: "primary" },
  { label: "LIVE_SIGNALS", status: "ACTIVE", tone: "amber" },
  { label: "MENTOR_FEED", status: "ONLINE", tone: "violet" },
  { label: "TRADE_JOURNAL", status: "READY", tone: "amber" },
  { label: "MARKET_ALERTS", status: "ACTIVE", tone: "red" },
  { label: "COMMUNITY_HUB", status: "LIVE", tone: "blue" },
  { label: "REWARDS_ENGINE", status: "ACTIVE", tone: "primary" },
];

function useCounter(target, duration = 1800) {
  const [display, setDisplay] = useState("0");
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          const num = parseFloat(target.replace(/[^0-9.]/g, ""));
          const suffix = target.replace(/[0-9.,]/g, "");
          let i = 0;
          const steps = 60;
          const iv = setInterval(() => {
            i++;
            setDisplay(Math.floor((num / steps) * i) + suffix);
            if (i >= steps) {
              setDisplay(target);
              clearInterval(iv);
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return [display, ref];
}

function Stat({ value, label }) {
  const [d, ref] = useCounter(value);
  return (
    <div className="stat-cell" ref={ref}>
      <div className="stat-val">{d}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}

function FAQItem({ question, answer, isOpen, onClick }) {
  return (
    <div className="faq-item">
      <div className="faq-question" onClick={onClick}>
        <span>{question}</span>
        <span className="faq-icon">{isOpen ? "−" : "+"}</span>
      </div>
      {isOpen && <div className="faq-answer">{answer}</div>}
    </div>
  );
}

/* --- NEW: lightweight 3D tilt-on-hover wrapper (visual only, no
   functional change — just tracks the mouse and sets CSS vars that
   the .term-frame--panel CSS uses to rotate/glow toward the cursor) --- */
function useTilt() {
  const ref = useRef(null);

  const handleMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateX = (0.5 - py) * 10;
    const rotateY = (px - 0.5) * 12;
    el.style.setProperty("--tiltX", `${rotateX}deg`);
    el.style.setProperty("--tiltY", `${rotateY}deg`);
    el.style.setProperty("--glowX", `${px * 100}%`);
    el.style.setProperty("--glowY", `${py * 100}%`);
  };

  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tiltX", `0deg`);
    el.style.setProperty("--tiltY", `0deg`);
  };

  return { ref, handleMove, handleLeave };
}

function TerminalPanel() {
  const { ref, handleMove, handleLeave } = useTilt();

  return (
    <div
      className="term-frame term-frame--panel term-frame--tilt"
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <div className="term-bar">
        <span className="term-dot term-dot--r" />
        <span className="term-dot term-dot--y" />
        <span className="term-dot term-dot--g" />
        <span className="term-label">BLUECHIP_TERMINAL v2.0</span>
      </div>
      <div className="term-body term-body--panel">
        <div className="term-boot-line">
          &gt; initialising modules...<span className="term-cursor" />
        </div>
        <div className="term-rows">
          {MODULES.map((m, i) => (
            <div
              className="term-row"
              key={m.label}
              style={{ animationDelay: `${0.55 + i * 0.14}s` }}
            >
              <span className="term-row-label-wrap">
                <span
                  className={`term-live-dot dot-${m.tone}`}
                  style={{ animationDelay: `${i * 0.22}s` }}
                />
                <span className="term-row-label">{m.label}</span>
              </span>
              <span
                className={`term-status tone-${m.tone}`}
                style={{ animationDelay: `${i * 0.31}s` }}
              >
                {m.status}
              </span>
            </div>
          ))}
        </div>
        <div
          className="term-summary"
          style={{ animationDelay: `${0.55 + MODULES.length * 0.14 + 0.15}s` }}
        >
          ✓ All systems operational — {MODULES.length} modules loaded
        </div>
        <div className="term-ticker">
          <div className="term-ticker-line" style={{ animationDelay: "0s" }}>
            &gt; XAUUSD signal triggered — entry confirmed
          </div>
          <div className="term-ticker-line" style={{ animationDelay: "-3.75s" }}>
            &gt; New lesson unlocked: Risk Management 201
          </div>
          <div className="term-ticker-line" style={{ animationDelay: "-7.5s" }}>
            &gt; 3 mentors online right now
          </div>
          <div className="term-ticker-line" style={{ animationDelay: "-11.25s" }}>
            &gt; Community chat — 214 active
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Academy({ onLoginClick, onSignupClick }) {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);
  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  const handleSignup = (e) => {
    e.preventDefault();
    if (onSignupClick) onSignupClick();
  };

  /* --- NEW: cursor-follow spotlight glow across the whole page.
     Purely decorative — sets CSS vars consumed by .bg-cursor-glow. --- */
  const pageRef = useRef(null);
  useEffect(() => {
    const handlePointerMove = (e) => {
      const el = pageRef.current;
      if (!el) return;
      el.style.setProperty("--cursor-x", `${e.clientX}px`);
      el.style.setProperty("--cursor-y", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  const whyItems = t("why.items", { returnObjects: true });
  const stepItems = t("steps.items", { returnObjects: true });
  const faqItems = t("faq.items", { returnObjects: true });
  const pillars = t("team.pillars", { returnObjects: true });
  const features = t("pricing.features", { returnObjects: true });

  return (
    <div className="page" ref={pageRef}>
      <div className="bg-fx" aria-hidden="true">
        <span className="bg-blob bg-blob--a" />
        <span className="bg-blob bg-blob--b" />
        <span className="bg-blob bg-blob--c" />
        <div className="bg-candles" />
        <div className="bg-cursor-glow" />
      </div>

      <nav className="nav">
        <div className="logo">
          Blue <span>Chip</span> Trading
        </div>
        <div className="nav-links">
          <a href="#">{t("nav.courses")}</a>
          <a href="#">{t("nav.mentorship")}</a>
          <a href="#">{t("nav.signals")}</a>
          <a href="#">{t("nav.pricing")}</a>
        </div>
        <div className="nav-right">
          <a href="#" className="nav-careers">
            {t("nav.becomeMentor")}
          </a>
          <LanguageSwitcher />
          <a
            href="#"
            className="nav-login"
            onClick={(e) => {
              e.preventDefault();
              onLoginClick();
            }}
          >
            {t("nav.login")}
          </a>
          <a href="#" className="nav-signup" onClick={handleSignup}>
            {t("nav.signup")}
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge">{t("hero.badge")}</div>
          <h1 className="hero-h1">
            {t("hero.title1")}
            <br />
            <em>{t("hero.title2")}</em>
          </h1>
          <p className="hero-p">{t("hero.desc")}</p>
          <button className="hero-cta" onClick={handleSignup}>
            {t("hero.cta")}
          </button>
        </div>
        <div className="hero-right">
          <TerminalPanel />
        </div>
      </section>

      <section className="stats-row">
        <Stat value="2,400+" label={t("stats.students")} />
        <Stat value="94%" label={t("stats.completion")} />
        <Stat value="18" label={t("stats.courses")} />
        <Stat value="Live" label={t("stats.sessions")} />
      </section>

      <section className="section why-section">
        <div className="eyebrow center">{t("why.eyebrow")}</div>
        <h2 className="h2 center">{t("why.title")}</h2>
        <div className="why-grid">
          {whyItems.map((w, i) => (
            <div className="why-card" key={i}>
              <div className="why-icon">{w.icon}</div>
              <div className="why-title">{w.title}</div>
              <p className="why-desc">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section about-section">
        <div className="eyebrow center">{t("about.eyebrow")}</div>
        <h2 className="h2 center">{t("about.title")}</h2>
        <div className="center" style={{ maxWidth: "800px", margin: "0 auto" }}>
          <p className="hero-p" style={{ margin: "0 auto" }}>
            {t("about.p1")}
            <br />
            <b>
              <u>{t("about.p2")}</u>
            </b>
          </p>
        </div>
      </section>

      <section className="section team-section">
        <div className="team-container">
          <div className="team-image-side">
            <img src="team-member.jpg" alt="Founders" className="team-main-img" />
            <div className="team-img-accent"></div>
          </div>
          <div className="team-text-side">
            <div className="eyebrow">{t("team.eyebrow")}</div>
            <h2 className="h2">{t("team.title")}</h2>
            <p className="team-description">
              {t("team.desc")}
              <br />
              <b>
                <u>{t("team.pillarsTitle")}</u>
              </b>
              <br />
              <b>
                <u>{pillars.technical.title}</u>
              </b>
              : {pillars.technical.desc}
              <br />
              <b>
                <u>{pillars.fundamental.title}</u>
              </b>
              : {pillars.fundamental.desc}
              <br />
              <b>
                <u>{pillars.risk.title}</u>
              </b>
              : {pillars.risk.desc}
              <br />
              <b>
                <u>{pillars.psychology.title}</u>
              </b>
              : {pillars.psychology.desc}
              <br />
              <b>
                <u>{pillars.live.title}</u>
              </b>
              : {pillars.live.desc}
              <br />
              <br />
            </p>
            <div className="team-quote">
              <b>
                <u>{t("team.quote")}</u>
              </b>
            </div>
          </div>
        </div>
      </section>

      <section className="section pricing-section">
        <div className="eyebrow center">{t("pricing.eyebrow")}</div>
        <h2 className="h2 center">{t("pricing.title")}</h2>
        <div className="pricing-card">
          <div className="pricing-name">{t("pricing.name")}</div>
          <div className="pricing-price">
            R420<span>{t("pricing.period")}</span>
          </div>
          <ul className="pricing-features">
            {features.map((f, i) => (
              <li key={i}>✓ {f}</li>
            ))}
          </ul>
          <button className="pricing-btn" onClick={handleSignup}>
            {t("pricing.cta")}
          </button>
        </div>
      </section>

      <section className="section steps-section">
        <div className="eyebrow center">{t("steps.eyebrow")}</div>
        <h2 className="h2 center">{t("steps.title")}</h2>
        <div className="steps-grid">
          {stepItems.map((s, i) => (
            <div key={i} className="step-card">
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <p className="step-desc">{s.desc}</p>
              {i === 0 && (
                <button className="step-cta" onClick={handleSignup}>
                  {t("steps.cta")}
                </button>
              )}
              {i < stepItems.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="career-section">
        <div className="career-content">
          <h2 className="career-title">{t("career.title")}</h2>
          <p className="career-desc">{t("career.desc")}</p>
          <button className="career-btn">{t("career.cta")}</button>
        </div>
        <div className="career-stats">
          <div className="career-stat">
            <div className="career-stat-value">R20K+</div>
            <div className="career-stat-label">{t("career.earnings")}</div>
          </div>
          <div className="career-stat">
            <div className="career-stat-value">100%</div>
            <div className="career-stat-label">{t("career.remote")}</div>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="eyebrow center">{t("faq.eyebrow")}</div>
        <h2 className="h2 center">{t("faq.title")}</h2>
        <div className="faq-grid">
          {faqItems.map((faq, i) => (
            <FAQItem
              key={i}
              question={faq.q}
              answer={
                i === 2 ? (
                  <Trans i18nKey="faq.items.2.a">
                    <a
                      href="#"
                      style={{ color: "#00d9ac", textDecoration: "underline", fontWeight: 600 }}
                    >
                      Watch the walkthrough video
                    </a>{" "}
                    below for a full look inside. We keep pricing simple with one plan, so
                    trials aren't on the table.
                  </Trans>
                ) : (
                  faq.a
                )
              }
              isOpen={openFaq === i}
              onClick={() => toggleFaq(i)}
            />
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: "48px" }}>
          <button className="pricing-btn" onClick={handleSignup}>
            {t("faq.cta")}
          </button>
        </div>
      </section>
    </div>
  );
}