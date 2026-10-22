import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
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
import {
  isValidLatitude,
  isValidLongitude,
  parseCoordinateInput
} from '../services/events';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import PhotoLightbox from './PhotoLightbox';
import ArchiveImage from './ArchiveImage';
import Presence from './Presence';
import {
  Upload,
  Trash2,
  Sparkles,
  AlertCircle,
  Loader2,
  CloudLightning,
  Check
} from 'lucide-react';

let photoCounter = 0;
const createPhotoId = () => {
  photoCounter += 1;
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `photo_${crypto.randomUUID()}`;
  }
  return `photo_${Date.now()}_${photoCounter}_${Math.random().toString(36).slice(2, 8)}`;
};

const createEventId = () => {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
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
      dateSource: 'saved',
      exifAutofill: null,
      category: classification.category,
      subtype: classification.subtype,
      attributes: classification.attributes,
      severity: SEVERITY_LEVELS[eventToEdit.severity]
        ? eventToEdit.severity
        : 'moderate',
      location: eventToEdit.location || '',
      // Coordinates live in the form as strings so a half-typed value such as
      // "-" or "56." does not get thrown away while the user is still typing.
      latitude:
        typeof eventToEdit.latitude === 'number'
          ? String(eventToEdit.latitude)
          : '',
      longitude:
        typeof eventToEdit.longitude === 'number'
          ? String(eventToEdit.longitude)
          : '',
      notes: eventToEdit.notes || '',
      tagsInput: Array.isArray(eventToEdit.tags)
        ? eventToEdit.tags.join(', ')
        : '',
      photos: Array.isArray(eventToEdit.photos) ? eventToEdit.photos : []
    };
  }

  const classification = normalizeClassification({
    category: 'thunderstorm',
    subtype: 'unspecified'
  });
  return {
    title: '',
    date: toDateTimeLocalValue(new Date()) || '',
    dateSource: 'default',
    exifAutofill: null,
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

// Selection provenance and notification details belong to this dialog only.
const editableValues = ({ dateSource, exifAutofill, ...values }) => values;

export default function EventFormModal({ eventToEdit, onClose, onSave }) {
  const initialState = useMemo(
    () => buildInitialState(eventToEdit),
    [eventToEdit]
  );
  const [form, setForm] = useState(initialState);

  const [exifNotice, setExifNotice] = useState('');
  const [photoProgress, setPhotoProgress] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [allPhotosVisible, setAllPhotosVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [validationField, setValidationField] = useState('');
  const [coordinatesOpen, setCoordinatesOpen] = useState(
    Boolean(
      initialState.latitude || initialState.longitude || initialState.tagsInput
    )
  );

  const fileInputRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    // Must be set on every mount: StrictMode runs the cleanup once immediately
    // after mounting in development, and a ref that is only cleared would stay
    // false for the rest of the dialog's life, silently discarding results.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!form.exifAutofill) return;
    if (form.latitude || form.longitude) setCoordinatesOpen(true);
    setExifNotice(`Из EXIF извлечено: ${form.exifAutofill.join(', ')}.`);
    const timer = setTimeout(() => setExifNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [form.exifAutofill]);

  const patch = useCallback(
    (changes) => setForm((prev) => ({ ...prev, ...changes })),
    []
  );

  const isDirty = useMemo(
    () =>
      JSON.stringify(editableValues(form)) !==
      JSON.stringify(editableValues(initialState)),
    [form, initialState]
  );
  useEffect(() => {
    if (!isDirty && !photoProgress && !isSaving) return;
    const guard = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [isDirty, photoProgress, isSaving]);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (isDirty || photoProgress) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  }, [isDirty, isSaving, photoProgress, onClose]);

  /* ------------------------------------------------------- classification */

  const category = EVENT_CATEGORIES[form.category] ? form.category : 'other';
  const categoryInfo = EVENT_CATEGORIES[category];
  const subtypeInfo = categoryInfo.subtypes.find(
    (item) => item.id === form.subtype
  );

  const handleCategoryChange = (nextCategory) => {
    const next = normalizeClassification({
      category: nextCategory,
      subtype: 'unspecified'
    });
    patch({
      category: next.category,
      subtype: next.subtype,
      attributes: next.attributes
    });
  };

  const handleSubtypeChange = (nextSubtype) => {
    // Attributes are carried over so that, for example, selected MCS structural
    // features are not wiped just because the subtype changed.
    const next = normalizeClassification({
      category,
      subtype: nextSubtype,
      attributes: form.attributes
    });
    patch({ subtype: next.subtype, attributes: next.attributes });
  };

  const setAttribute = (key, value) =>
    patch({ attributes: { ...form.attributes, [key]: value } });

  const toggleMcsFeature = (featureId) => {
    const selected = form.attributes.structuralFeatures || [];
    setAttribute(
      'structuralFeatures',
      selected.includes(featureId)
        ? selected.filter((id) => id !== featureId)
        : [...selected, featureId]
    );
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
      if (!isMountedRef.current) break;
      const file = files[i];
      try {
        if (!file.type.startsWith('image/')) {
          failed.push(file.name);
          continue;
        }

        const meta = await parsePhotoMetadata(file);
        const prepared = await preparePhotoFromFile(file);
        // Only a successfully added photo may supply observation metadata.
        if (!exifDate && meta.date) exifDate = meta.date;
        // Range-checked in parsePhotoMetadata, so 0 is accepted here.
        if (exifLat === null && meta.lat !== null && meta.lng !== null) {
          exifLat = meta.lat;
          exifLng = meta.lng;
        }

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
        if (isMountedRef.current)
          setPhotoProgress({ done: i + 1, total: files.length });
      }
    }

    if (!isMountedRef.current) return;
    setPhotoProgress(null);

    if (added.length > 0) {
      setForm((prev) => {
        const next = { ...prev, photos: [...prev.photos, ...added] };
        const notices = [];

        // Only the new form's current-time default is replaceable. Keep the
        // first EXIF date, saved dates (including undated legacy events), and
        // deliberate manual values, including an explicitly cleared field.
        if (exifDate && prev.dateSource === 'default') {
          next.date = exifDate;
          next.dateSource = 'exif';
          notices.push('дату съёмки');
        }
        if (exifLat !== null && next.latitude === '' && next.longitude === '') {
          next.latitude = String(exifLat);
          next.longitude = String(exifLng);
          notices.push('GPS-координаты');
        }

        if (notices.length > 0) {
          // Keep the updater pure: StrictMode can evaluate it twice. The
          // effect owns the notification and its timer after state commits.
          next.exifAutofill = notices;
        }
        return next;
      });
    }

    if (failed.length > 0) {
      setPhotoError(
        added.length === 0
          ? `Не удалось добавить файлы: ${failed.join(', ')}`
          : `Пропущено файлов: ${failed.length} (${failed.join(', ')})`
      );
    }
  };

  const handleRemovePhoto = (photoId) => {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.filter((photo) => photo.id !== photoId)
    }));
  };

  const handleCaptionChange = (photoId, caption) => {
    setForm((prev) => ({
      ...prev,
      photos: prev.photos.map((photo) =>
        photo.id === photoId ? { ...photo, caption } : photo
      )
    }));
  };

  /* ---------------------------------------------------------------- submit */

  const latitudeInvalid =
    form.latitude !== '' &&
    !isValidLatitude(parseCoordinateInput(form.latitude, 'latitude'));
  const longitudeInvalid =
    form.longitude !== '' &&
    !isValidLongitude(parseCoordinateInput(form.longitude, 'longitude'));
  const coordsIncomplete = (form.latitude !== '') !== (form.longitude !== '');
  const showError = (message, field) => {
    setFormError(message);
    setValidationField(field);
    if (field === 'field-latitude' || field === 'field-longitude')
      setCoordinatesOpen(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(field);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving || photoProgress) return;

    if (!form.title.trim()) {
      showError(
        'Укажите название явления — по нему запись будет видна в архиве.',
        'field-title'
      );
      return;
    }
    if (latitudeInvalid || longitudeInvalid) {
      showError(
        'Координаты вне допустимого диапазона: широта −90…90, долгота −180…180.',
        latitudeInvalid ? 'field-latitude' : 'field-longitude'
      );
      return;
    }
    if (coordsIncomplete) {
      showError(
        'Укажите обе координаты или оставьте оба поля пустыми.',
        form.latitude === '' ? 'field-latitude' : 'field-longitude'
      );
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
        classification: {
          category,
          subtype: form.subtype,
          attributes: form.attributes
        },
        severity: form.severity,
        location: form.location.trim(),
        latitude: parseCoordinateInput(form.latitude, 'latitude'),
        longitude: parseCoordinateInput(form.longitude, 'longitude'),
        notes: form.notes.trim(),
        tags: form.tagsInput
          .split(',')
          .map((tag) => tag.trim().replace(/^#/, ''))
          .filter(Boolean),
        photos: form.photos,
        createdAt: eventToEdit
          ? eventToEdit.createdAt
          : new Date().toISOString()
      });
    } catch (err) {
      // The parent reports storage failures; keeping the dialog open means the
      // user does not lose everything they typed.
      if (isMountedRef.current)
        showError(err?.message || 'Не удалось сохранить запись.', 'form-error');
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const isBusy = isSaving || Boolean(photoProgress);

  const footer = (
    <>
      <button
        type="button"
        className="btn-secondary"
        onClick={requestClose}
        disabled={isSaving}
      >
        Отмена
      </button>
      <button
        type="button"
        className="btn-secondary form-upload-shortcut"
        onClick={() => fileInputRef.current?.click()}
        disabled={isBusy}
        aria-label="Добавить снимки"
      >
        <Upload size={18} aria-hidden="true" />
        <span>Снимки</span>
      </button>
      <button
        type="submit"
        form="event-form"
        className="btn-primary"
        disabled={isBusy}
      >
        {isSaving && <Loader2 size={16} className="spin-icon" />}
        {isSaving
          ? 'Сохранение…'
          : eventToEdit
            ? 'Сохранить изменения'
            : 'Сохранить в архив'}
      </button>
    </>
  );

  return (
    <>
      <Modal
        title={eventToEdit ? 'Редактирование наблюдения' : 'Новое наблюдение'}
        titleIcon={<CloudLightning size={20} className="modal-heading-icon" />}
        onClose={requestClose}
        dismissDisabled={isSaving}
        footer={footer}
        className="form-modal"
        size="wide"
      >
        <form id="event-form" onSubmit={handleSubmit} noValidate>
          <fieldset
            disabled={isSaving}
            className="form-fields"
            aria-label="Данные наблюдения"
          >
            {exifNotice && (
              <div className="inline-alert info" role="status">
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
              <div
                className="inline-alert danger"
                role="alert"
                id="form-error"
                tabIndex={-1}
              >
                <AlertCircle size={16} aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <div className="form-layout">
              <div className="form-column">
                <section className="form-section" aria-label="Основное">
                  <h3 className="form-section-heading">Об этом наблюдении</h3>
                  <div className="form-group span-2">
                    <label className="form-label" htmlFor="field-title">
                      Название явления{' '}
                      <span className="req" aria-hidden="true">
                        *
                      </span>
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
                      aria-invalid={
                        validationField === 'field-title' && !form.title.trim()
                      }
                      aria-describedby={
                        validationField === 'field-title' && formError
                          ? 'form-error'
                          : undefined
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="field-date">
                      Дата и время явления
                    </label>
                    <input
                      id="field-date"
                      type="datetime-local"
                      value={form.date}
                      onChange={(e) =>
                        patch({ date: e.target.value, dateSource: 'manual' })
                      }
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="field-location">
                      Место наблюдения
                    </label>
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
                  <details className="form-disclosure classification-disclosure">
                    <summary>
                      <span className="disclosure-label">
                        Явление и характеристики
                        <small>
                          {categoryInfo.label} /{' '}
                          {SEVERITY_LEVELS[form.severity]?.label}
                        </small>
                      </span>
                    </summary>
                    <div className="disclosure-content">
                      <div className="form-grid-2 classification-selects">
                        <div className="form-group">
                          <label
                            className="form-label"
                            htmlFor="field-category"
                          >
                            Группа явления
                          </label>
                          <select
                            id="field-category"
                            value={category}
                            onChange={(e) =>
                              handleCategoryChange(e.target.value)
                            }
                            className="form-select"
                          >
                            {Object.values(EVENT_CATEGORIES).map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label" htmlFor="field-subtype">
                            Подтип
                          </label>
                          <select
                            id="field-subtype"
                            value={form.subtype}
                            onChange={(e) =>
                              handleSubtypeChange(e.target.value)
                            }
                            className="form-select"
                            disabled={categoryInfo.subtypes.length < 2}
                          >
                            {categoryInfo.subtypes.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                          {subtypeInfo?.description && (
                            <span className="form-help-text">
                              {subtypeInfo.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="field-severity">
                          Интенсивность / Опасность
                        </label>
                        <select
                          id="field-severity"
                          value={form.severity}
                          onChange={(e) => patch({ severity: e.target.value })}
                          className="form-select"
                        >
                          {Object.values(SEVERITY_LEVELS).map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {category === 'mcs' && (
                        <div className="form-group">
                          <span className="form-label">
                            Структурные признаки
                          </span>
                          <div className="chip-checkbox-group">
                            {MCS_STRUCTURAL_FEATURES.map((feature) => {
                              const checked = (
                                form.attributes.structuralFeatures || []
                              ).includes(feature.id);
                              return (
                                <label
                                  key={feature.id}
                                  className={`chip-checkbox ${checked ? 'checked' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      toggleMcsFeature(feature.id)
                                    }
                                    className="visually-hidden"
                                  />
                                  {checked && (
                                    <Check size={14} aria-hidden="true" />
                                  )}
                                  <span>{feature.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {category === 'hail' && (
                        <div className="form-group">
                          <label className="form-label" htmlFor="field-hail">
                            Класс града
                          </label>
                          <select
                            id="field-hail"
                            value={
                              form.attributes.hailSizeClass || 'unspecified'
                            }
                            onChange={(e) =>
                              setAttribute('hailSizeClass', e.target.value)
                            }
                            className="form-select"
                          >
                            {HAIL_SIZE_CLASSES.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                                {item.description
                                  ? ` — ${item.description}`
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {category === 'squall' && (
                        <div className="form-group">
                          <label className="form-label" htmlFor="field-squall">
                            Интенсивность шквала
                          </label>
                          <select
                            id="field-squall"
                            value={
                              form.attributes.squallIntensity || 'unspecified'
                            }
                            onChange={(e) =>
                              setAttribute('squallIntensity', e.target.value)
                            }
                            className="form-select"
                          >
                            {SQUALL_INTENSITIES.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                                {item.description
                                  ? ` — ${item.description}`
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {category === 'tornadic' &&
                        form.subtype === 'tornado' && (
                          <div className="form-grid-2">
                            <div className="form-group">
                              <label
                                className="form-label"
                                htmlFor="field-tornado-origin"
                              >
                                Происхождение торнадо
                              </label>
                              <select
                                id="field-tornado-origin"
                                value={
                                  form.attributes.tornadoOrigin || 'unspecified'
                                }
                                onChange={(e) =>
                                  handleTornadoOriginChange(e.target.value)
                                }
                                className="form-select"
                              >
                                {TORNADO_ORIGINS.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {form.attributes.tornadoOrigin !==
                              'non_mesocyclonic' && (
                              <div className="form-group">
                                <label
                                  className="form-label"
                                  htmlFor="field-tornado-intensity"
                                >
                                  Интенсивность торнадо
                                </label>
                                <select
                                  id="field-tornado-intensity"
                                  value={
                                    form.attributes.tornadoIntensity || 'ifu'
                                  }
                                  onChange={(e) =>
                                    setAttribute(
                                      'tornadoIntensity',
                                      e.target.value
                                    )
                                  }
                                  className="form-select"
                                >
                                  {TORNADO_INTENSITIES.map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                    </div>
                  </details>
                  <div className="form-group">
                    <label className="form-label" htmlFor="field-notes">
                      Заметки и полевые наблюдения
                    </label>
                    <textarea
                      id="field-notes"
                      rows={4}
                      placeholder="Движение ячейки, ворот, град, разрушения, радарные особенности…"
                      value={form.notes}
                      onChange={(e) => patch({ notes: e.target.value })}
                      className="form-textarea"
                    />
                  </div>
                </section>
              </div>
              <div className="form-column">
                <section
                  className="form-section"
                  aria-label="Материалы наблюдения"
                >
                  <h3 className="form-section-heading">
                    Материалы <span>необязательно</span>
                  </h3>
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
                      <label
                        htmlFor="photo-upload-input"
                        className="dropzone-label"
                      >
                        {photoProgress ? (
                          <Loader2
                            size={24}
                            className="upload-icon spin-icon"
                            aria-hidden="true"
                          />
                        ) : (
                          <Upload
                            size={24}
                            className="upload-icon"
                            aria-hidden="true"
                          />
                        )}
                        <span className="dropzone-title">
                          {photoProgress
                            ? 'Обработка снимков…'
                            : 'Выбрать снимки'}
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
                          Снимков в записи:{' '}
                          <strong>{form.photos.length}</strong>
                        </div>
                        <ul className="form-photos-list">
                          {form.photos.map((photo, index) => (
                            <li
                              key={photo.id}
                              className="form-photo-row"
                              hidden={!allPhotosVisible && index >= 4}
                            >
                              <button
                                type="button"
                                className="form-photo-preview"
                                aria-label={`Просмотреть снимок ${index + 1}`}
                                onClick={() => setPreviewIndex(index)}
                              >
                                <ArchiveImage
                                  src={photoPreviewSrc(photo)}
                                  alt=""
                                  className="form-photo-thumb"
                                  loading="lazy"
                                  decoding="async"
                                />
                              </button>
                              <input
                                type="text"
                                placeholder={`Подпись к снимку ${index + 1}`}
                                value={photo.caption || ''}
                                onChange={(e) =>
                                  handleCaptionChange(photo.id, e.target.value)
                                }
                                className="form-input caption-input"
                                maxLength={300}
                                aria-label={`Подпись к снимку ${index + 1}`}
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
                        {form.photos.length > 4 && (
                          <button
                            type="button"
                            className="btn-secondary photo-list-toggle"
                            aria-expanded={allPhotosVisible}
                            onClick={() =>
                              setAllPhotosVisible((value) => !value)
                            }
                          >
                            {allPhotosVisible
                              ? 'Свернуть список снимков'
                              : `Показать остальные снимки (${form.photos.length - 4})`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <details
                  className="form-disclosure"
                  open={coordinatesOpen}
                  onToggle={(e) => setCoordinatesOpen(e.currentTarget.open)}
                >
                  <summary>Координаты и теги</summary>
                  <div className="disclosure-content">
                    <div className="form-group">
                      <span className="form-label">Координаты на карте</span>
                      <div className="form-grid-2 tight">
                        <div className="field-with-error">
                          <input
                            id="field-latitude"
                            type="text"
                            inputMode="decimal"
                            placeholder="Широта: 56.32688"
                            value={form.latitude}
                            onChange={(e) =>
                              patch({ latitude: e.target.value })
                            }
                            className={`form-input ${latitudeInvalid ? 'invalid' : ''}`}
                            aria-label="Широта"
                            aria-invalid={
                              latitudeInvalid ||
                              (coordsIncomplete && form.latitude === '')
                            }
                            aria-describedby={
                              latitudeInvalid
                                ? 'latitude-error'
                                : coordsIncomplete
                                  ? 'coordinates-error'
                                  : undefined
                            }
                          />
                          {latitudeInvalid && (
                            <span className="field-error" id="latitude-error">
                              Широта должна быть в диапазоне −90…90
                            </span>
                          )}
                        </div>
                        <div className="field-with-error">
                          <input
                            id="field-longitude"
                            type="text"
                            inputMode="decimal"
                            placeholder="Долгота: 44.00598"
                            value={form.longitude}
                            onChange={(e) =>
                              patch({ longitude: e.target.value })
                            }
                            className={`form-input ${longitudeInvalid ? 'invalid' : ''}`}
                            aria-label="Долгота"
                            aria-invalid={
                              longitudeInvalid ||
                              (coordsIncomplete && form.longitude === '')
                            }
                            aria-describedby={
                              longitudeInvalid
                                ? 'longitude-error'
                                : coordsIncomplete
                                  ? 'coordinates-error'
                                  : undefined
                            }
                          />
                          {longitudeInvalid && (
                            <span className="field-error" id="longitude-error">
                              Долгота должна быть в диапазоне −180…180
                            </span>
                          )}
                        </div>
                      </div>
                      {coordsIncomplete && (
                        <span className="field-error" id="coordinates-error">
                          Нужны обе координаты, иначе точка не появится на карте
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="field-tags">
                        Теги (через запятую)
                      </label>
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
                  </div>
                </details>
              </div>
            </div>
          </fieldset>
        </form>
      </Modal>

      <Presence visible={showDiscardConfirm}>
        {showDiscardConfirm && (
          <ConfirmModal
            title="Закрыть без сохранения?"
            message={
              photoProgress
                ? 'Снимки ещё обрабатываются. Если закрыть форму сейчас, они не будут добавлены.'
                : 'В форме есть несохранённые изменения. Если закрыть сейчас, они будут потеряны.'
            }
            confirmLabel="Закрыть без сохранения"
            cancelLabel="Продолжить редактирование"
            onConfirm={() => {
              setShowDiscardConfirm(false);
              onClose();
            }}
            onCancel={() => setShowDiscardConfirm(false)}
          />
        )}
      </Presence>
      <Presence
        visible={previewIndex !== null && Boolean(form.photos[previewIndex])}
      >
        {previewIndex !== null && form.photos[previewIndex] && (
          <PhotoLightbox
            items={form.photos.map((photo) => ({
              photo,
              title: form.title,
              subtitle: form.location
            }))}
            index={previewIndex}
            onNavigate={setPreviewIndex}
            onClose={() => setPreviewIndex(null)}
          />
        )}
      </Presence>
    </>
  );
}
