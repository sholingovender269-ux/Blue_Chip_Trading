import React, { useEffect, useState, useCallback } from "react";
import "./admin.css";
import { supabase } from "./supabaseClient";

const EMPTY_CLIENT = { first_name: "", last_name: "", email: "", id_number: "", address: "" };
const EMPTY_ADMIN = { name: "", surname: "", email: "", password: "" };

const CLIENT_COLUMNS = "id, first_name, last_name, email, address, created_at";

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-ZA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function validatePassword(pw) {
  if (!pw) return "A temporary password is required for a new login.";
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must include a letter and a number.";
  return null;
}


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
      .select(CLIENT_COLUMNS)
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
      .select(CLIENT_COLUMNS);

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
              <th>Address</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="empty-row">Loading clients…</td></tr>
            )}
            {!loading && filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.first_name} {c.last_name}</td>
                <td className="mono">{c.email}</td>
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
              <tr><td colSpan={5} className="empty-row">No clients found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newAdmin, setNewAdmin] = useState(EMPTY_ADMIN);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [clientEmails, setClientEmails] = useState(() => new Set());

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

  const loadClientEmails = useCallback(async () => {
    const { data } = await supabase.from("clients").select("email");
    setClientEmails(new Set((data || []).map((c) => (c.email || "").toLowerCase())));
  }, []);

  useEffect(() => {
    fetchAdmins();
    loadClientEmails();
  }, [fetchAdmins, loadClientEmails]);

  const filtered = admins.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.name?.toLowerCase().includes(q) ||
      a.surname?.toLowerCase().includes(q) ||
      a.email?.toLowerCase().includes(q)
    );
  });

  const typedEmail = newAdmin.email.trim().toLowerCase();
  const isExistingClient = typedEmail !== "" && clientEmails.has(typedEmail);
  const passwordError = isExistingClient ? null : validatePassword(newAdmin.password);
  const showPasswordError = Boolean(passwordError) && (triedSubmit || newAdmin.password !== "");

  const toggleForm = () => {
    if (!showForm) loadClientEmails();
    setShowForm((s) => !s);
    setTriedSubmit(false);
    setNewAdmin(EMPTY_ADMIN);
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    setTriedSubmit(true);

    if (!newAdmin.name.trim() || !newAdmin.surname.trim() || !typedEmail) {
      setError("Name, surname, and email are required.");
      return;
    }
    if (passwordError) {
      setError(null);
      return; // the message is shown under the password field
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    const { data, error } = await supabase.functions.invoke("create-admin", {
      body: {
        email: typedEmail,
        password: isExistingClient ? "" : newAdmin.password,
        name: newAdmin.name.trim(),
        surname: newAdmin.surname.trim(),
      },
    });

    if (error) {
      let msg = error.message || "Failed to create admin.";
      try {
        const body = await error.context.json();
        msg = body?.error || body?.message || msg;
      } catch {
      }
      setError(msg);
    } else if (data?.error) {
      setError(data.error);
    } else {
      setAdmins((prev) => [data.admin, ...prev]);
      setNotice(
        data.reusedExistingLogin
          ? `${data.admin.email} already has an account, so they were made an admin. They must sign in with their own existing password.`
          : `${data.admin.email} was created as an admin. Share the temporary password with them.`
      );
      setNewAdmin(EMPTY_ADMIN);
      setTriedSubmit(false);
      setShowForm(false);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    setError(null);
    setNotice(null);
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
      {notice && <div className="admin-note-banner">{notice}</div>}

      <div className="admin-note-banner">
        <strong>Note:</strong> if the person already has a client account, no password is needed.
        They must sign in with their own existing password. If the email is new, set a temporary
        password (at least 8 characters, with a letter and a number), share it with them, and ask
        them to change it after their first sign-in.
      </div>

      <div className="table-toolbar">
        <input
          className="admin-search"
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="admin-btn primary" onClick={toggleForm}>
          {showForm ? "Cancel" : "+ New Admin"}
        </button>
        <button className="admin-btn ghost" onClick={fetchAdmins}>Refresh</button>
      </div>

      {showForm && (
        <form className="admin-inline-form" onSubmit={handleAddAdmin} noValidate>
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

          {isExistingClient ? (
            <div className="admin-field">
              <div className="admin-field-info">
                This person already has a client account. They will sign in with their own
                existing password.
              </div>
            </div>
          ) : (
            <div className="admin-field">
              <input
                className={`admin-search ${showPasswordError ? "admin-input-invalid" : ""}`}
                placeholder="Temporary password"
                type="password"
                autoComplete="new-password"
                value={newAdmin.password}
                onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
              />
              <span className={`admin-field-hint ${showPasswordError ? "error" : ""}`}>
                {showPasswordError
                  ? passwordError
                  : "At least 8 characters, with a letter and a number."}
              </span>
            </div>
          )}

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