import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EVENT_CATEGORIES,
  SEVERITY_LEVELS,
  MCS_STRUCTURAL_FEATURES,
  HAIL_SIZE_CLASSES,
  SQUALL_INTENSITIES,
  TORNADO_ORIGINS,
  TORNADO_INTENSITIES,
  getEventClassification,
  normalizeClassification
} from '../types/storm';
import { parsePhotoMetadata, toDateTimeLocalValue } from '../services/exif';
import { preparePhotoFromFile, photoPreviewSrc } from '../services/photos';
import { isValidLatitude, isValidLongitude, parseCoordinateInput } from '../services/events';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { Upload, Trash2, Sparkles, AlertCircle, Loader2, CloudLightning } from 'lucide-react';

let photoCounter = 0;
const createPhotoId = () => {
  photoCounter += 1;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `photo_${crypto.randomUUID()}`;
  }
  return `photo_${Date.now()}_${photoCounter}_${Math.random().toString(36).slice(2, 8)}`;
};

const createEventId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `evt_${crypto.randomUUID()}`;
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const buildInitialState = (eventToEdit) => {
  if (eventToEdit) {
    const classification = getEventClassification(eventToEdit);
    return {
      title: eventToEdit.title || '',
      date: eventToEdit.date || '',
      category: classification.category,
      subtype: classification.subtype,
      attributes: classification.attributes,
      severity: SEVERITY_LEVELS[eventToEdit.severity] ? eventToEdit.severity : 'moderate',
      location: eventToEdit.location || '',
      // Coordinates live in the form as strings so a half-typed value such as
      // "-" or "56." does not get thrown away while the user is still typing.
      latitude: typeof eventToEdit.latitude === 'number' ? String(eventToEdit.latitude) : '',
      longitude: typeof eventToEdit.longitude === 'number' ? String(eventToEdit.longitude) : '',
      notes: eventToEdit.notes || '',
      tagsInput: Array.isArray(eventToEdit.tags) ? eventToEdit.tags.join(', ') : '',
      photos: Array.isArray(eventToEdit.photos) ? eventToEdit.photos : []
    };
  }

  const classification = normalizeClassification({ category: 'thunderstorm', subtype: 'unspecified' });
  return {
    title: '',
    date: toDateTimeLocalValue(new Date()) || '',
    category: classification.category,
    subtype: classification.subtype,
    attributes: classification.attributes,
    severity: 'moderate',
    location: '',
    latitude: '',
    longitude: '',
    notes: '',
    tagsInput: '',
    photos: []
  };
};

