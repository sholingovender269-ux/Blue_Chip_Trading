import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "./supabaseClient.js"; // <-- adjust path to your client
import "./courses.css";

const LEVELS = [
  { key: "beginner", label: "Beginner", badge: "cyan" },
  { key: "intermediate", label: "Intermediate", badge: "purple" },
  { key: "advanced", label: "Advanced", badge: "orange" },
];

const DOWNLOADS = [
  { icon: "📕", name: "The Candlestick Bible", file: "Copy of .The Candlestick Bible.pdf" },
  { icon: "📘", name: "Forex Basics", file: "forex basics.pdf" },
  { icon: "📗", name: "Trading Psychology", file: "The Blueprint to Trading Psychology.pdf" },
  { icon: "📙", name: "ICT Strategy", file: "ICT FOREX TRADING STRATEGY.pdf" },
  { icon: "📓", name: "The ICT Bible", file: "The ICT Bible - V1 - By Ali Khan.pdf" },
];

/* ------------------------------------------------------------------ */
/*  Lesson HTML cleaner                                                */
/*  Mentor-posted lessons can contain <style>/<script> blocks or       */
/*  inline handlers that restyle the whole page or cover the button.   */
/*  This strips them so lesson content can't affect the layout.        */
/* ------------------------------------------------------------------ */
function cleanLessonHtml(html = "") {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  doc.querySelectorAll("script, style, link, meta, base, object, embed").forEach((n) => n.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((a) => {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
    });
  });
  return doc.body.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  Data hook: courses, lessons, and the logged-in user's progress     */
