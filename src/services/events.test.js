import { describe, it, expect } from 'vitest';
import {
  parseDateValue,
  getEventDate,
  formatEventDateTime,
  NO_DATE_LABEL,
  hasCoordinates,
  parseCoordinateInput,
  normalizeEventRecord,
  normalizeEventList,
  eventMatchesSearch,
  filterEvents,
  sortEvents,
  collectArchivePhotos,
  countArchivePhotos,
  computeArchiveStats,
  areFiltersActive
} from './events';

const makeEvent = (overrides = {}) => ({
  id: 'evt_1',
  title: 'Суперячейка над Бором',
  date: '2024-06-15T18:30',
  eventType: 'supercell',
  classification: { category: 'supercell', subtype: 'classic', attributes: {} },
  severity: 'severe',
  location: 'Нижегородская обл., г. Бор',
  latitude: 56.35,
  longitude: 44.07,
  notes: 'Мощный мезоциклон, шельфовое облако',
  tags: ['шельф', 'мезоциклон'],
  photos: [],
  createdAt: '2024-06-15T20:00:00.000Z',
  updatedAt: '2024-06-15T20:00:00.000Z',
  ...overrides
});

describe('date handling', () => {
  it('parses datetime-local values as local time', () => {
    const parsed = parseDateValue('2024-06-15T18:30');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getHours()).toBe(18);
    expect(parsed.getMinutes()).toBe(30);
  });

  it('returns null instead of an Invalid Date', () => {
    expect(parseDateValue('не дата')).toBeNull();
    expect(parseDateValue('')).toBeNull();
    expect(parseDateValue(null)).toBeNull();
    expect(parseDateValue(undefined)).toBeNull();
    expect(parseDateValue(new Date('nope'))).toBeNull();
  });

  it('never renders the literal string "Invalid Date"', () => {
    expect(formatEventDateTime(makeEvent({ date: 'garbage' }))).toBe(NO_DATE_LABEL);
    expect(formatEventDateTime(makeEvent({ date: '' }))).toBe(NO_DATE_LABEL);
    expect(formatEventDateTime({})).toBe(NO_DATE_LABEL);
    expect(formatEventDateTime(makeEvent())).not.toContain('Invalid');
  });

  it('falls back to createdAt when the observation date is missing', () => {
    const date = getEventDate(makeEvent({ date: '' }));
    expect(date?.toISOString()).toBe('2024-06-15T20:00:00.000Z');
  });
});

describe('coordinates', () => {
  it('treats 0,0 as a real position', () => {
    expect(hasCoordinates(makeEvent({ latitude: 0, longitude: 0 }))).toBe(true);
  });

  it('rejects out-of-range and non-numeric coordinates', () => {
    expect(hasCoordinates(makeEvent({ latitude: 91, longitude: 0 }))).toBe(false);
    expect(hasCoordinates(makeEvent({ latitude: 0, longitude: 181 }))).toBe(false);
    expect(hasCoordinates(makeEvent({ latitude: NaN, longitude: 0 }))).toBe(false);
    expect(hasCoordinates(makeEvent({ latitude: '56.3', longitude: '44.0' }))).toBe(false);
    expect(hasCoordinates({})).toBe(false);
  });

  it('parses coordinate input including a decimal comma', () => {
    expect(parseCoordinateInput('56,35', 'latitude')).toBeCloseTo(56.35);
    expect(parseCoordinateInput(' 44.07 ', 'longitude')).toBeCloseTo(44.07);
    expect(parseCoordinateInput('0', 'latitude')).toBe(0);
    expect(parseCoordinateInput('', 'latitude')).toBeNull();
    expect(parseCoordinateInput('abc', 'latitude')).toBeNull();
    expect(parseCoordinateInput('120', 'latitude')).toBeNull();
    expect(parseCoordinateInput('120', 'longitude')).toBe(120);
  });
});

