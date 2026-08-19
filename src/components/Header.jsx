import React from 'react';
import { CloudLightning, Map, Image as ImageIcon, BarChart2, Plus, Download, HardDrive, Wifi, WifiOff } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, onOpenAddModal, onOpenBackupModal, eventCount, isOnline }) {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="logo-section">
          <div className="logo-icon-wrapper">
            <CloudLightning className="logo-icon" size={24} />
          </div>
          <div className="logo-text">
            <h1 className="logo-title">Storm Archive</h1>
            <span className="logo-subtitle">Личный архив метеонаблюдений</span>
          </div>
        </div>

        <nav className="desktop-nav">
          <button 
            className={`nav-btn ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            <CloudLightning size={18} />
            <span>Архив</span>
            {eventCount > 0 && <span className="nav-count">{eventCount}</span>}
          </button>

          <button 
            className={`nav-btn ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            <Map size={18} />
            <span>Карта</span>
          </button>

          <button 
            className={`nav-btn ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            <ImageIcon size={18} />
            <span>Галерея</span>
          </button>

          <button 
            className={`nav-btn ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            <BarChart2 size={18} />
            <span>Статистика</span>
          </button>
        </nav>

        <div className="header-actions">
          <div className={`online-badge ${isOnline ? 'online' : 'offline'}`} title={isOnline ? 'Подключено к сети' : 'Офлайн режим (данные сохраняются локально)'}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="online-text">{isOnline ? 'Онлайн' : 'Офлайн'}</span>
          </div>

          <button 
            className="action-icon-btn" 
            onClick={onOpenBackupModal}
            title="Экспорт / Импорт данных"
          >
            <HardDrive size={18} />
          </button>

          <button 
            className="btn-primary add-event-btn"
            onClick={onOpenAddModal}
          >
            <Plus size={18} />
            <span className="btn-label">Добавить событие</span>
          </button>
        </div>
      </div>
    </header>
  );
}
