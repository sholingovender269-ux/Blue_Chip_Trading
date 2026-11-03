import {
  LiveKitRoom,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { Track, ConnectionState } from 'livekit-client';
import { useEffect, useRef, useState, Component } from 'react';
import '@livekit/components-styles';
import './live.css';
import { supabase } from './supabaseClient'; // adjust path if different
import LiveChat from './LiveChat.jsx';
import ScheduleLive from './scheduleLive.jsx';

class VideoErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div className="live-placeholder">Camera preview unavailable — stream is still live</div>;
    }
    return this.props.children;
  }
}

const LIVEKIT_URL = 'wss://blue-chip-trading-oz31f1yy.livekit.cloud';

// Captures one frame from a <video> element and returns it as a Base64 JPEG string
function captureFrame(videoEl) {
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.8);
}

function BroadcastView({ onEnd }) {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const myTrack = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera && t.publication
  );
  const screenTrack = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.ScreenShare && t.publication
  );
  const captured = useRef(false);
  const [shareError, setShareError] = useState('');

  // Each stream has its own chat room, named after this stream's session id.
  // Viewers get the same id from the broadcaster participant, so both sides match.
  const streamId =
    connectionState === ConnectionState.Connected ? room?.localParticipant?.sid : '';

  const toggleScreenShare = async () => {
    setShareError('');
    try {
      await localParticipant.setScreenShareEnabled(!localParticipant.isScreenShareEnabled, {
        audio: true,
        contentHint: 'detail',
        resolution: { width: 1920, height: 1080, frameRate: 30 },
      });
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return;
      console.error('Screen share failed:', err);
      setShareError('Could not share your screen. Use a desktop browser and allow screen sharing.');
    }
  };

  useEffect(() => {
    if (!myTrack || captured.current) return;

    const timer = setTimeout(async () => {
      const videoEl = document.querySelector('.live-video-frame video');
      if (!videoEl || videoEl.readyState < 2) return;

      captured.current = true;
      const screenshot = captureFrame(videoEl);

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) return;

      const { error } = await supabase.from('live_sessions').insert({
        user_id: user.id,
        screenshot,
      });

      if (error) console.error('Failed to save live session screenshot:', error);
    }, 1500);

    return () => clearTimeout(timer);
  }, [myTrack]);

  return (
    <div className="live-layout">
      <div className="live-card">
        <div className="live-card-header">
          <span className="live-pill on">● LIVE</span>
          <span className="live-viewer-name">{localParticipant?.identity}</span>
        </div>

        <div className="live-video-frame">
          {screenTrack ? (
            <>
              <VideoTrack trackRef={screenTrack} className="live-video contain" />
              {myTrack && (
                <div className="live-pip">
                  <VideoTrack trackRef={myTrack} className="live-video" />
                </div>
              )}
            </>
          ) : myTrack ? (
            <VideoTrack trackRef={myTrack} className="live-video" />
          ) : (
            <div className="live-placeholder">Starting camera…</div>
          )}
        </div>

        <div className="live-controls">
          <button
            className="live-btn mute"
            onClick={() => localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled)}
          >
            {localParticipant?.isCameraEnabled ? '📷 Camera On' : '🚫 Camera Off'}
          </button>
          <button
            className="live-btn mute"
            onClick={() => localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled)}
          >
            {localParticipant?.isMicrophoneEnabled ? '🎙️ Mic On' : '🔇 Mic Off'}
          </button>
          <button
            className={`live-btn mute${localParticipant?.isScreenShareEnabled ? ' sharing' : ''}`}
            onClick={toggleScreenShare}
          >
            {localParticipant?.isScreenShareEnabled ? '🛑 Stop Sharing' : '🖥️ Share Screen'}
          </button>
          <button className="live-btn end" onClick={onEnd}>
            End Stream
          </button>
        </div>

        {shareError && <div className="live-error live-error-inline">{shareError}</div>}
      </div>

      {/* Reported messages show here; the mentor can reply, remove and block */}
      {streamId ? (
        <LiveChat key={streamId} room={`main-room-${streamId}`} isModerator />
      ) : (
        <div className="live-chat">
          <div className="live-chat-list">
            <div className="chat-empty">Connecting chat…</div>
          </div>
        </div>
      )}
    </div>
  );
}

// `mentor` = the logged-in mentor object from your own login (needs `.id` from the mentors table)
export default function GoLive({ mentor }) {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startStream = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        'https://wnxeuhdxqfmeflyohsto.functions.supabase.co/livekit-token?room=main-room&username=me&role=broadcaster'
      );
      if (!res.ok) throw new Error('Token request failed');
      const t = await res.text();
      setToken(t);
      setConnected(true);
    } catch (err) {
      setError('Could not start stream. Is the token server running?');
    } finally {
      setLoading(false);
    }
  };

  const endStream = () => {
    setConnected(false);
    setToken('');
  };

  if (!connected) {
    return (
      <div className="live-page">
        <div className="live-split">
          <div className="live-card start-card">
            <div className="live-card-header">
              <span className="live-pill off">● OFFLINE</span>
            </div>
            <h2 className="live-title">Ready to go live?</h2>
            <p className="live-subtitle">
              Your camera and microphone will turn on and viewers on the Watch Live page
              will be able to see and hear you instantly.
            </p>
            {error && <div className="live-error">{error}</div>}
            <button className="live-btn start" onClick={startStream} disabled={loading}>
              {loading ? 'Connecting…' : '🔴 Go Live'}
            </button>
          </div>

          {/* Mentors schedule (and delete) upcoming lives here */}
          <ScheduleLive mentor={mentor} />
        </div>
      </div>
    );
  }

  return (
    <div className="live-page">
      <LiveKitRoom
        token={token}
        serverUrl={LIVEKIT_URL}
        video={true}
        audio={true}
        connect={true}
        onDisconnected={endStream}
      >
        <BroadcastView onEnd={endStream} />
      </LiveKitRoom>
    </div>
  );
}