import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import MobileNav from './components/MobileNav';
import FilterBar from './components/FilterBar';
import EventCard from './components/EventCard';
import EventDetailModal from './components/EventDetailModal';
import EventFormModal from './components/EventFormModal';
import MapView from './components/MapView';
import GalleryView from './components/GalleryView';
import StatsView from './components/StatsView';
import DataBackupModal from './components/DataBackupModal';
import ConfirmModal from './components/ConfirmModal';
import OfflineBanner from './components/OfflineBanner';

import { getStoredEvents, saveEvent, deleteEvent, clearAllEvents } from './services/storage';
import { EVENT_TYPES, SEVERITY_LEVELS } from './types/storm';
import { CloudLightning, Plus, Sparkles, HardDrive, RefreshCw } from 'lucide-react';

export default function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'map' | 'gallery' | 'stats'

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Modals
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [detailModalEvent, setDetailModalEvent] = useState(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Online / Offline
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getStoredEvents();
      setEvents(data);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter & Sort Logic
  const filteredEvents = useMemo(() => {
    return events
      .filter(evt => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = evt.title?.toLowerCase().includes(q);
          const matchLoc = evt.location?.toLowerCase().includes(q);
          const matchNotes = evt.notes?.toLowerCase().includes(q);
          const matchTags = evt.tags?.some(t => t.toLowerCase().includes(q));
          if (!matchTitle && !matchLoc && !matchNotes && !matchTags) return false;
        }

        // Type filter
        if (typeFilter && evt.eventType !== typeFilter) return false;

        // Severity filter
        if (severityFilter && evt.severity !== severityFilter) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
        }
        if (sortBy === 'oldest') {
          return new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt);
        }
        if (sortBy === 'severity') {
          const rank = { extreme: 4, severe: 3, moderate: 2, low: 1 };
          return (rank[b.severity] || 0) - (rank[a.severity] || 0);
        }
        if (sortBy === 'title') {
          return (a.title || '').localeCompare(b.title || '');
        }
        return 0;
      });
  }, [events, searchQuery, typeFilter, severityFilter, sortBy]);

  const handleOpenAddModal = () => {
    setEventToEdit(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (evt) => {
    setEventToEdit(evt);
    setDetailModalEvent(null);
    setIsFormModalOpen(true);
  };

  const handleSaveEvent = async (eventData) => {
    try {
      await saveEvent(eventData);
      await loadData();
      setIsFormModalOpen(false);
      setEventToEdit(null);
    } catch (err) {
      alert('Ошибка при сохранении события: ' + err.message);
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      await deleteEvent(id);
      await loadData();
      setDeleteConfirmId(null);
      if (detailModalEvent && detailModalEvent.id === id) {
        setDetailModalEvent(null);
      }
    } catch (err) {
      alert('Ошибка при удалении события: ' + err.message);
    }
  };

  const handleClearArchive = async () => {
    try {
      await clearAllEvents();
      await loadData();
    } catch (err) {
      alert('Ошибка при очистке архива: ' + err.message);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('');
    setSeverityFilter('');
    setSortBy('newest');
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

      <main className="main-content-container">
        {activeTab === 'events' && (
          <div className="events-tab-content">
            <FilterBar 
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              typeFilter={typeFilter}
              setTypeFilter={setTypeFilter}
              severityFilter={severityFilter}
              setSeverityFilter={setSeverityFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              totalResults={filteredEvents.length}
              onReset={handleResetFilters}
            />

            {loading ? (
              <div className="loading-state">
                <RefreshCw size={24} className="spin-icon" />
                <span>Загрузка архива...</span>
              </div>
            ) : events.length === 0 ? (
              /* CLEAN EMPTY ARCHIVE FOR NEW USER */
              <div className="empty-archive-hero">
                <div className="empty-hero-icon">
                  <CloudLightning size={40} />
                </div>
                <h2>Ваш Storm Archive чист</h2>
                <p>
                  Здесь будут храниться ваши личные метеорологические наблюдения: грозы, суперячейки,
                  шельфовые облака, шквалы, редкие атмосферные явления и фотографии.
                </p>
                <div className="empty-hero-actions">
                  <button className="btn-primary hero-btn" onClick={handleOpenAddModal}>
                    <Plus size={18} /> Добавить первое наблюдение
                  </button>
                  <button className="btn-secondary hero-btn" onClick={() => setIsBackupModalOpen(true)}>
                    <HardDrive size={18} /> Импортировать из JSON
                  </button>
                </div>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="empty-state-card">
                <h3>Ничего не найдено</h3>
                <p>По вашему запросу или выбранным фильтрам метеонаблюдения не найдены.</p>
                <button className="btn-secondary" onClick={handleResetFilters}>
                  Сбросить все фильтры
                </button>
              </div>
            ) : (
              <div className="events-grid">
                {filteredEvents.map(evt => (
                  <EventCard 
                    key={evt.id}
                    event={evt}
                    onView={(item) => setDetailModalEvent(item)}
                    onEdit={(item) => handleOpenEditModal(item)}
                    onDelete={(id) => setDeleteConfirmId(id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'map' && (
          <MapView 
            events={events}
            onViewEvent={(evt) => setDetailModalEvent(evt)}
            onOpenAddModal={handleOpenAddModal}
          />
        )}

        {activeTab === 'gallery' && (
          <GalleryView 
            events={events}
            onViewEvent={(evt) => setDetailModalEvent(evt)}
            onOpenAddModal={handleOpenAddModal}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView 
            events={events}
            onOpenAddModal={handleOpenAddModal}
          />
        )}
      </main>

      <MobileNav 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAddModal={handleOpenAddModal}
        eventCount={events.length}
      />

      {/* Modals */}
      {isFormModalOpen && (
        <EventFormModal 
          eventToEdit={eventToEdit}
          onClose={() => {
            setIsFormModalOpen(false);
            setEventToEdit(null);
          }}
          onSave={handleSaveEvent}
        />
      )}

      {detailModalEvent && (
        <EventDetailModal 
          event={detailModalEvent}
          onClose={() => setDetailModalEvent(null)}
          onEdit={(evt) => handleOpenEditModal(evt)}
          onDelete={(id) => setDeleteConfirmId(id)}
        />
      )}

      {isBackupModalOpen && (
        <DataBackupModal 
          onClose={() => setIsBackupModalOpen(false)}
          onDataReload={loadData}
          onClearArchive={handleClearArchive}
          totalEvents={events.length}
        />
      )}

      {deleteConfirmId && (
        <ConfirmModal 
          title="Удаление метеонаблюдения"
          message="Вы уверены, что хотите полностью удалить эту запись и все связанные с ней снимки?"
          onConfirm={() => handleDeleteEvent(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  );
}
