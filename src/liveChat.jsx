import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import './liveChat.css';

const MAX_LEN = 300;

function getDisplayName(authUser) {
  try {
    const s = JSON.parse(localStorage.getItem('bct_user') || 'null');
    if (s?.firstName) {
      const initial = s.lastName ? ` ${s.lastName[0]}.` : '';
      return `${s.firstName}${initial}`.slice(0, 30);
    }
    if (s?.name) return String(s.name).slice(0, 30);
  } catch {
    
  }
  return authUser?.email?.split('@')[0]?.slice(0, 30) || 'Viewer';
}

function getMentorId(isMentorPage = false) {
  try {
    const s = JSON.parse(localStorage.getItem('bct_user') || 'null');
    if (!s?.id) return null;
    return isMentorPage || s.role === 'mentor' ? String(s.id) : null;
  } catch {
    return null;
  }
}

function getMentorName() {
  const name = getDisplayName(null);
  return name === 'Viewer' ? 'Mentor' : name;
}

export default function LiveChat({ room = 'main-room', isModerator: isMentorSide = false }) {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reported, setReported] = useState(() => new Set());
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [banned, setBanned] = useState(false);
  const [blockedIds, setBlockedIds] = useState(() => new Set()); // viewers the mentor blocked

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickToBottom = useRef(true);

  const mentorId = isMentorSide ? getMentorId(true) : null;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data?.user || null));
  }, []);

  useEffect(() => {
    if (!user || isMentorSide) return undefined;
    let active = true;

    supabase
      .from('live_chat_bans')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('room', room)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setBanned(Boolean(data));
      });

    supabase
      .from('live_chat_reports')
      .select('message_id')
      .eq('reporter_id', user.id)
      .then(({ data }) => {
        if (active && data) setReported(new Set(data.map((r) => r.message_id)));
      });

    const channel = supabase
      .channel(`live-chat-ban-${user.id}-${room}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_chat_bans', filter: `user_id=eq.${user.id}` },
        (p) => {
          if (p.new?.room === room) setBanned(true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'live_chat_bans' },
        (p) => {
          if (p.old?.user_id === user.id) {
            setBanned(false);
            setError('');
          }
        }
      )
      .subscribe();

    const poll = setInterval(() => {
      supabase
        .from('live_chat_bans')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('room', room)
        .maybeSingle()
        .then(({ data, error: err }) => {
          if (active && !err) setBanned(Boolean(data));
        });
    }, 10000);

    return () => {
      active = false;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [user, isMentorSide, room]);

  useEffect(() => {
    let active = true;

    supabase
      .from('live_chat_messages')
      .select('*')
      .eq('room', room)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: err }) => {
        if (err) return console.error('Chat load failed:', err);
        if (active) setMessages((data || []).reverse());
      });

    const channel = supabase
      .channel(`live-chat-${room}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_chat_messages', filter: `room=eq.${room}` },
        (p) =>
          setMessages((prev) =>
            prev.some((m) => m.id === p.new.id) ? prev : [...prev.slice(-199), p.new]
          )
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_chat_messages', filter: `room=eq.${room}` },
        (p) => setMessages((prev) => prev.map((m) => (m.id === p.new.id ? p.new : m)))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'live_chat_messages' },
        (p) => setMessages((prev) => prev.filter((m) => m.id !== p.old.id))
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [room]);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, flaggedOnly]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const addMessage = (row) =>
    setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev.slice(-199), row]));

  const send = async (e) => {
    e.preventDefault();
    const message = text.trim();
    if (!message || sending) return;

    if (isMentorSide) {
      if (!mentorId) return;
      setSending(true);
      setError('');
      const { data: row, error: err } = await supabase.rpc('mentor_send_chat_message', {
        p_mentor_id: mentorId,
        p_room: room,
        p_display_name: getMentorName(),
        p_message: message,
      });
      setSending(false);
      if (err) {
        console.error('Mentor send failed:', err);
        setError(`Could not send: ${err.message}`);
        return;
      }
      if (row?.id) addMessage(row);
      setText('');
      stickToBottom.current = true;
      return;
    }

    if (!user || banned) return;
    setSending(true);
    setError('');
    const { data: result, error: err } = await supabase.rpc('send_live_chat_message', {
      p_room: room,
      p_display_name: getDisplayName(user),
      p_message: message,
    });
    setSending(false);

    if (err) {
      if (/blocked from chat/i.test(err.message)) {
        setBanned(true);
      } else if (/inappropriate/i.test(err.message)) {
        setError('Please keep it clean — that message was not sent.');
      } else {
        setError('Could not send message. Try again.');
      }
      return;
    }

    if (result === 'blocked' || result === 'banned') {
      setText('');
      setBanned(true);
      return;
    }

    setText('');
    stickToBottom.current = true;
  };

  const reply = (m) => {
    setText(`@${m.display_name} `);
    inputRef.current?.focus();
  };

  const report = async (id) => {
    setError('');
    const { error: err } = await supabase.rpc('report_chat_message', { p_message_id: id });
    if (err) {
      console.error('Report failed:', err);
      setError('Could not report that message. Try again.');
      return;
    }
    setReported((prev) => new Set(prev).add(id));
  };

  const remove = async (id) => {
    setError('');
    const { error: err } = mentorId
      ? await supabase.rpc('mentor_remove_chat_message', { p_mentor_id: mentorId, p_message_id: id })
      : await supabase.from('live_chat_messages').delete().eq('id', id);
    if (err) {
      console.error('Remove failed:', err);
      setError(`Remove failed: ${err.message}`);
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const dismissFlag = async (id) => {
    setError('');
    const { error: err } = mentorId
      ? await supabase.rpc('mentor_dismiss_chat_flag', { p_mentor_id: mentorId, p_message_id: id })
      : await supabase
          .from('live_chat_messages')
          .update({ is_flagged: false, report_count: 0 })
          .eq('id', id);
    if (err) {
      console.error('Dismiss failed:', err);
      setError(`Dismiss failed: ${err.message}`);
      return;
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, is_flagged: false, report_count: 0 } : m))
    );
  };

  const blockUser = async (m) => {
    setError('');
    if (!mentorId) {
      setError('Block failed: could not find your mentor login. Log out and log in again.');
      return;
    }
    const { error: err } = await supabase.rpc('mentor_block_chat_user', {
      p_mentor_id: mentorId,
      p_message_id: m.id,
    });
    if (err) {
      console.error('Block failed:', err);
      setError(`Block failed: ${err.message}`);
      return;
    }
    setBlockedIds((prev) => new Set(prev).add(m.user_id));
  };

  const flaggedCount = messages.filter((m) => m.is_flagged).length;
  const visible = isMentorSide && flaggedOnly ? messages.filter((m) => m.is_flagged) : messages;

  const canType = isMentorSide ? Boolean(mentorId) : Boolean(user);

  return (
    <div className={`live-chat${isMentorSide ? ' is-mentor' : ''}`}>
      <div className="live-chat-header">
        <span className="live-chat-title">Live Chat</span>
        {isMentorSide && (
          <button
            type="button"
            className={`chat-filter${flaggedOnly ? ' active' : ''}${flaggedCount > 0 ? ' has-flags' : ''}`}
            onClick={() => setFlaggedOnly((v) => !v)}
          >
            ⚑ Reported ({flaggedCount})
          </button>
        )}
      </div>

      <div className="live-chat-list" ref={listRef} onScroll={onScroll}>
        {visible.length === 0 && (
          <div className="chat-empty">
            {flaggedOnly ? 'No reported messages.' : 'No messages yet. Say hello!'}
          </div>
        )}

        {visible.map((m) => (
          <div
            key={m.id}
            className={`chat-msg${m.is_flagged && isMentorSide ? ' flagged' : ''}${
              m.user_id && m.user_id === user?.id ? ' mine' : ''
            }${m.is_mentor ? ' from-mentor' : ''}`}
          >
            <div className="chat-msg-head">
              <span className="chat-name">{m.display_name}</span>
              {m.is_mentor && <span className="chat-mentor-tag">MENTOR</span>}
              {isMentorSide && m.is_flagged && (
                <span className="chat-flag">⚑ reported ×{m.report_count}</span>
              )}
              <span className="chat-time">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div className="chat-text">{m.message}</div>

            <div className="chat-actions">
              {isMentorSide ? (
                <>
                  {!m.is_mentor && (
                    <button type="button" onClick={() => reply(m)}>Reply</button>
                  )}
                  {m.is_flagged && (
                    <button type="button" onClick={() => dismissFlag(m.id)}>Dismiss</button>
                  )}
                  <button type="button" className="danger" onClick={() => remove(m.id)}>Remove</button>
                  {!m.is_mentor &&
                    (blockedIds.has(m.user_id) ? (
                      <span className="chat-reported">Blocked</span>
                    ) : (
                      <button type="button" className="danger" onClick={() => blockUser(m)}>
                        Block user
                      </button>
                    ))}
                </>
              ) : (
                !m.is_mentor &&
                m.user_id !== user?.id &&
                (reported.has(m.id) ? (
                  <span className="chat-reported">Reported</span>
                ) : (
                  <button type="button" onClick={() => report(m.id)}>Report</button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="chat-error">{error}</div>}

      {!isMentorSide && user && banned ? (
        <div className="chat-banned">
           You've been blocked from the chat by the mentor or vulgar language was detected. You can chat again when the next live stream starts.
        </div>
      ) : canType ? (
        <form className="live-chat-form" onSubmit={send}>
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            placeholder={isMentorSide ? 'Reply to the chat…' : 'Send a message…'}
            maxLength={MAX_LEN}
          />
          <button type="submit" disabled={sending || !text.trim()}>Send</button>
        </form>
      ) : (
        <div className="chat-login-note">
          {isMentorSide ? 'Log in again to chat.' : 'Log in to join the chat.'}
        </div>
      )}
    </div>
  );
}