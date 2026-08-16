import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex-align-gap text-danger">
            <AlertTriangle size={20} />
            <h2>{title || 'Подтверждение удаления'}</h2>
          </div>
          <button className="close-btn" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="confirm-message">{message || 'Вы действительно хотите удалить это метеонаблюдение? Это действие нельзя будет отменить.'}</p>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>
            Отмена
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
