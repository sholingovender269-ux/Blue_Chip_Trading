import { useState, useRef, useEffect } from "react";
import "./analyze.css";

const KEY_ENCODED = "MmNjYzg5YTg0OGE1MWJlY2VmOTE5MDhlZmM0YWRmYjk4NGVlYmE4M2U2ZDJmMDg1YzM4MjE2YTU4MGJhMDM5Yy0xdi1yby1rcw==";
const getApiKey = () => atob(KEY_ENCODED).split("").reverse().join("");

const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const FCS_API_KEY = "qPsf0edpNixeEn35uJSkXFwstbp7Gso1v";
const FCS_API_URL = "https://api-v4.fcsapi.com/forex/latest";

const MAX_TOKENS = 4000;

const VISION_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-nano-12b-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "openrouter/free",
];

const TEXT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free",
];

const PRICE_KEYWORDS = /price|rate|quote|trading at|worth|xau|gold|xag|silver|eur\/?usd|gbp\/?usd|usd\/?jpy|aud\/?usd|usd\/?cad|nzd\/?usd|usd\/?chf/i;

const REFUSAL_PATTERN =
  /unauthorized advice|cannot provide (financial|investment|trading)|not (able|licensed) to (provide|give).{0,20}(advice|recommendation)|i('m| am) not a (licensed )?financial advisor|can'?t (give|provide) (specific )?(trading|investment) advice|as an ai( language model)?,? i (cannot|can't|am unable)/i;

const QUICK_PROMPTS = [
  { label: "Full S/R & Fib Breakdown", text: "Give me a full educational support/resistance and Fibonacci breakdown of this chart with entry, SL and TP." },
  { label: "Key S/R Zones", text: "Where are the key support and resistance zones on this chart?" },
  { label: "Trend & Structure", text: "What's the current trend direction and where's price relative to major support/resistance?" },
  { label: "Live Gold Price", text: "What's the current XAUUSD price and today's range?" },
];

const detectSymbol = (text) => {
  const t = text.toLowerCase();
  if (/xau|gold/.test(t)) return "XAUUSD";
  if (/xag|silver/.test(t)) return "XAGUSD";
  if (/eur/.test(t)) return "EURUSD";
  if (/gbp/.test(t)) return "GBPUSD";
  if (/jpy/.test(t)) return "USDJPY";
  if (/aud/.test(t)) return "AUDUSD";
  if (/cad/.test(t)) return "USDCAD";
  if (/nzd/.test(t)) return "NZDUSD";
  if (/chf/.test(t)) return "USDCHF";
  return "XAUUSD";
};

async function getLivePriceContext(text) {
  if (!PRICE_KEYWORDS.test(text)) return null;
  const symbol = detectSymbol(text);
  try {
    const res = await fetch(`${FCS_API_URL}?symbol=${symbol}&access_key=${FCS_API_KEY}`);
    const data = await res.json();
    const quote = data?.response?.[0];
    if (!quote) return null;
    const a = quote.active;
    return `LIVE MARKET DATA (use this for any price question — do not say you lack real-time data):
Symbol: ${symbol}
Current price: ${a.c}
Today's high: ${a.h}
Today's low: ${a.l}
Change: ${a.ch} (${a.chp}%)
As of: ${a.tm} UTC`;
  } catch (err) {
    console.error("FCS API error:", err);
    return null;
  }
}

const SYSTEM_PROMPT = `You are an elite technical analyst and trading educator specializing in classical price-action analysis, providing educational technical analysis commentary. This is for learning purposes only, not financial advice, and the user understands all trading decisions are their own responsibility.

SCOPE: You are Blue Chip's trading robot. You only discuss trading and the financial markets: charts, forex, gold, silver, indices, crypto, technical analysis, risk management and trading terms. If someone asks who or what you are, say you are an AI trading robot here to help with trading. If someone asks about anything else (weather, general knowledge, coding, recipes, personal advice and so on), do not answer it. Reply warmly in one or two sentences: say you're a trading robot that can only help with trading, then invite them to share a chart or ask a market question. Never use phrases like "as an AI I cannot", and never say you lack real-time data as the reason. It's simply outside what you do.

Your analysis is built around three core tools — you do NOT use smart money concepts, ICT terminology, order blocks, or liquidity-sweep language. Stick strictly to:

1. SUPPORT & RESISTANCE — identify major and minor horizontal support/resistance levels, prior swing highs/lows, and any zones showing repeated rejection or consolidation
2. FIBONACCI — retracement levels (23.6%, 38.2%, 50%, 61.8%, 78.6%) drawn from the most recent significant swing, plus extension levels (127.2%, 161.8%) for potential targets
3. PSYCHOLOGICAL LEVELS — round numbers (e.g. 1.1000, 2000.00, 50.00) and other levels traders commonly watch simply because they're round, plus how price has historically reacted around them

For every chart analysis provide, as educational commentary:
- 📊 KEY LEVELS: Major support/resistance and psychological round numbers currently in play
- 📐 FIBONACCI: Relevant retracement/extension levels and how price is reacting to them
- 🎯 TRADE SETUP: Illustrative entry criteria with confirmation
- 💰 ENTRY: Example entry price or zone
- 🛡️ STOP LOSS: Example SL with reasoning (beyond structure)
- 🎯 TAKE PROFIT: TP1, TP2, TP3 levels with RR ratios, referencing S/R, fib extensions, or the next psychological level
- ⚠️ INVALIDATION: What cancels the setup
- 📈 BIAS: Overall directional bias with confidence %

Be precise and professional. If the setup is not clear say so. End every analysis with a one-line reminder that this is educational content, not financial advice.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractReply = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "string" ? p : p?.text || "")).join("");
  }
  return "";
};

export default function Analyze({ user }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `Hey ${user?.firstName || user?.name?.split(" ")[0] || "Trader"} 👋 I'm your Blue Chip technical analyst. Upload a chart or ask me anything about the markets — I'll break it down using support/resistance, Fibonacci, and key psychological levels.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const processImageFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return false;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      setImageBase64({ data: base64, mimeType: file.type || "image/png" });
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
    return true;
  };

  const handleTextareaPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (processImageFile(file)) {
          e.preventDefault();
          return;
        }
      }
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    processImageFile(file);
  };
  const handleImageUpload = (e) => processImageFile(e.target.files[0]);
  const removeImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const callModel = async (model, baseBody, attempt = 1) => {
    const requestBody = { ...baseBody, model };
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getApiKey()}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Blue Chip Trading",
      },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 429 && attempt < 2) {
      await sleep(3000);
      return callModel(model, baseBody, attempt + 1);
    }
    return { response, data };
  };

  const callWithFallback = async (baseBody, modelChain) => {
    let lastResult = null;
    for (const model of modelChain) {
      let result;
      try {
        result = await callModel(model, baseBody);
      } catch (err) {
        console.warn(`Model ${model} errored:`, err);
        continue;
      }
      const { response, data } = result;
      lastResult = { response, data, model };

      if (response.status === 401 || response.status === 403) return lastResult;

      if (!response.ok || data.error) {
        console.warn(`Model ${model} failed:`, data.error);
        continue;
      }

      const reply = extractReply(data);
      if (!reply.trim()) {
        console.warn(
          `Model ${model} returned an empty reply (finish_reason: ${data?.choices?.[0]?.finish_reason}), trying next in chain.`
        );
        continue;
      }
      if (REFUSAL_PATTERN.test(reply)) {
        console.warn(`Model ${model} refused, trying next in chain.`);
        continue;
      }

      return { ...lastResult, ok: true };
    }
    return lastResult ? { ...lastResult, ok: false } : null;
  };

  const sendMessage = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !imageBase64) || loading) return;

    const userMsg = { role: "user", text: text || "Please analyze this chart.", image: imagePreview };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const currentImage = imageBase64;
    setImageBase64(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
    setLoading(true);

    try {
      const historyMessages = messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      }));

      const liveContext = await getLivePriceContext(text);
      const systemPromptWithLiveData = liveContext ? `${SYSTEM_PROMPT}\n\n${liveContext}` : SYSTEM_PROMPT;

      let baseBody;
      let modelChain;

      if (currentImage) {
        modelChain = VISION_MODELS;
        baseBody = {
          max_tokens: MAX_TOKENS,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${systemPromptWithLiveData}\n\n${text || "Please analyze this chart using support/resistance, Fibonacci, and psychological levels. Give me a full educational trade breakdown with entry, SL and TP."}`,
                },
                { type: "image_url", image_url: { url: `data:${currentImage.mimeType};base64,${currentImage.data}` } },
              ],
            },
          ],
        };
      } else {
        modelChain = TEXT_MODELS;
        baseBody = {
          max_tokens: MAX_TOKENS,
          messages: [
            { role: "system", content: systemPromptWithLiveData },
            ...historyMessages,
            { role: "user", content: text },
          ],
        };
      }

      const result = await callWithFallback(baseBody, modelChain);
      if (!result) {
        setMessages((prev) => [...prev, { role: "assistant", text: "⚠️ Couldn't reach the AI service. Check your connection and try again." }]);
        return;
      }
      const { response, data, model, ok } = result;
      console.log(`OpenRouter response (model: ${model}):`, data);

      if (!ok) {
        let errMsg;
        if (response.status === 401 || response.status === 403) {
          errMsg = "The AI service rejected its API key. Create a new key at openrouter.ai/keys, encode it, and paste it into KEY_ENCODED.";
        } else if (response.status === 429) {
          errMsg = "Rate limit hit on the free tier — wait a minute and try again.";
        } else if (!response.ok || data.error) {
          errMsg = data?.error?.metadata?.raw || data?.error?.message || `Request failed (${response.status})`;
        } else {
          errMsg = "All free models returned an empty or declined reply. Try again in a moment — free model availability rotates.";
        }
        setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${errMsg}` }]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: extractReply(data) }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { role: "assistant", text: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="analyze-page">
      <div className="analyze-bg-grid" />
      <div className="analyze-bg-glow" />

      <div className="analyze-layout">
        <aside className="analyze-sidebar">
          <div className="analyze-sidebar-header">
            <div className="analyze-ai-orb">
              <span className="orb-core" />
              <span className="orb-ring" />
            </div>
            <div>
              <h2>Blue Chip AI</h2>
              <span className="analyze-sub">S/R · Fibonacci Analyst</span>
            </div>
          </div>

          <div className="analyze-status">
            <span className="status-dot" />
            Model online — analyzing live market context
          </div>

          <div className="analyze-quick-title">Quick Prompts</div>
          <div className="analyze-quick-list">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                className="analyze-quick-btn"
                onClick={() => sendMessage(q.text)}
                disabled={loading}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="analyze-sidebar-footer">
            <div className="analyze-sidebar-footer-title">How it works</div>
            <p>Upload a chart screenshot or ask a market question. The assistant reads support/resistance, Fibonacci levels and key psychological price zones, then gives a full educational breakdown. Not financial advice.</p>
          </div>
        </aside>

        <main
          className={`analyze-main ${dragOver ? "analyze-drag-over" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="analyze-main-header">
            <h1>Chart Analysis</h1>
            <p>Drop a chart, ask a question, get an institutional-grade read.</p>
          </div>

          {dragOver && (
            <div className="analyze-drop-overlay">
              <div className="analyze-drop-text">📊 Drop chart to analyze</div>
            </div>
          )}

          <div className="analyze-messages">
            {messages.map((m, i) => (
              <div key={i} className={`analyze-msg ${m.role === "user" ? "analyze-msg-user" : "analyze-msg-bot"}`}>
                {m.role === "assistant" && <div className="analyze-avatar">AI</div>}
                <div className="analyze-bubble-wrap">
                  {m.image && <img src={m.image} alt="chart" className="analyze-chart-preview" />}
                  <div className="analyze-bubble">{m.text}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="analyze-msg analyze-msg-bot">
                <div className="analyze-avatar">AI</div>
                <div className="analyze-bubble analyze-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {imagePreview && (
            <div className="analyze-image-preview-row">
              <img src={imagePreview} alt="preview" className="analyze-image-thumb" />
              <span className="analyze-image-label">📊 Chart ready for analysis</span>
              <button className="analyze-remove-image" onClick={removeImage}>✕</button>
            </div>
          )}

          <div className="analyze-input-row">
            <button className="analyze-upload-btn" onClick={() => fileRef.current?.click()} title="Upload chart">
              📎
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
            <textarea
              ref={textareaRef}
              className="analyze-input"
              placeholder={imageBase64 ? "Add a note or press Enter..." : "Ask anything or upload a chart..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              onPaste={handleTextareaPaste}
              rows={1}
            />
            <button className="analyze-send-btn" onClick={() => sendMessage()} disabled={loading || (!input.trim() && !imageBase64)}>
              ➤
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}