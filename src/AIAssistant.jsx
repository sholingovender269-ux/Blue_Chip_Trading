import { useState, useRef, useEffect } from "react";
import "./AIAssistant.css";

const API_KEY = "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";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

const FCS_API_KEY = "qPsf0edpNixeEn35uJSkXFwstbp7Gso1v";
const FCS_API_URL = "https://api-v4.fcsapi.com/forex/latest";

// Ordered fallback chain of free, vision-capable models on OpenRouter.
// Verified live against openrouter.ai/models — Aug 2026 snapshot.
// General-purpose multimodal chat models first (less likely to trip
// safety refusals on "analyze this chart" prompts), reasoning/agentic
// vision models later as a last resort. Model availability shifts
// often on OpenRouter's free tier, so re-check this list periodically.
const VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "minimax/minimax-m3:free",
  "nvidia/nemotron-3-nano-12b-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "thinkingmachines/inkling:free",
];

// Text-only fallback chain (no image attached)
const TEXT_MODELS = [
  "openai/gpt-3.5-turbo",
  "meta-llama/llama-3.3-70b-instruct:free",
  "z-ai/glm-5.2:free",
];

const PRICE_KEYWORDS = /price|rate|quote|trading at|worth|xau|gold|xag|silver|eur\/?usd|gbp\/?usd|usd\/?jpy|aud\/?usd|usd\/?cad|nzd\/?usd|usd\/?chf/i;

