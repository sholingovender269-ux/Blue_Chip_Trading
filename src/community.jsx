import React, { useEffect, useRef, useState, useCallback } from "react";
import "./community.css";
import { supabase } from "./supabaseClient";

const DELETE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BAN_DURATION_MS = 10 * 60 * 1000; // 10 minutes

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns true if the text contains any word from the banned list.
function containsBannedWord(text, words) {
  if (!text || !words.length) return false;
  return words.some((w) => new RegExp(`\\b${escapeRegex(w)}\\b`, "i").test(text));
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (sameDay) return time;
  const date = d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short" });
  return `${date} · ${time}`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function canStillDelete(createdAt, now) {
  return now - new Date(createdAt).getTime() < DELETE_WINDOW_MS;
}

// Shown every time the Community page mounts — deliberately NOT persisted,
// so the person has to accept it again each time they open the page.
function GuidelinesModal({ onAgree }) {
  return (
    <div className="community-modal-overlay">
      <div className="community-modal">
        <h2>Community Guidelines</h2>
        <div className="community-modal-body">
          <p>Before you post, please keep in mind:</p>
          <ul>
            <li>This is not financial advice. Nothing posted here is a signal, guarantee, or recommendation to trade.</li>
            <li>Trading involves risk. Any decisions you make based on what others share are your own responsibility.</li>
            <li>Be respectful. No harassment, hate speech, or personal attacks.</li>
            <li>No spam, scams, or promotion of unrelated services.</li>
            <li>Using vulgar or offensive language will get your message blocked and you will be banned from the chat for 10 minutes.</li>
            <li>You can remove your own message within 5 minutes of sending it — after that it stays permanently.</li>
            <li>Anything shared here is visible to other members of the community.</li>
          </ul>
        </div>
        <button className="community-modal-agree-btn" onClick={onAgree}>
          I Understand — Continue
        </button>
      </div>
    </div>
  );
}

export default function CommunityPage({ user }) {
  const [agreed, setAgreed] = useState(false);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Moderation
  const [bannedWords, setBannedWords] = useState([]);
  const [bannedUntil, setBannedUntil] = useState(null); // ms timestamp or null
  const [banNow, setBanNow] = useState(Date.now());

  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  const userId = user?.id ? String(user.id) : null;
  const isBanned = bannedUntil !== null && bannedUntil > banNow;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  // Tick for the 5-minute delete window
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Tick every second while banned (countdown + auto-unban)
  useEffect(() => {
    if (bannedUntil === null) return undefined;
    setBanNow(Date.now());
    const id = setInterval(() => {
      const now = Date.now();
      setBanNow(now);
      if (now >= bannedUntil) {
        setBannedUntil(null);
        setError(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [bannedUntil]);

  // Load banned words (same table the live chat uses)
  useEffect(() => {
    let active = true;
    supabase
      .from("chat_banned_words")
      .select("word")
      .then(({ data, error: err }) => {
        if (err) return console.error("Banned words load failed:", err);
        if (active) {
          setBannedWords(
            (data || []).map((r) => String(r.word || "").trim().toLowerCase()).filter(Boolean)
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Check whether this user is currently banned
  const fetchBan = useCallback(async () => {
    if (!userId) return null;
    const { data, error: err } = await supabase
      .from("community_bans")
      .select("banned_until")
      .eq("user_id", userId)
      .maybeSingle();
    if (err) {
      console.error("Ban check failed:", err);
      return null;
    }
    const until = data?.banned_until ? new Date(data.banned_until).getTime() : null;
    return until && until > Date.now() ? until : null;
  }, [userId]);

  useEffect(() => {
    let active = true;
    fetchBan().then((until) => {
      if (active) {
        setBannedUntil(until);
        setBanNow(Date.now());
      }
    });
    return () => {
      active = false;
    };
  }, [fetchBan]);

  // Messages + realtime
  useEffect(() => {
    let cancelled = false;

    const fetchMessages = async () => {
      const { data, error: fetchErr } = await supabase
        .from("community_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;
      if (fetchErr) {
        console.error("Community fetch error:", fetchErr);
        setError(`Couldn't load messages: ${fetchErr.message}`);
      } else {
        setMessages(data || []);
        scrollToBottom();
      }
      setLoading(false);
    };

    fetchMessages();

    const channel = supabase
      .channel("community_messages_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]
          );
          scrollToBottom();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "community_messages" },
        (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [scrollToBottom]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const banUser = async () => {
    const until = Date.now() + BAN_DURATION_MS;
    setBannedUntil(until);
    setBanNow(Date.now());
    setText("");
    clearImage();
    const { error: banErr } = await supabase.from("community_bans").upsert(
      {
        user_id: userId,
        banned_until: new Date(until).toISOString(),
        reason: "vulgar language",
      },
      { onConflict: "user_id" }
    );
    if (banErr) console.error("Ban save failed:", banErr);
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !imageFile) return;

    if (!agreed) {
      setError("Please accept the community guidelines first.");
      return;
    }

    if (isBanned) return;

    setSending(true);
    setError(null);

    try {
      if (!userId) {
        throw new Error("You must be logged in to post. Log out and back in.");
      }

      // Re-check the ban server-side in case it was set from another tab/device
      const activeBan = await fetchBan();
      if (activeBan) {
        setBannedUntil(activeBan);
        setBanNow(Date.now());
        return;
      }

      // Vulgar word check: message is NOT sent, user is banned for 10 minutes
      if (trimmed && containsBannedWord(trimmed, bannedWords)) {
        await banUser();
        return;
      }

      let imageUrl = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("community-images")
          .upload(path, imageFile);

        if (uploadErr) throw uploadErr;

        const { data: publicData } = supabase.storage
          .from("community-images")
          .getPublicUrl(path);
        imageUrl = publicData.publicUrl;
      }

      const { error: insertErr } = await supabase
        .from("community_messages")
        .insert({
          user_id: userId,
          user_name: user?.name || "Trader",
          content: trimmed || null,
          image_url: imageUrl,
        });

      if (insertErr) throw insertErr;

      setText("");
      clearImage();
    } catch (err) {
      console.error("Send message error:", err);
      setError(`Couldn't send message: ${err.message || "unknown error"}`);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (message) => {
    if (!canStillDelete(message.created_at, Date.now())) {
      setError("This message can no longer be removed — the 5-minute window has passed.");
      return;
    }

    setDeletingId(message.id);
    setError(null);

    const prevMessages = messages;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));

    const { error: deleteErr } = await supabase
      .from("community_messages")
      .delete()
      .eq("id", message.id);

    if (deleteErr) {
      console.error("Delete message error:", deleteErr);
      setMessages(prevMessages); // roll back
      setError(`Couldn't remove message: ${deleteErr.message}`);
    }

    setDeletingId(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const composerDisabled = !agreed || isBanned;

  return (
    <div className="community-page">
      {!agreed && <GuidelinesModal onAgree={() => setAgreed(true)} />}

      <div className="community-header">
        <h1>Community</h1>
        <span className="live-badge">● LIVE</span>
      </div>

      <div className="community-feed" ref={scrollRef}>
        {loading && <div className="community-empty">Loading messages…</div>}

        {!loading && messages.length === 0 && (
          <div className="community-empty">No messages yet — say hello 👋</div>
        )}

        {messages.map((m) => {
          const isOwn = !!user?.id && String(m.user_id) === String(user.id);
          const deletable = isOwn && canStillDelete(m.created_at, nowTick);
          return (
            <div key={m.id} className={`community-msg ${isOwn ? "own" : ""}`}>
              <div className="community-avatar">
                {m.user_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="community-msg-body">
                <div className="community-msg-meta">
                  <span className="community-msg-name">{m.user_name}</span>
                  <span className="community-msg-time">{formatTime(m.created_at)}</span>
                  {deletable && (
                    <button
                      className="community-msg-delete"
                      onClick={() => handleDelete(m)}
                      disabled={deletingId === m.id}
                      title="Remove message (available for 5 minutes after sending)"
                    >
                      {deletingId === m.id ? "Removing…" : "Remove"}
                    </button>
                  )}
                </div>
                {m.content && <p className="community-msg-text">{m.content}</p>}
                {m.image_url && (
                  <img
                    className="community-msg-image"
                    src={m.image_url}
                    alt="Shared attachment"
                    loading="lazy"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="community-error">{error}</div>}

      {imagePreview && !isBanned && (
        <div className="community-image-preview">
          <img src={imagePreview} alt="Preview" />
          <button onClick={clearImage} className="community-remove-image">✕</button>
        </div>
      )}

      {isBanned ? (
        <div className="community-error community-banned">
          Vulgar language was detected, so you've been blocked from the community chat.
          You can chat again in {formatCountdown(bannedUntil - banNow)}.
        </div>
      ) : (
        <div className="community-composer">
          <button
            className="community-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            disabled={composerDisabled}
          >
            📎
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: "none" }}
            disabled={composerDisabled}
          />
          <textarea
            className="community-input"
            placeholder={
              agreed
                ? "Message the community…"
                : "Accept the guidelines above to start chatting…"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={composerDisabled}
          />
          <button
            className="community-send-btn"
            onClick={handleSend}
            disabled={composerDisabled || sending || (!text.trim() && !imageFile)}
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}