import { useSyncExternalStore } from 'react';
import { pwa } from '../services/pwa';

export default function PwaStatus({ blocked }) {
  const state = useSyncExternalStore(pwa.subscribe, pwa.getSnapshot, pwa.getSnapshot);
  if (state.phase === 'idle') return null;
  return (
    <div className="pwa-install-banner" role="status">
      <div className="pwa-banner-text">
        <span>{state.updateReady
          ? 'Доступна новая версия Storm Archive. Обновите приложение после завершения действий в открытых окнах.'
          : state.phase === 'ready' ? 'Приложение готово к работе без интернета.'
            : state.phase === 'error' ? 'Не удалось подготовить офлайн-версию. Подключитесь к сети и повторите.'
              : 'Подготовка приложения к работе без интернета…'}</span>
        {state.message && <span>{state.message}</span>}
      </div>
      {state.updateReady && <button type="button" className="btn-secondary" disabled={blocked || state.updating}
        onClick={() => pwa.applyUpdate()}>{state.updating ? 'Обновление…' : 'Обновить приложение'}</button>}
      {state.phase === 'error' && !state.updateReady && <button type="button" className="btn-secondary"
        onClick={() => pwa.retry()}>Повторить подготовку</button>}
    </div>
  );
}
