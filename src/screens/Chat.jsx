import { useEffect, useRef, useState } from 'react';
import { loadState, saveState } from '../storage';
import { getMyChats, createChat, updateChat, joinOrCreateMainChat, removeChatMember } from '../lib/db';
import ChatList from '../components/ChatList';
import ChatRoom from '../components/ChatRoom';

export default function Chat({ user, jump, friends, onAddFriend, unreadCounts, onChatOpened }) {
  const [chats, setChats] = useState(null);
  // Switching bottom-nav tabs unmounts this whole screen — without persisting which
  // chat was open, coming back from Purchases/Profile always dumped you back to the list.
  const [activeId, setActiveId] = useState(() => jump?.chatId ?? loadState('activeChatId', null));
  const loadStartedRef = useRef(false);

  useEffect(() => {
    // Guards against React StrictMode's intentional double-invoke in dev, which
    // was racing two "no chats yet, create the default one" calls into two chats.
    if (loadStartedRef.current) return;
    loadStartedRef.current = true;
    loadChats();
  }, []);

  useEffect(() => {
    if (jump) setActiveId(jump.chatId);
  }, [jump]);

  useEffect(() => {
    saveState('activeChatId', activeId);
    if (activeId) onChatOpened?.(activeId);
  }, [activeId]);

  useEffect(() => {
    // Clear a stale id (chat deleted, or left over from another account) so it
    // doesn't keep getting reloaded from storage on every future visit.
    if (chats !== null && activeId && !chats.some((c) => c.id === activeId)) {
      setActiveId(null);
    }
  }, [chats, activeId]);

  async function loadChats() {
    let mine = await getMyChats(user.phone);
    if (mine.length === 0) {
      // Everyone lands in the same shared main group on first login, not a private
      // copy of their own — this finds (or, once ever, creates) that one chat.
      const joined = await joinOrCreateMainChat(user);
      if (joined) mine = [joined];
    }
    setChats(mine);
  }

  async function handleCreate({ name, emoji, description, isDM, memberPhone, memberPhones }) {
    const created = await createChat({
      name,
      emoji,
      description,
      isDM: !!isDM,
      createdBy: user.phone,
      memberPhones: memberPhone ? [memberPhone] : memberPhones || [],
    });
    if (created) {
      setChats((c) => [...c, created]);
      setActiveId(created.id);
    }
  }

  async function handleUpdateChat(id, patch) {
    setChats((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await updateChat(id, patch);
  }

  async function handleLeaveChat(id) {
    await removeChatMember(id, user.phone);
    setChats((list) => list.filter((c) => c.id !== id));
    setActiveId(null);
  }

  if (chats === null) {
    return (
      <div className="screen">
        <p className="sub">Загрузка чатов...</p>
      </div>
    );
  }

  const chat = activeId ? chats.find((c) => c.id === activeId) : null;

  // activeId can point at a chat that no longer exists (stale value from a previous
  // session/device) — fall back to the list instead of rendering a blank screen.
  if (!activeId || !chat) {
    return (
      <ChatList
        chats={chats}
        friends={friends}
        onOpen={setActiveId}
        onCreate={handleCreate}
        onAddFriend={onAddFriend}
        unreadCounts={unreadCounts}
      />
    );
  }

  return (
    <ChatRoom
      key={activeId}
      user={user}
      chat={{ ...chat, isDM: chat.is_dm }}
      myRole={chat.myRole || 'member'}
      friends={friends}
      onBack={() => setActiveId(null)}
      onUpdateChat={handleUpdateChat}
      onLeaveChat={handleLeaveChat}
      autoJoinCall={jump?.chatId === activeId && jump?.autoCall ? jump.nonce : null}
    />
  );
}
