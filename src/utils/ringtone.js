// Synthesized two-tone ring pattern via Web Audio — no external sound file needed.
// Returns a stop function; call it when the call is answered/dismissed.
export function startRingtone() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  let stopped = false;
  let timer = null;

  function beep(time, freq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.25, time + 0.02);
    gain.gain.linearRampToValueAtTime(0, time + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  function cycle() {
    if (stopped) return;
    const now = ctx.currentTime;
    beep(now, 900);
    beep(now + 0.45, 900);
    timer = setTimeout(cycle, 2000);
  }
  cycle();

  return () => {
    stopped = true;
    clearTimeout(timer);
    ctx.close().catch(() => {});
  };
}
