import React from 'react';
import { EVENT_CATEGORIES, SEVERITY_LEVELS, HAZARDS, getEventClassification } from '../types/storm';
import { BarChart2, Zap, Calendar, MapPin, Gauge, Wind, Thermometer, ShieldAlert, Sparkles, PieChart } from 'lucide-react';

export default function StatsView({ events, onOpenAddModal }) {
  if (!events || events.length === 0) {
    return (
      <div className="stats-container">
        <div className="empty-state-card">
          <div className="empty-icon-wrapper">
            <BarChart2 size={32} />
          </div>
          <h3>Статистика пока недоступна</h3>
          <p>
            В архиве ещё нет сохранённых метеонаблюдений. Добавьте ваши первые записи, чтобы увидеть аналитику,
            распределение явлений по категориям, силе и сезонам.
          </p>
          <button className="btn-primary" onClick={onOpenAddModal}>
            Добавить первое наблюдение
          </button>
        </div>
      </div>
    );
  }

  const totalCount = events.length;
  const withPhotosCount = events.filter(e => e.photos && e.photos.length > 0).length;
  const withCoordsCount = events.filter(e => e.latitude && e.longitude).length;
  const severeCount = events.filter(e => e.severity === 'severe' || e.severity === 'extreme').length;

  // Breakdown by top-level classification group
  const typeCounts = {};
  Object.keys(EVENT_CATEGORIES).forEach(k => { typeCounts[k] = 0; });
  events.forEach(e => {
    const { category } = getEventClassification(e);
    if (typeCounts[category] !== undefined) {
      typeCounts[category]++;
    } else {
      typeCounts.other++;
    }
  });

  // Breakdown by Severity
  const severityCounts = { low: 0, moderate: 0, severe: 0, extreme: 0 };
  events.forEach(e => {
    if (severityCounts[e.severity] !== undefined) {
      severityCounts[e.severity]++;
    }
  });

  // Breakdown by Hazards
  const hazardCounts = {};
  Object.keys(HAZARDS).forEach(k => { hazardCounts[k] = 0; });
  events.forEach(e => {
    if (e.hazards && Array.isArray(e.hazards)) {
      e.hazards.forEach(h => {
        if (hazardCounts[h] !== undefined) hazardCounts[h]++;
      });
    }
  });

  // Average parameters
  const capes = events.map(e => parseFloat(e.parameters?.cape)).filter(n => !isNaN(n));
  const avgCape = capes.length > 0 ? Math.round(capes.reduce((a, b) => a + b, 0) / capes.length) : null;

  const winds = events.map(e => parseFloat(e.parameters?.windSpeed)).filter(n => !isNaN(n));
  const avgWind = winds.length > 0 ? (winds.reduce((a, b) => a + b, 0) / winds.length).toFixed(1) : null;

  const temps = events.map(e => parseFloat(e.parameters?.temperature)).filter(n => !isNaN(n));
  const avgTemp = temps.length > 0 ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null;

  return (
    <div className="stats-container">
      {/* Top Cards Summary */}
      <div className="stats-summary-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper blue">
            <Calendar size={20} />
          </div>
          <div>
            <span className="stat-value">{totalCount}</span>
            <span className="stat-label">Всего наблюдений</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper amber">
            <ShieldAlert size={20} />
          </div>
          <div>
            <span className="stat-value">{severeCount}</span>
            <span className="stat-label">Сильных / Опасных (ОЯ)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper emerald">
            <MapPin size={20} />
          </div>
          <div>
            <span className="stat-value">{withCoordsCount}</span>
            <span className="stat-label">Отмечено на карте</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper purple">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="stat-value">{withPhotosCount}</span>
            <span className="stat-label">С фотоснимками</span>
          </div>
        </div>
      </div>

      <div className="stats-charts-grid">
        {/* Distribution by Event Type */}
        <div className="chart-box">
          <h3 className="chart-title">
            <PieChart size={18} /> Распределение по группам метеоявлений
          </h3>
          <div className="bar-list">
            {Object.entries(typeCounts)
              .filter(([_, count]) => count > 0)
              .map(([typeKey, count]) => {
                const typeInfo = EVENT_CATEGORIES[typeKey] || EVENT_CATEGORIES.other;
                const percentage = Math.round((count / totalCount) * 100);
                return (
                  <div key={typeKey} className="bar-item">
                    <div className="bar-label-row">
                      <span className="bar-name" style={{ color: typeInfo.color }}>
                        {typeInfo.label}
                      </span>
                      <span className="bar-val">{count} ({percentage}%)</span>
                    </div>
                    <div className="bar-track">
                      <div 
                        className="bar-fill" 
                        style={{ width: `${percentage}%`, backgroundColor: typeInfo.color }}
                      ></div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Distribution by Severity Level */}
        <div className="chart-box">
          <h3 className="chart-title">
            <ShieldAlert size={18} /> Распределение по интенсивности
          </h3>
          <div className="bar-list">
            {Object.entries(severityCounts).map(([sevKey, count]) => {
              const sevInfo = SEVERITY_LEVELS[sevKey];
              if (!sevInfo) return null;
              const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
              return (
                <div key={sevKey} className="bar-item">
                  <div className="bar-label-row">
                    <span className="bar-name" style={{ color: sevInfo.color }}>
                      {sevInfo.label}
                    </span>
                    <span className="bar-val">{count} ({percentage}%)</span>
                  </div>
                  <div className="bar-track">
                    <div 
                      className="bar-fill" 
                      style={{ width: `${percentage}%`, backgroundColor: sevInfo.color }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hazards occurrences */}
        <div className="chart-box span-full">
          <h3 className="chart-title">
            <Zap size={18} /> Частота сопутствующих опасных факторов
          </h3>
          <div className="hazards-stats-grid">
            {Object.entries(hazardCounts).map(([hKey, count]) => {
              const hazard = HAZARDS[hKey];
              if (!hazard) return null;
              return (
                <div key={hKey} className="hazard-stat-pill">
                  <span className="h-stat-name">{hazard.label}</span>
                  <span className="h-stat-count">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Averages if params recorded */}
        {(avgCape !== null || avgWind !== null || avgTemp !== null) && (
          <div className="chart-box span-full">
            <h3 className="chart-title">Средние измеренные параметры</h3>
            <div className="averages-row">
              {avgCape !== null && (
                <div className="avg-metric-card">
                  <Gauge size={20} className="avg-icon" />
                  <div>
                    <span className="avg-val">{avgCape} J/kg</span>
                    <span className="avg-lbl">Средний CAPE</span>
                  </div>
                </div>
              )}
              {avgWind !== null && (
                <div className="avg-metric-card">
                  <Wind size={20} className="avg-icon" />
                  <div>
                    <span className="avg-val">{avgWind} м/с</span>
                    <span className="avg-lbl">Средняя скорость ветра</span>
                  </div>
                </div>
              )}
              {avgTemp !== null && (
                <div className="avg-metric-card">
                  <Thermometer size={20} className="avg-icon" />
                  <div>
                    <span className="avg-val">{avgTemp} °C</span>
                    <span className="avg-lbl">Средняя температура</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
