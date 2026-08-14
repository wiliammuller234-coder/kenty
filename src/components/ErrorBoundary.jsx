import { Component } from 'react';

// Without this, an uncaught render error unmounts the whole tree and leaves a blank
// white screen with zero information — exactly what happens when opening the app via
// a push-notification tap crashes on a code path normal in-app navigation never hits.
// This turns that into a visible, copyable error so it can be diagnosed without a
// USB cable and adb logcat every time.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      localStorage.setItem(
        'svoi_last_crash',
        JSON.stringify({ message: error?.message, stack: error?.stack, componentStack: info?.componentStack, at: new Date().toISOString() })
      );
    } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 20, color: '#fff', background: '#0b0f14', minHeight: '100vh', fontFamily: 'monospace' }}>
        <h2 style={{ marginTop: 0 }}>Приложение упало с ошибкой</h2>
        <p>Сфотографируй/скопируй текст ниже и отправь разработчику.</p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#151b23', padding: 12, borderRadius: 8, fontSize: 12 }}>
          {this.state.error?.message}
          {'\n\n'}
          {this.state.error?.stack}
        </pre>
        <button
          style={{ marginTop: 16, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#2dd4bf', color: '#000', fontWeight: 600 }}
          onClick={() => window.location.reload()}
        >
          Перезагрузить
        </button>
      </div>
    );
  }
}
