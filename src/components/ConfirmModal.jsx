import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  tone = 'danger',
  onConfirm,
  onCancel
}) {
  return (
    <Modal
      title={title || 'Подтверждение'}
      titleIcon={<AlertTriangle size={20} className={tone === 'danger' ? 'text-danger' : ''} aria-hidden="true" />}
      onClose={onCancel}
      className="confirm-modal"
      size="narrow"
      labelledBy="confirm-modal-title"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}
