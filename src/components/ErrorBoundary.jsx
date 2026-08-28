import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Catches render-time errors so a single bad record cannot leave the user with
 * a blank window and no way to recover.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Storm Archive crashed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash-screen">
        <div className="crash-card">
          <div className="empty-icon-wrapper"><AlertTriangle size={32} aria-hidden="true" /></div>
          <h2>Произошла непредвиденная ошибка</h2>
          <p>
            Архив сохранён на устройстве и не пострадал. Перезагрузите приложение — если ошибка повторяется,
            выгрузите резервную копию и сообщите текст ошибки ниже.
          </p>
          <pre className="crash-details">{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" /> Перезагрузить
          </button>
        </div>
      </div>
    );
  }
}
