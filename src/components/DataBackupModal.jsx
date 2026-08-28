import React, { useEffect, useRef, useState } from 'react';
import { exportArchiveJSON, importArchiveJSON, getStorageBackend } from '../services/storage';
import { countArchivePhotos } from '../services/events';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { Download, Upload, Trash2, HardDrive, Loader2 } from 'lucide-react';

const BACKEND_LABELS = {
  idb: 'IndexedDB — основное локальное хранилище браузера',
  local: 'localStorage — резервный режим, объём ограничен примерно 5 МБ'
};

export default function DataBackupModal({ onClose, onDataReload, onClearArchive, events }) {
  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState(null); // { kind: 'success' | 'error', text }
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [backend, setBackend] = useState(null);

  const totalEvents = events.length;
  const totalPhotos = countArchivePhotos(events);

  useEffect(() => {
    // Re-armed on every mount; StrictMode's immediate remount in development
    // would otherwise leave this false and suppress all status updates.
    isMountedRef.current = true;
    getStorageBackend().then(kind => {
      if (isMountedRef.current) setBackend(kind);
    }).catch(() => {});
    return () => { isMountedRef.current = false; };
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    setStatus(null);
    try {
      const count = await exportArchiveJSON();
      if (isMountedRef.current) setStatus({ kind: 'success', text: `Экспортировано наблюдений: ${count}` });
    } catch (err) {
      if (isMountedRef.current) setStatus({ kind: 'error', text: `Ошибка экспорта: ${err.message}` });
    } finally {
      if (isMountedRef.current) setIsExporting(false);
    }
  };

  const handleFileChange = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    // Reset first so choosing the same file again re-triggers the import.
    input.value = '';
    if (!file) return;

    setIsImporting(true);
    setStatus(null);
    try {
      const { imported, skipped } = await importArchiveJSON(file);
      await onDataReload();
      if (!isMountedRef.current) return;
      setStatus({
        kind: 'success',
        text: skipped > 0
          ? `Импортировано: ${imported}. Пропущено некорректных записей: ${skipped}.`
          : `Импортировано наблюдений: ${imported}.`
      });
    } catch (err) {
      if (isMountedRef.current) setStatus({ kind: 'error', text: `Ошибка импорта: ${err.message}` });
    } finally {
      if (isMountedRef.current) setIsImporting(false);
    }
  };

  return (
    <>
      <Modal
        title="Данные и резервные копии"
        titleIcon={<HardDrive size={20} aria-hidden="true" />}
        onClose={onClose}
        className="backup-modal"
      >
        <p className="backup-desc">
          Архив хранится только на этом устройстве и никуда не отправляется. Экспортируйте резервную копию,
          чтобы перенести наблюдения на другое устройство или защититься от потери данных.
        </p>

        <dl className="storage-summary">
          <div>
            <dt>Наблюдений</dt>
            <dd>{totalEvents}</dd>
          </div>
          <div>
            <dt>Снимков</dt>
            <dd>{totalPhotos}</dd>
          </div>
          <div className="storage-summary-wide">
            <dt>Хранилище</dt>
            <dd>{backend ? BACKEND_LABELS[backend] : 'определяется…'}</dd>
          </div>
        </dl>

        <div className="backup-options-list">
          <div className="backup-card">
            <div className="backup-card-info">
              <h4>Экспорт архива (JSON)</h4>
              <p>Один файл со всеми записями и фотографиями</p>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={handleExport}
              disabled={totalEvents === 0 || isExporting}
            >
              {isExporting ? <Loader2 size={16} className="spin-icon" /> : <Download size={16} aria-hidden="true" />}
              {isExporting ? 'Экспорт…' : 'Экспорт'}
            </button>
          </div>

          <div className="backup-card">
            <div className="backup-card-info">
              <h4>Импорт архива (JSON)</h4>
              <p>Записи с совпадающим идентификатором будут заменены версией из копии</p>
            </div>
            <div>
              <input
                type="file"
                accept="application/json,.json"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="visually-hidden"
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? <Loader2 size={16} className="spin-icon" /> : <Upload size={16} aria-hidden="true" />}
                {isImporting ? 'Импорт…' : 'Выбрать файл'}
              </button>
            </div>
          </div>

          {status && (
            <div className={`inline-alert ${status.kind === 'error' ? 'danger' : 'success'}`} role="status">
              {status.text}
            </div>
          )}

          <div className="backup-card danger-zone">
            <div className="backup-card-info">
              <h4 className="text-danger">Очистить весь архив</h4>
              <p>Удаляет все записи и фотографии с этого устройства без возможности отмены</p>
            </div>
            <button
              type="button"
              className="btn-danger"
              onClick={() => setShowClearConfirm(true)}
              disabled={totalEvents === 0}
            >
              <Trash2 size={16} aria-hidden="true" /> Очистить
            </button>
          </div>
        </div>
      </Modal>

      {showClearConfirm && (
        <ConfirmModal
          title="Очистить весь архив?"
          message={`Будут удалены все наблюдения (${totalEvents}) и снимки (${totalPhotos}). Действие необратимо. Рекомендуем сначала сделать экспорт.`}
          confirmLabel="Да, удалить всё"
          onConfirm={async () => {
            setShowClearConfirm(false);
            await onClearArchive();
            onClose();
          }}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </>
  );
}
