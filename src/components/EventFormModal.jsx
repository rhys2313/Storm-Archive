import React, { useState, useEffect } from 'react';
import { EVENT_TYPES, SEVERITY_LEVELS, HAZARDS } from '../types/storm';
import { parsePhotoMetadata } from '../services/exif';
import { X, Upload, Trash2, Camera, MapPin, Sparkles, AlertCircle } from 'lucide-react';

export default function EventFormModal({ eventToEdit, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [eventType, setEventType] = useState('thunderstorm');
  const [severity, setSeverity] = useState('moderate');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [selectedHazards, setSelectedHazards] = useState([]);
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [photos, setPhotos] = useState([]);

  // Meteorological parameters
  const [cape, setCape] = useState('');
  const [shear06, setShear06] = useState('');
  const [temperature, setTemperature] = useState('');
  const [dewPoint, setDewPoint] = useState('');
  const [pressure, setPressure] = useState('');
  const [windSpeed, setWindSpeed] = useState('');
  const [hailSize, setHailSize] = useState('');

  const [exifNotification, setExifNotification] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  useEffect(() => {
    if (eventToEdit) {
      setTitle(eventToEdit.title || '');
      setDate(eventToEdit.date || '');
      setEventType(eventToEdit.eventType || 'thunderstorm');
      setSeverity(eventToEdit.severity || 'moderate');
      setLocation(eventToEdit.location || '');
      setLatitude(eventToEdit.latitude !== undefined && eventToEdit.latitude !== null ? String(eventToEdit.latitude) : '');
      setLongitude(eventToEdit.longitude !== undefined && eventToEdit.longitude !== null ? String(eventToEdit.longitude) : '');
      setSelectedHazards(eventToEdit.hazards || []);
      setNotes(eventToEdit.notes || '');
      setTagsInput(eventToEdit.tags ? eventToEdit.tags.join(', ') : '');
      setPhotos(eventToEdit.photos || []);

      if (eventToEdit.parameters) {
        setCape(eventToEdit.parameters.cape || '');
        setShear06(eventToEdit.parameters.shear06 || '');
        setTemperature(eventToEdit.parameters.temperature || '');
        setDewPoint(eventToEdit.parameters.dewPoint || '');
        setPressure(eventToEdit.parameters.pressure || '');
        setWindSpeed(eventToEdit.parameters.windSpeed || '');
        setHailSize(eventToEdit.parameters.hailSize || '');
      }
    } else {
      // Default new date to current local datetime ISO
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setDate(now.toISOString().slice(0, 16));
    }
  }, [eventToEdit]);

  const handleHazardToggle = (hazardKey) => {
    setSelectedHazards(prev => 
      prev.includes(hazardKey) ? prev.filter(k => k !== hazardKey) : [...prev, hazardKey]
    );
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setIsProcessingPhoto(true);
    setExifNotification('');

    const newPhotos = [];
    let autoDate = null;
    let autoLat = null;
    let autoLng = null;

    for (const file of files) {
      const meta = await parsePhotoMetadata(file);

      if (meta.date && !date) autoDate = meta.date;
      if (meta.lat && !latitude) autoLat = meta.lat;
      if (meta.lng && !longitude) autoLng = meta.lng;

      const reader = new FileReader();
      const photoPromise = new Promise((resolve) => {
        reader.onload = (event) => {
          resolve({
            id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            url: event.target.result,
            caption: '',
            exif: meta.exif || {}
          });
        };
        reader.readAsDataURL(file);
      });

      const photoObj = await photoPromise;
      newPhotos.push(photoObj);
    }

    setPhotos(prev => [...prev, ...newPhotos]);
    setIsProcessingPhoto(false);

    let notices = [];
    if (autoDate) {
      setDate(autoDate);
      notices.push('дату сёмки');
    }
    if (autoLat && autoLng) {
      setLatitude(String(autoLat));
      setLongitude(String(autoLng));
      notices.push('GPS координаты');
    }

    if (notices.length > 0) {
      setExifNotification(`Извлечены данные EXIF: ${notices.join(', ')}.`);
      setTimeout(() => setExifNotification(''), 5000);
    }
  };

  const handleRemovePhoto = (photoId) => {
    setPhotos(prev => prev.filter(p => p.id !== photoId));
  };

  const handlePhotoCaptionChange = (photoId, caption) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption } : p));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Пожалуйста, укажите название явления');
      return;
    }

    const tagsArray = tagsInput
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    const eventData = {
      id: eventToEdit ? eventToEdit.id : 'evt_' + Date.now(),
      title: title.trim(),
      date,
      eventType,
      severity,
      location: location.trim(),
      latitude: latitude !== '' ? parseFloat(latitude) : null,
      longitude: longitude !== '' ? parseFloat(longitude) : null,
      hazards: selectedHazards,
      parameters: {
        cape: cape ? String(cape) : '',
        shear06: shear06 ? String(shear06) : '',
        temperature: temperature ? String(temperature) : '',
        dewPoint: dewPoint ? String(dewPoint) : '',
        pressure: pressure ? String(pressure) : '',
        windSpeed: windSpeed ? String(windSpeed) : '',
        hailSize: hailSize ? String(hailSize) : ''
      },
      notes: notes.trim(),
      tags: tagsArray,
      photos,
      createdAt: eventToEdit ? eventToEdit.createdAt : new Date().toISOString()
    };

    onSave(eventData);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{eventToEdit ? 'Редактирование метеонаблюдения' : 'Новое метеонаблюдение'}</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body scrollable-body">
          {exifNotification && (
            <div className="exif-alert">
              <Sparkles size={16} />
              <span>{exifNotification}</span>
            </div>
          )}

          {/* Title & Date */}
          <div className="form-grid-2">
            <div className="form-group span-2">
              <label className="form-label">
                Название явления <span className="req">*</span>
              </label>
              <input 
                type="text"
                placeholder="Например: Суперячейка с крупным градом и шельфовым облаком"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Дата и время явления</label>
              <input 
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Тип явления</label>
              <select 
                value={eventType} 
                onChange={(e) => setEventType(e.target.value)}
                className="form-select"
              >
                {Object.values(EVENT_TYPES).map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label className="form-label">Интенсивность / Опасность</label>
              <select 
                value={severity} 
                onChange={(e) => setSeverity(e.target.value)}
                className="form-select"
              >
                {Object.values(SEVERITY_LEVELS).map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Локация / Населённый пункт</label>
              <input 
                type="text"
                placeholder="Например: Нижегородская обл., г. Бор"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          {/* Map Coordinates */}
          <div className="form-group">
            <label className="form-label">
              Координаты на карте (широта, долгота)
            </label>
            <div className="form-grid-2">
              <input 
                type="number" 
                step="any"
                placeholder="Широта (Lat): 56.32688"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="form-input"
              />
              <input 
                type="number" 
                step="any"
                placeholder="Долгота (Lng): 44.00598"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          {/* Hazards */}
          <div className="form-group">
            <label className="form-label">Опасные явления и проявления</label>
            <div className="hazards-checkboxes">
              {Object.values(HAZARDS).map(h => {
                const checked = selectedHazards.includes(h.id);
                return (
                  <label key={h.id} className={`hazard-checkbox-label ${checked ? 'checked' : ''}`}>
                    <input 
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleHazardToggle(h.id)}
                      className="hidden-checkbox"
                    />
                    <span>{h.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Meteorological Parameters */}
          <div className="form-section-box">
            <h4 className="form-section-title">Метеорологические параметры (опционально)</h4>
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">CAPE (Дж/кг)</label>
                <input 
                  type="number" 
                  placeholder="2500" 
                  value={cape} 
                  onChange={(e) => setCape(e.target.value)} 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Сдвиг 0-6 км (м/с)</label>
                <input 
                  type="number" 
                  placeholder="22" 
                  value={shear06} 
                  onChange={(e) => setShear06(e.target.value)} 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Температура (°C)</label>
                <input 
                  type="number" 
                  placeholder="28" 
                  value={temperature} 
                  onChange={(e) => setTemperature(e.target.value)} 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Точка росы (°C)</label>
                <input 
                  type="number" 
                  placeholder="19" 
                  value={dewPoint} 
                  onChange={(e) => setDewPoint(e.target.value)} 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Давление (гПа)</label>
                <input 
                  type="number" 
                  placeholder="1012" 
                  value={pressure} 
                  onChange={(e) => setPressure(e.target.value)} 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Ветер / Шквал (м/с)</label>
                <input 
                  type="number" 
                  placeholder="25" 
                  value={windSpeed} 
                  onChange={(e) => setWindSpeed(e.target.value)} 
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Размер града (см)</label>
                <input 
                  type="number" 
                  step="0.5" 
                  placeholder="3.5" 
                  value={hailSize} 
                  onChange={(e) => setHailSize(e.target.value)} 
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Photo upload dropzone */}
          <div className="form-group">
            <label className="form-label">Фотоснимки наблюдения (извлечение EXIF метаданных)</label>

            <div className="upload-dropzone">
              <input 
                type="file" 
                accept="image/*" 
                multiple 
                onChange={handlePhotoUpload} 
                id="photo-upload-input" 
                className="hidden-file-input"
              />
              <label htmlFor="photo-upload-input" className="dropzone-label">
                <Upload size={24} className="upload-icon" />
                <span>Загрузить снимки наблюдения</span>
                <span className="dropzone-sub">
                  {isProcessingPhoto ? 'Обработка и чтение EXIF...' : 'JPG, PNG, WebP. Автоматическое чтение даты сёмки и GPS'}
                </span>
              </label>
            </div>

            {/* Photos Preview list */}
            {photos.length > 0 && (
              <div className="form-photos-list">
                {photos.map((photo) => (
                  <div key={photo.id} className="form-photo-row">
                    <img src={photo.url} alt="Preview" className="form-photo-thumb" />
                    <input 
                      type="text" 
                      placeholder="Подпись к фото..." 
                      value={photo.caption || ''} 
                      onChange={(e) => handlePhotoCaptionChange(photo.id, e.target.value)} 
                      className="form-input caption-input"
                    />
                    <button 
                      type="button" 
                      className="icon-action-btn delete" 
                      onClick={() => handleRemovePhoto(photo.id)}
                      title="Удалить фото"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="form-group">
            <label className="form-label">Заметки, структура и полевые наблюдения</label>
            <textarea 
              rows={4}
              placeholder="Подробное описание: движение ячейки, ворот, град, разрушения, метеорадарные особенности..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="form-textarea"
            />
          </div>

          {/* Tags */}
          <div className="form-group">
            <label className="form-label">Теги (через запятую)</label>
            <input 
              type="text"
              placeholder="Шельф, Град, Мезоциклон, Ночная_гроза"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="form-input"
            />
          </div>

          <div className="form-actions-row">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn-primary">
              {eventToEdit ? 'Сохранить изменения' : 'Сохранить в архив'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
