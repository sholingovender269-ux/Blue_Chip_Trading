import React, { useEffect, useState, useCallback } from "react";
import "./admin.css";
import { supabase } from "./supabaseClient";

const EMPTY_CLIENT = { first_name: "", last_name: "", email: "", id_number: "", address: "" };
const EMPTY_ADMIN = { name: "", surname: "", email: "", password: "" };

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

// ── Clients tab ─────────────────────────────────────────────────

function ClientsTab() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newClient, setNewClient] = useState(EMPTY_CLIENT);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setClients(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filtered = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  const handleAddClient = async (e) => {
    e.preventDefault();
    if (!newClient.first_name || !newClient.last_name || !newClient.email || !newClient.id_number) {
      setError("First name, last name, email, and ID number are required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("clients")
      .insert([newClient])
      .select();

    if (error) setError(error.message);
    else {
      setClients((prev) => [data[0], ...prev]);
      setNewClient(EMPTY_CLIENT);
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) setError(error.message);
    else setClients((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="dashboard-card users-card">
      <div className="card-header">
        <h2>Clients</h2>
        <span className="live-badge">● {filtered.length} shown</span>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}

      <div className="table-toolbar">
        <input
          className="admin-search"
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="admin-btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New Client"}
        </button>
        <button className="admin-btn ghost" onClick={fetchClients}>Refresh</button>
      </div>

      {showForm && (
        <form className="admin-inline-form" onSubmit={handleAddClient}>
          <input
            className="admin-search"
            placeholder="First name"
            value={newClient.first_name}
            onChange={(e) => setNewClient({ ...newClient, first_name: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="Last name"
            value={newClient.last_name}
            onChange={(e) => setNewClient({ ...newClient, last_name: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="Email"
            type="email"
            value={newClient.email}
            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="ID number"
            value={newClient.id_number}
            onChange={(e) => setNewClient({ ...newClient, id_number: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="Address (optional)"
            value={newClient.address}
            onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
          />
          <button className="admin-btn primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save Client"}
          </button>
        </form>
      )}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>ID Number</th>
              <th>Address</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="empty-row">Loading clients…</td></tr>
            )}
            {!loading && filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.first_name} {c.last_name}</td>
                <td className="mono">{c.email}</td>
                <td className="mono">{c.id_number}</td>
                <td>{c.address || "—"}</td>
                <td className="mono">{formatDate(c.created_at)}</td>
                <td className="row-actions">
                  <button
                    className="admin-btn danger small"
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                  >
                    {deletingId === c.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="empty-row">No clients found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Admins tab (public.admins) ───────────────────────────────────
// NOTE: admins.id is a foreign key to auth.users(id) — a row can only be
// inserted here for a UUID that already exists as an authenticated user.
// This form does NOT create the auth user itself (that requires the
// service-role key / an Edge Function, never the anon key on the client).
// Typical flow: the person signs up / is invited via Supabase Auth first,
// you copy their auth user UUID, then promote them to admin here.

function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newAdmin, setNewAdmin] = useState(EMPTY_ADMIN);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("admins")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else setAdmins(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const filtered = admins.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name?.toLowerCase().includes(q) ||
      a.surname?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q)
    );
  });

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdmin.name || !newAdmin.surname || !newAdmin.email || !newAdmin.password) {
      setError("Name, surname, email, and a temporary password are all required.");
      return;
    }
    setSaving(true);
    setError(null);

    // Calls the "create-admin" Edge Function, which creates the auth user
    // AND the admins row together using the service-role key server-side.
    // The function itself checks that the caller is already an admin.
    const { data, error } = await supabase.functions.invoke("create-admin", {
      body: {
        email: newAdmin.email,
        password: newAdmin.password,
        name: newAdmin.name,
        surname: newAdmin.surname,
      },
    });

    if (error) {
      setError(error.message || "Failed to create admin.");
    } else if (data?.error) {
      setError(data.error);
    } else {
      setAdmins((prev) => [data.admin, ...prev]);
      setNewAdmin(EMPTY_ADMIN);
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from("admins").delete().eq("id", id);
    if (error) setError(error.message);
    else setAdmins((prev) => prev.filter((a) => a.id !== id));
    setDeletingId(null);
  };

  return (
    <div className="dashboard-card users-card">
      <div className="card-header">
        <h2>Admins</h2>
        <span className="live-badge">● {filtered.length} shown</span>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}

      <div className="admin-note-banner">
        This creates a brand-new login and grants admin access in one step.
        Share the temporary password with them and have them change it after
        their first sign-in.
      </div>

      <div className="table-toolbar">
        <input
          className="admin-search"
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="admin-btn primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "+ New Admin"}
        </button>
        <button className="admin-btn ghost" onClick={fetchAdmins}>Refresh</button>
      </div>

      {showForm && (
        <form className="admin-inline-form" onSubmit={handleAddAdmin}>
          <input
            className="admin-search"
            placeholder="Name"
            value={newAdmin.name}
            onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="Surname"
            value={newAdmin.surname}
            onChange={(e) => setNewAdmin({ ...newAdmin, surname: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="Email"
            type="email"
            value={newAdmin.email}
            onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
          />
          <input
            className="admin-search"
            placeholder="Temporary password"
            type="password"
            value={newAdmin.password}
            onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
          />
          <button className="admin-btn primary" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create Admin"}
          </button>
        </form>
      )}

      <div className="admin-table-wrapper">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Auth UUID</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="empty-row">Loading admins…</td></tr>
            )}
            {!loading && filtered.map((a) => (
              <tr key={a.id}>
                <td>{a.name} {a.surname}</td>
                <td className="mono">{a.email}</td>
                <td className="mono">{a.id}</td>
                <td className="mono">{formatDate(a.created_at)}</td>
                <td className="row-actions">
                  <button
                    className="admin-btn danger small"
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                  >
                    {deletingId === a.id ? "Removing…" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} className="empty-row">No admins found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page shell with tabs ──────────────────────────────────────────

export default function ClientsPage() {
  const [tab, setTab] = useState("clients");

  return (
    <div className="clients-page-wrapper">
      <div className="admin-tabs">
        <button
          className={`admin-tab ${tab === "clients" ? "active" : ""}`}
          onClick={() => setTab("clients")}
        >
          Clients
        </button>
        <button
          className={`admin-tab ${tab === "admins" ? "active" : ""}`}
          onClick={() => setTab("admins")}
        >
          Admins
        </button>
      </div>

      {tab === "clients" ? <ClientsTab /> : <AdminsTab />}
    </div>
  );
}