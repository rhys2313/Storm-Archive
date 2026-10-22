import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
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
import PwaStatus from './components/PwaStatus';
import ShowMore from './components/ShowMore';
import SettingsModal from './components/SettingsModal';
import Presence from './components/Presence';
import StormMark from './components/StormMark';
import { useTheme } from './hooks/useTheme';
import { useSectionNavigation } from './hooks/useSectionNavigation';

// Leaflet (~150 kB) is only needed on the map tab, so it is split into its own
// chunk and fetched the first time the user opens that tab.
const MapView = lazy(() => import('./components/MapView'));

import {
  getStoredArchive,
  saveEvent,
  deleteEvent,
  clearAllEvents,
  retryStorageConnection
} from './services/storage';
import {
  EMPTY_FILTERS,
  areFiltersActive,
  filterEvents
} from './services/events';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import {
  CloudLightning,
  Plus,
  HardDrive,
  Loader2,
  AlertCircle,
  X
} from 'lucide-react';

export default function App() {
  const appearance = useTheme();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [archiveInfo, setArchiveInfo] = useState({
    issues: [],
    recordCount: 0,
    hasStoredData: false
  });
  const { activeTab, setActiveTab, mainRef } = useSectionNavigation();
  const [archiveLimit, setArchiveLimit] = useState(36);
  const [galleryFilter, setGalleryFilter] = useState('');
  const [galleryLimit, setGalleryLimit] = useState(48);

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

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

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

  const loadData = useCallback(async ({ retryStorage = false } = {}) => {
    setLoading(true);
    try {
      if (retryStorage) await retryStorageConnection();
      const { events: loadedEvents, ...info } = await getStoredArchive();
      setEvents(loadedEvents);
      setArchiveInfo(info);
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
    () => ({
      searchQuery: debouncedSearch,
      categoryFilter,
      subtypeFilter,
      severityFilter,
      sortBy
    }),
    [debouncedSearch, categoryFilter, subtypeFilter, severityFilter, sortBy]
  );

  const filteredEvents = useMemo(
    () => filterEvents(events, filters),
    [events, filters]
  );
  useEffect(() => {
    setArchiveLimit(36);
  }, [searchQuery, categoryFilter, subtypeFilter, severityFilter, sortBy]);
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
    () =>
      detailEventId
        ? events.find((event) => event.id === detailEventId) || null
        : null,
    [detailEventId, events]
  );

  const eventPendingDeletion = useMemo(
    () =>
      deleteConfirmId
        ? events.find((event) => event.id === deleteConfirmId) || null
        : null,
    [deleteConfirmId, events]
  );

  const handleOpenAddModal = useCallback(() => {
    if (archiveInfo.storage?.readOnly) {
      setActionError(
        'Изменения заблокированы: одно из хранилищ недоступно или имеет неподдерживаемую схему. Откройте «Данные и резервные копии» для диагностики.'
      );
      return;
    }
    setEventToEdit(null);
    setIsFormModalOpen(true);
  }, [archiveInfo.storage?.readOnly]);

  const handleOpenEditModal = useCallback(
    (event) => {
      if (
        archiveInfo.storage?.readOnly ||
        archiveInfo.storage?.overlapIds.includes(event.id)
      ) {
        setDetailEventId(null);
        setActionError(
          'Запись защищена от изменения. Проверьте хранилища и объедините копии или сохраните обе версии в разделе «Данные и резервные копии».'
        );
        return;
      }
      if (archiveInfo.issues.some((issue) => issue.id === event.id)) {
        setDetailEventId(null);
        setActionError(
          'Запись содержит повреждённые данные. Её исходное содержимое сохранено. Откройте «Данные и резервные копии» и экспортируйте архив перед восстановлением.'
        );
        return;
      }
      setEventToEdit(event);
      setDetailEventId(null);
      setIsFormModalOpen(true);
    },
    [archiveInfo.issues, archiveInfo.storage]
  );

  const handleCloseForm = useCallback(() => {
    setIsFormModalOpen(false);
    setEventToEdit(null);
  }, []);

  // Stable identities keep the memoised EventCard from re-rendering.
  const handleViewEvent = useCallback(
    (event) => setDetailEventId(event.id),
    []
  );
  const handleRequestDelete = useCallback((id) => setDeleteConfirmId(id), []);

  const handleSaveEvent = useCallback(
    async (eventData) => {
      // Errors propagate to the form, which keeps the user's input on screen.
      await saveEvent(eventData);
      await loadData();
      setIsFormModalOpen(false);
      setEventToEdit(null);
    },
    [loadData]
  );

  const handleDeleteEvent = useCallback(
    async (id) => {
      try {
        await deleteEvent(id);
        setDeleteConfirmId(null);
        setDetailEventId((current) => (current === id ? null : current));
        await loadData();
      } catch (err) {
        setDeleteConfirmId(null);
        setActionError(`Не удалось удалить запись: ${err.message}`);
      }
    },
    [loadData]
  );

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
          <div className="empty-icon-wrapper">
            <AlertCircle size={32} aria-hidden="true" />
          </div>
          <h2>Архив не открылся</h2>
          <p>{loadError}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => loadData({ retryStorage: true })}
          >
            Повторить
          </button>
        </div>
      );
    }

    if (events.length === 0) {
      if (archiveInfo.hasStoredData) {
        if (
          archiveInfo.storage?.incomplete &&
          archiveInfo.issues.length === 0
        ) {
          return (
            <div className="empty-state-card">
              <h2>
                {archiveInfo.storage.kind === 'idb'
                  ? 'Не удалось проверить весь архив'
                  : 'Основной архив недоступен'}
              </h2>
              <p>
                Содержимое всех хранилищ не удалось проверить. Это не означает,
                что архив пуст. Данные сохранены в своих хранилищах.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => loadData({ retryStorage: true })}
              >
                Проверить хранилища
              </button>
            </div>
          );
        }
        return (
          <div className="empty-state-card">
            <h2>Записи требуют восстановления</h2>
            <p>
              Исходные данные сохранены, но их не удалось безопасно показать.{' '}
              {archiveInfo.storage?.readOnly
                ? 'Для полного доступа восстановите доступ к хранилищам.'
                : 'Экспорт включает исходное содержимое.'}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsBackupModalOpen(true)}
            >
              Данные и резервные копии
            </button>
          </div>
        );
      }
      return (
        <div className="empty-archive-hero">
          <div className="empty-hero-copy">
            <span className="empty-caption">
              Место для того, что вы заметили
            </span>
            <h2>Сохраните первое наблюдение</h2>
            <p>
              Явление, место, время и несколько снимков. Даже короткая запись
              станет частью вашей истории наблюдений.
            </p>
            <div className="empty-hero-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleOpenAddModal}
              >
                <Plus size={18} aria-hidden="true" /> Добавить первое наблюдение
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsBackupModalOpen(true)}
              >
                <HardDrive size={18} aria-hidden="true" /> Импортировать из JSON
              </button>
            </div>
            <p className="empty-local-note">
              <HardDrive size={15} aria-hidden="true" /> Ваши записи останутся
              на этом устройстве
            </p>
          </div>
          <div className="empty-hero-relief" aria-hidden="true">
            <div className="relief-orbit">
              <StormMark />
            </div>
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
            <h2>Ничего не найдено</h2>
            <p>По запросу или выбранным фильтрам наблюдений нет.</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleResetFilters}
            >
              Сбросить фильтры
            </button>
          </div>
        ) : (
          <div className="events-grid" id="archive-list">
            {filteredEvents.slice(0, archiveLimit).map((event) => (
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
        <ShowMore
          shown={Math.min(archiveLimit, filteredEvents.length)}
          total={filteredEvents.length}
          label="наблюдения"
          listId="archive-list"
          onMore={() => setArchiveLimit((value) => value + 36)}
        />
      </>
    );
  };

  return (
    <div className="app-shell">
      <button
        type="button"
        className="skip-link"
        onClick={() => mainRef.current?.focus()}
      >
        К содержимому
      </button>
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={handleOpenAddModal}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        eventCount={events.length}
        isOnline={isOnline}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="workspace">
        <OfflineBanner isOnline={isOnline} />
        <PwaStatus
          blocked={
            isFormModalOpen ||
            Boolean(detailEvent) ||
            isBackupModalOpen ||
            isSettingsOpen ||
            Boolean(eventPendingDeletion)
          }
        />

        {archiveInfo.storage?.notices.length > 0 && (
          <div className="app-error-banner" role="status">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{archiveInfo.storage.notices.join(' ')}</span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsBackupModalOpen(true)}
            >
              Проверить данные
            </button>
          </div>
        )}

        {archiveInfo.issues.length > 0 && (
          <div className="app-error-banner" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>
              {archiveInfo.recordCount == null
                ? 'Локальный архив требует восстановления.'
                : `Проблемных записей: ${archiveInfo.issues.length}.`}{' '}
              Доступная часть архива открыта.
              {archiveInfo.storage?.readOnly
                ? 'Исходные данные сохранены. Для полного доступа требуется восстановить доступ к хранилищам.'
                : 'Исходные данные сохранены без изменений и включены в экспорт доступной части.'}
            </span>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsBackupModalOpen(true)}
            >
              Резервная копия
            </button>
          </div>
        )}

        {actionError && (
          <div className="app-error-banner" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{actionError}</span>
            <button
              type="button"
              className="close-btn"
              onClick={() => setActionError('')}
              aria-label="Скрыть сообщение"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <main
          className="main-content-container"
          ref={mainRef}
          tabIndex={-1}
          aria-labelledby="section-heading"
        >
          <div className="page-heading">
            <div>
              <h1 id="section-heading" className="section-heading">
                {
                  {
                    events: 'Архив наблюдений',
                    map: 'Карта наблюдений',
                    gallery: 'Галерея',
                    stats: 'Статистика'
                  }[activeTab]
                }
              </h1>
            </div>
            <PwaStatus compact />
          </div>
          <div className="section-view" key={activeTab}>
            {activeTab !== 'events' &&
            (loading ||
              loadError ||
              (archiveInfo.hasStoredData && events.length === 0)) ? (
              renderEventsTab()
            ) : (
              <>
                {activeTab === 'events' && renderEventsTab()}

                {activeTab === 'map' && (
                  <Suspense
                    fallback={
                      <div className="loading-state">
                        <Loader2
                          size={26}
                          className="spin-icon"
                          aria-hidden="true"
                        />
                        <span>Загрузка карты…</span>
                      </div>
                    }
                  >
                    <MapView
                      events={events}
                      onViewEvent={handleViewEvent}
                      onOpenAddModal={handleOpenAddModal}
                      onOpenArchive={() => setActiveTab('events')}
                    />
                  </Suspense>
                )}

                {activeTab === 'gallery' && (
                  <GalleryView
                    events={events}
                    onViewEvent={handleViewEvent}
                    onOpenAddModal={handleOpenAddModal}
                    categoryFilter={galleryFilter}
                    onCategoryChange={(value) => {
                      setGalleryFilter(value);
                      setGalleryLimit(48);
                    }}
                    limit={galleryLimit}
                    onShowMore={() => setGalleryLimit((value) => value + 48)}
                    onOpenArchive={() => setActiveTab('events')}
                  />
                )}

                {activeTab === 'stats' && (
                  <StatsView
                    events={events}
                    onOpenAddModal={handleOpenAddModal}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <MobileNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={handleOpenAddModal}
        eventCount={events.length}
      />

      <Presence visible={isFormModalOpen}>
        {isFormModalOpen && (
          <EventFormModal
            eventToEdit={eventToEdit}
            onClose={handleCloseForm}
            onSave={handleSaveEvent}
          />
        )}
      </Presence>

      <Presence visible={Boolean(detailEvent)}>
        {detailEvent && (
          <EventDetailModal
            event={detailEvent}
            onClose={() => setDetailEventId(null)}
            onEdit={handleOpenEditModal}
            onDelete={handleRequestDelete}
          />
        )}
      </Presence>

      <Presence visible={isBackupModalOpen}>
        {isBackupModalOpen && (
          <DataBackupModal
            onClose={() => setIsBackupModalOpen(false)}
            onDataReload={loadData}
            onClearArchive={handleClearArchive}
            events={events}
            archiveInfo={archiveInfo}
          />
        )}
      </Presence>

      <Presence visible={isSettingsOpen}>
        {isSettingsOpen && (
          <SettingsModal
            preference={appearance.preference}
            onThemeChange={appearance.chooseTheme}
            saveError={appearance.saveError}
            onClose={() => setIsSettingsOpen(false)}
            onOpenBackup={() => {
              setIsSettingsOpen(false);
              setIsBackupModalOpen(true);
            }}
          />
        )}
      </Presence>

      <Presence visible={Boolean(eventPendingDeletion)}>
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
      </Presence>
    </div>
  );
}
