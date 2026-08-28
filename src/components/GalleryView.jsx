import React, { useEffect, useMemo, useState } from 'react';
import { EVENT_CATEGORIES } from '../types/storm';
import { collectArchivePhotos, formatEventDateShort } from '../services/events';
import { photoPreviewSrc } from '../services/photos';
import PhotoLightbox from './PhotoLightbox';
import { Image as ImageIcon, Camera, Calendar, MapPin, ExternalLink } from 'lucide-react';

export default function GalleryView({ events, onViewEvent, onOpenAddModal }) {
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState(null);

  // Rebuilding this on every render was flattening the whole archive on each
  // keystroke elsewhere in the app.
  const allPhotos = useMemo(() => collectArchivePhotos(events), [events]);

  const visiblePhotos = useMemo(
    () => (categoryFilter ? allPhotos.filter(item => item.category === categoryFilter) : allPhotos),
    [allPhotos, categoryFilter]
  );

  // Deleting an event or changing the filter must not leave the lightbox
  // pointing at an index that no longer exists.
  useEffect(() => {
    if (lightboxIndex !== null && lightboxIndex >= visiblePhotos.length) setLightboxIndex(null);
  }, [visiblePhotos.length, lightboxIndex]);

  const usedCategories = useMemo(() => new Set(allPhotos.map(item => item.category)), [allPhotos]);

  const lightboxItems = useMemo(
    () => visiblePhotos.map(item => ({
      photo: item.photo,
      title: item.eventTitle,
      subtitle: [formatEventDateShort({ date: item.eventDate }), item.eventLocation].filter(Boolean).join(' · ')
    })),
    [visiblePhotos]
  );

  const activeItem = lightboxIndex !== null ? visiblePhotos[lightboxIndex] : null;

  return (
    <div className="gallery-view-container">
      <div className="view-toolbar">
        <div className="toolbar-info">
          <Camera size={18} aria-hidden="true" />
          <span>Всего снимков в архиве: <strong>{allPhotos.length}</strong></span>
          {categoryFilter && <span className="toolbar-sub">показано: {visiblePhotos.length}</span>}
        </div>

        {allPhotos.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="filter-select"
            aria-label="Фильтр по группе явлений"
          >
            <option value="">Все группы</option>
            {Object.values(EVENT_CATEGORIES)
              .filter(category => usedCategories.has(category.id))
              .map(category => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        )}
      </div>

      {allPhotos.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrapper"><ImageIcon size={32} aria-hidden="true" /></div>
          <h3>Галерея пуста</h3>
          <p>Снимки из всех наблюдений появляются здесь автоматически. Добавьте фотографии к записи, чтобы заполнить галерею.</p>
          <button type="button" className="btn-primary" onClick={onOpenAddModal}>Добавить наблюдение</button>
        </div>
      ) : visiblePhotos.length === 0 ? (
        <div className="empty-state-card">
          <h3>Ничего не найдено</h3>
          <p>В выбранной группе явлений снимков нет.</p>
          <button type="button" className="btn-secondary" onClick={() => setCategoryFilter('')}>Сбросить фильтр</button>
        </div>
      ) : (
        <ul className="gallery-grid">
          {visiblePhotos.map((item, index) => {
            const typeInfo = EVENT_CATEGORIES[item.category] || EVENT_CATEGORIES.other;
            const formattedDate = formatEventDateShort({ date: item.eventDate });

            return (
              <li key={item.key}>
                <button type="button" className="gallery-card" onClick={() => setLightboxIndex(index)}>
                  <span className="gallery-image-wrapper">
                    <img
                      src={photoPreviewSrc(item.photo)}
                      alt={item.photo.caption || item.eventTitle}
                      className="gallery-img"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="gallery-badge" style={{ backgroundColor: typeInfo.color }}>{typeInfo.label}</span>
                  </span>

                  <span className="gallery-card-body">
                    <span className="gallery-card-title">{item.eventTitle}</span>
                    <span className="gallery-card-meta">
                      {formattedDate && (
                        <span className="meta-chip"><Calendar size={12} aria-hidden="true" /> {formattedDate}</span>
                      )}
                      {item.eventLocation && (
                        <span className="meta-chip truncate"><MapPin size={12} aria-hidden="true" /> {item.eventLocation}</span>
                      )}
                    </span>
                    {item.photo.caption && <span className="gallery-caption">{item.photo.caption}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeItem && (
        <PhotoLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          actions={(
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const event = events.find(candidate => candidate.id === activeItem.eventId);
                setLightboxIndex(null);
                if (event) onViewEvent(event);
              }}
            >
              <ExternalLink size={16} aria-hidden="true" /> Перейти к наблюдению
            </button>
          )}
        />
      )}
    </div>
  );
}
