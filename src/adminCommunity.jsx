import React, { useEffect, useMemo, useState } from "react";
import "./adminCommunity.css";
import { supabase } from "./supabaseClient";

// ── Helpers ─────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SORT_OPTIONS = [
  { value: "created_at_desc", label: "Newest First" },
  { value: "created_at_asc", label: "Oldest First" },
  { value: "user_name_asc", label: "User Name (A → Z)" },
  { value: "user_name_desc", label: "User Name (Z → A)" },
];

// ── Main page ───────────────────────────────────────────────────

export default function AdminCommunityPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [typeFilter, setTypeFilter] = useState("all"); // all | text | image
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at_desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [lightboxUrl, setLightboxUrl] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const { data, error: msgErr } = await supabase
      .from("community_messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (msgErr) {
      setError(msgErr.message);
      setLoading(false);
      return;
    }

    setMessages(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const withImage = messages.filter((m) => m.image_url);
    const uniqueUsers = new Set(messages.map((m) => m.user_id || m.user_name)).size;
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = messages.filter((m) => m.created_at?.slice(0, 10) === today).length;
    return {
      total: messages.length,
      withImage: withImage.length,
      uniqueUsers,
      today: todayCount,
    };
  }, [messages]);

  const filtered = useMemo(() => {
    let rows = [...messages];

    if (typeFilter === "image") {
      rows = rows.filter((m) => m.image_url);
    } else if (typeFilter === "text") {
      rows = rows.filter((m) => !m.image_url);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((m) => {
        return (
          m.user_name?.toLowerCase().includes(q) ||
          m.content?.toLowerCase().includes(q) ||
          m.id?.toLowerCase().includes(q) ||
          m.user_id?.toLowerCase().includes(q)
        );
      });
    }

    rows.sort((a, b) => {
      switch (sortBy) {
        case "created_at_asc":
          return new Date(a.created_at) - new Date(b.created_at);
        case "created_at_desc":
          return new Date(b.created_at) - new Date(a.created_at);
        case "user_name_asc":
          return (a.user_name || "").localeCompare(b.user_name || "");
        case "user_name_desc":
          return (b.user_name || "").localeCompare(a.user_name || "");
        default:
          return 0;
      }
    });

    return rows;
  }, [messages, typeFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, search, sortBy]);

  const deleteMessage = async (id) => {
    if (!window.confirm("Delete this message permanently?")) return;
    const { error: delErr } = await supabase.from("community_messages").delete().eq("id", id);
    if (delErr) {
      alert("Failed to delete message: " + delErr.message);
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="admin-community-page">
      <div className="dashboard-stats">
        <div className="stat-card" style={{ "--accent": "var(--cyan)" }}>
          <div className="stat-card-icon">💬</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Total Messages</span>
            <span className="stat-card-value">{loading ? "…" : stats.total}</span>
            <span className="stat-card-change neutral">All time</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--purple)" }}>
          <div className="stat-card-icon">🖼️</div>
          <div className="stat-card-info">
            <span className="stat-card-label">With Images</span>
            <span className="stat-card-value">{loading ? "…" : stats.withImage}</span>
            <span className="stat-card-change neutral">Attachments</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--pink, #e879f9)" }}>
          <div className="stat-card-icon">👤</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Unique Posters</span>
            <span className="stat-card-value">{loading ? "…" : stats.uniqueUsers}</span>
            <span className="stat-card-change neutral">Distinct users</span>
          </div>
        </div>
        <div className="stat-card" style={{ "--accent": "var(--cyan)" }}>
          <div className="stat-card-icon">📅</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Posted Today</span>
            <span className="stat-card-value">{loading ? "…" : stats.today}</span>
            <span className="stat-card-change neutral">Since midnight</span>
          </div>
        </div>
      </div>

      <div className="dashboard-card community-card">
        <div className="card-header community-header">
          <h2>Community Messages</h2>

          <div className="community-toolbar">
            <input
              type="text"
              className="community-search"
              placeholder="Search user, content, id…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="community-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">All Messages</option>
              <option value="text">Text Only</option>
              <option value="image">With Image</option>
            </select>

            <select
              className="community-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <button className="community-refresh-btn" onClick={load}>Refresh</button>
          </div>
        </div>

        {error && <div className="community-error">{error}</div>}

        <div className="community-list">
          {loading && <div className="community-empty">Loading messages…</div>}

          {!loading && pageRows.length === 0 && (
            <div className="community-empty">No messages match your filters.</div>
          )}

          {!loading && pageRows.map((m) => (
            <div className="community-row" key={m.id}>
              <div className="community-row-main">
                <div className="community-row-head">
                  <span className="community-user">{m.user_name || "Unknown"}</span>
                  <span className="community-time mono small">{formatDateTime(m.created_at)}</span>
                </div>

                {m.content && <p className="community-content">{m.content}</p>}

                {m.image_url && (
                  <img
                    src={m.image_url}
                    alt="Community upload"
                    className="community-thumb"
                    onClick={() => setLightboxUrl(m.image_url)}
                  />
                )}

                <div className="community-meta">
                  <span className="mono small muted" title={m.user_id}>
                    {m.user_id ? m.user_id.slice(0, 8) + "…" : "no user id"}
                  </span>
                  {m.image_url && <span className="image-pill">has image</span>}
                </div>
              </div>

              <button className="community-delete-btn" onClick={() => deleteMessage(m.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="community-pagination">
            <span className="community-page-info">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </span>
            <div className="community-page-controls">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div className="community-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Full size" />
        </div>
      )}
    </div>
  );
}