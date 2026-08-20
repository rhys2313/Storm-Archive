import React, { useRef, useState } from 'react';
import { exportArchiveBackup, importArchiveBackup } from '../services/storage';
import { X, Download, Upload, Trash2, HardDrive, Check, AlertTriangle } from 'lucide-react';

export default function DataBackupModal({ onClose, onDataReload, onClearArchive, totalEvents }) {
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleExport = async () => {
    try {
      await exportArchiveBackup();
    } catch (err) {
      alert('Ошибка экспорта данных: ' + err.message);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus('');

    try {
      const importedCount = await importArchiveBackup(file);
      setImportStatus(`Успешно импортировано наблюдений: ${importedCount}`);
      await onDataReload();
    } catch (err) {
      setImportStatus(`Ошибка импорта: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card backup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-align-gap">
            <HardDrive size={20} />
            <h2>Управление данными и резервные копии</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body scrollable-body">
          <p className="backup-desc">
            Все данные Storm Archive сохраняются локально в IndexedDB. Полная резервная копия ZIP включает события и вложения; старый JSON по-прежнему можно импортировать.
          </p>

          <div className="backup-options-list">
            <div className="backup-card">
              <div className="backup-card-info">
                <h4>Полная резервная копия (ZIP)</h4>
                <p>Сохранить наблюдения ({totalEvents}) вместе с фотографиями, видео и файлами</p>
              </div>
              <button className="btn-primary" onClick={handleExport} disabled={totalEvents === 0}>
                <Download size={16} /> Экспорт
              </button>
            </div>

            <div className="backup-card">
              <div className="backup-card-info">
                <h4>Импорт архива</h4>
                <p>Восстановить ZIP с вложениями или совместимый старый JSON</p>
              </div>
              <div>
                <input 
                  type="file" 
                  accept=".zip,.json,application/zip,application/json"
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden-file-input" 
                />
                <button 
                  className="btn-secondary" 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                >
                  <Upload size={16} /> {isImporting ? 'Загрузка...' : 'Выбрать файл'}
                </button>
              </div>
            </div>

            {importStatus && (
              <div className="import-status-box">
                {importStatus}
              </div>
            )}

            <div className="backup-card danger-zone">
              <div className="backup-card-info">
                <h4 className="text-danger">Очистить весь архив</h4>
                <p>Удалить все сохранённые записи и фотографии из локальной базы данных</p>
              </div>
              {!showClearConfirm ? (
                <button className="btn-danger" onClick={() => setShowClearConfirm(true)}>
                  <Trash2 size={16} /> Очистить
                </button>
              ) : (
                <div className="clear-confirm-group">
                  <span className="confirm-text">Вы уверены?</span>
                  <button 
                    className="btn-danger confirm-btn" 
                    onClick={() => {
                      onClearArchive();
                      setShowClearConfirm(false);
                      onClose();
                    }}
                  >
                    Да, удалить все
                  </button>
                  <button className="btn-secondary" onClick={() => setShowClearConfirm(false)}>
                    Отмена
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
