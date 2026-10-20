import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Mystudents.css";
import "./Mentorsignals.css";

const SESSIONS = ["Asian", "London", "New York"];
const TYPES = ["Market", "Limit", "Stop"];

// Same pairs and timeframes as the homepage chart. "key" is what gets saved with the signal.
const PAIRS = [
    { key: "EURUSD", label: "EUR/USD", symbol: "FX:EURUSD" },
    { key: "GBPUSD", label: "GBP/USD", symbol: "FX:GBPUSD" },
    { key: "USDJPY", label: "USD/JPY", symbol: "FX:USDJPY" },
    { key: "USDCHF", label: "USD/CHF", symbol: "FX:USDCHF" },
    { key: "AUDUSD", label: "AUD/USD", symbol: "FX:AUDUSD" },
];

const TIMEFRAMES = [
    { label: "1M", value: "1" },
    { label: "5M", value: "5" },
    { label: "15M", value: "15" },
    { label: "1H", value: "60" },
    { label: "4H", value: "240" },
    { label: "1D", value: "D" },
];

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
    date: today(),
    session: "London",
    type: "Market",
    pair: "EURUSD",
    direction: "BUY",
    entry: "",
    stop_loss: "",
    take_profit: "",
    confidence: 70,
    rationale: "",
});

// TradingView Advanced Chart. Pair switching is done with the tabs above it.
function TradingViewChart({ symbol = PAIRS[0].symbol, interval = "15", height = 520 }) {
    const containerRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.innerHTML = "";

        const widget = document.createElement("div");
        widget.className = "tradingview-widget-container__widget";
        widget.style.height = "100%";
        widget.style.width = "100%";
        container.appendChild(widget);

        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;
        script.innerHTML = JSON.stringify({
            autosize: true,
            symbol,
            interval,
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            locale: "en",
            backgroundColor: "rgba(0, 0, 0, 0)",
            allow_symbol_change: false,
            save_image: true,
            calendar: false,
            support_host: "https://www.tradingview.com",
        });
        container.appendChild(script);

        return () => {
            container.innerHTML = "";
        };
    }, [symbol, interval]);

    return (
        <div
            ref={containerRef}
            className="tradingview-widget-container"
            style={{ height, width: "100%" }}
        />
    );
}