export default function EventFormModal({ eventToEdit, onClose, onSave }) {
  const initialState = useMemo(() => buildInitialState(eventToEdit), [eventToEdit]);
  const [form, setForm] = useState(initialState);

  const [exifNotice, setExifNotice] = useState('');
  const [photoProgress, setPhotoProgress] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Set once the user edits the date by hand, so EXIF never overwrites a
  // deliberate choice while still being able to replace the prefilled default.
  const dateTouchedRef = useRef(false);
  const fileInputRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Must be set on every mount: StrictMode runs the cleanup once immediately
    // after mounting in development, and a ref that is only cleared would stay
    // false for the rest of the dialog's life, silently discarding results.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const patch = useCallback((changes) => setForm(prev => ({ ...prev, ...changes })), []);

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initialState), [form, initialState]);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, isSaving, onClose]);

  /* ------------------------------------------------------- classification */

  const category = EVENT_CATEGORIES[form.category] ? form.category : 'other';
  const categoryInfo = EVENT_CATEGORIES[category];
  const subtypeInfo = categoryInfo.subtypes.find(item => item.id === form.subtype);

  const handleCategoryChange = (nextCategory) => {
    const next = normalizeClassification({ category: nextCategory, subtype: 'unspecified' });
    patch({ category: next.category, subtype: next.subtype, attributes: next.attributes });
  };

  const handleSubtypeChange = (nextSubtype) => {
    // Attributes are carried over so that, for example, selected MCS structural
    // features are not wiped just because the subtype changed.
    const next = normalizeClassification({ category, subtype: nextSubtype, attributes: form.attributes });
    patch({ subtype: next.subtype, attributes: next.attributes });
  };

  const setAttribute = (key, value) => patch({ attributes: { ...form.attributes, [key]: value } });

  const toggleMcsFeature = (featureId) => {
    const selected = form.attributes.structuralFeatures || [];
    setAttribute('structuralFeatures', selected.includes(featureId)
      ? selected.filter(id => id !== featureId)
      : [...selected, featureId]);
  };

  const handleTornadoOriginChange = (tornadoOrigin) => {
    const next = { ...form.attributes, tornadoOrigin };
    if (tornadoOrigin === 'non_mesocyclonic') delete next.tornadoIntensity;
    else if (!next.tornadoIntensity) next.tornadoIntensity = 'ifu';
    patch({ attributes: next });
  };

  /* --------------------------------------------------------------- photos */

  const handlePhotoUpload = async (event) => {
    const input = event.target;
    const files = Array.from(input.files || []);
    // Reset immediately so picking the same file again still fires onChange.
    input.value = '';
    if (files.length === 0) return;

    setPhotoError('');
    setExifNotice('');
    setPhotoProgress({ done: 0, total: files.length });

    const added = [];
    const failed = [];
    let exifDate = null;
    let exifLat = null;
    let exifLng = null;

    // Sequential processing keeps peak memory to a single decoded image, which
    // matters on Android where a batch of 20 camera files would otherwise be
    // decoded at once.
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      try {
        if (!file.type.startsWith('image/')) {
          failed.push(file.name);
          continue;
        }

        const meta = await parsePhotoMetadata(file);
        if (!exifDate && meta.date) exifDate = meta.date;
        // Range-checked in parsePhotoMetadata, so 0 is accepted here.
        if (exifLat === null && meta.lat !== null && meta.lng !== null) {
          exifLat = meta.lat;
          exifLng = meta.lng;
        }

        const prepared = await preparePhotoFromFile(file);
        added.push({
          id: createPhotoId(),
          url: prepared.url,
          thumb: prepared.thumb,
          caption: '',
          exif: meta.exif || {}
        });
      } catch (err) {
        console.error('Could not add photo:', err);
        failed.push(file.name);
      } finally {
        if (isMountedRef.current) setPhotoProgress({ done: i + 1, total: files.length });
      }
    }

    if (!isMountedRef.current) return;
    setPhotoProgress(null);

    if (added.length > 0) {
      setForm(prev => {
        const next = { ...prev, photos: [...prev.photos, ...added] };
        const notices = [];

        if (exifDate && !dateTouchedRef.current) {
          next.date = exifDate;
          notices.push('дату съёмки');
        }
        if (exifLat !== null && next.latitude === '' && next.longitude === '') {
          next.latitude = String(exifLat);
          next.longitude = String(exifLng);
          notices.push('GPS-координаты');
        }

        if (notices.length > 0) {
          setExifNotice(`Из EXIF извлечено: ${notices.join(', ')}.`);
          if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) setExifNotice('');
          }, 6000);
        }
        return next;
      });
    }

    if (failed.length > 0) {
      setPhotoError(added.length === 0
        ? `Не удалось добавить файлы: ${failed.join(', ')}`
        : `Пропущено файлов: ${failed.length} (${failed.join(', ')})`);
    }
  };

  const handleRemovePhoto = (photoId) => {
    setForm(prev => ({ ...prev, photos: prev.photos.filter(photo => photo.id !== photoId) }));
  };

  const handleCaptionChange = (photoId, caption) => {
    setForm(prev => ({
      ...prev,
      photos: prev.photos.map(photo => (photo.id === photoId ? { ...photo, caption } : photo))
    }));
  };

  /* ---------------------------------------------------------------- submit */

  const latitudeInvalid = form.latitude !== '' && !isValidLatitude(parseCoordinateInput(form.latitude, 'latitude'));
  const longitudeInvalid = form.longitude !== '' && !isValidLongitude(parseCoordinateInput(form.longitude, 'longitude'));
  const coordsIncomplete = (form.latitude !== '') !== (form.longitude !== '');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving || photoProgress) return;

    if (!form.title.trim()) {
      setFormError('Укажите название явления — по нему запись будет видна в архиве.');
      return;
    }
    if (latitudeInvalid || longitudeInvalid) {
      setFormError('Координаты вне допустимого диапазона: широта −90…90, долгота −180…180.');
      return;
    }
    if (coordsIncomplete) {
      setFormError('Укажите обе координаты или оставьте оба поля пустыми.');
      return;
    }

    setFormError('');
    setIsSaving(true);
    try {
      await onSave({
        id: eventToEdit ? eventToEdit.id : createEventId(),
        title: form.title.trim(),
        date: form.date,
        eventType: category,
        classification: { category, subtype: form.subtype, attributes: form.attributes },
        severity: form.severity,
        location: form.location.trim(),
        latitude: parseCoordinateInput(form.latitude, 'latitude'),
        longitude: parseCoordinateInput(form.longitude, 'longitude'),
        notes: form.notes.trim(),
        tags: form.tagsInput.split(',').map(tag => tag.trim().replace(/^#/, '')).filter(Boolean),
        photos: form.photos,
        createdAt: eventToEdit ? eventToEdit.createdAt : new Date().toISOString()
      });
    } catch (err) {
      // The parent reports storage failures; keeping the dialog open means the
      // user does not lose everything they typed.
      if (isMountedRef.current) setFormError(err?.message || 'Не удалось сохранить запись.');
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const isBusy = isSaving || Boolean(photoProgress);

  const footer = (
    <>
      <button type="button" className="btn-secondary" onClick={requestClose} disabled={isSaving}>
        Отмена
      </button>
      <button type="submit" form="event-form" className="btn-primary" disabled={isBusy}>
        {isSaving && <Loader2 size={16} className="spin-icon" />}
        {isSaving ? 'Сохранение…' : eventToEdit ? 'Сохранить изменения' : 'Сохранить в архив'}
      </button>
    </>
  );

  return (
    <>
      <Modal
        title={eventToEdit ? 'Редактирование наблюдения' : 'Новое наблюдение'}
        titleIcon={<CloudLightning size={20} className="modal-heading-icon" />}
        onClose={requestClose}
        footer={footer}
        className="form-modal"
        size="wide"
      >
        <form id="event-form" onSubmit={handleSubmit} noValidate>
          {exifNotice && (
            <div className="inline-alert info">
              <Sparkles size={16} aria-hidden="true" />
              <span>{exifNotice}</span>
            </div>
          )}
          {photoError && (
            <div className="inline-alert warning" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{photoError}</span>
            </div>
          )}
          {formError && (
            <div className="inline-alert danger" role="alert">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-grid-2">
            <div className="form-group span-2">
              <label className="form-label" htmlFor="field-title">
                Название явления <span className="req" aria-hidden="true">*</span>
              </label>
              <input
                id="field-title"
                type="text"
                placeholder="Например: Суперячейка с крупным градом"
                value={form.title}
                onChange={(e) => patch({ title: e.target.value })}
                className="form-input"
                maxLength={200}
                autoComplete="off"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="field-date">Дата и время явления</label>
              <input
                id="field-date"
                type="datetime-local"
                value={form.date}
                onChange={(e) => {
                  dateTouchedRef.current = true;
                  patch({ date: e.target.value });
                }}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="field-severity">Интенсивность / Опасность</label>
              <select
                id="field-severity"
                value={form.severity}
                onChange={(e) => patch({ severity: e.target.value })}
                className="form-select"
              >
                {Object.values(SEVERITY_LEVELS).map(level => (
                  <option key={level.id} value={level.id}>{level.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="field-category">Группа явления</label>
              <select
                id="field-category"
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="form-select"
              >
                {Object.values(EVENT_CATEGORIES).map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="field-subtype">Подтип</label>
              <select
                id="field-subtype"
                value={form.subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="form-select"
                disabled={categoryInfo.subtypes.length < 2}
              >
                {categoryInfo.subtypes.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              {subtypeInfo?.description && <span className="form-help-text">{subtypeInfo.description}</span>}
            </div>
          </div>

          {category === 'mcs' && (
            <div className="form-group">
              <span className="form-label">Структурные признаки</span>
              <div className="chip-checkbox-group">
                {MCS_STRUCTURAL_FEATURES.map(feature => {
                  const checked = (form.attributes.structuralFeatures || []).includes(feature.id);
                  return (
                    <label key={feature.id} className={`chip-checkbox ${checked ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMcsFeature(feature.id)}
                        className="visually-hidden"
                      />
                      <span>{feature.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {category === 'hail' && (
            <div className="form-group">
              <label className="form-label" htmlFor="field-hail">Класс града</label>
              <select
                id="field-hail"
                value={form.attributes.hailSizeClass || 'unspecified'}
                onChange={(e) => setAttribute('hailSizeClass', e.target.value)}
                className="form-select"
              >
                {HAIL_SIZE_CLASSES.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}{item.description ? ` — ${item.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === 'squall' && (
            <div className="form-group">
              <label className="form-label" htmlFor="field-squall">Интенсивность шквала</label>
              <select
                id="field-squall"
                value={form.attributes.squallIntensity || 'unspecified'}
                onChange={(e) => setAttribute('squallIntensity', e.target.value)}
                className="form-select"
              >
                {SQUALL_INTENSITIES.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}{item.description ? ` — ${item.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === 'tornadic' && form.subtype === 'tornado' && (
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="field-tornado-origin">Происхождение торнадо</label>
                <select
                  id="field-tornado-origin"
                  value={form.attributes.tornadoOrigin || 'unspecified'}
                  onChange={(e) => handleTornadoOriginChange(e.target.value)}
                  className="form-select"
                >
                  {TORNADO_ORIGINS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>
              {form.attributes.tornadoOrigin !== 'non_mesocyclonic' && (
                <div className="form-group">
                  <label className="form-label" htmlFor="field-tornado-intensity">Интенсивность торнадо</label>
                  <select
                    id="field-tornado-intensity"
                    value={form.attributes.tornadoIntensity || 'ifu'}
                    onChange={(e) => setAttribute('tornadoIntensity', e.target.value)}
                    className="form-select"
                  >
                    {TORNADO_INTENSITIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="field-location">Локация / Населённый пункт</label>
            <input
              id="field-location"
              type="text"
              placeholder="Например: Нижегородская обл., г. Бор"
              value={form.location}
              onChange={(e) => patch({ location: e.target.value })}
              className="form-input"
              maxLength={200}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <span className="form-label">Координаты на карте</span>
            <div className="form-grid-2 tight">
              <div className="field-with-error">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Широта: 56.32688"
                  value={form.latitude}
                  onChange={(e) => patch({ latitude: e.target.value })}
                  className={`form-input ${latitudeInvalid ? 'invalid' : ''}`}
                  aria-label="Широта"
                  aria-invalid={latitudeInvalid}
                />
                {latitudeInvalid && <span className="field-error">Широта должна быть в диапазоне −90…90</span>}
              </div>
              <div className="field-with-error">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Долгота: 44.00598"
                  value={form.longitude}
                  onChange={(e) => patch({ longitude: e.target.value })}
                  className={`form-input ${longitudeInvalid ? 'invalid' : ''}`}
                  aria-label="Долгота"
                  aria-invalid={longitudeInvalid}
                />
                {longitudeInvalid && <span className="field-error">Долгота должна быть в диапазоне −180…180</span>}
              </div>
            </div>
            {coordsIncomplete && <span className="field-error">Нужны обе координаты, иначе точка не появится на карте</span>}
          </div>

          <div className="form-group">
            <span className="form-label">Фотоснимки наблюдения</span>

            <div className="upload-dropzone">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                id="photo-upload-input"
                className="visually-hidden"
                disabled={Boolean(photoProgress)}
              />
              <label htmlFor="photo-upload-input" className="dropzone-label">
                {photoProgress
                  ? <Loader2 size={24} className="upload-icon spin-icon" aria-hidden="true" />
                  : <Upload size={24} className="upload-icon" aria-hidden="true" />}
                <span className="dropzone-title">
                  {photoProgress ? 'Обработка снимков…' : 'Выбрать снимки'}
                </span>
                <span className="dropzone-sub">
                  {photoProgress
                    ? `Обработано ${photoProgress.done} из ${photoProgress.total}`
                    : 'JPG, PNG, WebP. Дата съёмки и GPS считываются из EXIF автоматически'}
                </span>
              </label>
            </div>

            {form.photos.length > 0 && (
              <>
                <div className="photos-count-row">
                  Снимков в записи: <strong>{form.photos.length}</strong>
                </div>
                <ul className="form-photos-list">
                  {form.photos.map((photo, index) => (
                    <li key={photo.id} className="form-photo-row">
                      <img
                        src={photoPreviewSrc(photo)}
                        alt=""
                        className="form-photo-thumb"
                        loading="lazy"
                        decoding="async"
                      />
                      <input
                        type="text"
                        placeholder={`Подпись к снимку ${index + 1}`}
                        value={photo.caption || ''}
                        onChange={(e) => handleCaptionChange(photo.id, e.target.value)}
                        className="form-input caption-input"
                        maxLength={300}
                      />
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        onClick={() => handleRemovePhoto(photo.id)}
                        title="Удалить снимок"
                        aria-label={`Удалить снимок ${index + 1}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="field-notes">Заметки и полевые наблюдения</label>
            <textarea
              id="field-notes"
              rows={5}
              placeholder="Движение ячейки, ворот, град, разрушения, радарные особенности…"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              className="form-textarea"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="field-tags">Теги (через запятую)</label>
            <input
              id="field-tags"
              type="text"
              placeholder="Шельф, Град, Мезоциклон"
              value={form.tagsInput}
              onChange={(e) => patch({ tagsInput: e.target.value })}
              className="form-input"
              autoComplete="off"
            />
          </div>
        </form>
      </Modal>

      {showDiscardConfirm && (
        <ConfirmModal
          title="Закрыть без сохранения?"
          message="В форме есть несохранённые изменения. Если закрыть сейчас, они будут потеряны."
          confirmLabel="Закрыть без сохранения"
          cancelLabel="Продолжить редактирование"
          onConfirm={() => {
            setShowDiscardConfirm(false);
            onClose();
          }}
          onCancel={() => setShowDiscardConfirm(false)}
        />
      )}
    </>
  );
}
