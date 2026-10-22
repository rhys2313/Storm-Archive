import { Plus, HardDrive, SlidersHorizontal, ArrowUpRight } from 'lucide-react';
import { NAV_TABS } from '../config/navigation';
import StormMark from './StormMark';

export default function Header({
  activeTab,
  setActiveTab,
  onOpenAddModal,
  onOpenBackupModal,
  onOpenSettings,
  theme,
  eventCount,
  isOnline
}) {
  return (
    <header className="app-header">
      <div className="header-container">
        <button
          type="button"
          className="brand"
          onClick={() => setActiveTab('events')}
          aria-label="Storm Archive — открыть архив"
        >
          <StormMark theme={theme} />
          <span className="logo-text">
            <span className="logo-title">
              Storm
              <br />
              Archive
            </span>
            <span className="logo-subtitle">Личный архив наблюдений</span>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="Разделы">
          {NAV_TABS.map(({ id, label, icon: Icon, showCount }) => (
            <button
              key={id}
              type="button"
              title={label}
              className={`nav-btn ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
            >
              <Icon size={21} aria-hidden="true" />
              <span>{label}</span>
              {showCount && eventCount > 0 && (
                <span className="nav-count">{eventCount}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="btn-primary add-event-btn"
          onClick={onOpenAddModal}
          aria-label="Добавить наблюдение"
          title="Добавить наблюдение"
        >
          <Plus size={20} aria-hidden="true" />
          <span>Новое наблюдение</span>
        </button>
        <div className="sidebar-bottom">
          <button
            type="button"
            className="sidebar-action backup-action"
            onClick={onOpenBackupModal}
            title="Данные и резервные копии"
            aria-label="Данные и резервные копии"
          >
            <HardDrive size={19} aria-hidden="true" />
            <span>Данные и копии</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="sidebar-action settings-action"
            onClick={onOpenSettings}
            aria-label="Настройки"
            title="Настройки"
          >
            <SlidersHorizontal size={19} aria-hidden="true" />
            <span>Настройки</span>
          </button>
          <div className="connection-state">
            <span
              className={`connection-dot ${isOnline ? 'online' : ''}`}
              aria-hidden="true"
            />
            <span>
              {isOnline ? 'Данные на устройстве' : 'Работа без интернета'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
