import React, { useMemo } from 'react';
import { EVENT_CATEGORIES, SEVERITY_LEVELS } from '../types/storm';
import { computeArchiveStats } from '../services/events';
import { BarChart2, Camera, MapPin, ShieldAlert, PieChart, CalendarRange, CloudLightning } from 'lucide-react';

const MONTH_LABELS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const percent = (count, total) => (total > 0 ? Math.round((count / total) * 100) : 0);

const BarRow = ({ label, color, count, total }) => (
  <div className="bar-item">
    <div className="bar-label-row">
      <span className="bar-name" style={{ color }}>{label}</span>
      <span className="bar-val">{count} · {percent(count, total)}%</span>
    </div>
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${percent(count, total)}%`, backgroundColor: color }} />
    </div>
  </div>
);

export default function StatsView({ events, onOpenAddModal }) {
  const stats = useMemo(() => computeArchiveStats(events), [events]);

  if (stats.total === 0) {
    return (
      <div className="stats-container">
        <div className="empty-state-card">
          <div className="empty-icon-wrapper"><BarChart2 size={32} aria-hidden="true" /></div>
          <h3>Статистика пока недоступна</h3>
          <p>
            В архиве ещё нет сохранённых наблюдений. Добавьте первые записи, чтобы увидеть распределение
            явлений по группам, интенсивности и сезонам.
          </p>
          <button type="button" className="btn-primary" onClick={onOpenAddModal}>Добавить наблюдение</button>
        </div>
      </div>
    );
  }

  const categoryRows = Object.entries(stats.categoryCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const peakMonth = Math.max(...stats.monthCounts);

  const summaryCards = [
    { icon: CloudLightning, tone: 'blue', value: stats.total, label: 'Всего наблюдений' },
    { icon: ShieldAlert, tone: 'amber', value: stats.severeCount, label: 'Сильных и опасных (ОЯ)' },
    { icon: MapPin, tone: 'emerald', value: stats.withCoords, label: 'С координатами' },
    { icon: Camera, tone: 'purple', value: stats.photoCount, label: `Снимков (в ${stats.withPhotos} записях)` }
  ];

  return (
    <div className="stats-container">
      <div className="stats-summary-grid">
        {summaryCards.map(({ icon: Icon, tone, value, label }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon-wrapper ${tone}`}><Icon size={20} aria-hidden="true" /></div>
            <div className="stat-card-body">
              <span className="stat-value">{value}</span>
              <span className="stat-label">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="stats-charts-grid">
        <section className="chart-box">
          <h3 className="chart-title"><PieChart size={18} aria-hidden="true" /> Распределение по группам явлений</h3>
          <div className="bar-list">
            {categoryRows.map(([key, count]) => {
              const info = EVENT_CATEGORIES[key] || EVENT_CATEGORIES.other;
              return <BarRow key={key} label={info.label} color={info.color} count={count} total={stats.total} />;
            })}
          </div>
        </section>

        <section className="chart-box">
          <h3 className="chart-title"><ShieldAlert size={18} aria-hidden="true" /> Распределение по интенсивности</h3>
          <div className="bar-list">
            {Object.values(SEVERITY_LEVELS).map(level => (
              <BarRow
                key={level.id}
                label={level.label}
                color={level.color}
                count={stats.severityCounts[level.id] || 0}
                total={stats.total}
              />
            ))}
          </div>
        </section>

        <section className="chart-box span-full">
          <h3 className="chart-title"><CalendarRange size={18} aria-hidden="true" /> Сезонное распределение</h3>
          <div className="month-chart" role="img" aria-label="Количество наблюдений по месяцам">
            {stats.monthCounts.map((count, index) => (
              <div key={MONTH_LABELS[index]} className="month-column" title={`${MONTH_LABELS[index]}: ${count}`}>
                <span className="month-count">{count || ''}</span>
                <div className="month-bar-track">
                  <div
                    className="month-bar-fill"
                    style={{ height: peakMonth > 0 ? `${Math.round((count / peakMonth) * 100)}%` : '0%' }}
                  />
                </div>
                <span className="month-label">{MONTH_LABELS[index]}</span>
              </div>
            ))}
          </div>

          {stats.years.length > 0 && (
            <div className="year-chips">
              {stats.years.map(({ year, count }) => (
                <span key={year} className="year-chip">{year}: <strong>{count}</strong></span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
