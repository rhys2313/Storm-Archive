import React from 'react';
import { Plus } from 'lucide-react';
import { NAV_TABS } from '../config/navigation';

const [FIRST, SECOND, THIRD, FOURTH] = NAV_TABS;

const NavItem = ({ tab, activeTab, setActiveTab, eventCount }) => {
  const { id, label, icon: Icon, showCount } = tab;
  return (
    <button
      type="button"
      className={`mobile-nav-item ${activeTab === id ? 'active' : ''}`}
      onClick={() => setActiveTab(id)}
      aria-current={activeTab === id ? 'page' : undefined}
    >
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      {showCount && eventCount > 0 && (
        <span className="mobile-count-dot">{eventCount > 99 ? '99+' : eventCount}</span>
      )}
    </button>
  );
};

export default function MobileNav({ activeTab, setActiveTab, onOpenAddModal, eventCount }) {
  const shared = { activeTab, setActiveTab, eventCount };

  return (
    <nav className="mobile-bottom-nav" aria-label="Разделы">
      <NavItem tab={FIRST} {...shared} />
      <NavItem tab={SECOND} {...shared} />

      <div className="fab-wrapper">
        <button
          type="button"
          className="mobile-fab-btn"
          onClick={onOpenAddModal}
          aria-label="Добавить наблюдение"
        >
          <Plus size={24} />
        </button>
      </div>

      <NavItem tab={THIRD} {...shared} />
      <NavItem tab={FOURTH} {...shared} />
    </nav>
  );
}
