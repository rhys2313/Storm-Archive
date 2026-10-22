import { useSyncExternalStore } from 'react';
import { CircleCheck } from 'lucide-react';
import { pwa } from '../services/pwa';

export default function PwaStatus({ blocked, compact = false }) {
  const state = useSyncExternalStore(
    pwa.subscribe,
    pwa.getSnapshot,
    pwa.getSnapshot
  );
  if (state.phase === 'idle') return null;
  // Only an uneventful success belongs in the heading. Service messages and
  // update offers must stay readable in the full-width notice area.
  const ready = state.phase === 'ready' && !state.updateReady && !state.message;
  if (ready !== compact) return null;
  if (ready) {
    return (
      <span
        className="pwa-status-ready"
        role="status"
        aria-label="Приложение готово к работе без интернета."
        title="Приложение готово к работе без интернета."
      >
        <CircleCheck size={20} aria-hidden="true" />
      </span>
    );
  }
  return (
    <div className="pwa-install-banner" role="status">
      <div className="pwa-banner-text">
        <span>
          {state.updateReady
            ? 'Доступна новая версия «Storm Archive». Обновите приложение после завершения действий в открытых окнах.'
            : state.phase === 'ready'
              ? 'Приложение готово к работе без интернета.'
              : state.phase === 'error'
                ? 'Не удалось подготовить офлайн-версию. Подключитесь к сети и повторите.'
                : 'Подготовка приложения к работе без интернета…'}
        </span>
        {state.message && <span>{state.message}</span>}
      </div>
      {state.updateReady && (
        <button
          type="button"
          className="btn-secondary"
          disabled={blocked || state.updating}
          onClick={() => pwa.applyUpdate()}
        >
          {state.updating ? 'Обновление…' : 'Обновить приложение'}
        </button>
      )}
      {state.phase === 'error' && !state.updateReady && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => pwa.retry()}
        >
          Повторить подготовку
        </button>
      )}
    </div>
  );
}