// Phrases that indicate the model refused instead of answering, so we
// know to retry with the next model in the chain rather than showing
// the refusal to the user.
const REFUSAL_PATTERN =
  /unauthorized advice|cannot provide (financial|investment|trading)|not (able|licensed) to (provide|give).{0,20}(advice|recommendation)|i('m| am) not a (licensed )?financial advisor|can'?t (give|provide) (specific )?(trading|investment) advice|as an ai( language model)?,? i (cannot|can't|am unable)/i;

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

// Framed as educational technical-analysis commentary rather than
// direct trade instruction — reduces false-positive safety refusals
// on stricter free models while keeping the same SMC/ICT depth.
const SYSTEM_PROMPT = `You are an elite SMC (Smart Money Concepts) and ICT (Inner Circle Trader) trading educator providing educational technical analysis commentary. This is for learning purposes only, not financial advice, and the user understands all trading decisions are their own responsibility.

When analyzing charts you must:
1. Identify market structure (BOS, CHOCH, HH, HL, LH, LL)
2. Locate key supply and demand zones
3. Identify order blocks (bullish/bearish)
4. Find fair value gaps (FVG) and imbalances
5. Spot liquidity pools (buy-side/sell-side liquidity)
6. Identify optimal trade entry (OTE) using fibonacci
7. Check for inducement and liquidity sweeps
8. Assess premium and discount zones

For every chart analysis provide, as educational commentary:
- 📊 MARKET STRUCTURE: Current structure and bias
- 🎯 TRADE SETUP: Illustrative entry criteria with confirmation
- 💰 ENTRY: Example entry price or zone
- 🛡️ STOP LOSS: Example SL with reasoning (beyond structure)
- 🎯 TAKE PROFIT: TP1, TP2, TP3 levels with RR ratios
- ⚠️ INVALIDATION: What cancels the setup
- 📈 BIAS: Overall directional bias with confidence %

Be precise and professional. If the setup is not clear say so. End every analysis with a one-line reminder that this is educational content, not financial advice.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AIAssistant({ user, activeSymbol }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: `Hey ${user?.firstName || "Trader"} 👋 I'm your Blue Chip SMC/ICT analyst. Upload a chart using the 📎 button or drag and drop an image into the chat, then I'll give you a full SMC/ICT analysis.`,
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
  }, [messages, open]);

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

  // Calls OpenRouter with a single model, retrying once on 429.
  const callModel = async (model, baseBody, attempt = 1) => {
    const requestBody = { ...baseBody, model };
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Blue Chip Trading",
      },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (response.status === 429 && attempt < 2) {
      await sleep(3000);
      return callModel(model, baseBody, attempt + 1);
    }
    return { response, data };
  };

  // Walks the model chain until one returns a usable (non-refusal) reply.
  const callWithFallback = async (baseBody, modelChain) => {
    let lastResult = null;
    for (const model of modelChain) {
      const { response, data } = await callModel(model, baseBody);
      lastResult = { response, data, model };

      if (!response.ok || data.error) {
        console.warn(`Model ${model} failed:`, data.error);
        continue; // try next model
      }

      const reply = data?.choices?.[0]?.message?.content || "";
      if (REFUSAL_PATTERN.test(reply)) {
        console.warn(`Model ${model} refused, trying next in chain.`);
        continue; // try next model
      }

      return lastResult; // success
    }
    return lastResult; // return the last attempt even if it also failed/refused
  };

  const sendMessage = async () => {
    const text = input.trim();
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
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${systemPromptWithLiveData}\n\n${text || "Please analyze this chart using SMC and ICT concepts. Give me a full educational trade breakdown with entry, SL and TP."}`,
                },
                { type: "image_url", image_url: { url: `data:${currentImage.mimeType};base64,${currentImage.data}` } },
              ],
            },
          ],
        };
      } else {
        modelChain = TEXT_MODELS;
        baseBody = {
          messages: [
            { role: "system", content: systemPromptWithLiveData },
            ...historyMessages,
            { role: "user", content: text },
          ],
        };
      }

      const { response, data, model } = await callWithFallback(baseBody, modelChain);
      console.log(`OpenRouter response (model: ${model}):`, data);

      if (!response.ok || data.error) {
        let errMsg = data?.error?.metadata?.raw || data?.error?.message || `Request failed (${response.status})`;
        if (response.status === 429) {
          errMsg = "Rate limit hit on the free tier — wait a minute and try again.";
        }
        setMessages((prev) => [...prev, { role: "assistant", text: `⚠️ ${errMsg}` }]);
        return;
      }

      const reply = data?.choices?.[0]?.message?.content || "Sorry, I couldn't get a response. Try again.";

      if (REFUSAL_PATTERN.test(reply)) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "⚠️ All available free models declined to analyze this one. Try rephrasing your question, or try again shortly — free model availability rotates.",
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: reply }]);
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
    <>
      <button className={`ai-fab ${open ? "ai-fab-open" : ""}`} onClick={() => setOpen(!open)}>
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div
          className={`ai-panel ${dragOver ? "ai-drag-over" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-dot" />
              <span>Blue Chip AI Analyst</span>
            </div>
            <span className="ai-panel-sub">SMC · ICT</span>
          </div>

          {dragOver && (
            <div className="ai-drop-overlay">
              <div className="ai-drop-text">📊 Drop chart here</div>
            </div>
          )}

          <div className="ai-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role === "user" ? "ai-msg-user" : "ai-msg-bot"}`}>
                {m.role === "assistant" && <div className="ai-avatar">AI</div>}
                <div className="ai-bubble-wrap">
                  {m.image && <img src={m.image} alt="chart" className="ai-chart-preview" />}
                  <div className="ai-bubble">{m.text}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg-bot">
                <div className="ai-avatar">AI</div>
                <div className="ai-bubble ai-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {imagePreview ? (
            <div className="ai-image-preview-row">
              <img src={imagePreview} alt="preview" className="ai-image-thumb" />
              <span className="ai-image-label">📊 Chart ready for analysis</span>
              <button className="ai-remove-image" onClick={removeImage}>✕</button>
            </div>
          ) : (
            <div className="ai-paste-hint">
              📎 Upload · Drag & drop a chart image here
            </div>
          )}

          <div className="ai-input-row">
            <button className="ai-upload-btn" onClick={() => fileRef.current?.click()} title="Upload chart">
              📎
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleImageUpload}
            />
            <textarea
              ref={textareaRef}
              className="ai-input"
              placeholder={imageBase64 ? "Add a note or press Enter..." : "Ask anything or upload a chart..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              onPaste={handleTextareaPaste}
              rows={1}
            />
            <button
              className="ai-send-btn"
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !imageBase64)}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}