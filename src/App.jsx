import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import MobileNav from './components/MobileNav';
import FilterBar from './components/FilterBar';
import EventCard from './components/EventCard';
import EventDetailModal from './components/EventDetailModal';
import EventFormModal from './components/EventFormModal';
import GalleryView from './components/GalleryView';
import StatsView from './components/StatsView';
import DataBackupModal from './components/DataBackupModal';
import ConfirmModal from './components/ConfirmModal';
import OfflineBanner from './components/OfflineBanner';

// Leaflet (~150 kB) is only needed on the map tab, so it is split into its own
// chunk and fetched the first time the user opens that tab.
const MapView = lazy(() => import('./components/MapView'));

import { getStoredEvents, saveEvent, deleteEvent, clearAllEvents } from './services/storage';
import { EMPTY_FILTERS, areFiltersActive, filterEvents } from './services/events';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import { CloudLightning, Plus, HardDrive, Loader2, AlertCircle, X } from 'lucide-react';

export default function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [activeTab, setActiveTab] = useState('events');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [detailEventId, setDetailEventId] = useState(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  /* ------------------------------------------------------------ lifecycle */

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await getStoredEvents());
      setLoadError('');
    } catch (err) {
      console.error('Failed to load events:', err);
      setLoadError(err?.message || 'Не удалось загрузить архив.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* --------------------------------------------------------- filter state */

  // Debounced so typing does not re-filter and re-render the grid per keystroke.
  const debouncedSearch = useDebouncedValue(searchQuery, 220);

  const filters = useMemo(
    () => ({ searchQuery: debouncedSearch, categoryFilter, subtypeFilter, severityFilter, sortBy }),
    [debouncedSearch, categoryFilter, subtypeFilter, severityFilter, sortBy]
  );

  const filteredEvents = useMemo(() => filterEvents(events, filters), [events, filters]);
  const isFiltered = areFiltersActive({ ...filters, searchQuery });

  const handleResetFilters = useCallback(() => {
    setSearchQuery(EMPTY_FILTERS.searchQuery);
    setCategoryFilter(EMPTY_FILTERS.categoryFilter);
    setSubtypeFilter(EMPTY_FILTERS.subtypeFilter);
    setSeverityFilter(EMPTY_FILTERS.severityFilter);
    setSortBy(EMPTY_FILTERS.sortBy);
  }, []);

  /* --------------------------------------------------------------- actions */

  // The detail dialog is keyed by id rather than by a snapshot, so it always
  // reflects the freshly reloaded record after an edit.
  const detailEvent = useMemo(
    () => (detailEventId ? events.find(event => event.id === detailEventId) || null : null),
    [detailEventId, events]
  );

  const eventPendingDeletion = useMemo(
    () => (deleteConfirmId ? events.find(event => event.id === deleteConfirmId) || null : null),
    [deleteConfirmId, events]
  );

  const handleOpenAddModal = useCallback(() => {
    setEventToEdit(null);
    setIsFormModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((event) => {
    setEventToEdit(event);
    setDetailEventId(null);
    setIsFormModalOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setIsFormModalOpen(false);
    setEventToEdit(null);
  }, []);

  // Stable identities keep the memoised EventCard from re-rendering.
  const handleViewEvent = useCallback((event) => setDetailEventId(event.id), []);
  const handleRequestDelete = useCallback((id) => setDeleteConfirmId(id), []);

  const handleSaveEvent = useCallback(async (eventData) => {
    // Errors propagate to the form, which keeps the user's input on screen.
    await saveEvent(eventData);
    await loadData();
    setIsFormModalOpen(false);
    setEventToEdit(null);
  }, [loadData]);

  const handleDeleteEvent = useCallback(async (id) => {
    try {
      await deleteEvent(id);
      setDeleteConfirmId(null);
      setDetailEventId(current => (current === id ? null : current));
      await loadData();
    } catch (err) {
      setDeleteConfirmId(null);
      setActionError(`Не удалось удалить запись: ${err.message}`);
    }
  }, [loadData]);

  const handleClearArchive = useCallback(async () => {
    try {
      await clearAllEvents();
      setDetailEventId(null);
      await loadData();
    } catch (err) {
      setActionError(`Не удалось очистить архив: ${err.message}`);
    }
  }, [loadData]);

  /* ------------------------------------------------------------------ view */

  const renderEventsTab = () => {
    if (loading) {
      return (
        <div className="loading-state">
          <Loader2 size={26} className="spin-icon" aria-hidden="true" />
          <span>Загрузка архива…</span>
        </div>
      );
    }

    if (loadError) {
      return (
        <div className="empty-state-card">
          <div className="empty-icon-wrapper"><AlertCircle size={32} aria-hidden="true" /></div>
          <h3>Архив не открылся</h3>
          <p>{loadError}</p>
          <button type="button" className="btn-primary" onClick={loadData}>Повторить</button>
        </div>
      );
    }

    if (events.length === 0) {
      return (
        <div className="empty-archive-hero">
          <div className="empty-hero-icon"><CloudLightning size={40} aria-hidden="true" /></div>
          <h2>Ваш Storm Archive пуст</h2>
          <p>
            Здесь будут храниться личные метеонаблюдения: грозы, суперячейки, шкваловые вороты,
            редкие атмосферные явления и фотографии к ним.
          </p>
          <div className="empty-hero-actions">
            <button type="button" className="btn-primary" onClick={handleOpenAddModal}>
              <Plus size={18} aria-hidden="true" /> Добавить первое наблюдение
            </button>
            <button type="button" className="btn-secondary" onClick={() => setIsBackupModalOpen(true)}>
              <HardDrive size={18} aria-hidden="true" /> Импортировать из JSON
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <FilterBar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          subtypeFilter={subtypeFilter}
          setSubtypeFilter={setSubtypeFilter}
          severityFilter={severityFilter}
          setSeverityFilter={setSeverityFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          totalResults={filteredEvents.length}
          totalEvents={events.length}
          isFiltered={isFiltered}
          onReset={handleResetFilters}
        />

        {filteredEvents.length === 0 ? (
          <div className="empty-state-card">
            <h3>Ничего не найдено</h3>
            <p>По запросу или выбранным фильтрам наблюдений нет.</p>
            <button type="button" className="btn-secondary" onClick={handleResetFilters}>Сбросить фильтры</button>
          </div>
        ) : (
          <div className="events-grid">
            {filteredEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onView={handleViewEvent}
                onEdit={handleOpenEditModal}
                onDelete={handleRequestDelete}
              />
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="app-shell">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={handleOpenAddModal}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        eventCount={events.length}
        isOnline={isOnline}
      />

      <OfflineBanner isOnline={isOnline} />

      {actionError && (
        <div className="app-error-banner" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{actionError}</span>
          <button type="button" className="close-btn" onClick={() => setActionError('')} aria-label="Скрыть сообщение">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="main-content-container">
        {activeTab === 'events' && renderEventsTab()}

        {activeTab === 'map' && (
          <Suspense fallback={<div className="loading-state"><Loader2 size={26} className="spin-icon" aria-hidden="true" /><span>Загрузка карты…</span></div>}>
            <MapView events={events} onViewEvent={handleViewEvent} onOpenAddModal={handleOpenAddModal} />
          </Suspense>
        )}

        {activeTab === 'gallery' && (
          <GalleryView events={events} onViewEvent={handleViewEvent} onOpenAddModal={handleOpenAddModal} />
        )}

        {activeTab === 'stats' && <StatsView events={events} onOpenAddModal={handleOpenAddModal} />}
      </main>

      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={handleOpenAddModal}
        eventCount={events.length}
      />

      {isFormModalOpen && (
        <EventFormModal eventToEdit={eventToEdit} onClose={handleCloseForm} onSave={handleSaveEvent} />
      )}

      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          onClose={() => setDetailEventId(null)}
          onEdit={handleOpenEditModal}
          onDelete={handleRequestDelete}
        />
      )}

      {isBackupModalOpen && (
        <DataBackupModal
          onClose={() => setIsBackupModalOpen(false)}
          onDataReload={loadData}
          onClearArchive={handleClearArchive}
          events={events}
        />
      )}

      {eventPendingDeletion && (
        <ConfirmModal
          title="Удалить наблюдение?"
          message={`Запись «${eventPendingDeletion.title}»${
            eventPendingDeletion.photos.length > 0
              ? ` и связанные с ней снимки (${eventPendingDeletion.photos.length})`
              : ''
          } будут удалены безвозвратно.`}
          confirmLabel="Удалить"
          onConfirm={() => handleDeleteEvent(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
}
