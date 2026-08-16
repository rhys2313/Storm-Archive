import React from 'react';
import { EVENT_TYPES, SEVERITY_LEVELS, HAZARDS } from '../types/storm';
import { Calendar, MapPin, Tag, Image as ImageIcon, Zap, Eye, Edit2, Trash2, Gauge, Wind, Thermometer } from 'lucide-react';

export default function EventCard({ event, onView, onEdit, onDelete }) {
  const eventType = EVENT_TYPES[event.eventType] || EVENT_TYPES.other;
  const severity = SEVERITY_LEVELS[event.severity] || SEVERITY_LEVELS.moderate;
  const hasPhotos = event.photos && event.photos.length > 0;

  const formattedDate = event.date 
    ? new Date(event.date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Дата не указана';

  return (
    <div className={`event-card ${hasPhotos ? 'has-media' : 'text-only'}`}>
      {/* Show cover image ONLY if uploaded by user */}
      {hasPhotos && (
        <div className="card-media-wrapper" onClick={() => onView(event)}>
          <img 
            src={event.photos[0].url} 
            alt={event.photos[0].caption || event.title} 
            className="card-cover-image" 
            loading="lazy" 
          />
          <div className="media-badge">
            <ImageIcon size={13} />
            <span>{event.photos.length}</span>
          </div>
        </div>
      )}

      <div className="card-content">
        <div className="card-header">
          <div className="badges-group">
            <span 
              className="type-badge" 
              style={{ backgroundColor: `${eventType.color}20`, color: eventType.color, borderColor: `${eventType.color}40` }}
            >
              <span className="badge-dot" style={{ backgroundColor: eventType.color }}></span>
              {eventType.label}
            </span>

            <span className={`severity-badge ${severity.badgeClass}`}>
              {severity.label}
            </span>
          </div>

          <div className="card-quick-actions">
            <button className="icon-action-btn" onClick={() => onView(event)} title="Просмотр">
              <Eye size={16} />
            </button>
            <button className="icon-action-btn" onClick={() => onEdit(event)} title="Редактировать">
              <Edit2 size={16} />
            </button>
            <button className="icon-action-btn delete" onClick={() => onDelete(event.id)} title="Удалить">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <h3 className="card-title" onClick={() => onView(event)}>
          {event.title}
        </h3>

        <div className="card-meta">
          <div className="meta-item">
            <Calendar size={14} className="meta-icon" />
            <span>{formattedDate}</span>
          </div>
          {event.location && (
            <div className="meta-item">
              <MapPin size={14} className="meta-icon" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
        </div>

        {/* Hazards badges */}
        {event.hazards && event.hazards.length > 0 && (
          <div className="hazards-chips">
            {event.hazards.map(hKey => {
              const hazard = HAZARDS[hKey];
              if (!hazard) return null;
              return (
                <span key={hKey} className="hazard-chip" title={hazard.label}>
                  <Zap size={11} />
                  <span>{hazard.label}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Parameters snippet if present */}
        {event.parameters && (event.parameters.cape || event.parameters.windSpeed || event.parameters.temperature) && (
          <div className="parameters-strip">
            {event.parameters.cape && (
              <span className="param-item" title="Энергия неустойчивости CAPE">
                <Gauge size={12} /> {event.parameters.cape} J/kg
              </span>
            )}
            {event.parameters.windSpeed && (
              <span className="param-item" title="Скорость ветра">
                <Wind size={12} /> {event.parameters.windSpeed} m/s
              </span>
            )}
            {event.parameters.temperature && (
              <span className="param-item" title="Температура">
                <Thermometer size={12} /> {event.parameters.temperature}°C
              </span>
            )}
          </div>
        )}

        {/* Notes preview */}
        {event.notes && (
          <p className="card-notes-preview">
            {event.notes.length > 140 ? `${event.notes.slice(0, 140)}...` : event.notes}
          </p>
        )}

        {/* Tags */}
        {event.tags && event.tags.length > 0 && (
          <div className="card-tags">
            {event.tags.map((tag, idx) => (
              <span key={idx} className="tag-item">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
