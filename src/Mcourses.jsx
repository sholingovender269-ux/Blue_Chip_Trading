import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Mystudents.css";      // shared mentor-page variables, navbar, .error-message
import "./Mcourses.css";

// Same tables the student Courses page reads (courses, lessons, lesson_progress),
// so anything a mentor creates here shows up for students automatically.
//   courses : id, slug, title, description, level (beginner|intermediate|advanced),
//             sort_order, is_flagship, mentor_id (owner)      -> see mentor_courses.sql
//   lessons : id, course_id, title, description, content_text, content_html,
//             video_url, read_minutes, sort_order
// All mentors can read every course. A mentor can only edit/delete their own.

const LEVELS = ["beginner", "intermediate", "advanced"];
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const studentKey = (c) => String(c.id ?? c.client_no);

// ---------- helpers ----------
const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

// Students render content_html as HTML, so mentor text is always escaped first.
const toHtml = (text, videoUrl) => {
    const paras = text
        .trim()
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
        .join("");
    const safeVideo = /^https?:\/\//i.test(videoUrl || "") ? videoUrl.trim() : null;
    const video = safeVideo
        ? `<p><a href="${escapeHtml(safeVideo)}" target="_blank" rel="noopener noreferrer">▶ Watch the video</a></p>`
        : "";
    return paras + video;
};

const readMinutes = (text) =>
    Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 200));

const makeSlug = (title) =>
    title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50) +
    "-" +
    Math.random().toString(36).slice(2, 6);

const EMPTY_FORM = { title: "", description: "", level: "beginner", content: "", video: "" };

