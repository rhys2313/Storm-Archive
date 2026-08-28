import React from 'react';
import { EVENT_CATEGORIES, SEVERITY_LEVELS } from '../types/storm';
import { SORT_OPTIONS } from '../services/events';
import { Search, X } from 'lucide-react';

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  subtypeFilter,
  setSubtypeFilter,
  severityFilter,
  setSeverityFilter,
  sortBy,
  setSortBy,
  totalResults,
  totalEvents,
  isFiltered,
  onReset
}) {
  // Guards against a stale category id left over from an older archive.
  const activeCategory = categoryFilter ? EVENT_CATEGORIES[categoryFilter] : null;
  const subtypes = activeCategory?.subtypes ?? [];

  const handleCategoryChange = (nextCategory) => {
    setCategoryFilter(nextCategory);
    setSubtypeFilter('');
  };

  return (
    <div className="filter-bar">
      <div className="filter-top-row">
        <div className="search-input-wrapper">
          <Search size={18} className="search-icon" aria-hidden="true" />
          <input
            type="search"
            placeholder="Поиск по названию, локации, заметкам, тегам…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Поиск по архиву"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить поиск"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-controls">
          <select
            value={categoryFilter}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="filter-select"
            aria-label="Группа явлений"
          >
            <option value="">Все группы явлений</option>
            {Object.values(EVENT_CATEGORIES).map(category => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>

          {subtypes.length > 1 && (
            <select
              value={subtypeFilter}
              onChange={(e) => setSubtypeFilter(e.target.value)}
              className="filter-select"
              aria-label="Подтип явления"
            >
              <option value="">Все подтипы</option>
              {subtypes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          )}

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="filter-select"
            aria-label="Интенсивность"
          >
            <option value="">Любая интенсивность</option>
            {Object.values(SEVERITY_LEVELS).map(level => (
              <option key={level.id} value={level.id}>{level.label}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
            aria-label="Сортировка"
          >
            {SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>

          {isFiltered && (
            <button type="button" className="btn-secondary reset-filters-btn" onClick={onReset}>
              <X size={16} aria-hidden="true" />
              <span className="btn-text">Сбросить</span>
            </button>
          )}
        </div>
      </div>

      <div className="filter-info-row" aria-live="polite">
        {isFiltered
          ? <span>Найдено: <strong>{totalResults}</strong> из {totalEvents}</span>
          : <span>Наблюдений в архиве: <strong>{totalEvents}</strong></span>}
      </div>
    </div>
  );
}
