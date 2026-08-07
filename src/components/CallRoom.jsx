import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function CallRoom({ user, chat, onClose }) {
  const [participants, setParticipants] = useState({});
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState('connecting');
  const channelRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const audioElsRef = useRef({});

  useEffect(() => {
    let cancelled = false;

    async function start() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setStatus('no-mic');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      setStatus('connected');

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
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(phone, { kind: 'ice', candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        audioElsRef.current[phone] = e.streams[0];
        setParticipants((p) => ({ ...p }));
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
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
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
    };
  }, [chat.id, user.phone, user.name, user.emoji]);

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
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
      {status === 'connecting' && <p className="sub">Подключаюсь...</p>}

      <div className="call-participants">
        <div className="call-avatar me">
          <div className="avatar">{user.emoji}</div>
          <span>{user.name} (ты){muted ? ' 🔇' : ''}</span>
        </div>
        {others.map(([phone, p]) => (
          <div className="call-avatar" key={phone}>
            <div className="avatar">{p.emoji}</div>
            <span>{p.name}</span>
          </div>
        ))}
        {others.length === 0 && status === 'connected' && (
          <p className="sub">Ждём остальных — скинь им ссылку на этот чат</p>
        )}
      </div>

      {others.map(([phone]) =>
        audioElsRef.current[phone] ? (
          <audio key={phone} autoPlay ref={(el) => { if (el) el.srcObject = audioElsRef.current[phone]; }} />
        ) : null
      )}

      <div className="call-controls">
        <button className={`call-btn ${muted ? 'active' : ''}`} onClick={toggleMute}>
          {muted ? '🔇' : '🎤'}
        </button>
        <button className="call-btn hangup" onClick={onClose}>📞</button>
      </div>
    </div>
  );
}
