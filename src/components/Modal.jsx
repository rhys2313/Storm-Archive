import React from 'react';
import { X } from 'lucide-react';
import { useModalLayer } from '../hooks/useModalLayer';

/**
 * Standard dialog shell: backdrop, header with a close button, scrollable body
 * and an optional footer. Every dialog in Storm Archive uses it so that Escape,
 * backdrop clicks, focus handling and spacing behave identically.
 */
export default function Modal({
  title,
  titleIcon,
  headerContent,
  children,
  footer,
  onClose,
  className = '',
  labelledBy = 'modal-title',
  size = 'default'
}) {
  const { dialogRef, handleBackdropClick } = useModalLayer(onClose);

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className={`modal-card modal-${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <div className="modal-header">
          {headerContent || (
            <div className="flex-align-gap modal-heading">
              {titleIcon}
              <h2 id={labelledBy}>{title}</h2>
            </div>
          )}
          <button type="button" className="close-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body scrollable-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
