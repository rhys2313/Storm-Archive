import React, { useState } from 'react';
import { SEVERITY_LEVELS, getClassificationAttributeLabels, getClassificationLabel, getEventTypeInfo } from '../types/storm';
import { formatEventDateTime, formatCoordinates, hasCoordinates, parseDateValue } from '../services/events';
import { photoPreviewSrc } from '../services/photos';
import Modal from './Modal';
import PhotoLightbox from './PhotoLightbox';
import { Calendar, MapPin, Edit2, Trash2, Camera, Compass, Crosshair, Maximize2, FileText, Tag } from 'lucide-react';

export default function EventDetailModal({ event, onClose, onEdit, onDelete }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);

  if (!event) return null;

  const eventType = getEventTypeInfo(event);
  const classificationLabel = getClassificationLabel(event);
  const classificationAttributes = getClassificationAttributeLabels(event);
  const severity = SEVERITY_LEVELS[event.severity] || SEVERITY_LEVELS.moderate;
  const photos = Array.isArray(event.photos) ? event.photos : [];
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const addedAt = parseDateValue(event.createdAt);

  const lightboxItems = photos.map(photo => ({ photo, title: event.title, subtitle: event.location }));

  const header = (
    <div className="modal-title-area">
      <div className="badges-group">
        <span
          className="type-badge"
          style={{ backgroundColor: `${eventType.color}20`, color: eventType.color, borderColor: `${eventType.color}40` }}
        >
          <span className="badge-dot" style={{ backgroundColor: eventType.color }} />
          {classificationLabel}
        </span>
        <span className={`severity-badge ${severity.badgeClass}`}>{severity.label}</span>
      </div>
      <h2 id="detail-modal-title" className="detail-title">{event.title}</h2>
    </div>
  );

  const footer = (
    <>
      {addedAt && (
        <span className="footer-note">
          В архиве с {formatEventDateTime({ date: event.createdAt })}
        </span>
      )}
      <button type="button" className="btn-secondary" onClick={() => onEdit(event)}>
        <Edit2 size={16} aria-hidden="true" /> Редактировать
      </button>
      <button type="button" className="btn-danger" onClick={() => onDelete(event.id)}>
        <Trash2 size={16} aria-hidden="true" /> Удалить
      </button>
    </>
  );

  return (
    <>
      <Modal
        headerContent={header}
        onClose={onClose}
        footer={footer}
        className="detail-modal"
        size="wide"
        labelledBy="detail-modal-title"
      >
        <div className="detail-meta-grid">
          <div className="meta-card">
            <Calendar size={18} className="meta-icon" aria-hidden="true" />
            <div className="meta-card-body">
              <span className="meta-label">Дата и время наблюдения</span>
              <p className="meta-value">{formatEventDateTime(event, { long: true })}</p>
            </div>
          </div>

          {event.location && (
            <div className="meta-card">
              <MapPin size={18} className="meta-icon" aria-hidden="true" />
              <div className="meta-card-body">
                <span className="meta-label">Место наблюдения</span>
                <p className="meta-value">{event.location}</p>
              </div>
            </div>
          )}

          {/* Shown independently of the location, so coordinate-only records
              still expose their position. */}
          {hasCoordinates(event) && (
            <div className="meta-card">
              <Crosshair size={18} className="meta-icon" aria-hidden="true" />
              <div className="meta-card-body">
                <span className="meta-label">Координаты</span>
                <p className="meta-value mono">{formatCoordinates(event)}</p>
              </div>
            </div>
          )}
        </div>

        <section className="detail-section">
          <h4 className="section-subtitle"><Compass size={16} aria-hidden="true" /> Классификация явления</h4>
          <div className="classification-detail">
            <span className="classification-main">{classificationLabel}</span>
            {classificationAttributes.map(label => (
              <span key={label} className="classification-attribute">{label}</span>
            ))}
          </div>
        </section>

        {photos.length > 0 && (
          <section className="detail-section">
            <h4 className="section-subtitle">
              <Camera size={16} aria-hidden="true" /> Фотографии наблюдения ({photos.length})
            </h4>
            <ul className="photos-grid">
              {photos.map((photo, index) => (
                <li key={photo.id || index} className="photo-item">
                  <button
                    type="button"
                    className="photo-item-card"
                    onClick={() => setLightboxIndex(index)}
                    aria-label={`Открыть снимок ${index + 1} из ${photos.length}`}
                  >
                    <img
                      src={photoPreviewSrc(photo)}
                      alt={photo.caption || ''}
                      className="photo-thumb"
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="photo-overlay"><Maximize2 size={18} aria-hidden="true" /></span>
                    {photo.exif?.camera && <span className="photo-exif-tag">{photo.exif.camera}</span>}
                  </button>
                  {/* Captions sit outside the fixed-height frame, otherwise they
                      are clipped and never visible. */}
                  {photo.caption && <p className="photo-caption">{photo.caption}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {event.notes && (
          <section className="detail-section">
            <h4 className="section-subtitle"><FileText size={16} aria-hidden="true" /> Заметки и полевые описания</h4>
            <p className="detail-notes-text">{event.notes}</p>
          </section>
        )}

        {tags.length > 0 && (
          <section className="detail-section">
            <h4 className="section-subtitle"><Tag size={16} aria-hidden="true" /> Теги</h4>
            <div className="card-tags">
              {tags.map(tag => <span key={tag} className="tag-item">#{tag}</span>)}
            </div>
          </section>
        )}
      </Modal>

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <PhotoLightbox
          items={lightboxItems}
          index={lightboxIndex}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
