import React, { useEffect, useRef, useState, useCallback } from "react";
import "./community.css";
import { supabase } from "./supabaseClient";

// Basic profanity filter — extend this list as needed.
const BAD_WORDS = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick",
  "piss", "slut", "whore", "nigger", "faggot", "cock", "pussy",
];

const DELETE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function censor(text) {
  if (!text) return text;
  let out = text;
  BAD_WORDS.forEach((word) => {
    const re = new RegExp(`\\b${word}\\b`, "gi");
    out = out.replace(re, (match) => match[0] + "*".repeat(match.length - 1));
  });
  return out;
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

function canStillDelete(createdAt, now) {
  return now - new Date(createdAt).getTime() < DELETE_WINDOW_MS;
}

// Shown every time the Community page mounts — this is deliberately NOT
// persisted to localStorage, so the person has to accept it again each
// time they open the page, per the requirement.
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
            <li>Messages are filtered for offensive language, but you're still responsible for what you post.</li>
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
  // Resets to false on every mount (i.e. every time the person navigates
  // to Community), so the guidelines modal reappears each visit.
  const [agreed, setAgreed] = useState(false);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Ticks every 30s purely to re-render so delete buttons disappear once
  // a message crosses the 5-minute mark, without needing a refresh.
  const [nowTick, setNowTick] = useState(Date.now());
  const fileInputRef = useRef(null);
  const scrollRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

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

    // Realtime subscription — new messages push straight into state,
    // and deletes (by this user or others, within their own window)
    // remove the row from everyone's view live.
    const channel = supabase
      .channel("community_messages_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_messages" },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
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

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !imageFile) return;

    if (!agreed) {
      setError("Please accept the community guidelines first.");
      return;
    }

    if (!user?.id) {
      setError(
        "You must be logged in to post. (No user id found — try logging out and back in.)"
      );
      return;
    }

    setSending(true);
    setError(null);

    try {
      let imageUrl = null;

      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("community-images")
          .upload(path, imageFile);

        if (uploadErr) throw uploadErr;

        const { data: publicData } = supabase.storage
          .from("community-images")
          .getPublicUrl(path);
        imageUrl = publicData.publicUrl;
      }

      const cleanContent = trimmed ? censor(trimmed) : null;

      const { error: insertErr } = await supabase
        .from("community_messages")
        .insert({
          user_id: user.id,
          user_name: user.name || "Trader",
          content: cleanContent,
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

    // Optimistic removal — the DB is still the source of truth (RLS
    // policy enforces the 5-minute window server-side too), but this
    // makes the click feel instant.
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
          const isOwn = m.user_id === user?.id;
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

      {imagePreview && (
        <div className="community-image-preview">
          <img src={imagePreview} alt="Preview" />
          <button onClick={clearImage} className="community-remove-image">✕</button>
        </div>
      )}

      <div className="community-composer">
        <button
          className="community-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Attach image"
          disabled={!agreed}
        >
          📎
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: "none" }}
          disabled={!agreed}
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
          disabled={!agreed}
        />
        <button
          className="community-send-btn"
          onClick={handleSend}
          disabled={!agreed || sending || (!text.trim() && !imageFile)}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}