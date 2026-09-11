import { LiveKitRoom, useTracks, VideoTrack } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useEffect, useState, useRef } from 'react';
import '@livekit/components-styles';
import './live.css';

// Same URL as GoLive.jsx
const LIVEKIT_URL = 'wss://blue-chip-trading-oz31f1yy.livekit.cloud';

function LiveVideo() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone]);
  const videoTrack = tracks.find((t) => t.source === Track.Source.Camera);

  if (tracks.length === 0) {
    return (
      <div className="live-card">
        <div className="live-card-header">
          <span className="live-pill off">● OFFLINE</span>
        </div>
        <div className="live-video-frame">
          <div className="live-placeholder">Stream is currently offline</div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-card">
      <div className="live-card-header">
        <span className="live-pill on">● LIVE NOW</span>
      </div>
      <div className="live-video-frame">
        {videoTrack ? (
          <VideoTrack trackRef={videoTrack} className="live-video" />
        ) : (
          <div className="live-placeholder">Audio only</div>
        )}
      </div>
    </div>
  );
}

export default function WatchLive() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  // unique identity per viewer session so multiple viewers don't collide
  const viewerId = useRef(`viewer-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    fetch(
      `https://wnxeuhdxqfmeflyohsto.functions.supabase.co/livekit-token?room=main-room&username=${viewerId.current}&role=viewer`
    )
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.text();
      })
      .then(setToken)
      .catch(() => setError('Could not connect. Is the stream server running?'));
  }, []);

  if (error) {
    return (
      <div className="live-page">
        <div className="live-card">
          <div className="live-error">{error}</div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="live-page">
        <div className="live-card">
          <div className="live-placeholder">Connecting…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="live-page">
      <LiveKitRoom
        token={token}
        serverUrl={LIVEKIT_URL}
        video={false}
        audio={false}
        connect={true}
      >
        <LiveVideo />
      </LiveKitRoom>
    </div>
  );
}