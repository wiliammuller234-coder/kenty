import { useEffect, useState } from 'react';
import { loadState, saveState } from './storage';
import { DEFAULT_FRIENDS } from './data/friends';
import { getMyChats, sendMessage, deleteProfile } from './lib/db';
import Login from './screens/Login';
import Chat from './screens/Chat';
import Purchases from './screens/Purchases';
import Birthdays from './screens/Birthdays';
import Profile from './screens/Profile';
import BottomNav from './components/BottomNav';
import './App.css';

const TITLES = {
  chat: 'Кенты',
  purchases: 'Покупки',
  birthdays: 'Дни рождения',
  profile: 'Профиль',
};

export default function App() {
  const [user, setUser] = useState(() => loadState('user', null));
  const [tab, setTab] = useState('chat');
  const [friends, setFriends] = useState(() => loadState('friends', DEFAULT_FRIENDS));
  const [purchaseCount, setPurchaseCount] = useState(() => (loadState('purchases', []) || []).length);
  const [theme, setTheme] = useState(() => loadState('theme', 'dark'));
  const [chatJump, setChatJump] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveState('theme', theme);
  }, [theme]);

  function handleLogin(u) {
    setUser(u);
    saveState('user', u);
  }

  function updateUser(u) {
    setUser(u);
    saveState('user', u);
  }

  function logout() {
    saveState('user', null);
    setUser(null);
  }

  async function deleteAccount() {
    await deleteProfile(user.phone);
    saveState('user', null);
    setUser(null);
  }

  function addFriend(f) {
    const next = [...friends, f];
    setFriends(next);
    saveState('friends', next);
  }

  async function congratulate(friend) {
    const mine = await getMyChats(user.phone);
    const mainChat = mine[0];
    if (!mainChat) return;
    await sendMessage(mainChat.id, {
      authorPhone: user.phone,
      author: user.name,
      emoji: user.emoji,
      avatarImg: user.avatarImg || null,
      text: `🎉 Поздравляю с днём рождения, ${friend.name}! Пусть всё будет ${friend.emoji}`,
    });
    setChatJump({ chatId: mainChat.id, nonce: Date.now() });
    setTab('chat');
  }

  if (!user) {
    return (
      <div className="phone">
        <Login onComplete={handleLogin} />
      </div>
    );
  }

  return (
    <div className="phone">
      <div className="app-shell">
        <div className="topbar">
          <h2>{TITLES[tab]}</h2>
          <span>{user.emoji}</span>
        </div>
        {tab === 'chat' && (
          <Chat user={user} jump={chatJump} friends={friends} onAddFriend={addFriend} />
        )}
        {tab === 'purchases' && (
          <Purchases user={user} friends={friends} onCountChange={setPurchaseCount} />
        )}
        {tab === 'birthdays' && (
          <Birthdays friends={friends} onAddFriend={addFriend} onCongratulate={congratulate} />
        )}
        {tab === 'profile' && (
          <Profile
            user={user}
            onUpdate={updateUser}
            friends={friends}
            purchaseCount={purchaseCount}
            theme={theme}
            onThemeChange={setTheme}
            onLogout={logout}
            onDeleteAccount={deleteAccount}
          />
        )}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
