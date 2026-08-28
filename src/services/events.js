import {
  EVENT_CATEGORIES,
  SEVERITY_LEVELS,
  getClassificationSearchText,
  getEventClassification,
  migrateEventClassification
} from '../types/storm';

export const SEVERITY_RANK = { extreme: 4, severe: 3, moderate: 2, low: 1 };
export const DEFAULT_SEVERITY = 'moderate';

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Сначала новые' },
  { id: 'oldest', label: 'Сначала старые' },
  { id: 'severity', label: 'По силе (сначала ОЯ)' },
  { id: 'title', label: 'По названию (А-Я)' }
];

/* ------------------------------------------------------------------ dates */

/**
 * Parses a stored event timestamp. Events use the `YYYY-MM-DDTHH:mm` value
 * produced by `<input type="datetime-local">`, which JS interprets as local
 * time, while `createdAt` is a UTC ISO string.
 * Returns null for missing or unparseable values instead of an Invalid Date,
 * so callers never render the string "Invalid Date".
 */
export const parseDateValue = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Observation time, falling back to the creation time of the record. */
export const getEventDate = (event) => parseDateValue(event?.date) || parseDateValue(event?.createdAt);

const formatterCache = new Map();
const getFormatter = (options) => {
  const key = JSON.stringify(options);
  if (!formatterCache.has(key)) {
    formatterCache.set(key, new Intl.DateTimeFormat('ru-RU', options));
  }
  return formatterCache.get(key);
};

const DATE_TIME_OPTIONS = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
const DATE_TIME_LONG_OPTIONS = { ...DATE_TIME_OPTIONS, weekday: 'long' };
const DATE_SHORT_OPTIONS = { day: '2-digit', month: '2-digit', year: 'numeric' };

export const NO_DATE_LABEL = 'Дата не указана';

export const formatEventDateTime = (event, { long = false } = {}) => {
  const date = parseDateValue(event?.date);
  if (!date) return NO_DATE_LABEL;
  return getFormatter(long ? DATE_TIME_LONG_OPTIONS : DATE_TIME_OPTIONS).format(date);
};

export const formatEventDateShort = (event) => {
  const date = parseDateValue(event?.date);
  return date ? getFormatter(DATE_SHORT_OPTIONS).format(date) : '';
};

/* ----------------------------------------------------------- coordinates */

export const isValidLatitude = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 90;
export const isValidLongitude = (value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 180;

/**
 * True when the event carries a usable position. Checked by range rather than
 * truthiness so that latitude 0 (equator) and longitude 0 (Greenwich) count.
 */
export const hasCoordinates = (event) =>
  isValidLatitude(event?.latitude) && isValidLongitude(event?.longitude);

export const formatCoordinates = (event) =>
  hasCoordinates(event) ? `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}` : '';

/** Parses a coordinate coming from a text/number input. */
export const parseCoordinateInput = (raw, kind) => {
  if (raw === '' || raw === null || raw === undefined) return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
  if (!Number.isFinite(value)) return null;
  const valid = kind === 'latitude' ? isValidLatitude(value) : isValidLongitude(value);
  return valid ? value : null;
};

/* ------------------------------------------------------------ normalizing */

const asTrimmedString = (value) => (typeof value === 'string' ? value.trim() : '');

const asStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const tag = asTrimmedString(item).replace(/^#/, '');
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
};

const normalizePhotos = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(photo => photo && typeof photo.url === 'string' && photo.url)
    .map((photo, index) => ({
      id: asTrimmedString(photo.id) || `photo_legacy_${index}`,
      url: photo.url,
      thumb: typeof photo.thumb === 'string' && photo.thumb ? photo.thumb : null,
      caption: asTrimmedString(photo.caption),
      exif: photo.exif && typeof photo.exif === 'object' ? photo.exif : {}
    }));
};

const normalizeCoordinate = (value, kind) => {
  const parsed = parseCoordinateInput(value, kind);
  return parsed === null ? null : parsed;
};

/**
 * Brings a record loaded from storage or an imported backup into the shape the
 * UI expects. Guards against hand-edited JSON, partially written records and
 * archives created by older versions of the app.
 */
export const normalizeEventRecord = (raw) => {
  if (!raw || typeof raw !== 'object') return null;

  const id = asTrimmedString(raw.id);
  if (!id) return null;

  const withClassification = migrateEventClassification(raw);
  const severity = SEVERITY_LEVELS[raw.severity] ? raw.severity : DEFAULT_SEVERITY;
  const date = parseDateValue(raw.date) ? raw.date : '';
  const createdAt = parseDateValue(raw.createdAt) ? raw.createdAt : new Date().toISOString();

  return {
    ...withClassification,
    id,
    title: asTrimmedString(raw.title) || 'Без названия',
    date,
    severity,
    location: asTrimmedString(raw.location),
    latitude: normalizeCoordinate(raw.latitude, 'latitude'),
    longitude: normalizeCoordinate(raw.longitude, 'longitude'),
    notes: typeof raw.notes === 'string' ? raw.notes.trim() : '',
    tags: asStringArray(raw.tags),
    photos: normalizePhotos(raw.photos),
    createdAt,
    updatedAt: parseDateValue(raw.updatedAt) ? raw.updatedAt : createdAt
  };
};

