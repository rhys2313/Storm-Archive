import React from 'react';
import { CloudLightning, Plus, HardDrive, Wifi, WifiOff } from 'lucide-react';
import { NAV_TABS } from '../config/navigation';

export default function Header({ activeTab, setActiveTab, onOpenAddModal, onOpenBackupModal, eventCount, isOnline }) {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="logo-section">
          <div className="logo-icon-wrapper">
            <CloudLightning className="logo-icon" size={24} aria-hidden="true" />
          </div>
          <div className="logo-text">
            <h1 className="logo-title">Storm Archive</h1>
            <span className="logo-subtitle">Личный архив метеонаблюдений</span>
          </div>
        </div>

        <nav className="desktop-nav" aria-label="Разделы">
          {NAV_TABS.map(({ id, label, icon: Icon, showCount }) => (
            <button
              key={id}
              type="button"
              className={`nav-btn ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {showCount && eventCount > 0 && <span className="nav-count">{eventCount}</span>}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <span
            className={`online-badge ${isOnline ? 'online' : 'offline'}`}
            title={isOnline ? 'Подключено к сети' : 'Офлайн-режим: данные сохраняются локально'}
          >
            {isOnline ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
            <span className="online-text">{isOnline ? 'Онлайн' : 'Офлайн'}</span>
          </span>

          <button
            type="button"
            className="action-icon-btn"
            onClick={onOpenBackupModal}
            title="Данные и резервные копии"
            aria-label="Данные и резервные копии"
          >
            <HardDrive size={18} />
          </button>

          <button type="button" className="btn-primary add-event-btn" onClick={onOpenAddModal}>
            <Plus size={18} aria-hidden="true" />
            <span className="btn-label">Добавить наблюдение</span>
          </button>
        </div>
      </div>
    </header>
  );
}
