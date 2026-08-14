// Plain module-level value, not React state — the global message subscription in
// App.jsx needs to know "is the user already looking at this exact chat" at the
// moment an event arrives, without threading that state up through Chat.jsx/
// ChatRoom.jsx just for this one check. ChatRoom sets it on mount, clears it on
// unmount (tab switch or navigating back to the chat list).
let activeChatId = null;

export function setActiveChatId(id) {
  activeChatId = id;
}

export function getActiveChatId() {
  return activeChatId;
}