export const normalizeEventList = (list) =>
  (Array.isArray(list) ? list : []).map(normalizeEventRecord).filter(Boolean);

/* ---------------------------------------------------------- query & sort */

export const eventMatchesSearch = (event, query) => {
  const q = asTrimmedString(query).toLowerCase();
  if (!q) return true;
  return Boolean(
    event.title?.toLowerCase().includes(q)
    || event.location?.toLowerCase().includes(q)
    || event.notes?.toLowerCase().includes(q)
    || event.tags?.some(tag => tag.toLowerCase().includes(q))
    || event.photos?.some(photo => photo.caption?.toLowerCase().includes(q))
    || getClassificationSearchText(event).includes(q)
  );
};

export const EMPTY_FILTERS = {
  searchQuery: '',
  categoryFilter: '',
  subtypeFilter: '',
  severityFilter: '',
  sortBy: 'newest'
};

export const areFiltersActive = (filters) =>
  Boolean(filters.searchQuery?.trim())
  || Boolean(filters.categoryFilter)
  || Boolean(filters.subtypeFilter)
  || Boolean(filters.severityFilter)
  || (filters.sortBy || 'newest') !== 'newest';

export const sortEvents = (events, sortBy) => {
  const list = [...events];
  const timeOf = (event) => {
    const date = getEventDate(event);
    return date ? date.getTime() : null;
  };
  // Records without any usable timestamp always sink to the bottom instead of
  // scattering randomly through the list.
  const byTime = (direction) => (a, b) => {
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return direction === 'asc' ? ta - tb : tb - ta;
  };

  switch (sortBy) {
    case 'oldest':
      return list.sort(byTime('asc'));
    case 'severity':
      return list.sort((a, b) => {
        const diff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
        return diff !== 0 ? diff : byTime('desc')(a, b);
      });
    case 'title':
      return list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'));
    case 'newest':
    default:
      return list.sort(byTime('desc'));
  }
};

export const filterEvents = (events, filters = EMPTY_FILTERS) => {
  const { searchQuery, categoryFilter, subtypeFilter, severityFilter, sortBy } = { ...EMPTY_FILTERS, ...filters };
  const matched = (Array.isArray(events) ? events : []).filter(event => {
    if (!eventMatchesSearch(event, searchQuery)) return false;
    if (categoryFilter || subtypeFilter) {
      const classification = getEventClassification(event);
      if (categoryFilter && classification.category !== categoryFilter) return false;
      if (subtypeFilter && classification.subtype !== subtypeFilter) return false;
    }
    if (severityFilter && event.severity !== severityFilter) return false;
    return true;
  });
  return sortEvents(matched, sortBy);
};

/* ---------------------------------------------------------------- photos */

/**
 * Flattens every photo in the archive into a gallery feed, newest observation
 * first. Photos keep a reference to their owning event id rather than the whole
 * event object so the list stays cheap to build and compare.
 */
export const collectArchivePhotos = (events) => {
  const feed = [];
  for (const event of sortEvents(Array.isArray(events) ? events : [], 'newest')) {
    if (!Array.isArray(event.photos)) continue;
    event.photos.forEach((photo, index) => {
      feed.push({
        key: `${event.id}::${photo.id || index}`,
        photo,
        photoIndex: index,
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date,
        eventLocation: event.location,
        category: getEventClassification(event).category
      });
    });
  }
  return feed;
};

export const countArchivePhotos = (events) =>
  (Array.isArray(events) ? events : []).reduce(
    (total, event) => total + (Array.isArray(event.photos) ? event.photos.length : 0),
    0
  );

/* ----------------------------------------------------------------- stats */

export const computeArchiveStats = (events) => {
  const list = Array.isArray(events) ? events : [];
  const categoryCounts = {};
  const severityCounts = { low: 0, moderate: 0, severe: 0, extreme: 0 };
  const monthCounts = new Array(12).fill(0);
  const yearCounts = new Map();

  let photoCount = 0;
  let withPhotos = 0;
  let withCoords = 0;
  let severeCount = 0;

  for (const event of list) {
    const { category } = getEventClassification(event);
    const bucket = EVENT_CATEGORIES[category] ? category : 'other';
    categoryCounts[bucket] = (categoryCounts[bucket] || 0) + 1;

    if (severityCounts[event.severity] !== undefined) severityCounts[event.severity] += 1;
    if (event.severity === 'severe' || event.severity === 'extreme') severeCount += 1;

    const photos = Array.isArray(event.photos) ? event.photos.length : 0;
    photoCount += photos;
    if (photos > 0) withPhotos += 1;
    if (hasCoordinates(event)) withCoords += 1;

    const date = getEventDate(event);
    if (date) {
      monthCounts[date.getMonth()] += 1;
      yearCounts.set(date.getFullYear(), (yearCounts.get(date.getFullYear()) || 0) + 1);
    }
  }

  return {
    total: list.length,
    severeCount,
    withPhotos,
    withCoords,
    photoCount,
    categoryCounts,
    severityCounts,
    monthCounts,
    years: [...yearCounts.entries()].sort((a, b) => b[0] - a[0]).map(([year, count]) => ({ year, count }))
  };
};
