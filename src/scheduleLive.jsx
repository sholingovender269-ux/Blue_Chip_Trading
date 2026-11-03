import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import './live.css';

const pad = (n) => String(n).padStart(2, '0');
const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// `mentor` is the logged-in mentor from your own login (must have an `id`
// that matches mentors.id).
export default function ScheduleLive({ mentor }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState([]);

  const mentorId = mentor?.id;

  const today = toDateInput(new Date());
  const maxDate = toDateInput(new Date(Date.now() + 365 * 24 * 3600 * 1000));

  const loadMine = useCallback(async () => {
    if (!mentorId) return;
    const { data, error } = await supabase
      .from('session_schedule')
      .select('*')
      .eq('mentor_id', mentorId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true });
    if (error) console.error('Failed to load schedule:', error);
    else setMine(data || []);
  }, [mentorId]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  // Only mentors can see or use this form
  if (!mentorId) {
    return (
      <div className="live-card schedule-card">
        <div className="live-card-header">
          <h3 className="schedule-heading">📅 Schedule a Live</h3>
        </div>
        <div className="live-placeholder">Only mentors can schedule a live.</div>
      </div>
    );
  }

  const validate = () => {
    const e = {};
    const t = title.trim();
    if (t.length < 3) e.title = 'Title must be at least 3 characters.';
    else if (t.length > 100) e.title = 'Title must be 100 characters or fewer.';
    if (description.length > 500) e.description = 'Description must be 500 characters or fewer.';
    if (!date) e.date = 'Pick a date.';
    if (!time) e.time = 'Pick a time.';

    const dur = Number(duration);
    if (!Number.isInteger(dur) || dur < 15 || dur > 480) {
      e.duration = 'Duration must be between 15 and 480 minutes.';
    }

    if (date && time) {
      const when = new Date(`${date}T${time}`);
      if (Number.isNaN(when.getTime())) e.date = 'Invalid date or time.';
      else if (when.getTime() < Date.now() + 5 * 60 * 1000) {
        e.time = 'Must be at least 5 minutes from now.';
      } else if (when.getTime() > Date.now() + 365 * 24 * 3600 * 1000) {
        e.date = 'Cannot schedule more than a year ahead.';
      } else {
        const start = when.getTime();
        const end = start + dur * 60000;
        const clash = mine.find((s) => {
          const s0 = new Date(s.scheduled_at).getTime();
          const s1 = s0 + s.duration_minutes * 60000;
          return start < s1 && end > s0;
        });
        if (clash) e.time = `Overlaps with "${clash.title}".`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setFormError('');
    setSuccess('');

    if (!mentorId) {
      setFormError('Only mentors can schedule a live.');
      return;
    }
    if (!validate()) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('session_schedule').insert({
        mentor_id: mentorId,
        title: title.trim(),
        description: description.trim() || null,
        scheduled_at: new Date(`${date}T${time}`).toISOString(),
        duration_minutes: Number(duration),
      });
      if (error) {
        console.error('Failed to schedule live:', error);
        setFormError('Could not save the schedule. Please try again.');
        return;
      }
      setSuccess('Live scheduled! Clients can now see it.');
      setTitle('');
      setDescription('');
      setDate('');
      setTime('');
      setDuration(60);
      setErrors({});
      loadMine();
    } finally {
      setSaving(false);
    }
  };

  // Hard delete. .select() lets us detect a blocked delete (0 rows, no error).
  const deleteSession = async (id) => {
    if (!window.confirm('Delete this scheduled live?')) return;
    setFormError('');
    setSuccess('');
    const { data, error } = await supabase
      .from('session_schedule')
      .delete()
      .eq('id', id)
      .eq('mentor_id', mentorId) // only your own
      .select();
    if (error || !data?.length) {
      console.error('Failed to delete:', error);
      setFormError('Could not delete that live.');
    } else {
      setMine((prev) => prev.filter((s) => s.id !== id));
      setSuccess('Live deleted.');
    }
  };

  return (
    <div className="live-card schedule-card">
      <div className="live-card-header">
        <h3 className="schedule-heading">📅 Schedule a Live</h3>
      </div>

      <form onSubmit={handleSubmit} noValidate className="schedule-form">
        <label className="schedule-field">
          <span>Title</span>
          <input
            className="schedule-input"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly market breakdown"
          />
          {errors.title && <small className="schedule-err">{errors.title}</small>}
        </label>

        <label className="schedule-field">
          <span>Description (optional)</span>
          <textarea
            className="schedule-input"
            rows={3}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will you cover?"
          />
          {errors.description && <small className="schedule-err">{errors.description}</small>}
        </label>

        <div className="schedule-row">
          <label className="schedule-field">
            <span>Date</span>
            <input
              type="date"
              className="schedule-input"
              value={date}
              min={today}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
            />
            {errors.date && <small className="schedule-err">{errors.date}</small>}
          </label>
          <label className="schedule-field">
            <span>Time</span>
            <input
              type="time"
              className="schedule-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            {errors.time && <small className="schedule-err">{errors.time}</small>}
          </label>
          <label className="schedule-field schedule-field-wide">
            <span>Duration (min)</span>
            <input
              type="number"
              className="schedule-input"
              value={duration}
              min={15}
              max={480}
              step={5}
              onChange={(e) => setDuration(e.target.value)}
            />
            {errors.duration && <small className="schedule-err">{errors.duration}</small>}
          </label>
        </div>

        {formError && <div className="live-error">{formError}</div>}
        {success && <div className="schedule-success">{success}</div>}

        <button className="live-btn start" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Schedule Live'}
        </button>
      </form>

      {mine.length > 0 && (
        <div className="schedule-list">
          <h4 className="schedule-subheading">Your upcoming lives</h4>
          {mine.map((s) => (
            <div className="schedule-item" key={s.id}>
              <div>
                <div className="schedule-item-title">{s.title}</div>
                <div className="schedule-item-meta">
                  {new Date(s.scheduled_at).toLocaleString([], {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  · {s.duration_minutes} min
                </div>
              </div>
              <button className="live-btn end" type="button" onClick={() => deleteSession(s.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}