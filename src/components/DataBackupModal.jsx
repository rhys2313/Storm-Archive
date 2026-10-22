import React, { useEffect, useRef, useState } from 'react';
import {
  exportArchiveJSON,
  importArchiveJSON,
  getStorageBackend,
  ArchiveImportConflictError,
  prepareStorageMerge,
  mergeStorageArchives,
  keepBothStorageVersions
} from '../services/storage';
import { countArchivePhotos } from '../services/events';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import Presence from './Presence';
import { Download, Upload, Trash2, HardDrive, Loader2 } from 'lucide-react';

const BACKEND_LABELS = {
  idb: 'IndexedDB — основное локальное хранилище браузера',
  local: 'localStorage — резервный режим, объём ограничен примерно 5 МБ',
  incompatible: 'IndexedDB — неподдерживаемая схема; изменения заблокированы'
};

export default function DataBackupModal({
  onClose,
  onDataReload,
  onClearArchive,
  events,
  archiveInfo
}) {
  const fileInputRef = useRef(null);
  const statusRef = useRef(null);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState(null); // { kind: 'success' | 'error', text }
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [backend, setBackend] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [pendingStorageAction, setPendingStorageAction] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);

  const totalEvents = archiveInfo ? archiveInfo.recordCount : events.length;
  const totalPhotos = countArchivePhotos(events);
  const hasStoredData = archiveInfo
    ? archiveInfo.hasStoredData
    : events.length > 0;
  const isBusy = isImporting || isExporting || isCheckingStorage;
  const hasConfirmation = Boolean(pendingImport || pendingStorageAction);
  const storage = archiveInfo?.storage;
  useEffect(() => {
    if (status)
      statusRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant'
      });
  }, [status]);

  const runStorageAction = async (work) => {
    setIsCheckingStorage(true);
    setStatus(null);
    try {
      const message = await work();
      await onDataReload();
      const kind = await getStorageBackend();
      if (isMountedRef.current) {
        setBackend(kind);
        setStatus({ kind: 'success', text: message });
      }
    } catch (err) {
      await onDataReload();
      if (isMountedRef.current) setStatus({ kind: 'error', text: err.message });
    } finally {
      if (isMountedRef.current) setIsCheckingStorage(false);
    }
  };

  const prepareMerge = async () => {
    setIsCheckingStorage(true);
    setStatus(null);
    try {
      const plan = await prepareStorageMerge();
      if (isMountedRef.current) {
        if (plan.count) setPendingStorageAction({ kind: 'merge', plan });
        else
          setStatus({
            kind: 'error',
            text: 'Нет записей для безопасного переноса. Сначала разрешите конфликты или восстановите повреждённые данные из экспорта.'
          });
      }
    } catch (err) {
      if (isMountedRef.current) setStatus({ kind: 'error', text: err.message });
    } finally {
      if (isMountedRef.current) setIsCheckingStorage(false);
    }
  };

  useEffect(() => {
    // Re-armed on every mount; StrictMode's immediate remount in development
    // would otherwise leave this false and suppress all status updates.
    isMountedRef.current = true;
    getStorageBackend()
      .then((kind) => {
        if (isMountedRef.current) setBackend(kind);
      })
      .catch(() => {});
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const count = await exportArchiveJSON();
      if (isMountedRef.current)
        setStatus({
          kind: 'success',
          text:
            totalEvents == null
              ? 'Исходное содержимое локального архива экспортировано для восстановления.'
              : storage?.conflicts.length
                ? 'Обе исходные версии включены в копию для восстановления. Для обычного импорта сначала разрешите конфликты.'
                : `Экспортировано наблюдений: ${count}${storage?.incomplete ? ' (только доступная резервная часть)' : ''}`
        });
    } catch (err) {
      if (isMountedRef.current)
        setStatus({ kind: 'error', text: `Ошибка экспорта: ${err.message}` });
    } finally {
      if (isMountedRef.current) setIsExporting(false);
    }
  };

  const handleImport = async (file, options) => {
    setIsImporting(true);
    setStatus(null);
    try {
      const { imported } = await importArchiveJSON(file, options);
      await onDataReload();
      if (!isMountedRef.current) return;
      setStatus({
        kind: 'success',
        text: `Импортировано наблюдений: ${imported}.`
      });
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof ArchiveImportConflictError) {
        setPendingImport({ file, conflicts: err.conflicts });
      } else {
        setStatus({ kind: 'error', text: `Ошибка импорта: ${err.message}` });
      }
    } finally {
      if (isMountedRef.current) setIsImporting(false);
    }
  };

  const handleFileChange = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (file && !isBusy) await handleImport(file);
  };

  return (
    <>
      <Modal
        title="Данные и резервные копии"
        titleIcon={<HardDrive size={20} aria-hidden="true" />}
        onClose={() => {
          if (!isBusy) onClose();
        }}
        dismissDisabled={isBusy}
        className="backup-modal"
      >
        <p className="backup-desc">
          Архив хранится только на этом устройстве. Сохраните резервную копию
          для защиты данных или переноса на другое устройство.
        </p>

        <dl className="storage-summary">
          <div>
            <dt>{storage?.incomplete ? 'Доступных записей' : 'Наблюдений'}</dt>
            <dd>{totalEvents ?? 'не удалось определить'}</dd>
          </div>
          <div>
            <dt>
              {archiveInfo?.issues.length ? 'Доступных снимков' : 'Снимков'}
            </dt>
            <dd>{totalPhotos}</dd>
          </div>
        </dl>
        <details
          className="form-disclosure storage-diagnostics"
          open={Boolean(
            storage?.readOnly ||
              storage?.incomplete ||
              storage?.notices.length ||
              storage?.conflicts.length ||
              storage?.canMerge
          )}
        >
          <summary>Состояние хранилищ</summary>
          <div className="disclosure-content">
            <dl>
              <dt>Хранилище</dt>
              <dd>{backend ? BACKEND_LABELS[backend] : 'определяется…'}</dd>
            </dl>
            {storage && (
              <button
                type="button"
                className="btn-secondary storage-check"
                disabled={isBusy || hasConfirmation}
                onClick={() =>
                  runStorageAction(async () => {
                    await onDataReload({ retryStorage: true });
                    return 'Проверка хранилищ завершена. Актуальное состояние показано выше.';
                  })
                }
              >
                Проверить хранилища
              </button>
            )}
          </div>
        </details>

        {storage &&
          (storage.notices.length > 0 ||
            storage.conflicts.length > 0 ||
            storage.canMerge) && (
            <div className="backup-card">
              <div className="backup-card-info">
                {storage.notices.map((notice, index) => (
                  <p key={index}>{notice}</p>
                ))}
                {storage.conflicts.map((conflict, index) => (
                  <div key={`${conflict.id}-${index}`}>
                    <p>
                      Конфликт «{conflict.id}»: IndexedDB — «
                      {String(conflict.primary.title || 'Без названия')}»,
                      localStorage — «
                      {String(conflict.local.title || 'Без названия')}». Обе
                      исходные версии сохранены и включаются в экспорт.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={isBusy || hasConfirmation || storage.readOnly}
                      onClick={() =>
                        setPendingStorageAction({ kind: 'keepBoth', conflict })
                      }
                    >
                      Сохранить обе версии
                    </button>
                  </div>
                ))}
                {storage.canMerge && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={isBusy || hasConfirmation || storage.readOnly}
                    onClick={prepareMerge}
                  >
                    Объединить хранилища
                  </button>
                )}
              </div>
            </div>
          )}

        {archiveInfo?.issues.length > 0 && (
          <div className="inline-alert warning" role="status">
            <div>
              <p>
                {storage?.readOnly
                  ? 'Исходные записи сохранены. Для экспорта восстановите доступ к хранилищам.'
                  : 'Экспорт сохранит исходные записи, включая повреждённые данные.'}{' '}
                Автоматическое исправление исходников не выполнялось.
              </p>
              <ul>
                {archiveInfo.issues.slice(0, 5).map((issue, index) => (
                  <li key={index}>
                    {issue.index == null ? '' : `Запись ${issue.index + 1}: `}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="backup-options-list">
          <div className="backup-card">
            <div className="backup-card-info">
              <h4>Экспорт архива (JSON)</h4>
              <p>
                {storage?.readOnly
                  ? 'Для полного экспорта восстановите доступ к обоим хранилищам'
                  : storage?.incomplete
                    ? 'Копия доступных резервных данных; содержимое основной базы не проверено'
                    : storage?.conflicts.length
                      ? 'Копия обеих исходных версий для восстановления; обычный импорт требует разрешения конфликтов'
                      : 'Один файл со всеми записями и фотографиями'}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleExport}
              disabled={
                !hasStoredData || isBusy || hasConfirmation || storage?.readOnly
              }
            >
              {isExporting ? (
                <Loader2 size={16} className="spin-icon" />
              ) : (
                <Download size={16} aria-hidden="true" />
              )}
              {isExporting ? 'Экспорт…' : 'Экспорт'}
            </button>
          </div>

          <div className="backup-card">
            <div className="backup-card-info">
              <h4>Импорт архива (JSON)</h4>
              <p>
                Файл проверяется целиком. Замена отличающихся существующих
                записей требует подтверждения.
              </p>
            </div>
            <div>
              <input
                type="file"
                accept="application/json,.json"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="visually-hidden"
                disabled={isBusy || hasConfirmation || storage?.readOnly}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || hasConfirmation || storage?.readOnly}
              >
                {isImporting ? (
                  <Loader2 size={16} className="spin-icon" />
                ) : (
                  <Upload size={16} aria-hidden="true" />
                )}
                {isImporting ? 'Импорт…' : 'Выбрать файл'}
              </button>
            </div>
          </div>

          {status && (
            <div
              ref={statusRef}
              className={`inline-alert ${status.kind === 'error' ? 'danger' : 'success'}`}
              role="status"
            >
              {status.text}
            </div>
          )}

          <details className="form-disclosure backup-danger">
            <summary>Удаление данных</summary>
            <div className="disclosure-content">
              {' '}
              <div className="backup-card danger-zone">
                <div className="backup-card-info">
                  <h4 className="text-danger">Очистить весь архив</h4>
                  <p>
                    Удаляет доступные записи и фотографии без возможности
                    отмены. При резервном режиме основная база не затрагивается.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={
                    !hasStoredData ||
                    isBusy ||
                    hasConfirmation ||
                    storage?.readOnly
                  }
                >
                  <Trash2 size={16} aria-hidden="true" /> Очистить
                </button>
              </div>
            </div>
          </details>
        </div>
      </Modal>

      <Presence visible={Boolean(pendingStorageAction)}>
        {pendingStorageAction && (
          <ConfirmModal
            tone="normal"
            title={
              pendingStorageAction.kind === 'merge'
                ? 'Объединить хранилища?'
                : 'Сохранить обе версии?'
            }
            message={
              pendingStorageAction.kind === 'merge'
                ? `Записей для переноса или удаления одинаковой копии: ${pendingStorageAction.plan.count}. Существующие версии IndexedDB не заменяются. Исходные копии в localStorage будут убраны только после проверки результата. Останется конфликтующих или повреждённых записей: ${pendingStorageAction.plan.remaining}.`
                : 'Версия IndexedDB останется без изменений. Версия localStorage получит отдельный идентификатор с сохранением исходного идентификатора в метаданных. Обе записи появятся в архиве и смогут редактироваться независимо.'
            }
            confirmLabel={
              pendingStorageAction.kind === 'merge'
                ? 'Объединить'
                : 'Сохранить обе'
            }
            onConfirm={() => {
              const pending = pendingStorageAction;
              setPendingStorageAction(null);
              runStorageAction(async () => {
                if (pending.kind === 'keepBoth') {
                  await keepBothStorageVersions(pending.conflict);
                  return 'Обе версии сохранены как отдельные наблюдения.';
                }
                const result = await mergeStorageArchives(pending.plan);
                return result.cleaned
                  ? `Объединение завершено. Проверено записей: ${result.copied}.`
                  : 'Копирование завершено, но исходные копии в localStorage оставлены: источник изменился или его очистка недоступна. Повторите проверку и объединение.';
              });
            }}
            onCancel={() => setPendingStorageAction(null)}
          />
        )}
      </Presence>

      <Presence visible={Boolean(pendingImport)}>
        {pendingImport && (
          <ConfirmModal
            title="Заменить существующие наблюдения?"
            message={`Отличающихся записей: ${pendingImport.conflicts.length}. Их данные и фотографии будут заменены версиями из файла. Сначала сохраните резервную копию, если текущие версии нужны. До подтверждения архив не изменён.`}
            confirmLabel="Заменить и импортировать"
            onConfirm={() => {
              const pending = pendingImport;
              setPendingImport(null);
              handleImport(pending.file, {
                replaceExisting: true,
                expectedConflicts: pending.conflicts
              });
            }}
            onCancel={() => {
              setPendingImport(null);
              setStatus({
                kind: 'success',
                text: 'Импорт отменён. Архив не изменён.'
              });
            }}
          />
        )}
      </Presence>

      <Presence visible={Boolean(showClearConfirm)}>
        {showClearConfirm && (
          <ConfirmModal
            title="Очистить весь архив?"
            message={`${storage?.incomplete ? 'Будет удалена только доступная резервная часть; основная база не затрагивается.' : 'Будет удалён весь доступный архив, включая повреждённые исходные записи.'} Наблюдений: ${totalEvents ?? 'не удалось определить'}, доступных снимков: ${totalPhotos}. Действие необратимо. Рекомендуем сначала сделать экспорт.`}
            confirmLabel="Да, удалить всё"
            onConfirm={async () => {
              setShowClearConfirm(false);
              await onClearArchive();
              onClose();
            }}
            onCancel={() => setShowClearConfirm(false)}
          />
        )}
      </Presence>
    </>
  );
}