describe('normalizeEventRecord', () => {
  it('drops records without an id', () => {
    expect(normalizeEventRecord({ title: 'x' })).toBeNull();
    expect(normalizeEventRecord(null)).toBeNull();
    expect(normalizeEventRecord('nope')).toBeNull();
  });

  it('repairs partial and hand-edited records', () => {
    const record = normalizeEventRecord({ id: 'evt_2' });
    expect(record.title).toBe('Без названия');
    expect(record.severity).toBe('moderate');
    expect(record.tags).toEqual([]);
    expect(record.photos).toEqual([]);
    expect(record.latitude).toBeNull();
    expect(record.longitude).toBeNull();
    expect(record.date).toBe('');
    expect(record.classification.category).toBe('other');
  });

  it('coerces coordinates given as strings and rejects bad ones', () => {
    const record = normalizeEventRecord({ id: 'e', latitude: '56.35', longitude: '999' });
    expect(record.latitude).toBeCloseTo(56.35);
    expect(record.longitude).toBeNull();
  });

  it('normalizes an invalid severity to the default', () => {
    expect(normalizeEventRecord({ id: 'e', severity: 'apocalyptic' }).severity).toBe('moderate');
  });

  it('deduplicates tags and strips hashes', () => {
    const record = normalizeEventRecord({ id: 'e', tags: ['#Град', 'град', ' шельф ', '', 42] });
    expect(record.tags).toEqual(['Град', 'шельф']);
  });

  it('drops photos without a url and keeps thumbnails', () => {
    const record = normalizeEventRecord({
      id: 'e',
      photos: [
        { id: 'p1', url: 'data:image/jpeg;base64,AAA', thumb: 'data:image/jpeg;base64,BBB' },
        { id: 'p2' },
        null,
        { id: 'p3', url: 'data:image/jpeg;base64,CCC' }
      ]
    });
    expect(record.photos).toHaveLength(2);
    expect(record.photos[0].thumb).toBe('data:image/jpeg;base64,BBB');
    expect(record.photos[1].thumb).toBeNull();
  });

  it('gives legacy photos without an id a stable identifier', () => {
    const record = normalizeEventRecord({ id: 'e', photos: [{ url: 'data:image/jpeg;base64,A' }] });
    expect(record.photos[0].id).toBe('photo_legacy_0');
  });

  it('is idempotent, so loading does not rewrite storage on every start', () => {
    const once = normalizeEventRecord(makeEvent());
    const twice = normalizeEventRecord(once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('skips invalid entries in a list', () => {
    expect(normalizeEventList([makeEvent(), null, { noId: true }, 'x'])).toHaveLength(1);
    expect(normalizeEventList(null)).toEqual([]);
  });
});

describe('search', () => {
  const event = normalizeEventRecord(makeEvent({
    photos: [{ id: 'p1', url: 'data:image/jpeg;base64,A', caption: 'Ворот на подходе' }]
  }));

  it('matches title, location, notes, tags, photo captions and classification', () => {
    expect(eventMatchesSearch(event, 'бор')).toBe(true);
    expect(eventMatchesSearch(event, 'мезоциклон')).toBe(true);
    expect(eventMatchesSearch(event, 'ворот')).toBe(true);
    expect(eventMatchesSearch(event, 'классическая суперячейка')).toBe(true);
    expect(eventMatchesSearch(event, 'торнадо')).toBe(false);
  });

  it('treats an empty or whitespace query as no filter', () => {
    expect(eventMatchesSearch(event, '')).toBe(true);
    expect(eventMatchesSearch(event, '   ')).toBe(true);
  });

  it('does not crash on records with missing fields', () => {
    expect(eventMatchesSearch({ id: 'x' }, 'что-нибудь')).toBe(false);
  });
});

describe('filtering and sorting', () => {
  const events = [
    normalizeEventRecord(makeEvent({ id: 'a', title: 'Бета', date: '2024-06-15T18:30', severity: 'low' })),
    normalizeEventRecord(makeEvent({ id: 'b', title: 'Альфа', date: '2025-07-01T12:00', severity: 'extreme' })),
    normalizeEventRecord(makeEvent({
      id: 'c', title: 'Гамма', date: '', createdAt: '2023-01-01T00:00:00.000Z', severity: 'moderate',
      eventType: 'hail', classification: { category: 'hail', subtype: 'unspecified', attributes: { hailSizeClass: 'large' } }
    }))
  ];

  it('sorts newest and oldest first', () => {
    expect(sortEvents(events, 'newest').map(e => e.id)).toEqual(['b', 'a', 'c']);
    expect(sortEvents(events, 'oldest').map(e => e.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by severity then by date', () => {
    expect(sortEvents(events, 'severity').map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by title using Russian collation', () => {
    expect(sortEvents(events, 'title').map(e => e.title)).toEqual(['Альфа', 'Бета', 'Гамма']);
  });

  it('keeps records without any timestamp at the bottom of date sorts', () => {
    // Raw record straight from a hand-edited backup: no usable timestamp at all.
    const undated = { id: 'z', title: 'Без даты', date: '', createdAt: 'broken', severity: 'low' };
    expect(sortEvents([undated, ...events], 'newest').at(-1).id).toBe('z');
    expect(sortEvents([undated, ...events], 'oldest').at(-1).id).toBe('z');
  });

  it('gives repaired records a valid timestamp so they stay sortable', () => {
    const repaired = normalizeEventRecord({ id: 'z', createdAt: 'broken' });
    expect(getEventDate(repaired)).toBeInstanceOf(Date);
  });

  it('does not mutate the input array', () => {
    const order = events.map(e => e.id);
    sortEvents(events, 'title');
    expect(events.map(e => e.id)).toEqual(order);
  });

  it('filters by category, subtype and severity', () => {
    expect(filterEvents(events, { categoryFilter: 'hail' }).map(e => e.id)).toEqual(['c']);
    expect(filterEvents(events, { categoryFilter: 'supercell', subtypeFilter: 'classic' }).map(e => e.id)).toEqual(['b', 'a']);
    expect(filterEvents(events, { severityFilter: 'extreme' }).map(e => e.id)).toEqual(['b']);
    expect(filterEvents(events, { categoryFilter: 'supercell', subtypeFilter: 'lp' })).toEqual([]);
  });

  it('combines search with filters', () => {
    expect(filterEvents(events, { searchQuery: 'альфа', severityFilter: 'extreme' }).map(e => e.id)).toEqual(['b']);
    expect(filterEvents(events, { searchQuery: 'альфа', severityFilter: 'low' })).toEqual([]);
  });

  it('handles a missing or empty event list', () => {
    expect(filterEvents(undefined)).toEqual([]);
    expect(filterEvents([])).toEqual([]);
  });

  it('detects whether any filter is active', () => {
    expect(areFiltersActive({ sortBy: 'newest' })).toBe(false);
    expect(areFiltersActive({ searchQuery: '  ' })).toBe(false);
    expect(areFiltersActive({ searchQuery: 'гроза' })).toBe(true);
    expect(areFiltersActive({ sortBy: 'title' })).toBe(true);
  });
});

describe('photo aggregation', () => {
  const events = [
    normalizeEventRecord(makeEvent({
      id: 'old', date: '2024-01-01T10:00',
      photos: [{ id: 'p1', url: 'data:image/jpeg;base64,A' }]
    })),
    normalizeEventRecord(makeEvent({
      id: 'new', date: '2025-01-01T10:00',
      photos: [
        { id: 'p2', url: 'data:image/jpeg;base64,B' },
        { id: 'p3', url: 'data:image/jpeg;base64,C' }
      ]
    })),
    normalizeEventRecord(makeEvent({ id: 'none', photos: [] }))
  ];

  it('lists photos newest observation first', () => {
    expect(collectArchivePhotos(events).map(item => item.photo.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('produces keys unique across events', () => {
    const keys = collectArchivePhotos(events).map(item => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('binds every photo to its owning event', () => {
    const feed = collectArchivePhotos(events);
    expect(feed.find(item => item.photo.id === 'p1').eventId).toBe('old');
    expect(feed.find(item => item.photo.id === 'p3').eventId).toBe('new');
  });

  it('counts photos across the archive', () => {
    expect(countArchivePhotos(events)).toBe(3);
    expect(countArchivePhotos([])).toBe(0);
    expect(countArchivePhotos(null)).toBe(0);
  });
});

describe('computeArchiveStats', () => {
  const events = [
    normalizeEventRecord(makeEvent({ id: 'a', severity: 'extreme', date: '2024-06-15T18:30', photos: [{ id: 'p', url: 'data:image/jpeg;base64,A' }] })),
    normalizeEventRecord(makeEvent({ id: 'b', severity: 'low', date: '2024-07-20T12:00', latitude: null, longitude: null })),
    normalizeEventRecord(makeEvent({ id: 'c', severity: 'moderate', date: '2025-06-02T09:00', eventType: 'hail', classification: { category: 'hail', subtype: 'unspecified', attributes: {} } }))
  ];

  it('summarises the archive', () => {
    const stats = computeArchiveStats(events);
    expect(stats.total).toBe(3);
    expect(stats.severeCount).toBe(1);
    expect(stats.withPhotos).toBe(1);
    expect(stats.photoCount).toBe(1);
    expect(stats.withCoords).toBe(2);
    expect(stats.categoryCounts.supercell).toBe(2);
    expect(stats.categoryCounts.hail).toBe(1);
    expect(stats.severityCounts.extreme).toBe(1);
    expect(stats.monthCounts[5]).toBe(2);
    expect(stats.years).toEqual([{ year: 2025, count: 1 }, { year: 2024, count: 2 }]);
  });

  it('handles an empty archive without dividing by zero', () => {
    const stats = computeArchiveStats([]);
    expect(stats.total).toBe(0);
    expect(stats.years).toEqual([]);
    expect(stats.monthCounts).toHaveLength(12);
  });
});
