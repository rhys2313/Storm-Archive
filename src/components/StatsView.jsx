import React, { useMemo } from 'react';
import { EVENT_CATEGORIES, SEVERITY_LEVELS } from '../types/storm';
import { computeArchiveStats } from '../services/events';
import {
  BarChart2,
  Camera,
  MapPin,
  ShieldAlert,
  PieChart,
  CalendarRange,
  CloudLightning
} from 'lucide-react';

const MONTH_LABELS = [
  'Янв',
  'Фев',
  'Мар',
  'Апр',
  'Май',
  'Июн',
  'Июл',
  'Авг',
  'Сен',
  'Окт',
  'Ноя',
  'Дек'
];

const percent = (count, total) =>
  total > 0 ? Math.round((count / total) * 100) : 0;

const BarRow = ({ label, color, count, total }) => (
  <div className="bar-item">
    <div className="bar-label-row">
      <span className="bar-name">{label}</span>
      <span className="bar-val">
        {count} · {percent(count, total)}%
      </span>
    </div>
    <div className="bar-track">
      <div
        className="bar-fill"
        style={{ width: `${percent(count, total)}%`, backgroundColor: color }}
      />
    </div>
  </div>
);

export default function StatsView({ events, onOpenAddModal }) {
  const stats = useMemo(() => computeArchiveStats(events), [events]);

  if (stats.total === 0) {
    return (
      <div className="stats-container">
        <div className="empty-state-card">
          <div className="empty-icon-wrapper">
            <BarChart2 size={32} aria-hidden="true" />
          </div>
          <h2>Статистика пока недоступна</h2>
          <p>
            В архиве ещё нет сохранённых наблюдений. Добавьте первые записи,
            чтобы увидеть распределение явлений по группам, интенсивности и
            сезонам.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={onOpenAddModal}
          >
            Добавить наблюдение
          </button>
        </div>
      </div>
    );
  }

  const categoryRows = Object.entries(stats.categoryCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const peakMonth = Math.max(...stats.monthCounts);
  const datedCount = stats.monthCounts.reduce((sum, count) => sum + count, 0);

  const summaryCards = [
    {
      icon: CloudLightning,
      tone: 'blue',
      value: stats.total,
      label: 'Всего наблюдений'
    },
    {
      icon: ShieldAlert,
      tone: 'amber',
      value: stats.severeCount,
      label: 'Сильных и опасных'
    },
    {
      icon: MapPin,
      tone: 'emerald',
      value: stats.withCoords,
      label: 'С координатами'
    },
    {
      icon: Camera,
      tone: 'purple',
      value: stats.photoCount,
      label: `Снимков (в ${stats.withPhotos} записях)`
    }
  ];

  return (
    <div className="stats-container">
      <section className="stats-overview" aria-label="Об архиве">
        <div className="stats-lead">
          <span>Всего наблюдений</span>
          <strong>{stats.total}</strong>
          <p>Вся история ваших наблюдений</p>
        </div>
        <dl className="stats-facts">
          {summaryCards.slice(1).map(({ icon: Icon, value, label }) => (
            <div key={label}>
              <dt>
                <Icon size={18} aria-hidden="true" />
                {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="stats-charts-grid">
        <section className="chart-box span-full">
          <h2 className="chart-title">
            <CalendarRange size={18} aria-hidden="true" /> Сезонное
            распределение
          </h2>
          {stats.total > datedCount && (
            <p className="form-help-text">
              Без даты: {stats.total - datedCount}. Эти записи не учтены в
              сезонном распределении.
            </p>
          )}
          {datedCount === 0 ? (
            <p className="form-help-text">
              Добавьте дату к наблюдениям, чтобы увидеть распределение по
              месяцам.
            </p>
          ) : (
            <div
              className="month-chart"
              role="img"
              aria-label={`Количество наблюдений по месяцам: ${stats.monthCounts.map((count, index) => `${MONTH_LABELS[index]} — ${count}`).join(', ')}`}
            >
              {stats.monthCounts.map((count, index) => (
                <div
                  key={MONTH_LABELS[index]}
                  className="month-column"
                  title={`${MONTH_LABELS[index]}: ${count}`}
                >
                  <span className="month-count">{count}</span>
                  <div className="month-bar-track">
                    <div
                      className="month-bar-fill"
                      style={{
                        height:
                          peakMonth > 0
                            ? `${(count / peakMonth) * 100}%`
                            : '0%',
                        minHeight: count > 0 ? '2px' : 0
                      }}
                    />
                  </div>
                  <span className="month-label">{MONTH_LABELS[index]}</span>
                </div>
              ))}
            </div>
          )}

          {stats.years.length > 0 && (
            <div className="year-chips">
              {stats.years.map(({ year, count }) => (
                <span key={year} className="year-chip">
                  {year}: <strong>{count}</strong>
                </span>
              ))}
            </div>
          )}
        </section>
        <section className="chart-box">
          <h2 className="chart-title">
            <PieChart size={18} aria-hidden="true" /> Распределение по группам
            явлений
          </h2>
          <div className="bar-list">
            {categoryRows.map(([key, count]) => {
              const info = EVENT_CATEGORIES[key] || EVENT_CATEGORIES.other;
              return (
                <BarRow
                  key={key}
                  label={info.label}
                  color={info.color}
                  count={count}
                  total={stats.total}
                />
              );
            })}
          </div>
        </section>

        <section className="chart-box">
          <h2 className="chart-title">
            <ShieldAlert size={18} aria-hidden="true" /> Распределение по
            интенсивности
          </h2>
          <div className="bar-list">
            {Object.values(SEVERITY_LEVELS).map((level) => (
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
      </div>
    </div>
  );
}
