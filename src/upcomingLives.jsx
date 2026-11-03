import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import './live.css';

export default function UpcomingLives() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      const since = new Date(Date.now() - 8 * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from('session_schedule')
        .select('id, title, description, scheduled_at, duration_minutes')
        .eq('status', 'scheduled')
        .gte('scheduled_at', since)
        .order('scheduled_at', { ascending: true })
        .limit(20);
      if (!active) return;
      if (error) {
        console.error('Failed to load upcoming lives:', error);
        setError('Could not load the schedule.');
      } else {
        const now = Date.now();
        setItems(
          (data || []).filter(
            (s) => new Date(s.scheduled_at).getTime() + s.duration_minutes * 60000 > now
          )
        );
        setError('');
      }
      setLoading(false);
    };

    load();
    const timer = setInterval(load, 30000); // refresh every 30s
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="live-card schedule-card">
      <div className="live-card-header">
        <h3 className="schedule-heading">📅 Upcoming Lives</h3>
      </div>

      {loading && <div className="live-placeholder">Loading schedule…</div>}
      {error && <div className="live-error">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div className="live-placeholder">No lives scheduled yet. Check back soon.</div>
      )}

      {items.map((s) => {
        const start = new Date(s.scheduled_at);
        const startsIn = start.getTime() - Date.now();
        return (
          <div className="schedule-item" key={s.id}>
            <div>
              <div className="schedule-item-title">{s.title}</div>
              <div className="schedule-item-meta">
                {start.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })} ·{' '}
                {s.duration_minutes} min
              </div>
              {s.description && <div className="schedule-item-desc">{s.description}</div>}
            </div>
            {startsIn <= 0 ? (
              <span className="live-pill on">● STARTING</span>
            ) : (
              <span className="live-pill off">
                {startsIn < 3600000
                  ? `in ${Math.max(1, Math.round(startsIn / 60000))} min`
                  : startsIn < 86400000
                  ? `in ${Math.round(startsIn / 3600000)} h`
                  : `in ${Math.round(startsIn / 86400000)} d`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}