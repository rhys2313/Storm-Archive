import { useState } from 'react';
import {
  SEVERITY_LEVELS,
  getClassificationAttributeLabels,
  getClassificationLabel,
  getEventTypeInfo
} from '../types/storm';
import {
  formatEventDateTime,
  formatCoordinates,
  hasCoordinates,
  parseDateValue
} from '../services/events';
import { photoPreviewSrc } from '../services/photos';
import Modal from './Modal';
import PhotoLightbox from './PhotoLightbox';
import ArchiveImage from './ArchiveImage';
import Presence from './Presence';
import {
  MapPin,
  Edit2,
  Trash2,
  Camera,
  Crosshair,
  Maximize2
} from 'lucide-react';

export default function EventDetailModal({ event, onClose, onEdit, onDelete }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  if (!event) return null;
  const type = getEventTypeInfo(event);
  const classification = getClassificationLabel(event);
  const attributes = getClassificationAttributeLabels(event);
  const severity = SEVERITY_LEVELS[event.severity] || SEVERITY_LEVELS.moderate;
  const photos = Array.isArray(event.photos) ? event.photos : [];
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const addedAt = parseDateValue(event.createdAt);
  return (
    <>
      <Modal
        headerContent={<span className="modal-heading">Наблюдение</span>}
        onClose={onClose}
        className="detail-modal"
        size="wide"
        labelledBy="detail-modal-title"
        footer={
          <>
            {addedAt && (
              <span className="footer-note">
                В архиве с {formatEventDateTime({ date: event.createdAt })}
              </span>
            )}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onEdit(event)}
            >
              <Edit2 size={16} aria-hidden="true" />
              Редактировать
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => onDelete(event.id)}
            >
              <Trash2 size={16} aria-hidden="true" />
              Удалить
            </button>
          </>
        }
      >
        <article className="detail-document">
          <div className="detail-dateline">
            <time dateTime={event.date || undefined}>
              {formatEventDateTime(event, { long: true })}
            </time>
            <span className={`severity-badge ${severity.badgeClass}`}>
              {severity.label}
            </span>
          </div>
          <h2 id="detail-modal-title" className="detail-title">
            {event.title}
          </h2>
          <div className="classification-detail">
            <span className="type-badge">
              <span
                className="badge-dot"
                style={{ backgroundColor: type.color }}
              />
              {classification}
            </span>
            {attributes.map((label) => (
              <span key={label} className="classification-attribute">
                {label}
              </span>
            ))}
          </div>
          {(event.location || hasCoordinates(event)) && (
            <dl className="detail-facts">
              {event.location && (
                <div>
                  <dt>
                    <MapPin size={16} aria-hidden="true" />
                    Место наблюдения
                  </dt>
                  <dd>{event.location}</dd>
                </div>
              )}
              {hasCoordinates(event) && (
                <div>
                  <dt>
                    <Crosshair size={16} aria-hidden="true" />
                    Координаты
                  </dt>
                  <dd className="mono">{formatCoordinates(event)}</dd>
                </div>
              )}
            </dl>
          )}
          {photos.length > 0 && (
            <section className="detail-section">
              <h3 className="section-subtitle">
                <Camera size={17} aria-hidden="true" />
                Фотографии наблюдения ({photos.length})
              </h3>
              <ul className="photos-grid detail-photo-grid">
                {photos.map((photo, index) => (
                  <li
                    key={photo.id || index}
                    className={`photo-item ${index === 0 ? 'lead-photo' : ''}`}
                  >
                    <button
                      type="button"
                      className="photo-item-card"
                      onClick={() => setLightboxIndex(index)}
                      aria-label={`Открыть снимок ${index + 1} из ${photos.length}`}
                    >
                      <ArchiveImage
                        src={photoPreviewSrc(photo)}
                        alt={photo.caption || ''}
                        className="photo-thumb"
                        loading="lazy"
                        decoding="async"
                      />
                      <span className="photo-overlay">
                        <Maximize2 size={18} aria-hidden="true" />
                      </span>
                      {photo.exif?.camera && (
                        <span className="photo-exif-tag">
                          {photo.exif.camera}
                        </span>
                      )}
                    </button>
                    {photo.caption && (
                      <p className="photo-caption">{photo.caption}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {event.notes && (
            <section className="detail-section">
              <h3 className="section-subtitle">Полевые заметки</h3>
              <p className="detail-notes-text">{event.notes}</p>
            </section>
          )}
          {tags.length > 0 && (
            <section className="detail-section detail-tag-section">
              <h3 className="section-subtitle">Теги</h3>
              <div className="card-tags">
                {tags.map((tag) => (
                  <span key={tag} className="tag-item">
                    #{tag}
                  </span>
                ))}
              </div>
            </section>
          )}
        </article>
      </Modal>
      <Presence
        visible={lightboxIndex !== null && Boolean(photos[lightboxIndex])}
      >
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <PhotoLightbox
            items={photos.map((photo) => ({
              photo,
              title: event.title,
              subtitle: event.location
            }))}
            index={lightboxIndex}
            onNavigate={setLightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </Presence>
    </>
  );
}
