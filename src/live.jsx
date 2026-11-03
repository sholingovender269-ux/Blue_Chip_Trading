import {
  LiveKitRoom,
  useRemoteParticipants,
  useTracks,
  VideoTrack,
  RoomAudioRenderer,
  StartAudio,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useEffect, useState, useRef } from 'react';
import '@livekit/components-styles';
import './live.css';
import LiveChat from './LiveChat.jsx';
import UpcomingLives from './upcomingLives.jsx'; // NEW

const LIVEKIT_URL = 'wss://blue-chip-trading-oz31f1yy.livekit.cloud';

function LiveStage() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone, Track.Source.ScreenShare]);
  const videoTrack = tracks.find(
    (t) => !t.participant.isLocal && t.source === Track.Source.Camera && t.publication
  );
  const screenTrack = tracks.find(
    (t) => !t.participant.isLocal && t.source === Track.Source.ScreenShare && t.publication
  );

  const remotes = useRemoteParticipants();
  const broadcaster = remotes.find((p) => !String(p.identity).startsWith('viewer-'));
  const isLive = Boolean(broadcaster);
  const chatRoom = `main-room-${broadcaster?.sid || 'live'}`;

  // OFFLINE: offline card on the left, upcoming lives on the right
  if (!isLive) {
    return (
      <div className="live-split">
        <div className="live-card">
          <div className="live-card-header">
            <span className="live-pill off">● OFFLINE</span>
          </div>
          <div className="live-video-frame">
            <div className="live-placeholder">Stream is currently offline</div>
          </div>
        </div>

        <UpcomingLives />
      </div>
    );
  }

  // LIVE: schedule is hidden
  return (
    <div className="live-layout">
      <div className="live-card">
        <div className="live-card-header">
          <span className="live-pill on">● LIVE NOW</span>
          {screenTrack && <span className="live-viewer-name">🖥️ Screen share</span>}
        </div>
        <div className="live-video-frame">
          {screenTrack ? (
            <>
              <VideoTrack trackRef={screenTrack} className="live-video contain" />
              {videoTrack && (
                <div className="live-pip">
                  <VideoTrack trackRef={videoTrack} className="live-video" />
                </div>
              )}
            </>
          ) : videoTrack ? (
            <VideoTrack trackRef={videoTrack} className="live-video" />
          ) : (
            <div className="live-placeholder">Camera is off</div>
          )}
        </div>
      </div>

      <LiveChat key={chatRoom} room={chatRoom} />
    </div>
  );
}

export default function WatchLive() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
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
        <div className="live-split">
          <div className="live-card">
            <div className="live-error">{error}</div>
          </div>
          <UpcomingLives />
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
        <LiveStage />
        <RoomAudioRenderer />
        <StartAudio
          label="🔊 Click to enable sound"
          className="live-btn start"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
          }}
        />
      </LiveKitRoom>
    </div>
  );
}