/* ------------------------------------------------------------------ */
function useCourseData() {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [done, setDone] = useState(new Set()); // lesson ids completed by this user
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id ?? null;

        const [c, l, p] = await Promise.all([
          supabase.from("courses").select("*").order("sort_order"),
          supabase.from("lessons").select("*").order("sort_order"),
          uid
            ? supabase.from("lesson_progress").select("lesson_id").eq("user_id", uid)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const err = c.error || l.error || p.error;
        if (err) throw err;
        if (cancelled) return;

        setUserId(uid);
        setCourses(c.data);
        setLessons(l.data);
        setDone(new Set(p.data.map((r) => r.lesson_id)));
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load courses");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleLesson = useCallback(
    async (lesson) => {
      if (!userId) return;
      const isDone = done.has(lesson.id);

      // optimistic update
      setDone((prev) => {
        const next = new Set(prev);
        isDone ? next.delete(lesson.id) : next.add(lesson.id);
        return next;
      });

      const { error: e } = isDone
        ? await supabase
            .from("lesson_progress")
            .delete()
            .eq("user_id", userId)
            .eq("lesson_id", lesson.id)
        : await supabase.from("lesson_progress").insert({
            user_id: userId,
            lesson_id: lesson.id,
            course_id: lesson.course_id,
          });

      if (e) {
        // rollback
        setDone((prev) => {
          const next = new Set(prev);
          isDone ? next.add(lesson.id) : next.delete(lesson.id);
          return next;
        });
      }
    },
    [userId, done]
  );

  return { courses, lessons, done, userId, loading, error, toggleLesson };
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */
function ProgressBar({ completed, total }) {
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">
        {completed}/{total} · {pct}%
      </span>
    </div>
  );
}

function CourseCard({ course, total, completed, minutes, onOpen }) {
  const finished = total > 0 && completed === total;
  const status = completed === 0 ? "Start course" : finished ? "Review" : "Continue";
  return (
    <div
      className={`course-card level-${course.level} ${finished ? "is-finished" : ""}`}
      onClick={() => onOpen(course.slug)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(course.slug)}
    >
      <div className="cc-top">
        <span className="cc-level">{course.level}</span>
        {finished && <span className="cc-done">✓ Done</span>}
      </div>
      <h3 className="cc-title">{course.title}</h3>
      <div className="cc-meta">
        <span>{total} {total === 1 ? "lesson" : "lessons"}</span>
        <span className="cc-dot">•</span>
        <span>{minutes} min</span>
      </div>
      <ProgressBar completed={completed} total={total} />
      <span className="cc-btn">
        {status} <span className="cc-btn-arrow">→</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Course viewer (works for every course, incl. the flagship)         */
/* ------------------------------------------------------------------ */
function CourseViewer({ course, lessons, done, userId, onToggle, onBack }) {
  const [activeId, setActiveId] = useState(lessons[0]?.id);
  const sectionRefs = useRef({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course.id]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveId(e.target.dataset.lessonId);
        });
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [lessons]);

  const scrollTo = (id) =>
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const completed = lessons.filter((l) => done.has(l.id)).length;
  const totalMin = lessons.reduce((s, l) => s + (l.read_minutes || 0), 0);

  return (
    <div className="bc-page">
      <div className="bc-grid-bg" />

      <button type="button" onClick={onBack} className="bc-back-link" style={{ all: "unset", cursor: "pointer" }}>
        ← All Courses
      </button>

      <div className="bc-hero">
        <span className="bc-eyebrow">{course.is_flagship ? "Flagship Course" : course.level}</span>
        <h1>{course.title}</h1>
        {course.description && <p>{course.description}</p>}
        <div className="bc-meta">
          <span>{lessons.length} {lessons.length === 1 ? "lesson" : "lessons"}</span>
          <span className="bc-dot">•</span>
          <span>~{totalMin} min total</span>
        </div>
        <div className="hero-progress">
          {userId ? (
            <ProgressBar completed={completed} total={lessons.length} />
          ) : (
            <span className="login-hint">Log in to save your progress on this course.</span>
          )}
        </div>
      </div>

      <div className="bc-body">
        <nav className="bc-toc">
          {lessons.map((l, i) => (
            <button
              key={l.id}
              className={`bc-toc-item ${String(activeId) === String(l.id) ? "active" : ""} ${done.has(l.id) ? "done" : ""}`}
              onClick={() => scrollTo(l.id)}
            >
              <span className="bc-toc-number">{done.has(l.id) ? "✓" : String(i + 1).padStart(2, "0")}</span>
              <span className="bc-toc-title">{l.title}</span>
              <span className="bc-toc-time">{l.read_minutes} min</span>
            </button>
          ))}
        </nav>

        <div className="bc-lessons">
          {lessons.length === 0 && (
            <p className="courses-status">
              No lessons have been added to this course yet. Check back soon.
            </p>
          )}
          {lessons.map((l, i) => (
            <section
              key={l.id}
              data-lesson-id={l.id}
              ref={(el) => (sectionRefs.current[l.id] = el)}
              className="bc-lesson"
            >
              <div className="bc-lesson-header">
                <span className="bc-lesson-number">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{l.title}</h2>
                  <span className="bc-lesson-time">{l.read_minutes} min read</span>
                </div>
              </div>

              {/* content is cleaned first so mentor HTML can't break the layout */}
              <div
                className="bc-lesson-content"
                dangerouslySetInnerHTML={{ __html: cleanLessonHtml(l.content_html) }}
              />

              <div className="bc-lesson-footer">
                <button
                  type="button"
                  disabled={!userId}
                  className={`complete-btn ${done.has(l.id) ? "is-done" : ""}`}
                  onClick={() => onToggle(l)}
                  title={userId ? "" : "Log in to track progress"}
                >
                  {done.has(l.id) ? "✓ Completed — click to undo" : "Mark as complete"}
                </button>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function Courses() {
  const { courses, lessons, done, userId, loading, error, toggleLesson } = useCourseData();
  const [openSlug, setOpenSlug] = useState(null);

  const lessonsByCourse = useMemo(() => {
    const m = {};
    lessons.forEach((l) => (m[l.course_id] ||= []).push(l));
    return m;
  }, [lessons]);

  const stats = (course) => {
    const ls = lessonsByCourse[course.id] || [];
    return {
      total: ls.length,
      completed: ls.filter((l) => done.has(l.id)).length,
      minutes: ls.reduce((s, l) => s + (l.read_minutes || 0), 0),
    };
  };

  if (loading) return <div className="courses-page"><p className="courses-status">Loading courses…</p></div>;
  if (error) return <div className="courses-page"><p className="courses-status">Error: {error}</p></div>;

  const openCourse = courses.find((c) => c.slug === openSlug);
  if (openCourse) {
    return (
      <CourseViewer
        course={openCourse}
        lessons={lessonsByCourse[openCourse.id] || []}
        done={done}
        userId={userId}
        onToggle={toggleLesson}
        onBack={() => setOpenSlug(null)}
      />
    );
  }

  const flagship = courses.find((c) => c.is_flagship);

  return (
    <div className="courses-page">
      <div className="courses-grid-bg" />

      <div className="courses-header">
        <h1>
          Trading <span>Academy</span>
        </h1>
        <p>Structured lessons from first principles to institutional-level concepts.</p>
      </div>

      {flagship && (() => {
        const s = stats(flagship);
        const label = s.completed === 0 ? "Start the Method" : s.completed === s.total ? "Review the Method" : "Continue the Method";
        return (
          <div className="fh" onClick={() => setOpenSlug(flagship.slug)} role="button" tabIndex={0}
               onKeyDown={(e) => e.key === "Enter" && setOpenSlug(flagship.slug)}>
            <div className="fh-glow" />
            <div className="fh-content">
              <span className="fh-badge">★ Flagship Course</span>
              <h2 className="fh-title">The Blue Chip <span>Trading Method</span></h2>
              <p className="fh-desc">{flagship.description}</p>

              <div className="fh-chips">
                <span>{s.total} lessons</span>
                <span>~{s.minutes} min</span>
                <span>D1 → M15</span>
                <span>Beginner → Advanced</span>
              </div>

              <div className="fh-progress"><ProgressBar completed={s.completed} total={s.total} /></div>

              <button type="button" className="fh-cta" onClick={(e) => { e.stopPropagation(); setOpenSlug(flagship.slug); }}>
                {label} <span>→</span>
              </button>
            </div>

            <div className="fh-steps" aria-hidden="true">
              {["D1", "H4", "H1", "M15"].map((t, i) => (
                <div className="fh-step" key={t}>
                  <span className="fh-step-tag">{t}</span>
                  <span className="fh-step-label">{["Bias", "Zone", "Reaction", "Trigger"][i]}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {LEVELS.map(({ key, label, badge }) => {
        const list = courses.filter((c) => c.level === key && !c.is_flagship);
        if (!list.length) return null;
        return (
          <section className="course-section" key={key}>
            <div className="section-heading">
              <span className={`section-badge ${badge}`}>{label}</span>
            </div>
            <div className="course-grid">
              {list.map((c) => (
                <CourseCard key={c.id} course={c} {...stats(c)} onOpen={setOpenSlug} />
              ))}
            </div>
          </section>
        );
      })}

      <div className="downloads-section">
        <div className="downloads-header">
          <span className="section-badge gold">Resources</span>
          <h2>Course Materials</h2>
        </div>
        <div className="downloads-grid">
          {DOWNLOADS.map((d) => (
            <a key={d.file} className="download-item" href={`${import.meta.env.BASE_URL}${d.file}`} download>
              <span className="download-icon">{d.icon}</span>
              {d.name}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}