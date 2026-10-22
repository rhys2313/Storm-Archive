import { useId, useRef, useState } from 'react';
import { EVENT_CATEGORIES, SEVERITY_LEVELS } from '../types/storm';
import { SORT_OPTIONS } from '../services/events';
import { Search, X, SlidersHorizontal } from 'lucide-react';

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
  const searchRef = useRef(null);
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const activeCategory = categoryFilter
    ? EVENT_CATEGORIES[categoryFilter]
    : null;
  const subtypes = activeCategory?.subtypes ?? [];
  const filterCount = [categoryFilter, subtypeFilter, severityFilter].filter(
    Boolean
  ).length;
  const changeCategory = (value) => {
    setCategoryFilter(value);
    setSubtypeFilter('');
  };
  return (
    <section className="filter-bar" aria-label="Поиск и фильтры">
      <div className="archive-tools">
        <div className="search-input-wrapper">
          <Search size={19} className="search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Найти наблюдение…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Поиск по архиву"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => {
                setSearchQuery('');
                searchRef.current?.focus();
              }}
              aria-label="Очистить поиск"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn-secondary filter-toggle ${expanded ? 'selected' : ''}`}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span>Фильтры</span>
          {filterCount > 0 && (
            <span className="filter-count">{filterCount}</span>
          )}
        </button>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="filter-select sort-select"
          aria-label="Сортировка"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="filter-panel" id={panelId} hidden={!expanded}>
        <label className="form-group">
          <span className="form-label">Группа явлений</span>
          <select
            value={categoryFilter}
            onChange={(e) => changeCategory(e.target.value)}
            className="form-select"
            aria-label="Группа явлений"
          >
            <option value="">Все группы явлений</option>
            {Object.values(EVENT_CATEGORIES).map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </label>
        {subtypes.length > 1 && (
          <label className="form-group">
            <span className="form-label">Подтип явления</span>
            <select
              value={subtypeFilter}
              onChange={(e) => setSubtypeFilter(e.target.value)}
              className="form-select"
              aria-label="Подтип явления"
            >
              <option value="">Все подтипы</option>
              {subtypes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-group">
          <span className="form-label">Интенсивность</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="form-select"
            aria-label="Интенсивность"
          >
            <option value="">Любая интенсивность</option>
            {Object.values(SEVERITY_LEVELS).map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-info-row">
        <span role="status">
          {isFiltered ? (
            <>
              Найдено: <strong>{totalResults}</strong> из {totalEvents}
            </>
          ) : (
            <>
              Наблюдений в архиве: <strong>{totalEvents}</strong>
            </>
          )}
        </span>
        {isFiltered && (
          <button type="button" className="reset-filters-btn" onClick={onReset}>
            <X size={14} aria-hidden="true" /> Сбросить
          </button>
        )}
        {!expanded && filterCount > 0 && (
          <span className="active-filter-summary">
            {[
              activeCategory?.label,
              subtypes.find((item) => item.id === subtypeFilter)?.label,
              SEVERITY_LEVELS[severityFilter]?.label
            ]
              .filter(Boolean)
              .join(' / ')}
          </span>
        )}
      </div>
    </section>
  );
}
