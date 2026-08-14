const TABS = [
  { id: 'chat', icon: '💬', label: 'Чат' },
  { id: 'purchases', icon: '🛒', label: 'Покупки' },
  { id: 'birthdays', icon: '🎂', label: 'ДР' },
  { id: 'games', icon: '🎮', label: 'Игры' },
  { id: 'profile', icon: '👤', label: 'Профиль' },
];

export default function BottomNav({ active, onChange }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-item ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="icon">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
