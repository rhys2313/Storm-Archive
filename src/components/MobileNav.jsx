import React from 'react';
import { CloudLightning, Map, Image as ImageIcon, BarChart2, Plus } from 'lucide-react';

export default function MobileNav({ activeTab, setActiveTab, onOpenAddModal, eventCount }) {
  return (
    <nav className="mobile-bottom-nav">
      <button 
        className={`mobile-nav-item ${activeTab === 'events' ? 'active' : ''}`}
        onClick={() => setActiveTab('events')}
      >
        <CloudLightning size={20} />
        <span>Архив</span>
        {eventCount > 0 && <span className="mobile-count-dot">{eventCount}</span>}
      </button>

      <button 
        className={`mobile-nav-item ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => setActiveTab('map')}
      >
        <Map size={20} />
        <span>Карта</span>
      </button>

      <div className="fab-wrapper">
        <button className="mobile-fab-btn" onClick={onOpenAddModal} title="Добавить наблюдение">
          <Plus size={24} />
        </button>
      </div>

      <button 
        className={`mobile-nav-item ${activeTab === 'gallery' ? 'active' : ''}`}
        onClick={() => setActiveTab('gallery')}
      >
        <ImageIcon size={20} />
        <span>Галерея</span>
      </button>

      <button 
        className={`mobile-nav-item ${activeTab === 'stats' ? 'active' : ''}`}
        onClick={() => setActiveTab('stats')}
      >
        <BarChart2 size={20} />
        <span>Инфо</span>
      </button>
    </nav>
  );
}
