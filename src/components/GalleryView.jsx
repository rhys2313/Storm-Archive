import React, { useState } from 'react';
import { EVENT_CATEGORIES, getClassificationLabel, getEventClassification, getEventTypeInfo } from '../types/storm';
import { Image as ImageIcon, Camera, Calendar, MapPin, X, ExternalLink, Filter } from 'lucide-react';

export default function GalleryView({ events, onViewEvent, onOpenAddModal }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');

  // Gather all photos from events
  const allPhotos = [];
  events.forEach(evt => {
    if (evt.photos && evt.photos.length > 0) {
      evt.photos.forEach((photo, idx) => {
        allPhotos.push({
          ...photo,
          eventId: evt.id,
          eventTitle: evt.title,
          eventDate: evt.date,
          eventLocation: evt.location,
          category: getEventClassification(evt).category,
          classificationLabel: getClassificationLabel(evt),
          photoIndex: idx,
          fullEvent: evt
        });
      });
    }
  });

  const filteredPhotos = typeFilter 
    ? allPhotos.filter(p => p.category === typeFilter)
    : allPhotos;

  return (
    <div className="gallery-view-container">
      <div className="gallery-toolbar">
        <div className="gallery-info">
          <Camera size={18} />
          <span>Всего фотоснимков в архиве: <strong>{allPhotos.length}</strong></span>
        </div>

        {allPhotos.length > 0 && (
          <div className="select-wrapper">
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">Все группы</option>
              {Object.values(EVENT_CATEGORIES).map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {allPhotos.length === 0 ? (
        <div className="empty-state-card">
          <div className="empty-icon-wrapper">
            <ImageIcon size={32} />
          </div>
          <h3>Галерея пуста</h3>
          <p>В вашем архиве пока нет добавленных снимков. Фотографии из всех созданных метеонаблюдений будут автоматически отображаться здесь.</p>
          <button className="btn-primary" onClick={onOpenAddModal}>
            Добавить метеонаблюдение
          </button>
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="empty-state-card">
          <p>Нет фотографий, соответствующих выбранной категории.</p>
          <button className="btn-secondary" onClick={() => setTypeFilter('')}>
            Сбросить фильтр
          </button>
        </div>
      ) : (
        <div className="gallery-grid">
          {filteredPhotos.map((photo, i) => {
            const eventType = getEventTypeInfo(photo.fullEvent);
            const formattedDate = photo.eventDate ? new Date(photo.eventDate).toLocaleDateString('ru-RU') : '';

            return (
              <div key={photo.id || i} className="gallery-card" onClick={() => setSelectedPhoto(photo)}>
                <div className="gallery-image-wrapper">
                  <img src={photo.url} alt={photo.caption || photo.eventTitle} className="gallery-img" loading="lazy" />
                  <div className="gallery-badge" style={{ backgroundColor: eventType.color }}>
                    {photo.classificationLabel}
                  </div>
                </div>

                <div className="gallery-card-body">
                  <h4 className="gallery-card-title">{photo.eventTitle}</h4>
                  <div className="gallery-card-meta">
                    {formattedDate && <span><Calendar size={12} /> {formattedDate}</span>}
                    {photo.eventLocation && <span><MapPin size={12} /> {photo.eventLocation}</span>}
                  </div>
                  {photo.caption && <p className="gallery-caption">{photo.caption}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div className="lightbox-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn lightbox-close" onClick={() => setSelectedPhoto(null)}>
              <X size={24} />
            </button>
            <img src={selectedPhoto.url} alt="Full size" className="lightbox-image" />

            <div className="lightbox-footer">
              <div className="lightbox-info-main">
                <h3>{selectedPhoto.eventTitle}</h3>
                {selectedPhoto.caption && <p>{selectedPhoto.caption}</p>}
              </div>

              {selectedPhoto.exif && (
                <div className="lightbox-exif-info">
                  {selectedPhoto.exif.camera && <span>📷 {selectedPhoto.exif.camera}</span>}
                  {selectedPhoto.exif.focalLength && <span>📐 {selectedPhoto.exif.focalLength}</span>}
                  {selectedPhoto.exif.iso && <span>💡 {selectedPhoto.exif.iso}</span>}
                  {selectedPhoto.exif.aperture && <span>⭕ {selectedPhoto.exif.aperture}</span>}
                  {selectedPhoto.exif.exposure && <span>⏱ {selectedPhoto.exif.exposure}</span>}
                </div>
              )}

              <button 
                className="btn-primary view-event-btn" 
                onClick={() => {
                  const evt = selectedPhoto.fullEvent;
                  setSelectedPhoto(null);
                  onViewEvent(evt);
                }}
              >
                <ExternalLink size={16} /> Перейти к событию
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
