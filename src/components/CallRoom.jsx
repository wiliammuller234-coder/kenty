import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { postSystemMessage } from '../lib/db';
import { releaseCallWatcher, requestResync } from '../lib/activeCall';

// STUN alone only works when both sides can be reached directly — behind a
// symmetric NAT (common on mobile carriers) it silently connects with no audio.
const CONN_LABELS = {
  new: '🟡 инициализация',
  connecting: '🟡 соединяюсь',
  connected: '🟢 подключено',
  disconnected: '🟠 обрыв связи',
  failed: '🔴 не удалось соединиться',
  closed: '⚪ закрыто',
};

const STUN_ONLY = [{ urls: 'stun:stun.l.google.com:19302' }];

// Personal (not shared/overused-demo) TURN relay — Metered.ca free tier, own account.
// The account's secret key stays server-side in a Supabase Edge Function; this just
// calls that function, which is safe to ship inside the app.
const TURN_CREDENTIALS_URL = 'https://kprfjlcydxqpcgwjzafw.supabase.co/functions/v1/turn-credentials';
const SUPABASE_ANON_KEY = 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou';

async function fetchIceServers() {
  try {
    // Supabase's gateway rejects Edge Function calls with no apikey header at
    // all, even with "Verify JWT" turned off on the function itself.
    const res = await fetch(TURN_CREDENTIALS_URL, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const servers = await res.json();
    if (Array.isArray(servers) && servers.length) return [...STUN_ONLY, ...servers];
  } catch {
    // fall through to STUN-only below
  }
  return STUN_ONLY;
}

export default function CallRoom({ user, chat, onClose, video, isJoin }) {
  const [participants, setParticipants] = useState({});
  const [connStates, setConnStates] = useState({});
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(!!video);
  const [status, setStatus] = useState('connecting');
  const channelRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const audioElsRef = useRef({});
  const statsRef = useRef({});
  const iceServersRef = useRef(STUN_ONLY);
  const callStartRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // getUserMedia only exists in "secure contexts" (HTTPS or localhost) — on
      // plain HTTP over a LAN IP, navigator.mediaDevices is undefined and calling
      // .getUserMedia on it throws synchronously outside any try/catch, which used
      // to leave the screen stuck on "Подключаюсь..." forever with no explanation.
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('insecure-context');
        return;
      }
      let stream;
      const [micResult, iceServers] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user' } : false }),
        fetchIceServers(),
      ]).then(([a, b]) => [a, b.status === 'fulfilled' ? b.value : STUN_ONLY]);
      if (micResult.status !== 'fulfilled') {
        setStatus('no-mic');
        return;
      }
      stream = micResult.value;
      iceServersRef.current = iceServers;
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setStatus('connected');

      // Presence only tells people already IN the app that a call is happening — this
      // is what actually wakes up someone whose app is closed or backgrounded.
      // Only the person actually starting the call sends this — CallRoom mounts for
      // the person *accepting* one too, and without this check that mount fired a
      // second "incoming call" push back at the original caller, arriving as a
      // spurious ring shortly after the real call (a delayed FCM push arriving
      // after the real call already ended, sometimes even after it was hung up).
      if (!isJoin) {
        fetch('https://kprfjlcydxqpcgwjzafw.supabase.co/functions/v1/notify-call', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: 'sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou',
            Authorization: 'Bearer sb_publishable_h-w7eAaBfmktfdRa1YG-sQ_Zqnxhhou',
          },
          body: JSON.stringify({
            chatId: chat.id,
            callerPhone: user.phone,
            callerName: user.name,
            chatName: chat.name,
            chatEmoji: chat.emoji,
          }),
        }).catch(() => {});
      }

      // The App-level "who's calling" watcher (App.jsx) may already hold a
      // subscribed channel for this exact topic — a second .on()/.subscribe() on
      // the same topic throws synchronously, which would silently break this
      // call's own signaling. Force it to give up that channel first.
      releaseCallWatcher(chat.id);
      const channel = supabase.channel(`call:${chat.id}`, {
        config: { presence: { key: user.phone } },
      });
      channelRef.current = channel;

      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload.to !== user.phone) return;
        handleSignal(payload);
      });

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const nextParticipants = {};
        for (const phone of Object.keys(state)) {
          const meta = state[phone][0];
          nextParticipants[phone] = { name: meta.name, emoji: meta.emoji };
          if (phone !== user.phone && user.phone < phone && !peersRef.current[phone]) {
            connectTo(phone);
          }
        }
        for (const phone of Object.keys(peersRef.current)) {
          if (!nextParticipants[phone]) closePeer(phone);
        }
        // Duration should count from when someone actually joined, not from when
        // this screen opened — otherwise "Звонок завершён" includes all the time
        // spent alone on "Ждём остальных" before anyone answered.
        if (!callStartRef.current && Object.keys(nextParticipants).some((phone) => phone !== user.phone)) {
          callStartRef.current = Date.now();
        }
        setParticipants(nextParticipants);
      });

      channel.subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          await channel.track({ name: user.name, emoji: user.emoji });
        }
      });
    }

    function sendSignal(to, data) {
      channelRef.current?.send({ type: 'broadcast', event: 'signal', payload: { from: user.phone, to, ...data } });
    }

    function createPeerConnection(phone) {
      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(phone, { kind: 'ice', candidate: e.candidate });
          statsRef.current[phone] = { ...statsRef.current[phone], sent: (statsRef.current[phone]?.sent || 0) + 1 };
          setConnStates((s) => ({ ...s }));
        }
      };
      pc.ontrack = (e) => {
        audioElsRef.current[phone] = e.streams[0];
        setParticipants((p) => ({ ...p }));
      };
      // Presence (who's "in" the call) is separate from whether the actual voice
      // connection succeeded — without this, the UI could show someone's avatar
      // while the audio link silently never came up, with no way to tell why.
      // iceConnectionState + candidate counters are surfaced too, since without them
      // there's no way to see from the phone screen alone whether candidates are even
      // being exchanged (a signaling problem) versus exchanged-but-unreachable (NAT/TURN).
      pc.onconnectionstatechange = () => {
        setConnStates((s) => ({ ...s, [phone]: pc.connectionState }));
      };
      pc.oniceconnectionstatechange = () => {
        statsRef.current[phone] = { ...statsRef.current[phone], ice: pc.iceConnectionState };
        setConnStates((s) => ({ ...s }));
      };
      peersRef.current[phone] = pc;
      return pc;
    }

    async function connectTo(phone) {
      const pc = createPeerConnection(phone);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(phone, { kind: 'offer', sdp: offer });
    }

    async function handleSignal(payload) {
      const { from, kind } = payload;
      if (kind === 'offer') {
        const pc = peersRef.current[from] || createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(from, { kind: 'answer', sdp: answer });
      } else if (kind === 'answer') {
        const pc = peersRef.current[from];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (kind === 'ice') {
        const pc = peersRef.current[from];
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          statsRef.current[from] = { ...statsRef.current[from], received: (statsRef.current[from]?.received || 0) + 1 };
          setConnStates((s) => ({ ...s }));
        }
      }
    }

    function closePeer(phone) {
      peersRef.current[phone]?.close();
      delete peersRef.current[phone];
      delete audioElsRef.current[phone];
    }

    start();

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      Object.keys(peersRef.current).forEach(closePeer);
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
      }
      // Give the untrack a moment to actually reach the server before the
      // App-level watcher resubscribes to this same topic — resubscribing
      // immediately risks reading a not-yet-updated presence state (still showing
      // this call as active) and misreading it as a brand new incoming call.
      setTimeout(requestResync, 1500);
      // Leaves a record in the chat itself — otherwise a call that just happened
      // is invisible the moment everyone hangs up, with nothing to show it occurred.
      if (callStartRef.current) {
        const seconds = Math.round((Date.now() - callStartRef.current) / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = String(seconds % 60).padStart(2, '0');
        postSystemMessage(chat.id, `${video ? '🎥' : '📞'} Звонок завершён · ${mins}:${secs}`);
      }
    };
  }, [chat.id, user.phone, user.name, user.emoji, video, isJoin]);

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;
    videoTracks.forEach((t) => (t.enabled = !camOn));
    setCamOn((c) => !c);
  }

  const others = Object.entries(participants).filter(([phone]) => phone !== user.phone);

  return (
    <div className="call-overlay">
      <div className="call-title">{chat.emoji} {chat.name}</div>

      {status === 'no-mic' && (
        <p className="sub" style={{ color: 'var(--danger)' }}>
          Нет доступа к микрофону — разреши его в браузере/приложении
        </p>
      )}
      {status === 'insecure-context' && (
        <p className="sub" style={{ color: 'var(--danger)' }}>
          Звонки работают только на HTTPS или localhost — эта страница открыта по обычному HTTP, микрофон здесь недоступен
        </p>
      )}
      {status === 'connecting' && <p className="sub">Подключаюсь...</p>}

      {video ? (
        <div className="video-grid">
          <div className="video-tile">
            <video
              autoPlay
              muted
              playsInline
              ref={(el) => {
                if (el && localStreamRef.current && el.srcObject !== localStreamRef.current) {
                  el.srcObject = localStreamRef.current;
                }
              }}
            />
            {!camOn && <div className="video-tile-off">{user.emoji}</div>}
            <span className="video-tile-label">{user.name} (ты){muted ? ' 🔇' : ''}</span>
          </div>
          {others.map(([phone, p]) => (
            <div className="video-tile" key={phone}>
              {audioElsRef.current[phone] ? (
                <video
                  autoPlay
                  playsInline
                  ref={(el) => {
                    if (!el) return;
                    const stream = audioElsRef.current[phone];
                    if (el.srcObject !== stream) {
                      el.srcObject = stream;
                      el.play().catch((err) => console.error('Playback of remote call video failed', err));
                    }
                  }}
                />
              ) : (
                <div className="video-tile-off">{p.emoji}</div>
              )}
              <span className="video-tile-label">{p.name} · {CONN_LABELS[connStates[phone]] || '🟡'}</span>
            </div>
          ))}
          {others.length === 0 && status === 'connected' && (
            <p className="sub">Ждём остальных — скинь им ссылку на этот чат</p>
          )}
        </div>
      ) : (
        <>
          <div className="call-participants">
            <div className="call-avatar me">
              <div className="avatar">{user.emoji}</div>
              <span>{user.name} (ты){muted ? ' 🔇' : ''}</span>
            </div>
            {others.map(([phone, p]) => (
              <div className="call-avatar" key={phone}>
                <div className="avatar">{p.emoji}</div>
                <span>{p.name}</span>
                <span className="sub" style={{ fontSize: 11 }}>{CONN_LABELS[connStates[phone]] || '🟡 соединяюсь'}</span>
                <span className="sub" style={{ fontSize: 10 }}>
                  ICE: {statsRef.current[phone]?.ice || '—'} · отправлено {statsRef.current[phone]?.sent || 0} · получено {statsRef.current[phone]?.received || 0}
                </span>
              </div>
            ))}
            {others.length === 0 && status === 'connected' && (
              <p className="sub">Ждём остальных — скинь им ссылку на этот чат</p>
            )}
          </div>

          {others.map(([phone]) =>
            audioElsRef.current[phone] ? (
              <audio
                key={phone}
                autoPlay
                playsInline
                ref={(el) => {
                  if (!el) return;
                  const stream = audioElsRef.current[phone];
                  // Every ontrack/presence update re-renders this component, which used to
                  // reassign srcObject to the same stream each time — that can reset/interrupt
                  // playback repeatedly, so it never actually gets a chance to be heard.
                  if (el.srcObject !== stream) {
                    el.srcObject = stream;
                    el.play().catch((err) => console.error('Playback of remote call audio failed', err));
                  }
                }}
              />
            ) : null
          )}
        </>
      )}

      <div className="call-controls">
        {video && (
          <button className={`call-btn ${!camOn ? 'active' : ''}`} onClick={toggleCamera}>
            {camOn ? '🎥' : '🎥🚫'}
          </button>
        )}
        <button className={`call-btn ${muted ? 'active' : ''}`} onClick={toggleMute}>
          {muted ? '🔇' : '🎤'}
        </button>
        <button className="call-btn hangup" onClick={onClose}>📞</button>
      </div>
    </div>
  );
}
