export const EVENT_TYPES = {
  thunderstorm: {
    id: 'thunderstorm',
    label: 'Обычная гроза',
    color: '#f59e0b',
    icon: 'CloudLightning',
    description: 'Одноячейковая или многоячейковая внутримассовая/фронтальная гроза'
  },
  supercell: {
    id: 'supercell',
    label: 'Суперячейка',
    color: '#a855f7',
    icon: 'Sparkles',
    description: 'Мезоциклонная суперячейковая гроза со вращением'
  },
  shelf_cloud: {
    id: 'shelf_cloud',
    label: 'Шельфовое облако (Squall Line)',
    color: '#06b6d4',
    icon: 'Wind',
    description: 'Шкваловый ворот, шкваловая линия или выемка шквала'
  },
  hail: {
    id: 'hail',
    label: 'Град',
    color: '#38bdf8',
    icon: 'CloudRain',
    description: 'Выпадение крупного или интенсивного града'
  },
  squall: {
    id: 'squall',
    label: 'Шквал / Ураган',
    color: '#ec4899',
    icon: 'Wind',
    description: 'Сильное шквалистое усиление ветра или прямолинейный выдув (Downburst)'
  },
  tornado: {
    id: 'tornado',
    label: 'Смерч / Торнадо',
    color: '#ef4444',
    icon: 'Compass',
    description: 'Воронкообразный вихрь, касающийся поверхности'
  },
  funnel_cloud: {
    id: 'funnel_cloud',
    label: 'Воронка (Funnel Cloud)',
    color: '#8b5cf6',
    icon: 'Cloud',
    description: 'Облачный воронкообразный рукав без контакта с землей'
  },
  aurora: {
    id: 'aurora',
    label: 'Северное сияние',
    color: '#10b981',
    icon: 'Sun',
    description: 'Полярное сияние и геомагнитная активность'
  },
  halo: {
    id: 'halo',
    label: 'Гало / Редкие облака',
    color: '#eab308',
    icon: 'Sun',
    description: 'Оптические атмосферные явления или редкие формации облаков (Mammatus, Asperitas)'
  },
  fog: {
    id: 'fog',
    label: 'Туман / Смоговой шлейф',
    color: '#94a3b8',
    icon: 'Cloud',
    description: 'Инверсионный или адвективный туман'
  },
  other: {
    id: 'other',
    label: 'Другое явление',
    color: '#64748b',
    icon: 'Radio',
    description: 'Иные метеорологические и атмосферные события'
  }
};

export const SEVERITY_LEVELS = {
  low: { id: 'low', label: 'Слабое', color: '#10b981', badgeClass: 'severity-low' },
  moderate: { id: 'moderate', label: 'Умеренное', color: '#38bdf8', badgeClass: 'severity-moderate' },
  severe: { id: 'severe', label: 'Сильное', color: '#f59e0b', badgeClass: 'severity-severe' },
  extreme: { id: 'extreme', label: 'Опасное (ОЯ)', color: '#ef4444', badgeClass: 'severity-extreme' }
};

export const HAZARDS = {
  lightning: { id: 'lightning', label: 'Молнии (CG)', icon: 'Zap' },
  hail: { id: 'hail', label: 'Град', icon: 'Circle' },
  heavy_rain: { id: 'heavy_rain', label: 'Сильный ливень', icon: 'CloudRain' },
  damaging_wind: { id: 'damaging_wind', label: 'Шквал / Ветер', icon: 'Wind' },
  dust: { id: 'dust', label: 'Пылевая буря', icon: 'Sun' },
  flooding: { id: 'flooding', label: 'Затопление', icon: 'Droplets' }
};
