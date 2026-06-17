import { useState, useEffect, useRef } from "react";
import "./homepage.css";

const WHY_US = [
  { icon: "📊", title: "Advanced Charting ", desc: "Simulated trading environment powered by live forex charts, drawing tools, and multi-timeframe analysis." },
  { icon: "📚", title: "Educational Resources", desc: "Structured courses, video tutorials, and written guides built for every skill level." },
  { icon: "📰", title: "Daily Market Analysis", desc: "Fresh breakdowns of what moved the market today and what to watch tomorrow." },
  { icon: "✅", title: "Regulated & Trusted", desc: "Fully compliant and transparent. Your funds and data are always protected." },
  { icon: "👥", title: "Live Mentorship", desc: "Watch real trades unfold in live sessions. Ask questions. Learn from real experience." },
  { icon: "🏆", title: "Points & Rewards", desc: "Earn points for course completions and community activity. Unlock badges and perks." },
];

const STEPS = [
  { n: "01", title: "Create Your Account", desc: "Sign up in under 2 minutes. No credit card required to get started." },
  { n: "02", title: "Choose Your Path", desc: "Pick the plan that fits your level — Beginner or Pro. Both give full platform access." },
  { n: "03", title: "Start Learning & Trading", desc: "Follow structured courses, join live sessions, practice on demo, and grow with the community." },
];

const FAQS = [
  { q: "Do I need experience to start?", a: "Not at all! We have courses for absolute beginners." },
  { q: "How much does it cost?", a: "R420/month. No hidden fees, cancel anytime." },
  {
    q: "Can I try before I buy?",
    a: (
      <>
        <a href="#" style={{ color: '#00C9A7', textDecoration: 'underline', fontWeight: 600 }}>Watch the video</a> below for a full breakdown. We offer a fixed plan, so trials aren't available.
      </>
    )
  },
  { q: "Is my money safe?", a: "We are an educational platform — we do not handle trading funds, only subscription fees." },
];

function useCounter(target, duration = 1800) {
  const [display, setDisplay] = useState("0");
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const num = parseFloat(target.replace(/[^0-9.]/g, ""));
        const suffix = target.replace(/[0-9.,]/g, "");
        let i = 0;
        const steps = 60;
        const iv = setInterval(() => {
          i++;
          setDisplay(Math.floor((num / steps) * i) + suffix);
          if (i >= steps) { setDisplay(target); clearInterval(iv); }
        }, duration / steps);
      }
    }, { threshold: 0.3 });
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

