import { useState, useEffect, useRef } from "react";
import "./homepage.css";

const WHY_US = [
  { icon: "📊", title: "Advanced Charting Tools", desc: "Professional-grade charts with 50+ indicators, drawing tools, and multi-timeframe analysis." },
  { icon: "📚", title: "Free Educational Resources", desc: "Structured courses, video tutorials, and written guides built for every skill level." },
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

const PLATFORM_FEATURES = [
  { icon: "🛡", title: "Secure & Reliable", desc: "Top-tier security for your funds and data. We take protection seriously." },
  { icon: "📡", title: "Live Signals", desc: "Verified entry, exit, and direction calls from our mentor team daily." },
  { icon: "👥", title: "Community", desc: "Join thousands of traders sharing insights, asking questions, and growing together daily." },
  { icon: "📚", title: "Courses", desc: "Structured courses from beginner to advanced. Learn at your own pace." },
  { icon: "🎯", title: "Live Trading", desc: "Trade alongside professional traders in real-time. Watch and learn." },
  { icon: "🤝", title: "Mentorships", desc: "One-on-one guidance from experienced traders who've been where you are." },
  { icon: "💻", title: "Simulated Trading", desc: "Practice with live market conditions using virtual money. Zero risk." },
  { icon: "📈", title: "Market Analysis", desc: "Daily breakdowns of market movements and trading opportunities." },
];

const FAQS = [
  { q: "Do I need experience to start?", a: "Not at all! We have courses for absolute beginners. You'll learn everything from scratch." },
  { q: "How much does it cost?", a: "We have one simple plan at $99/month. No hidden fees, cancel anytime." },
  { q: "Can I try before I buy?", a: "Yes! Start with our free tier. No credit card required to begin learning." },
  { q: "Are the signals really profitable?", a: "We provide verified signals from professional traders. Past performance doesn't guarantee future results, but our community sees consistent results." },
  { q: "How do I join live trading sessions?", a: "Live sessions are included in your plan. Watch, ask questions, and trade along with mentors." },
  { q: "Is my money safe?", a: "Yes! We're fully regulated and use bank-level security for all transactions." },
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

export default function Academy() {
  const [openFaq, setOpenFaq] = useState(null);
  const toggleFaq = (i) => setOpenFaq(openFaq === i ? null : i);

  return (
    <div className="page">

      <nav className="nav">
        <div className="logo">Blue <span>Chip</span>Trading</div>
        <div className="nav-links">
          <a href="#">Courses</a>
          <a href="#">Mentorship</a>
          <a href="#">Signals</a>
          <a href="#">Community</a>
          <a href="#">Pricing</a>
        </div>
        <div className="nav-right">
          <a href="#" className="nav-login">Log In</a>
          <a href="#" className="nav-signup">Sign Up</a>
          <a href="#" className="nav-careers">Become a Mentor</a>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge">Forex Education — Done Properly</div>
          <h1 className="hero-h1">
            Learn to Trade.<br />
            <em>The Right Way.</em>
          </h1>
          <p className="hero-p">
            Structured courses, live mentorship, verified signals, and a community
            of real traders — one platform, one simple monthly price.
          </p>
          <p className="hero-note">No credit card required · Cancel anytime</p>
        </div>
        <div className="hero-right">
          <img src="2.jpg" alt="Example" className="hero-image" />
        </div>
      </section>

      <section className="stats-row">
        <Stat value="2,400+" label="Active Students" />
        <Stat value="94%" label="Completion Rate" />
        <Stat value="18" label="Structured Courses" />
        <Stat value="Live" label="Daily Sessions" />
      </section>

      {/* PRICING - single plan */}
      <section className="section pricing-section">
        <div className="eyebrow center">Simple Pricing</div>
        <h2 className="h2 center">One Plan. Everything Included.</h2>
        <p className="pricing-subtitle center">No tiers, no confusion. Just full access for one flat rate.</p>
        <div className="pricing-single">
          <div className="pricing-card recommended">
            <div className="pricing-name">Pro</div>
            <div className="pricing-price">R420<span>/month</span></div>
            <ul className="pricing-features">
              <li>✓ All Courses</li>
              <li>✓ Live Trading Sessions with Professional</li>
              <li>✓ Verified Signals</li>
              <li>✓ Mentorship Access</li>
              <li>✓ Priority Support</li>
              <li>✓ Simulated Trading</li>
              <li>✓ Live Forex Chart</li>
              <li>✓ Market Analysis</li>
              <li>✓ Exclusive Trading community</li>
              <li><b>We decided on a single, transparent price for everyone — making quality education and trading skills accessible to all</b></li>
            </ul>
            <button className="pricing-btn">Get Started</button>
          </div>
        </div>
      </section>

      <section className="section platform-section">
        <div className="eyebrow center">Everything You Need</div>
        <h2 className="h2 center">All-in-One Trading Platform</h2>
        <div className="platform-grid">
          {PLATFORM_FEATURES.map((f, i) => (
            <div key={i} className="platform-card">
              <div className="platform-icon">{f.icon}</div>
              <div className="platform-title">{f.title}</div>
              <p className="platform-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section steps-section">
        <div className="eyebrow center">How It Works</div>
        <h2 className="h2 center">Get Started in 3 Simple Steps</h2>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div key={i} className="step-card">
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <p className="step-desc">{s.desc}</p>
              {i < STEPS.length - 1 && <div className="step-arrow">→</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="section whyus-section">
        <div className="eyebrow center">Why Choose Us</div>
        <h2 className="h2 center">Everything You Need.<br />All in One Place.</h2>
        <div className="whyus-grid">
          {WHY_US.map((w, i) => (
            <div key={i} className="why-card">
              <div className="why-icon">{w.icon}</div>
              <div className="why-title">{w.title}</div>
              <p className="why-desc">{w.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CAREER SECTION - moved lower */}
      <section className="career-section">
        <div className="career-content">
          <div className="career-icon">🏆</div>
          <h2 className="career-title">Are You a Skilled Trader?</h2>
          <p className="career-desc">
            Prove your skills and join our elite team of professional traders.
            We're looking for talented individuals who can analyze markets,
            identify opportunities, and help our community grow.
          </p>
          <button className="career-btn">Apply Now →</button>
        </div>
        <div className="career-stats">
          <div className="career-stat">
            <div className="career-stat-value">R50K+</div>
            <div className="career-stat-label">Average Earnings</div>
          </div>
          <div className="career-stat">
            <div className="career-stat-value">24/7</div>
            <div className="career-stat-label">Global Markets</div>
          </div>
          <div className="career-stat">
            <div className="career-stat-value">100%</div>
            <div className="career-stat-label">Remote Work</div>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="eyebrow center">Got Questions?</div>
        <h2 className="h2 center">Frequently Asked Questions</h2>
        <div className="faq-grid">
          {FAQS.map((faq, i) => (
            <FAQItem
              key={i}
              question={faq.q}
              answer={faq.a}
              isOpen={openFaq === i}
              onClick={() => toggleFaq(i)}
            />
          ))}
        </div>
      </section>

    </div>
  );
}