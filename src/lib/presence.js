import { supabase } from './supabase';

let channel = null;
let onlineSet = new Set();
const listeners = new Set();

export function startPresence(user) {
  if (channel) return;
  channel = supabase.channel('presence-global', { config: { presence: { key: user.phone } } });
  channel.on('presence', { event: 'sync' }, () => {
    const state = channel.presenceState();
    onlineSet = new Set(Object.keys(state));
    listeners.forEach((l) => l(onlineSet));
  });
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ name: user.name, online_at: Date.now() });
    }
  });
}

export function stopPresence() {
  if (channel) {
    channel.untrack();
    supabase.removeChannel(channel);
    channel = null;
    onlineSet = new Set();
  }
}

export function isOnline(phone) {
  return onlineSet.has(phone);
}

export function subscribePresence(fn) {
  listeners.add(fn);
  fn(onlineSet);
  return () => listeners.delete(fn);
}
