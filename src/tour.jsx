import React, { useEffect, useLayoutEffect, useState } from "react";
import "./tour.css";

const STORAGE_KEY = "bluechip-tour-done";

const STEPS = [
  { target: "dashboard", title: "Dashboard", text: "Your overview: balance, live charts, market watch and forex session times." },
  { target: "account", title: "Account", text: "Manage your profile, photo and personal details." },
  { target: "analyze", title: "Analyze", text: "Get AI-powered analysis of the markets and your charts." },
  { target: "courses", title: "Courses", text: "Learning material to build your trading skills." },
  { target: "demo", title: "Demo Trade", text: "Practice with virtual money on live charts. No risk." },
  { target: "signals", title: "Signals", text: "Trade ideas based on current market prices." },
  { target: "live", title: "Live", text: "Watch live trading sessions and market coverage." },
  { target: "partners", title: "Partners", text: "Our partner brokers and perks." },
  { target: "Community", title: "Community", text: "Chat with other traders, share ideas, or apply to become a mentor." },
];

const TIP_W = 300;

export default function OnboardingTour() {
  const [active, setActive] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
    }
    setActive(false);
  };

  const next = () => (i === STEPS.length - 1 ? finish() : setI(i + 1));
  const prev = () => setI((n) => Math.max(0, n - 1));

  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const el = document.querySelector(`[data-tour="${STEPS[i].target}"]`);
      const r = el && el.getBoundingClientRect();
      setRect(r && r.width > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, i]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!active || !rect) return null;

  const step = STEPS[i];
  const center = rect.left + rect.width / 2;
  const tipLeft = Math.max(12, Math.min(center - TIP_W / 2, window.innerWidth - TIP_W - 12));
  const tipTop = rect.top + rect.height + 16;
  const arrowLeft = Math.max(16, Math.min(center - tipLeft, TIP_W - 16));

  return (
    <div className="tour-root">
      <div className="tour-blocker" onClick={finish} />
      <div
        className="tour-spotlight"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div className="tour-tip" style={{ top: tipTop, left: tipLeft, width: TIP_W }}>
        <span className="tour-arrow" style={{ left: arrowLeft }} />
        <div className="tour-step-count">
          {i + 1} / {STEPS.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-text">{step.text}</p>
        <div className="tour-actions">
          <button className="tour-btn tour-skip" onClick={finish}>
            Skip
          </button>
          <div className="tour-nav">
            {i > 0 && (
              <button className="tour-btn" onClick={prev}>
                Previous
              </button>
            )}
            <button className="tour-btn tour-primary" onClick={next}>
              {i === STEPS.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}