function MentorSignals({ onNavigate, user }) {

    // Mentor signals live in their own table, separate from the AI "signals" table.
    const mentorName =
        `${user?.first_name || user?.firstName || ""} ${user?.last_name || user?.lastName || ""}`.trim() ||
        user?.name ||
        null;

    const [signals, setSignals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [filter, setFilter] = useState("all");
    const [form, setForm] = useState(emptyForm());
    const [interval, setInterval] = useState("15");

    // =========================
    // LOAD + LIVE UPDATES
    // =========================

    useEffect(() => {
        fetchSignals();

        const channel = supabase
            .channel("mentor-signals-feed")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "mentor_signals" },
                fetchSignals
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchSignals = async () => {
        // Each mentor sees their own signals (everyone's if no mentor id is available)
        let query = supabase.from("mentor_signals").select("*");
        if (user?.id) query = query.eq("mentor_id", user.id);

        const { data, error } = await query
            .order("date", { ascending: false })
            .order("created_at", { ascending: false });

        if (error) {
            setError(error.message);
        } else {
            setSignals(data || []);
        }

        setLoading(false);
    };

    // =========================
    // POST SIGNAL
    // =========================

    // Chart tabs and the Pair dropdown stay in sync
    const pickPair = (key) => setForm((f) => ({ ...f, pair: key }));
    const chartSymbol = (PAIRS.find((p) => p.key === form.pair) || PAIRS[0]).symbol;

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const postSignal = async (e) => {
        e.preventDefault();
        setError("");

        const entry = parseFloat(form.entry);
        const sl = parseFloat(form.stop_loss);
        const tp = parseFloat(form.take_profit);

        if (!form.pair.trim() || [entry, sl, tp].some(isNaN)) {
            setError("Pair, entry, stop loss and take profit are required.");
            return;
        }

        const valid =
            form.direction === "BUY"
                ? sl < entry && entry < tp
                : tp < entry && entry < sl;

        if (!valid) {
            setError(
                form.direction === "BUY"
                    ? "For a BUY: stop loss < entry < take profit."
                    : "For a SELL: take profit < entry < stop loss."
            );
            return;
        }

        setSaving(true);

        const { error } = await supabase.from("mentor_signals").insert({
            mentor_id: user?.id || null,
            mentor_name: mentorName,
            date: form.date,
            session: form.session,
            type: form.type,
            pair: form.pair.trim().toUpperCase(),
            direction: form.direction,
            entry,
            stop_loss: sl,
            take_profit: tp,
            confidence: parseInt(form.confidence, 10),
            rationale: form.rationale.trim() || null,
        });

        setSaving(false);

        if (error) {
            setError(error.message);
        } else {
            setForm(emptyForm());
            fetchSignals();
        }
    };

    // =========================
    // DELETE SIGNAL
    // =========================

    const deleteSignal = async (id) => {
        if (!window.confirm("Delete this signal?")) return;

        const { error } = await supabase.from("mentor_signals").delete().eq("id", id);

        if (error) setError(error.message);
        else setSignals(signals.filter((s) => s.id !== id));
    };

    // =========================
    // HELPERS
    // =========================

    // Works with numeric (75) or text (low / medium / high) confidence
    const confidenceInfo = (value) => {
        const n = Number(value);
        if (value !== null && value !== "" && !isNaN(n)) {
            return { label: `${n}%`, pct: n };
        }
        const text = String(value || "").toLowerCase();
        const levels = { low: 33, medium: 66, high: 100 };
        return { label: text || "—", pct: levels[text] || 0 };
    };

    // "Asia" and "Asian" should both match the Asian tab
    const sameSession = (a, b) =>
        String(a).toLowerCase().slice(0, 4) ===
        String(b).toLowerCase().slice(0, 4);

    const visible = signals.filter(
        (s) => filter === "all" || sameSession(s.session, filter)
    );

    const riskReward = (s) => {
        const risk = Math.abs(s.entry - s.stop_loss);
        const reward = Math.abs(s.take_profit - s.entry);
        return risk ? (reward / risk).toFixed(2) : "—";
    };

    // =========================
    // RENDER
    // =========================

    return (
        <div className="mentor-page">


            <main className="mentor-content">

                <div className="page-header">
                    <div>
                        <p className="page-label">MENTOR PORTAL</p>
                        <h1>Trading Signals</h1>
                        <p>Post new trade ideas and review past signals.</p>
                    </div>

                    <button className="refresh-button" onClick={fetchSignals}>
                        Refresh
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}

                {/* CHART */}

                <div className="students-card">
                    <div className="card-header">
                        <div>
                            <h2>Live Chart</h2>
                        </div>

                        <div className="filter-tabs">
                            {PAIRS.map((p) => (
                                <button
                                    type="button"
                                    key={p.key}
                                    className={form.pair === p.key ? "active" : ""}
                                    onClick={() => pickPair(p.key)}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div className="filter-tabs">
                            {TIMEFRAMES.map((tf) => (
                                <button
                                    type="button"
                                    key={tf.value}
                                    className={interval === tf.value ? "active" : ""}
                                    onClick={() => setInterval(tf.value)}
                                >
                                    {tf.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <TradingViewChart symbol={chartSymbol} interval={interval} />
                </div>

                {/* POST FORM */}

                <form className="students-card signal-form" onSubmit={postSignal}>

                    <div className="card-header">
                        <div>
                            <h2>New Signal</h2>
                        </div>
                    </div>

                    <div className="form-grid">

                        <label className="field">
                            <span>Date</span>
                            <input
                                name="date"
                                type="date"
                                value={form.date}
                                onChange={handleChange}
                            />
                        </label>

                        <label className="field">
                            <span>Session</span>
                            <select name="session" value={form.session} onChange={handleChange}>
                                {SESSIONS.map((s) => (
                                    <option key={s}>{s}</option>
                                ))}
                            </select>
                        </label>

                        <label className="field">
                            <span>Type</span>
                            <select name="type" value={form.type} onChange={handleChange}>
                                {TYPES.map((t) => (
                                    <option key={t}>{t}</option>
                                ))}
                            </select>
                        </label>

                        <label className="field">
                            <span>Pair</span>
                            <select name="pair" value={form.pair} onChange={handleChange}>
                                {PAIRS.map((p) => (
                                    <option key={p.key} value={p.key}>{p.label}</option>
                                ))}
                            </select>
                        </label>

                        <div className="field">
                            <span>Direction</span>
                            <div className="direction-toggle">
                                {["BUY", "SELL"].map((d) => (
                                    <button
                                        type="button"
                                        key={d}
                                        className={
                                            form.direction === d
                                                ? `active ${d.toLowerCase()}`
                                                : ""
                                        }
                                        onClick={() =>
                                            setForm({ ...form, direction: d })
                                        }
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="field">
                            <span>Entry</span>
                            <input
                                name="entry"
                                type="number"
                                step="any"
                                value={form.entry}
                                onChange={handleChange}
                            />
                        </label>

                        <label className="field">
                            <span>Stop loss</span>
                            <input
                                name="stop_loss"
                                type="number"
                                step="any"
                                value={form.stop_loss}
                                onChange={handleChange}
                            />
                        </label>

                        <label className="field">
                            <span>Take profit</span>
                            <input
                                name="take_profit"
                                type="number"
                                step="any"
                                value={form.take_profit}
                                onChange={handleChange}
                            />
                        </label>

                        <label className="field field-half">
                            <span>Confidence: {form.confidence}%</span>
                            <input
                                name="confidence"
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={form.confidence}
                                onChange={handleChange}
                            />
                        </label>

                        <label className="field field-wide">
                            <span>Rationale</span>
                            <textarea
                                name="rationale"
                                rows="3"
                                placeholder="Why this trade? Key levels, confluence, risk notes…"
                                value={form.rationale}
                                onChange={handleChange}
                            />
                        </label>

                    </div>

                    <button type="submit" className="post-button" disabled={saving}>
                        {saving ? "Posting…" : "+ Post signal"}
                    </button>
                </form>

                {/* SIGNAL LIST */}

                <div className="students-card">

                    <div className="card-header">
                        <div>
                            <h2>Signal Feed</h2>
                        </div>

                        <div className="filter-tabs">
                            {["all", ...SESSIONS].map((f) => (
                                <button
                                    key={f}
                                    className={filter === f ? "active" : ""}
                                    onClick={() => setFilter(f)}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="table-wrapper">
                        <table className="signals-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Pair</th>
                                    <th>Side</th>
                                    <th>Session</th>
                                    <th>Type</th>
                                    <th>Entry</th>
                                    <th>SL</th>
                                    <th>TP</th>
                                    <th>R:R</th>
                                    <th>Conf.</th>
                                    <th>Rationale</th>
                                    <th>Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading && (
                                    <tr>
                                        <td colSpan="12" className="empty-row">
                                            Loading signals...
                                        </td>
                                    </tr>
                                )}

                                {!loading && visible.map((s) => (
                                    <tr key={s.id}>
                                        <td className="num">{s.date}</td>
                                        <td className="cell-main">
                                            <strong>{s.pair}</strong>
                                        </td>
                                        <td className="cell-main">
                                            <span className={`side-badge ${s.direction.toLowerCase()}`}>
                                                {s.direction}
                                            </span>
                                        </td>
                                        <td className="num">{s.session}</td>
                                        <td className="num">{s.type}</td>
                                        <td className="num">{s.entry}</td>
                                        <td className="num">{s.stop_loss}</td>
                                        <td className="num">{s.take_profit}</td>
                                        <td className="num">{riskReward(s)}</td>
                                        <td className="num">
                                            <div className="conf">
                                                <i style={{ width: `${confidenceInfo(s.confidence).pct}%` }} />
                                            </div>
                                            <span className="conf-label">
                                                {confidenceInfo(s.confidence).label}
                                            </span>
                                        </td>
                                        <td className="rationale-cell">
                                            <div className="rationale-text" title={s.rationale || ""}>
                                                {s.rationale || "—"}
                                            </div>
                                        </td>
                                        <td className="cell-main">
                                            <button
                                                className="delete-button"
                                                onClick={() => deleteSignal(s.id)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {!loading && visible.length === 0 && (
                                    <tr>
                                        <td colSpan="12" className="empty-row">
                                            No signals yet. Post your first one above.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </main>
        </div>
    );
}

export default MentorSignals;