import React, { useCallback, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Camera, Aperture, Timer, Ruler, Sun } from 'lucide-react';
import { useModalLayer } from '../hooks/useModalLayer';
import { photoFullSrc } from '../services/photos';

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
export default function PhotoLightbox({ items, index, onNavigate, onClose, actions }) {
  const { dialogRef, handleBackdropClick } = useModalLayer(onClose);
  const total = items.length;
  const current = items[index];

  const go = useCallback((delta) => {
    if (total < 2) return;
    onNavigate((index + delta + total) % total);
  }, [index, total, onNavigate]);

  useEffect(() => {
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
  }, [go]);

  // Horizontal swipe navigation for Android.
  const touchStart = useRef(null);
  const handleTouchStart = (event) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="lightbox-topbar">
          {total > 1 && <span className="lightbox-counter">{index + 1} / {total}</span>}
          <button type="button" className="close-btn lightbox-close" onClick={onClose} aria-label="Закрыть просмотр">
            <X size={22} />
          </button>
        </div>

        <div className="lightbox-stage">
          {total > 1 && (
            <button type="button" className="lightbox-nav prev" onClick={() => go(-1)} aria-label="Предыдущая фотография">
              <ChevronLeft size={26} />
            </button>
          )}

          <img
            // Keying by photo id forces a fresh element per photo so the
            // previous decoded bitmap can be released.
            key={current.photo.id || index}
            src={photoFullSrc(current.photo)}
            alt={current.photo.caption || current.title || 'Фотография наблюдения'}
            className="lightbox-image"
          />

          {total > 1 && (
            <button type="button" className="lightbox-nav next" onClick={() => go(1)} aria-label="Следующая фотография">
              <ChevronRight size={26} />
            </button>
          )}
        </div>

        <div className="lightbox-footer">
          {current.title && <h3 className="lightbox-title">{current.title}</h3>}
          {current.subtitle && <p className="lightbox-subtitle">{current.subtitle}</p>}
          {current.photo.caption && <p className="lightbox-caption">{current.photo.caption}</p>}
          <ExifRow exif={current.photo.exif} />
          {actions && <div className="lightbox-actions">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