function MentorCourses({ onNavigate, user }) {
    const mentorId = user?.id != null ? String(user.id) : null;

    const [courses, setCourses] = useState([]);
    const [lessons, setLessons] = useState([]);
    const [progress, setProgress] = useState([]); // lesson_progress rows
    const [clients, setClients] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [scope, setScope] = useState("all"); // "all" | "mine"
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // modal = null | { type: "course" } | { type: "lesson", lesson?: {...} }
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // =========================
    // LOAD
    // =========================

    useEffect(() => {
        loadAll();
    }, []);

    const loadAll = async () => {
        setError("");

        const [c, l, p, s] = await Promise.all([
            supabase.from("courses").select("*").order("sort_order", { ascending: true }),
            supabase.from("lessons").select("*").order("sort_order", { ascending: true }),
            supabase.from("lesson_progress").select("*"),
            supabase.from("clients").select("*"),
        ]);

        const firstError = c.error || l.error || p.error || s.error;
        if (firstError) setError(firstError.message);

        const courseRows = c.data || [];
        setCourses(courseRows);
        setLessons(l.data || []);
        setProgress(p.data || []);
        setClients(s.data || []);
        setSelectedId((prev) =>
            courseRows.some((x) => x.id === prev) ? prev : courseRows[0]?.id ?? null
        );
        setLoading(false);
    };

    // =========================
    // DERIVED DATA
    // =========================

    const isMine = (course) =>
        !!course && !!mentorId && course.mentor_id != null && String(course.mentor_id) === mentorId;

    const visibleCourses = scope === "mine" ? courses.filter(isMine) : courses;
    const selected = visibleCourses.find((c) => c.id === selectedId) || null;
    const canEdit = isMine(selected);

    const courseLessons = lessons.filter((l) => l.course_id === selectedId);
    const lessonCount = (courseId) => lessons.filter((l) => l.course_id === courseId).length;

    // lesson_progress has one row per completed lesson per student
    const completedBy = {}; // `${course}|${user}` -> completed lesson count
    progress.forEach((p) => {
        const k = `${p.course_id}|${p.user_id}`;
        completedBy[k] = (completedBy[k] || 0) + 1;
    });

    const courseStudents = Object.keys(completedBy)
        .filter((k) => k.startsWith(`${selectedId}|`))
        .map((k) => ({ userId: k.split("|")[1], completed: completedBy[k] }));

    const percentFor = (completed) =>
        courseLessons.length ? Math.min(100, Math.round((completed / courseLessons.length) * 100)) : 0;

    const enrolledStudents = new Set(progress.map((p) => String(p.user_id))).size;
    const avgCompletion = (() => {
        const keys = Object.keys(completedBy);
        if (!keys.length) return 0;
        const pcts = keys.map((k) => {
            const total = lessonCount(k.split("|")[0]);
            return total ? Math.min(100, (completedBy[k] / total) * 100) : 0;
        });
        return Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
    })();

    const findClient = (uid) =>
        clients.find((c) =>
            [c.id, c.user_id, c.auth_id, c.client_no].some((v) => v != null && String(v) === String(uid))
        );

    // =========================
    // MODALS
    // =========================

    const openCourseModal = () => {
        setForm(EMPTY_FORM);
        setModal({ type: "course" });
    };

    const openLessonModal = (lesson) => {
        setForm({
            ...EMPTY_FORM,
            title: lesson?.title || "",
            content: lesson?.content_text ?? lesson?.description ?? "",
            video: lesson?.video_url || "",
        });
        setModal({ type: "lesson", lesson });
    };

    const closeModal = () => setModal(null);

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

    const save = async () => {
        if (!form.title.trim()) {
            setError("A title is required.");
            return;
        }
        if (!mentorId) {
            setError("Your mentor account could not be identified. Please log in again.");
            return;
        }
        if (modal.type === "lesson" && !canEdit) {
            setError("You can only change lessons in your own courses.");
            return;
        }

        setSaving(true);
        setError("");

        let result;

        if (modal.type === "course") {
            const nextOrder = courses.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) + 1;
            // .select().single() returns the new row so we can open it right away
            result = await supabase
                .from("courses")
                .insert({
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    level: LEVELS.includes(form.level) ? form.level : "beginner",
                    slug: makeSlug(form.title),
                    sort_order: nextOrder,
                    is_flagship: false,
                    mentor_id: mentorId,
                })
                .select()
                .single();
        } else {
            const text = form.content.trim();
            const payload = {
                title: form.title.trim(),
                description: text.slice(0, 140) || null,
                content_text: text || null,
                content_html: toHtml(text, form.video),
                video_url: form.video.trim() || null,
                read_minutes: readMinutes(text),
            };

            if (modal.lesson) {
                result = await supabase.from("lessons").update(payload).eq("id", modal.lesson.id);
            } else {
                const nextOrder =
                    courseLessons.reduce((m, l) => Math.max(m, l.sort_order || 0), 0) + 1;
                result = await supabase.from("lessons").insert({
                    ...payload,
                    course_id: selectedId,
                    slug: makeSlug(form.title), // lessons.slug is NOT NULL
                    sort_order: nextOrder,
                });
            }
        }

        setSaving(false);

        if (result.error) {
            setError(result.error.message);
            return;
        }

        const wasCourse = modal.type === "course";
        const newCourseId = wasCourse ? result.data?.id : null;

        closeModal();
        await loadAll();

        // Jump straight to the course that was just created so lessons go into it
        if (newCourseId != null) {
            setScope("all");
            setSelectedId(newCourseId);
        }
    };

    // =========================
    // DELETE (own courses only)
    // =========================

    const deleteLesson = async (id) => {
        if (!canEdit) return;
        if (!window.confirm("Delete this lesson?")) return;
        const { error } = await supabase.from("lessons").delete().eq("id", id);
        if (error) setError(error.message);
        else loadAll();
    };

    const deleteCourse = async () => {
        if (!selected || !canEdit) return;
        if (!window.confirm(`Delete "${selected.title}" and all its lessons?`)) return;

        const lessonsDel = await supabase.from("lessons").delete().eq("course_id", selected.id);
        if (lessonsDel.error) {
            setError(lessonsDel.error.message);
            return;
        }
        const { error } = await supabase
            .from("courses")
            .delete()
            .eq("id", selected.id)
            .eq("mentor_id", mentorId);
        if (error) setError(error.message);
        else loadAll();
    };

    // =========================
    // RENDER
    // =========================

    return (
        <div className="mentor-page">

            <div className="courses-header">
                <h1>My Courses</h1>
                <p>Create your own courses and lessons, browse everything available, and track student progress.</p>
                <button className="add-course-button" onClick={openCourseModal}>
                    + Add course
                </button>
            </div>

            {error && (
                <div className="error-message" style={{ maxWidth: 1157, margin: "0 auto 16px" }}>
                    {error}
                </div>
            )}

            <div className="course-stats">
                <div className="course-stat-card">
                    <span>Courses</span>
                    <strong>{courses.length}</strong>
                </div>
                <div className="course-stat-card">
                    <span>Lessons</span>
                    <strong>{lessons.length}</strong>
                </div>
                <div className="course-stat-card">
                    <span>Students enrolled</span>
                    <strong>{enrolledStudents}</strong>
                </div>
                <div className="course-stat-card">
                    <span>Avg. completion</span>
                    <strong>{avgCompletion}%</strong>
                </div>
            </div>

            <div className="courses-container">
                {/* SIDEBAR */}
                <aside className="courses-sidebar">
                    <div className="sidebar-title">
                        <h2>{scope === "mine" ? "My Courses" : "All Courses"}</h2>
                        <div className="scope-toggle">
                            <button
                                className={scope === "all" ? "active" : ""}
                                onClick={() => setScope("all")}
                            >
                                All
                            </button>
                            <button
                                className={scope === "mine" ? "active" : ""}
                                onClick={() => setScope("mine")}
                            >
                                Mine
                            </button>
                        </div>
                    </div>

                    {loading && (
                        <div className="course-option"><p>Loading…</p></div>
                    )}

                    {!loading && visibleCourses.length === 0 && (
                        <div className="course-option">
                            <p>{scope === "mine" ? "You haven't created a course yet." : "No courses yet."}</p>
                        </div>
                    )}

                    {visibleCourses.map((c) => (
                        <div
                            key={c.id}
                            className={`course-option ${c.id === selectedId ? "selected" : ""}`}
                            onClick={() => setSelectedId(c.id)}
                        >
                            <div>
                                <h3>{c.title}</h3>
                                <p>
                                    {lessonCount(c.id)} lessons{isMine(c) ? " · yours" : ""}
                                </p>
                            </div>
                            <span>→</span>
                        </div>
                    ))}
                </aside>

                {/* MAIN AREA */}
                <section className="course-main">
                    {!selected ? (
                        <div className="course-title-section">
                            <div>
                                <h2>No course selected</h2>
                                <p>Create a course to start adding lessons.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="course-title-section">
                                <div>
                                    <h2>{selected.title}</h2>
                                    <p>{selected.description || "No description."}</p>
                                </div>
                                <div className="lesson-actions">
                                    <span className="course-badge">{cap(selected.level) || "Course"}</span>
                                    {canEdit && (
                                        <button className="delete-lesson" onClick={deleteCourse}>
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!canEdit && (
                                <p className="readonly-note">
                                    {selected.is_flagship
                                        ? "Flagship course — read only."
                                        : "Created by another mentor — read only."}
                                </p>
                            )}

                            <div className="content-section">
                                <div className="section-header">
                                    <div>
                                        <h2>Lessons</h2>
                                        <p>{courseLessons.length} lessons in this course</p>
                                    </div>
                                    {canEdit && (
                                        <button className="small-add-button" onClick={() => openLessonModal()}>
                                            + Add lesson
                                        </button>
                                    )}
                                </div>

                                {courseLessons.length === 0 && (
                                    <div className="lesson-card">
                                        <div className="lesson-info">
                                            <p>
                                                {canEdit
                                                    ? "No lessons yet. Add your first one."
                                                    : "No lessons in this course yet."}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {courseLessons.map((l, i) => (
                                    <div className="lesson-card" key={l.id}>
                                        <div className="lesson-number">
                                            {String(i + 1).padStart(2, "0")}
                                        </div>
                                        <div className="lesson-info">
                                            <h3>{l.title}</h3>
                                            <p>{l.description || "No description."}</p>
                                        </div>
                                        {canEdit && (
                                            <div className="lesson-actions">
                                                <button onClick={() => openLessonModal(l)}>Edit</button>
                                                <button
                                                    className="delete-lesson"
                                                    onClick={() => deleteLesson(l.id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="progress-section">
                                <div className="section-header">
                                    <div>
                                        <h2>Student Progress</h2>
                                        <p>{courseStudents.length} students enrolled</p>
                                    </div>
                                </div>

                                <div className="student-table">
                                    <div className="student-table-header">
                                        <span>Student</span>
                                        <span>Email</span>
                                        <span>Progress</span>
                                        <span>Status</span>
                                        <span></span>
                                    </div>

                                    {courseStudents.length === 0 && (
                                        <div className="student-row">
                                            <span className="student-email">No students enrolled yet.</span>
                                        </div>
                                    )}

                                    {courseStudents.map((s) => {
                                        const client = findClient(s.userId);
                                        const name = client
                                            ? `${client.first_name || ""} ${client.last_name || ""}`.trim() || "Student"
                                            : "Unknown student";
                                        const pct = percentFor(s.completed);
                                        return (
                                            <div className="student-row" key={s.userId}>
                                                <div className="student-name">
                                                    <div className="student-avatar">
                                                        {name.charAt(0).toUpperCase()}
                                                    </div>
                                                    {name}
                                                </div>
                                                <div className="student-email">{client?.email || "—"}</div>
                                                <div className="progress-area">
                                                    <div className="progress-bar">
                                                        <div className="progress-fill" style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span>{pct}%</span>
                                                </div>
                                                <div className="active-status">
                                                    {pct >= 100 ? "Completed" : "Active"}
                                                </div>
                                                <button
                                                    className="view-student-button"
                                                    onClick={() => onNavigate?.("students")}
                                                >
                                                    View
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>

            {/* MODAL (course or lesson) */}
            {modal && (
                <div className="modal-background" onClick={closeModal}>
                    <div className="lesson-modal" onClick={(e) => e.stopPropagation()}>
                        <button className="close-modal" onClick={closeModal}>×</button>

                        <h2>
                            {modal.type === "course"
                                ? "Add course"
                                : modal.lesson ? "Edit lesson" : "Add lesson"}
                        </h2>
                        <p>
                            {modal.type === "course"
                                ? "Create a new course. Students will see it in the Trading Academy."
                                : `Lesson for ${selected?.title || "this course"}.`}
                        </p>

                        <label>Title</label>
                        <input name="title" value={form.title} onChange={handleChange} />

                        {modal.type === "course" ? (
                            <>
                                <label>Description</label>
                                <textarea name="description" value={form.description} onChange={handleChange} />

                                <label>Level</label>
                                <select name="level" value={form.level} onChange={handleChange}>
                                    {LEVELS.map((lv) => (
                                        <option key={lv} value={lv}>{cap(lv)}</option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <>
                                <label>Lesson content</label>
                                <textarea
                                    name="content"
                                    value={form.content}
                                    onChange={handleChange}
                                    placeholder="Write the lesson. Leave a blank line between paragraphs."
                                    style={{ minHeight: 170 }}
                                />

                                <label>Video URL (optional)</label>
                                <input
                                    name="video"
                                    value={form.video}
                                    onChange={handleChange}
                                    placeholder="https://…"
                                />
                            </>
                        )}

                        <button className="save-button" onClick={save} disabled={saving}>
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MentorCourses;