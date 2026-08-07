import { useEffect, useMemo, useRef, useState } from 'react';

function seededBars(seed, count = 26) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  const bars = [];
  for (let i = 0; i < count; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    bars.push(30 + (s % 1000) / 1000 * 70);
  }
  return bars;
}

function fmt(s) {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function VoiceMessage({ src, id }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [broken, setBroken] = useState(false);
  const [errCode, setErrCode] = useState(null);
  const [playSrc, setPlaySrc] = useState(null);
  const bars = useMemo(() => seededBars(id), [id]);

  useEffect(() => {
    // Chrome can be unreliable playing very long data: URIs directly — decode the
    // stored data URL into a Blob and hand the <audio> element a blob: URL instead,
    // which plays back far more reliably for MediaRecorder output.
    let objectUrl = null;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setBroken(true);
    }, 8000);
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (cancelled) return;
        // Some devices report the recorder's mimeType with formatting quirks
        // (e.g. "audio/webm; codecs=opus" with a space) that can trip up
        // playback — normalize to a plain container type before creating the blob.
        const normalized = new Blob([buf], { type: 'audio/webm' });
        objectUrl = URL.createObjectURL(normalized);
        setPlaySrc(objectUrl);
        clearTimeout(timeout);
      })
      .catch(() => {
        clearTimeout(timeout);
        setBroken(true);
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playSrc) return;

    function onDuration() {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    }
    function onTime() {
      setCurrent(audio.currentTime);
      if (isFinite(audio.duration)) setDuration(audio.duration);
    }
    function onEnd() {
      setPlaying(false);
      setCurrent(0);
    }
    function onError() {
      setErrCode(audio.error?.code ?? null);
      setBroken(true);
    }

    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onError);
    };
  }, [playSrc]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio
      .play()
      .then(() => setPlaying(true))
      .catch((e) => {
        setErrCode(e?.name || null);
        setBroken(true);
      });
  }

  if (broken) {
    return <div className="voice-msg voice-broken">⚠️ Не удалось воспроизвести{errCode ? ` (код: ${errCode})` : ''}</div>;
  }

  if (!playSrc) {
    return <div className="voice-msg voice-broken">Загрузка...</div>;
  }

  const progress = duration ? current / duration : 0;

  return (
    <div className="voice-msg">
      <audio ref={audioRef} src={playSrc} preload="metadata" />
      <button type="button" className="voice-play" onClick={toggle}>
        {playing ? '⏸' : '▶'}
      </button>
      <div className="voice-wave">
        {bars.map((h, i) => (
          <span
            key={i}
            className="voice-bar"
            style={{ height: `${h}%`, opacity: i / bars.length <= progress ? 1 : 0.35 }}
          />
        ))}
      </div>
      <span className="voice-time">{fmt(playing || current > 0 ? current : duration)}</span>
    </div>
  );
}
