import React, { useState } from 'react';
import { EVENT_TYPES, SEVERITY_LEVELS, HAZARDS } from '../types/storm';
import { X, Calendar, MapPin, Edit2, Trash2, Zap, Gauge, Wind, Thermometer, Droplets, Camera, Compass, Tag, Maximize2 } from 'lucide-react';

export default function EventDetailModal({ event, onClose, onEdit, onDelete }) {
  const [activePhotoIdx, setActivePhotoModalIdx] = useState(null);

  if (!event) return null;

  const eventType = EVENT_TYPES[event.eventType] || EVENT_TYPES.other;
  const severity = SEVERITY_LEVELS[event.severity] || SEVERITY_LEVELS.moderate;

  const formattedDate = event.date 
    ? new Date(event.date).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'long'
      })
    : 'Дата не указана';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-area">
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
            <h2 className="detail-title">{event.title}</h2>
          </div>

          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body scrollable-body">
          {/* Metadata bar */}
          <div className="detail-meta-grid">
            <div className="meta-card">
              <Calendar size={18} className="meta-icon" />
              <div>
                <span className="meta-label">Дата и время</span>
                <p className="meta-value">{formattedDate}</p>
              </div>
            </div>

            {event.location && (
              <div className="meta-card">
                <MapPin size={18} className="meta-icon" />
                <div>
                  <span className="meta-label">Место наблюдения</span>
                  <p className="meta-value">{event.location}</p>
                  {event.latitude && event.longitude && (
                    <span className="meta-sub">
                      GPS: {event.latitude}, {event.longitude}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Photos Gallery */}
          {event.photos && event.photos.length > 0 && (
            <div className="detail-section">
              <h4 className="section-subtitle">
                <Camera size={16} /> Фотографии наблюдения ({event.photos.length})
              </h4>
              <div className="photos-grid">
                {event.photos.map((photo, idx) => (
                  <div key={photo.id || idx} className="photo-item-card" onClick={() => setActivePhotoModalIdx(idx)}>
                    <img src={photo.url} alt={photo.caption || event.title} className="photo-thumb" />
                    <div className="photo-overlay">
                      <Maximize2 size={18} />
                    </div>
                    {photo.caption && <p className="photo-caption">{photo.caption}</p>}
                    {photo.exif && photo.exif.camera && (
                      <span className="photo-exif-tag">{photo.exif.camera}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hazards */}
          {event.hazards && event.hazards.length > 0 && (
            <div className="detail-section">
              <h4 className="section-subtitle">
                <Zap size={16} /> Сопутствующие опасные явления
              </h4>
              <div className="hazards-chips">
                {event.hazards.map(hKey => {
                  const hazard = HAZARDS[hKey];
                  if (!hazard) return null;
                  return (
                    <span key={hKey} className="hazard-chip large">
                      <Zap size={14} />
                      <span>{hazard.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meteorological Parameters */}
          {event.parameters && Object.values(event.parameters).some(v => v !== '' && v !== null && v !== undefined) && (
            <div className="detail-section">
              <h4 className="section-subtitle">
                <Gauge size={16} /> Метеорологические параметры
              </h4>
              <div className="parameters-grid">
                {event.parameters.cape && (
                  <div className="param-card">
                    <span className="param-label">CAPE (Энергия)</span>
                    <span className="param-value">{event.parameters.cape} J/kg</span>
                  </div>
                )}
                {event.parameters.shear06 && (
                  <div className="param-card">
                    <span className="param-label">Сдвиг ветра 0-6 км</span>
                    <span className="param-value">{event.parameters.shear06} m/s</span>
                  </div>
                )}
                {event.parameters.temperature && (
                  <div className="param-card">
                    <span className="param-label">Температура воздуха</span>
                    <span className="param-value">{event.parameters.temperature} °C</span>
                  </div>
                )}
                {event.parameters.dewPoint && (
                  <div className="param-card">
                    <span className="param-label">Точка росы</span>
                    <span className="param-value">{event.parameters.dewPoint} °C</span>
                  </div>
                )}
                {event.parameters.pressure && (
                  <div className="param-card">
                    <span className="param-label">Давление</span>
                    <span className="param-value">{event.parameters.pressure} hPa</span>
                  </div>
                )}
                {event.parameters.windSpeed && (
                  <div className="param-card">
                    <span className="param-label">Скорость ветра / Шквал</span>
                    <span className="param-value">{event.parameters.windSpeed} m/s</span>
                  </div>
                )}
                {event.parameters.hailSize && (
                  <div className="param-card">
                    <span className="param-label">Размер града</span>
                    <span className="param-value">{event.parameters.hailSize} cm</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <div className="detail-section">
              <h4 className="section-subtitle">Заметки и полевые описания</h4>
              <p className="detail-notes-text">{event.notes}</p>
            </div>
          )}

          {/* Tags */}
          {event.tags && event.tags.length > 0 && (
            <div className="detail-section">
              <div className="card-tags">
                {event.tags.map((tag, idx) => (
                  <span key={idx} className="tag-item">#{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={() => onEdit(event)}>
            <Edit2 size={16} /> Редактировать
          </button>
          <button className="btn-danger" onClick={() => onDelete(event.id)}>
            <Trash2 size={16} /> Удалить
          </button>
        </div>
      </div>

      {/* Lightbox for photo modal */}
      {activePhotoIdx !== null && event.photos[activePhotoIdx] && (
        <div className="lightbox-backdrop" onClick={() => setActivePhotoModalIdx(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn lightbox-close" onClick={() => setActivePhotoModalIdx(null)}>
              <X size={24} />
            </button>
            <img src={event.photos[activePhotoIdx].url} alt="Full view" className="lightbox-image" />
            <div className="lightbox-meta">
              {event.photos[activePhotoIdx].caption && (
                <p className="lightbox-caption">{event.photos[activePhotoIdx].caption}</p>
              )}
              {event.photos[activePhotoIdx].exif && (
                <div className="lightbox-exif-info">
                  {event.photos[activePhotoIdx].exif.camera && (
                    <span>📷 {event.photos[activePhotoIdx].exif.camera}</span>
                  )}
                  {event.photos[activePhotoIdx].exif.focalLength && (
                    <span>📐 {event.photos[activePhotoIdx].exif.focalLength}</span>
                  )}
                  {event.photos[activePhotoIdx].exif.iso && (
                    <span>💡 {event.photos[activePhotoIdx].exif.iso}</span>
                  )}
                  {event.photos[activePhotoIdx].exif.aperture && (
                    <span>⭕ {event.photos[activePhotoIdx].exif.aperture}</span>
                  )}
                  {event.photos[activePhotoIdx].exif.exposure && (
                    <span>⏱ {event.photos[activePhotoIdx].exif.exposure}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
