import {  LiveKitRoom,
  useLocalParticipant,
  useTracks,
  VideoTrack, } from '@livekit/components-react';
import { Track } from 'livekit-client'
import { useEffect, useRef, useState } from 'react';
import '@livekit/components-styles';
import './live.css';
import { Component } from 'react';
import { supabase } from './supabaseClient'; // adjust path if different

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

// PASTE YOUR REAL WEBSOCKET URL HERE
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
  const tracks = useTracks([Track.Source.Camera]);
  const myTrack = tracks.find(
    (t) => t.participant.isLocal && t.publication
  );
  const captured = useRef(false);

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
    <div className="live-card">
      <div className="live-card-header">
        <span className="live-pill on">● LIVE</span>
        <span className="live-viewer-name">{localParticipant?.identity}</span>
      </div>

      <div className="live-video-frame">
        {myTrack ? (
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
        <button className="live-btn end" onClick={onEnd}>
          End Stream
        </button>
      </div>
    </div>
  );
}

export default function GoLive() {
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