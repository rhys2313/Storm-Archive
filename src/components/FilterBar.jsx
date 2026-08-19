import React from 'react';
import { EVENT_TYPES, SEVERITY_LEVELS } from '../types/storm';
import { Search, SlidersHorizontal, X, ArrowDownUp } from 'lucide-react';

export default function FilterBar({ 
  searchQuery, 
  setSearchQuery, 
  typeFilter, 
  setTypeFilter, 
  severityFilter, 
  setSeverityFilter, 
  sortBy, 
  setSortBy,
  totalResults,
  onReset
}) {
  const isFiltered = searchQuery || typeFilter || severityFilter || sortBy !== 'newest';

  return (
    <div className="filter-bar">
      <div className="filter-top-row">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" />
          <input 
            type="text" 
            placeholder="Поиск по названию, локации, заметкам или тегам..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-controls">
          <div className="select-wrapper">
            <select 
              value={typeFilter} 
              onChange={(e) => setTypeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">Все типы явлений</option>
              {Object.values(EVENT_TYPES).map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="select-wrapper">
            <select 
              value={severityFilter} 
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="filter-select"
            >
              <option value="">Любая интенсивность</option>
              {Object.values(SEVERITY_LEVELS).map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="select-wrapper">
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="filter-select"
            >
              <option value="newest">Сначала новые</option>
              <option value="oldest">Сначала старые</option>
              <option value="severity">По силе (сначала ОЯ)</option>
              <option value="title">По названию (А-Я)</option>
            </select>
          </div>

          {isFiltered && (
            <button className="btn-secondary reset-filters-btn" onClick={onReset} title="Сбросить фильтры">
              <X size={16} />
              <span className="btn-text">Сбросить</span>
            </button>
          )}
        </div>
      </div>

      <div className="filter-info-row">
        <span className="results-count">
          Найдено наблюдений: <strong>{totalResults}</strong>
        </span>
      </div>
    </div>
  );
}
