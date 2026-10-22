import React, { useCallback, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Aperture,
  Timer,
  Ruler,
  Sun
} from 'lucide-react';
import { useModalLayer } from '../hooks/useModalLayer';
import { photoFullSrc } from '../services/photos';
import ArchiveImage from './ArchiveImage';
import { useLayerClosing } from '../hooks/useLayerClosing';

const ExifRow = ({ exif }) => {
  if (!exif) return null;
  const entries = [
    [Camera, exif.camera],
    [Ruler, exif.focalLength],
    [Sun, exif.iso],
    [Aperture, exif.aperture],
    [Timer, exif.exposure]
  ].filter(([, value]) => Boolean(value));

  if (entries.length === 0) return null;

  return (
    <div className="lightbox-exif-info">
      {entries.map(([Icon, value]) => (
        <span key={value} className="lightbox-exif-item">
          <Icon size={13} aria-hidden="true" /> {value}
        </span>
      ))}
    </div>
  );
};

/**
 * Full-screen photo viewer shared by the observation dialog and the gallery.
 *
 * Only the current photo is mounted, so browsing an archive with hundreds of
 * photos never holds more than one full-resolution image in memory.
 *
 * `items` entries: { photo, title, subtitle }
 */
export default function PhotoLightbox({
  items,
  index,
  onNavigate,
  onClose,
  actions
}) {
  const closing = useLayerClosing();
  const { dialogRef, handleBackdropClick } = useModalLayer(
    closing ? () => {} : onClose
  );
  const total = items.length;
  const current = items[index];

  const go = useCallback(
    (delta) => {
      if (total < 2) return;
      onNavigate((index + delta + total) % total);
    },
    [index, total, onNavigate]
  );

  useEffect(() => {
    if (closing) return;
    const handleKeyDown = (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        go(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [go, closing]);

  // Horizontal swipe navigation for Android.
  const touchStart = useRef(null);
  const handleTouchStart = (event) => {
    if (closing || event.touches.length !== 1) {
      touchStart.current = null;
      return;
    }
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (closing || !start || event.touches.length > 0) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      // A photo swipe must not also become browser Back or a synthetic click.
      if (event.cancelable) event.preventDefault();
      go(dx < 0 ? 1 : -1);
    }
  };

  if (!current) return null;

  // Kept distinct from the observation dialog underneath, which would otherwise
  // expose an identical accessible name to screen readers.
  const dialogLabel = `Просмотр фотографии ${index + 1} из ${total}${current.title ? `: ${current.title}` : ''}`;

  return (
    <div className="lightbox-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="lightbox-content"
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        tabIndex={-1}
      >
        <div className="lightbox-topbar">
          {total > 1 && (
            <span className="lightbox-counter">
              {index + 1} / {total}
            </span>
          )}
          <button
            type="button"
            className="close-btn lightbox-close"
            onClick={onClose}
            aria-label="Закрыть просмотр"
          >
            <X size={22} />
          </button>
        </div>

        <div
          className="lightbox-stage"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
        >
          {total > 1 && (
            <button
              type="button"
              className="lightbox-nav prev"
              onClick={() => go(-1)}
              aria-label="Предыдущая фотография"
            >
              <ChevronLeft size={26} />
            </button>
          )}

          <ArchiveImage
            // Keying by photo id forces a fresh element per photo so the
            // previous decoded bitmap can be released.
            key={current.photo.id || index}
            src={photoFullSrc(current.photo)}
            alt={
              current.photo.caption || current.title || 'Фотография наблюдения'
            }
            className="lightbox-image"
          />

          {total > 1 && (
            <button
              type="button"
              className="lightbox-nav next"
              onClick={() => go(1)}
              aria-label="Следующая фотография"
            >
              <ChevronRight size={26} />
            </button>
          )}
        </div>

        <div
          className="lightbox-footer"
          tabIndex={0}
          role="region"
          aria-label="Подпись и сведения о снимке"
        >
          {current.title && <h3 className="lightbox-title">{current.title}</h3>}
          {current.subtitle && (
            <p className="lightbox-subtitle">{current.subtitle}</p>
          )}
          {current.photo.caption && (
            <p className="lightbox-caption">{current.photo.caption}</p>
          )}
          <ExifRow exif={current.photo.exif} />
          {actions && <div className="lightbox-actions">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
