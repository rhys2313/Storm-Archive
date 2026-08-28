import React from 'react';
import { SEVERITY_LEVELS, getClassificationAttributeLabels, getClassificationLabel, getEventTypeInfo } from '../types/storm';
import { formatEventDateTime } from '../services/events';
import { photoPreviewSrc } from '../services/photos';
import { Calendar, MapPin, Image as ImageIcon, Eye, Edit2, Trash2 } from 'lucide-react';

const NOTES_PREVIEW_LIMIT = 160;
const VISIBLE_TAGS = 4;

function EventCard({ event, onView, onEdit, onDelete }) {
  const eventType = getEventTypeInfo(event);
  const classificationLabel = getClassificationLabel(event);
  const classificationAttributes = getClassificationAttributeLabels(event);
  const severity = SEVERITY_LEVELS[event.severity] || SEVERITY_LEVELS.moderate;

  const photos = Array.isArray(event.photos) ? event.photos : [];
  const cover = photos[0];
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const hiddenTagCount = Math.max(0, tags.length - VISIBLE_TAGS);

  const notesPreview = event.notes && event.notes.length > NOTES_PREVIEW_LIMIT
    ? `${event.notes.slice(0, NOTES_PREVIEW_LIMIT).trimEnd()}…`
    : event.notes;

  return (
    <article className={`event-card ${cover ? 'has-media' : 'text-only'}`}>
      {cover && (
        <button
          type="button"
          className="card-media-wrapper"
          onClick={() => onView(event)}
          aria-label={`Открыть наблюдение «${event.title}»`}
        >
          <img
            // The thumbnail keeps grids light even with hundreds of records.
            src={photoPreviewSrc(cover)}
            alt=""
            className="card-cover-image"
            loading="lazy"
            decoding="async"
          />
          <span className="media-badge">
            <ImageIcon size={13} aria-hidden="true" />
            <span>{photos.length}</span>
          </span>
        </button>
      )}

      <div className="card-content">
        <div className="card-header">
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

          <div className="card-quick-actions">
            <button type="button" className="icon-action-btn" onClick={() => onView(event)} title="Просмотр" aria-label="Просмотр">
              <Eye size={16} />
            </button>
            <button type="button" className="icon-action-btn" onClick={() => onEdit(event)} title="Редактировать" aria-label="Редактировать">
              <Edit2 size={16} />
            </button>
            <button type="button" className="icon-action-btn delete" onClick={() => onDelete(event.id)} title="Удалить" aria-label="Удалить">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <h3 className="card-title">
          <button type="button" className="card-title-btn" onClick={() => onView(event)}>{event.title}</button>
        </h3>

        {classificationAttributes.length > 0 && (
          <p className="classification-summary">{classificationAttributes.join(' · ')}</p>
        )}

        <div className="card-meta">
          <div className="meta-item">
            <Calendar size={14} className="meta-icon" aria-hidden="true" />
            <span>{formatEventDateTime(event)}</span>
          </div>
          {event.location && (
            <div className="meta-item">
              <MapPin size={14} className="meta-icon" aria-hidden="true" />
              <span className="truncate" title={event.location}>{event.location}</span>
            </div>
          )}
        </div>

        {notesPreview && <p className="card-notes-preview">{notesPreview}</p>}

        {tags.length > 0 && (
          <div className="card-tags">
            {tags.slice(0, VISIBLE_TAGS).map(tag => <span key={tag} className="tag-item">#{tag}</span>)}
            {hiddenTagCount > 0 && <span className="tag-item muted">+{hiddenTagCount}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

// Card content only depends on the event object, which is replaced wholesale on
// save. Memoising stops every card from re-rendering while the user types in the
// search box.
export default React.memo(EventCard);
