import { useState } from 'react';
import { normalizePhone } from '../utils/phone';
import { upsertProfile, createPendingCode, checkPendingCode } from '../lib/db';

const EMOJIS = ['🦊', '🐱', '🐺', '🦉', '🐸', '🐼', '🐵', '🐧', '🦁', '🐨'];
const BOT_USERNAME = 'kenty_verify_bot';

export default function Login({ onComplete }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [token, setToken] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [birthDate, setBirthDate] = useState('');
  const [age, setAge] = useState('');

  async function sendCode() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Введи нормальный номер телефона');
      return;
    }
    setError('');
    setBusy(true);
    const result = await createPendingCode(normalizePhone(phone));
    setBusy(false);
    if (!result) {
      setError('Не получилось создать код, попробуй ещё раз');
      return;
    }
    setToken(result.token);
    setStep('code');
  }

  async function verifyCode() {
    setBusy(true);
    const ok = await checkPendingCode(token, codeInput);
    setBusy(false);
    if (!ok) {
      setError('Неверный код, попробуй ещё раз');
      return;
    }
    setError('');
    setStep('name');
  }

  async function finish() {
    if (!name.trim()) {
      setError('Введи имя');
      return;
    }
    const user = {
      name: name.trim(),
      emoji,
      phone: normalizePhone(phone),
      birthday: birthDate ? birthDate.slice(5) : null,
      age: age ? Number(age) : null,
    };
    await upsertProfile(user);
    onComplete(user);
  }

  return (
    <div className="auth">
      <div className="auth-logo">🔥</div>
      <h1>Кенты</h1>
      <p className="sub">Закрытая тусовка для своих людей</p>

      {step === 'phone' && (
        <>
          <input
            className="field"
            type="tel"
            placeholder="+7 900 000-00-00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          {error && <p className="sub" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" onClick={sendCode} disabled={busy}>
            {busy ? 'Секунду...' : 'Получить код'}
          </button>
        </>
      )}

      {step === 'code' && (
        <>
          <a
            className="btn"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
            href={`https://t.me/${BOT_USERNAME}?start=${token}`}
            target="_blank"
            rel="noreferrer"
          >
            ✈️ Открыть Telegram-бота за кодом
          </a>
          <p className="sub" style={{ textAlign: 'center' }}>
            Нажми Start в чате с ботом — код придёт сообщением
          </p>
          <input
            className="field"
            inputMode="numeric"
            placeholder="Код из Telegram"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
          />
          {error && <p className="sub" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" onClick={verifyCode} disabled={busy}>
            {busy ? 'Проверяю...' : 'Подтвердить'}
          </button>
        </>
      )}

      {step === 'name' && (
        <>
          <input
            className="field"
            placeholder="Как тебя зовут?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="field"
            type="number"
            placeholder="Сколько тебе лет?"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
          <input
            className="field"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <p className="sub" style={{ marginTop: 8 }}>Выбери аватарку</p>
          <div className="emoji-pick">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className={e === emoji ? 'sel' : ''}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
          {error && <p className="sub" style={{ color: 'var(--danger)' }}>{error}</p>}
          <button className="btn" onClick={finish}>Готово</button>
        </>
      )}
    </div>
  );
}