export default function Academy({ onLoginClick, onSignupClick }) {
  const [openFaq, setOpenFaq] = useState(null);
  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  const handleSignup = (e) => {
    e.preventDefault();
    if (onSignupClick) onSignupClick();
  };

  return (
    <div className="page">
      <nav className="nav">
        <div className="logo">Blue <span>Chip</span> Trading</div>
        <div className="nav-links">
          <a href="#">Courses</a>
          <a href="#">Mentorship</a>
          <a href="#">Signals</a>
          <a href="#">Pricing</a>
        </div>
        <div className="nav-right">
          <a href="#" className="nav-careers">Become a Mentor</a>
          <a
            href="#"
            className="nav-login"
            onClick={(e) => { e.preventDefault(); onLoginClick(); }}
          >
            Log In
          </a>
          {/* Nav Sign Up */}
          <a href="#" className="nav-signup" onClick={handleSignup}>
            Sign Up
          </a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge">Forex Education — Done Properly</div>
          <h1 className="hero-h1">Learn to Trade.<br /><em>The Right Way.</em></h1>
          <p className="hero-p">Structured courses, live trading sessions, verified signals, and a thriving community of real traders.</p>
          {/* Hero CTA */}
          <button className="hero-cta" onClick={handleSignup}>
            Get Started Free →
          </button>
          <p className="hero-note">No credit card required · Cancel anytime</p>
        </div>
        <div className="hero-right">
          <img src="2.jpg" alt="Trading" className="hero-image" />
        </div>
      </section>

      <section className="stats-row">
        <Stat value="2,400+" label="Active Students" />
        <Stat value="94%" label="Completion Rate" />
        <Stat value="18" label="Courses" />
        <Stat value="Live" label="Daily Sessions" />
      </section>

      <section className="section about-section">
        <div className="eyebrow center">Who Are We</div>
        <h2 className="h2 center">The Story Behind Blue Chip Trading</h2>
        <div className="center" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <p className="hero-p" style={{ margin: '0 auto' }}>
            It started with a group of friends in a college library no mentors, no shortcuts, just a shared hunger for more.
            Late nights turned into early mornings.
            Losses, setbacks, pressure, we went through it all together.
            There were times it didn't make sense.
            Times we wanted to quit. But we didn't.
            We stayed locked in… until it finally clicked.
            And when it did, we didn't leave anyone behind.
            That's how Blue Chip Trading was built — a brotherhood that turned struggle into skill, and now helps others win.<br />

            <b><u>Today, Blue Chip Trading has grown into a global community built on discipline, consistency, and real results.
            What started as a small group of friends is now a team helping traders around the world learn, improve, and take control of their journey —
            the right way.</u></b>
          </p>
        </div>
      </section>

      {/* --- SINGLE TEAM MEMBER SECTION --- */}
      <section className="section team-section">
        <div className="team-container">
          <div className="team-image-side">
            <img src="team-member.jpg" alt="Founders" className="team-main-img" />
            <div className="team-img-accent"></div>
          </div>
          <div className="team-text-side">
            <div className="eyebrow">Our Team</div>
            <h2 className="h2">Meet the Team</h2>
            <p className="team-description">
              At Blue Chip Trading, you aren't just learning from a single individual. You are gaining access to a collective powerhouse of multiple professional traders, each specializing in a different pillar of the financial markets. We've combined our years of trial and error to create a single, unified path for our students.<br />

              <b><u>The Core Pillars:</u></b><br />
              <b><u>Technical Mastery</u></b>: Precision entry and exit strategies developed over a decade of chart analysis.<br />
              <b><u>Fundamental Insight</u></b>: Deep-dive breakdowns of the "why" behind major market movements.<br />
              <b><u>Risk Management</u></b>: Battle-tested frameworks designed to protect your capital above all else.<br />
              <b><u>Trading Psychology</u></b>: Coaching focused on building the discipline and patience of a professional.<br />
              <b><u>Live Mentorship</u></b>: Real-time guidance to help you navigate live market conditions as they unfold.<br /><br />
            </p>
            <div className="team-quote">
              <b><u>"Our mission is simple: to provide the clarity, transparency, and community we wish we had when we first started."</u></b>
            </div>
          </div>
        </div>
      </section>

      <section className="section pricing-section">
        <div className="eyebrow center">Simple Pricing</div>
        <h2 className="h2 center">One Plan. Everything Included.</h2>
        <div className="pricing-card">
          <div className="pricing-name">All-in Access</div>
          <div className="pricing-price">R420<span>/month</span></div>
          <ul className="pricing-features">
            <li>✓ All Professional Courses</li>
            <li>✓ Live Trading Sessions</li>
            <li>✓ Verified Daily Signals</li>
            <li>✓ Exclusive Community Access</li>
            <li>✓ Simulated Trading</li>
            <li>✓ Market Analysis</li>
          </ul>
          {/* Pricing CTA */}
          <button className="pricing-btn" onClick={handleSignup}>
            Get Started Now
          </button>
        </div>
      </section>

      <section className="section steps-section">
        <div className="eyebrow center">How It Works</div>
        <h2 className="h2 center">Get Started in 3 Steps</h2>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div key={i} className="step-card">
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <p className="step-desc">{s.desc}</p>
              {/* Step 1 gets a direct signup CTA */}
              {i === 0 && (
                <button className="step-cta" onClick={handleSignup}>
                  Create Account →
                </button>
              )}
              {i < STEPS.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="career-section">
        <div className="career-content">
          <h2 className="career-title">Are You a Skilled Trader?</h2>
          <p className="career-desc">Join our elite team. Prove your skills and help our community grow.</p>
          <button className="career-btn">Apply Now →</button>
        </div>
        <div className="career-stats">
          <div className="career-stat"><div className="career-stat-value">R20K+</div><div className="career-stat-label">Avg Earnings</div></div>
          <div className="career-stat"><div className="career-stat-value">100%</div><div className="career-stat-label">Remote</div></div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="eyebrow center">Got Questions?</div>
        <h2 className="h2 center">Frequently Asked Questions</h2>
        <div className="faq-grid">
          {FAQS.map((faq, i) => (
            <FAQItem key={i} question={faq.q} answer={faq.a} isOpen={openFaq === i} onClick={() => toggleFaq(i)} />
          ))}
        </div>
        {/* Bottom CTA */}
        <div style={{ textAlign: 'center', marginTop: '48px' }}>
          <button className="pricing-btn" onClick={handleSignup}>
            Join Blue Chip Trading →
          </button>
        </div>
      </section>
    </div>
  );
}