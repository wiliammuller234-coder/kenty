import { useEffect, useState } from 'react';
import { getMyChats, createChat, updateChat } from '../lib/db';
import ChatList from '../components/ChatList';
import ChatRoom from '../components/ChatRoom';

export default function Chat({ user, jump, friends, onAddFriend }) {
  const [chats, setChats] = useState(null);
  const [activeId, setActiveId] = useState(jump?.chatId ?? null);

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (jump) setActiveId(jump.chatId);
  }, [jump]);

  async function loadChats() {
    let mine = await getMyChats(user.phone);
    if (mine.length === 0) {
      const created = await createChat({
        name: 'Кенты',
        emoji: '🔥',
        createdBy: user.phone,
        memberPhones: [],
      });
      if (created) mine = [created];
    }
    setChats(mine);
  }

  async function handleCreate({ name, emoji, isDM, memberPhone }) {
    const created = await createChat({
      name,
      emoji,
      isDM: !!isDM,
      createdBy: user.phone,
      memberPhones: memberPhone ? [memberPhone] : [],
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

  if (chats === null) {
    return (
      <div className="screen">
        <p className="sub">Загрузка чатов...</p>
      </div>
    );
  }

  if (!activeId) {
    return (
      <ChatList
        chats={chats}
        friends={friends}
        onOpen={setActiveId}
        onCreate={handleCreate}
        onAddFriend={onAddFriend}
      />
    );
  }

  const chat = chats.find((c) => c.id === activeId);
  if (!chat) return null;

  return (
    <ChatRoom
      key={activeId}
      user={user}
      chat={{ ...chat, isDM: chat.is_dm }}
      onBack={() => setActiveId(null)}
      onUpdateChat={handleUpdateChat}
    />
  );
}
