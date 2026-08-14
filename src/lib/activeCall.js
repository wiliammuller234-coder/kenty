// A chat's `call:<id>` Realtime topic can only have one live subscribed channel
// object per client at a time — a second `.on()`/`.subscribe()` on the same topic
// throws synchronously. The App-level "who's calling" watcher and CallRoom (the
// actual call screen) both need that topic, at different times, so CallRoom calls
// releaseCallWatcher() right before it creates its own channel, forcing the
// watcher to give up its channel for that one chat first. The watcher re-adds it
// on its next sync once CallRoom is done.
const releasers = new Map();

export function registerCallWatcher(chatId, release) {
  releasers.set(chatId, release);
}

export function unregisterCallWatcher(chatId) {
  releasers.delete(chatId);
}

export function releaseCallWatcher(chatId) {
  const release = releasers.get(chatId);
  if (release) {
    release();
    releasers.delete(chatId);
  }
}

// Otherwise the watcher only notices a chat needs re-watching on its own ~20s poll
// — leaving a window, right after a call ends, where a stale "someone's still
// present" read from the tail end of that same call could get freshly subscribed
// and misread as a brand new incoming call (spurious re-ring + banner).
let resyncFn = null;

export function registerResync(fn) {
  resyncFn = fn;
}

export function requestResync() {
  resyncFn?.();
}
