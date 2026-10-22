import React, { useId } from 'react';
import ArchiveImage from './ArchiveImage';
import {
  SEVERITY_LEVELS,
  getClassificationAttributeLabels,
  getClassificationLabel,
  getEventTypeInfo
} from '../types/storm';
import { formatEventDateTime, parseDateValue } from '../services/events';
import { photoPreviewSrc } from '../services/photos';
import {
  MapPin,
  Image as ImageIcon,
  Edit2,
  Trash2,
  ArrowUpRight
} from 'lucide-react';

function EventCard({ event, onView, onEdit, onDelete }) {
  const titleId = useId();
  const eventType = getEventTypeInfo(event);
  const classificationLabel = getClassificationLabel(event);
  const attributes = getClassificationAttributeLabels(event);
  const severity = SEVERITY_LEVELS[event.severity] || SEVERITY_LEVELS.moderate;
  const photos = Array.isArray(event.photos) ? event.photos : [];
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const date = parseDateValue(event.date);
  const notes =
    event.notes?.length > 160
      ? event.notes.slice(0, 160).trimEnd() + '…'
      : event.notes;
  return (
    <article
      className={`event-card ${photos[0] ? 'has-media' : 'text-only'}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (!e.target.closest('button, a, input')) onView(event);
      }}
    >
      {photos[0] && (
        <button
          type="button"
          className="card-media-wrapper"
          onClick={() => onView(event)}
          aria-label={`Открыть наблюдение «${event.title}»`}
        >
          <ArchiveImage
            src={photoPreviewSrc(photos[0])}
            alt=""
            className="card-cover-image"
            loading="lazy"
            decoding="async"
          />
          <span className="media-badge">
            <ImageIcon size={14} aria-hidden="true" />
            {photos.length}
          </span>
          <span className="card-media-open">
            <ArrowUpRight size={20} aria-hidden="true" />
          </span>
        </button>
      )}
      <div className="card-date-stamp" aria-hidden="true">
        <strong>{date ? String(date.getDate()).padStart(2, '0') : '—'}</strong>
        <span>
          {date
            ? date.toLocaleDateString('ru-RU', { month: 'short' })
            : 'без даты'}
        </span>
        {date && <small>{date.getFullYear()}</small>}
      </div>
      <div className="card-content">
        <div className="card-intro">
          <div className="card-header">
            <div className="badges-group">
              <span className="type-badge">
                <span
                  className="badge-dot"
                  style={{ backgroundColor: eventType.color }}
                />
                {classificationLabel}
              </span>
              <span className={`severity-badge ${severity.badgeClass}`}>
                {severity.label}
              </span>
            </div>
          </div>
          <h2 className="card-title" id={titleId}>
            <button
              type="button"
              className="card-title-btn"
              onClick={() => onView(event)}
            >
              {event.title}
            </button>
          </h2>
        </div>
        {attributes.length > 0 && (
          <p className="classification-summary">{attributes.join(' · ')}</p>
        )}
        {notes && <p className="card-notes-preview">{notes}</p>}
        <div className="card-meta">
          <time
            dateTime={event.date || undefined}
            aria-label={formatEventDateTime(event)}
          >
            <span className="card-meta-date">{formatEventDateTime(event)}</span>
            <span className="card-meta-time" aria-hidden="true">
              {date
                ? date.toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Без даты'}
            </span>
          </time>
          {event.location && (
            <span className="meta-item">
              <MapPin size={14} aria-hidden="true" />
              <span className="truncate" title={event.location}>
                {event.location}
              </span>
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="card-tags">
            {tags.slice(0, 4).map((tag) => (
              <span key={tag} className="tag-item">
                #{tag}
              </span>
            ))}
            {tags.length > 4 && (
              <span className="tag-item muted">+{tags.length - 4}</span>
            )}
          </div>
        )}
      </div>
      <div className="card-quick-actions">
        <button
          type="button"
          className="icon-action-btn"
          onClick={() => onEdit(event)}
          title="Редактировать"
          aria-label="Редактировать"
          aria-describedby={titleId}
        >
          <Edit2 size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-action-btn delete"
          onClick={() => onDelete(event.id)}
          title="Удалить"
          aria-label="Удалить"
          aria-describedby={titleId}
        >
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
export default React.memo(EventCard);
