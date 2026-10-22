import { Plus } from 'lucide-react';
import { NAV_TABS } from '../config/navigation';

export default function MobileNav({ activeTab, setActiveTab, onOpenAddModal }) {
  return (
    <div className="mobile-dock">
      <nav className="mobile-bottom-nav" aria-label="Разделы">
        {NAV_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`mobile-nav-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
            aria-current={activeTab === id ? 'page' : undefined}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button
        type="button"
        className="mobile-fab-btn"
        onClick={onOpenAddModal}
        aria-label="Добавить наблюдение"
      >
        <Plus size={26} aria-hidden="true" />
      </button>
    </div>
  );
}
