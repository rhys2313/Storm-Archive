const UNSPECIFIED = { id: 'unspecified', label: 'Не уточнено' };

export const EVENT_CATEGORIES = {
  thunderstorm: {
    id: 'thunderstorm', label: 'Грозы', color: '#f59e0b', icon: 'CloudLightning',
    subtypes: [UNSPECIFIED, { id: 'single_cell', label: 'Моноячейковая гроза' }, { id: 'multicell', label: 'Мультиячейковая гроза' }]
  },
  supercell: {
    id: 'supercell', label: 'Суперячейковые грозы', color: '#a855f7', icon: 'Sparkles',
    subtypes: [UNSPECIFIED, { id: 'classic', label: 'Классическая суперячейка' }, { id: 'lp', label: 'LP-суперячейка', description: 'Суперячейка с малым количеством осадков' }, { id: 'hp', label: 'HP-суперячейка', description: 'Суперячейка с большим количеством осадков' }, { id: 'mini', label: 'Мини-суперячейка' }]
  },
  mcs: {
    id: 'mcs', label: 'Мезомасштабные конвективные системы', color: '#06b6d4', icon: 'CloudRain',
    subtypes: [UNSPECIFIED, { id: 'mcs', label: 'Мезомасштабная конвективная система (MCS)' }, { id: 'mcc', label: 'Мезомасштабный конвективный комплекс (MCC)' }, { id: 'pecs', label: 'PECS' }, { id: 'qlcs', label: 'Квазилинейная конвективная система (QLCS)' }, { id: 'squall_line', label: 'Линия шквалов (Squall line)' }, { id: 'bow_echo', label: 'Bow echo' }]
  },
  shelf_cloud: { id: 'shelf_cloud', label: 'Шкваловый ворот (Shelf cloud)', color: '#22d3ee', icon: 'Wind', subtypes: [UNSPECIFIED] },
  hail: { id: 'hail', label: 'Град', color: '#38bdf8', icon: 'CloudRain', subtypes: [UNSPECIFIED] },
  squall: { id: 'squall', label: 'Шквал', color: '#ec4899', icon: 'Wind', subtypes: [UNSPECIFIED] },
  tornadic: {
    id: 'tornadic', label: 'Торнадические явления', color: '#ef4444', icon: 'Compass',
    subtypes: [UNSPECIFIED, { id: 'funnel_cloud', label: 'Облако-воронка (Funnel cloud)' }, { id: 'tornado', label: 'Торнадо' }]
  },
  optical: { id: 'optical', label: 'Оптические явления', color: '#eab308', icon: 'Sun', subtypes: [UNSPECIFIED] },
  rare_clouds: { id: 'rare_clouds', label: 'Редкие облака', color: '#8b5cf6', icon: 'Cloud', subtypes: [UNSPECIFIED] },
  fog: { id: 'fog', label: 'Туман', color: '#94a3b8', icon: 'Cloud', subtypes: [UNSPECIFIED] },
  // Preserved as a distinct legacy category so existing records remain meaningful.
  aurora: { id: 'aurora', label: 'Северное сияние', color: '#10b981', icon: 'Sun', subtypes: [UNSPECIFIED] },
  other: { id: 'other', label: 'Другое явление', color: '#64748b', icon: 'Radio', subtypes: [UNSPECIFIED] }
};

export const MCS_STRUCTURAL_FEATURES = [
  { id: 'lewp', label: 'LEWP' },
  { id: 'mcv', label: 'Мезомасштабный конвективный вихрь (MCV)' },
  { id: 'derecho', label: 'Derecho' },
  { id: 'embedded_mesocyclone', label: 'Встроенный мезоциклон' },
  { id: 'multiple_mesocyclones', label: 'Несколько мезоциклонов' },
  { id: 'embedded_supercell', label: 'Встроенная суперячейка' },
  { id: 'multiple_supercells', label: 'Несколько суперячеек' }
];

export const HAIL_SIZE_CLASSES = [UNSPECIFIED, { id: 'standard', label: 'Стандартный град', description: '<2 см' }, { id: 'large', label: 'Крупный град', description: '2–4 см' }, { id: 'very_large', label: 'Очень крупный град', description: '5–9 см' }, { id: 'giant', label: 'Гигантский град', description: '10–14 см' }, { id: 'colossal', label: 'Колоссальный град', description: '≥15 см' }];
export const SQUALL_INTENSITIES = [UNSPECIFIED, { id: 'moderate', label: 'Умеренный', description: '20–24 м/с' }, { id: 'strong', label: 'Сильный', description: '25–29 м/с' }, { id: 'very_strong', label: 'Особо сильный', description: '≥30 м/с' }];
export const TORNADO_ORIGINS = [UNSPECIFIED, { id: 'mesocyclonic', label: 'Мезоциклонное' }, { id: 'non_mesocyclonic', label: 'Немезоциклонное' }];
export const TORNADO_INTENSITIES = [{ id: 'ifu', label: 'IFU / не оценён' }, ...['IF0', 'IF0.5', 'IF1', 'IF1.5', 'IF2', 'IF2.5', 'IF3', 'IF4', 'IF5'].map(id => ({ id, label: id }))];

// Kept for compatibility with existing imports and external backups.
export const EVENT_TYPES = EVENT_CATEGORIES;

const LEGACY_EVENT_TYPE_MAP = {
  thunderstorm: { category: 'thunderstorm', subtype: 'unspecified' }, supercell: { category: 'supercell', subtype: 'unspecified' }, mcs: { category: 'mcs', subtype: 'unspecified' }, shelf_cloud: { category: 'shelf_cloud', subtype: 'unspecified' }, hail: { category: 'hail', subtype: 'unspecified' }, squall: { category: 'squall', subtype: 'unspecified' }, tornadic: { category: 'tornadic', subtype: 'unspecified' }, tornado: { category: 'tornadic', subtype: 'tornado' }, funnel_cloud: { category: 'tornadic', subtype: 'funnel_cloud' }, optical: { category: 'optical', subtype: 'unspecified' }, halo: { category: 'optical', subtype: 'unspecified' }, rare_clouds: { category: 'rare_clouds', subtype: 'unspecified' }, fog: { category: 'fog', subtype: 'unspecified' }, aurora: { category: 'aurora', subtype: 'unspecified' }, other: { category: 'other', subtype: 'unspecified' }
};

const optionById = (options, id, fallback = 'unspecified') =>
  options.find(option => option.id === id)?.id
  || options.find(option => option.id === fallback)?.id
  || 'unspecified';

export const getDefaultClassificationAttributes = (category, subtype = 'unspecified') => {
  if (category === 'mcs') return { structuralFeatures: [] };
  if (category === 'hail') return { hailSizeClass: 'unspecified' };
  if (category === 'squall') return { squallIntensity: 'unspecified' };
  if (category === 'tornadic' && subtype === 'tornado') return { tornadoOrigin: 'unspecified', tornadoIntensity: 'ifu' };
  return {};
};

export const normalizeClassification = (classification, legacyEventType) => {
  const legacy = LEGACY_EVENT_TYPE_MAP[legacyEventType] || LEGACY_EVENT_TYPE_MAP.other;
  const requestedCategory = classification?.category || legacy.category;
  const category = EVENT_CATEGORIES[requestedCategory] ? requestedCategory : legacy.category;
  const subtype = optionById(EVENT_CATEGORIES[category].subtypes, classification?.subtype, legacy.subtype);
  const sourceAttributes = classification?.attributes || {};
  const attributes = getDefaultClassificationAttributes(category, subtype);
  if (category === 'mcs') {
    const allowed = new Set(MCS_STRUCTURAL_FEATURES.map(feature => feature.id));
    attributes.structuralFeatures = [...new Set((sourceAttributes.structuralFeatures || []).filter(id => allowed.has(id)))];
  }
  if (category === 'hail') attributes.hailSizeClass = optionById(HAIL_SIZE_CLASSES, sourceAttributes.hailSizeClass);
  if (category === 'squall') attributes.squallIntensity = optionById(SQUALL_INTENSITIES, sourceAttributes.squallIntensity);
  if (category === 'tornadic' && subtype === 'tornado') {
    attributes.tornadoOrigin = optionById(TORNADO_ORIGINS, sourceAttributes.tornadoOrigin);
    if (attributes.tornadoOrigin !== 'non_mesocyclonic') {
      attributes.tornadoIntensity = optionById(TORNADO_INTENSITIES, sourceAttributes.tornadoIntensity, 'ifu');
    } else {
      delete attributes.tornadoIntensity;
    }
  }
  return { category, subtype, attributes };
};

export const migrateEventClassification = (event) => {
  const classification = normalizeClassification(event.classification, event.eventType);
  const migrated = { ...event, eventType: classification.category, classification };
  return JSON.stringify(event.classification) === JSON.stringify(classification) && event.eventType === classification.category ? event : migrated;
};

export const getEventClassification = (event) => normalizeClassification(event?.classification, event?.eventType);
export const getEventTypeInfo = (event) => EVENT_CATEGORIES[getEventClassification(event).category] || EVENT_CATEGORIES.other;
export const getClassificationLabel = (event) => {
  const { category, subtype } = getEventClassification(event);
  const categoryInfo = EVENT_CATEGORIES[category] || EVENT_CATEGORIES.other;
  const subtypeInfo = categoryInfo.subtypes.find(item => item.id === subtype);
  return subtypeInfo && subtype !== 'unspecified' ? `${categoryInfo.label} · ${subtypeInfo.label}` : categoryInfo.label;
};
export const getClassificationAttributeLabels = (event) => {
  const { category, subtype, attributes } = getEventClassification(event);
  if (category === 'mcs') return (attributes.structuralFeatures || []).map(id => MCS_STRUCTURAL_FEATURES.find(feature => feature.id === id)?.label).filter(Boolean);
  if (category === 'hail' && attributes.hailSizeClass !== 'unspecified') { const item = HAIL_SIZE_CLASSES.find(option => option.id === attributes.hailSizeClass); return item ? [`${item.label}${item.description ? ` — ${item.description}` : ''}`] : []; }
  if (category === 'squall' && attributes.squallIntensity !== 'unspecified') { const item = SQUALL_INTENSITIES.find(option => option.id === attributes.squallIntensity); return item ? [`${item.label}${item.description ? ` — ${item.description}` : ''}`] : []; }
  if (category === 'tornadic' && subtype === 'tornado') { const origin = TORNADO_ORIGINS.find(option => option.id === attributes.tornadoOrigin); const intensity = TORNADO_INTENSITIES.find(option => option.id === attributes.tornadoIntensity); return [origin?.id !== 'unspecified' && origin?.label, origin?.id !== 'non_mesocyclonic' && intensity?.label].filter(Boolean); }
  return [];
};
export const getClassificationSearchText = (event) => [getClassificationLabel(event), ...getClassificationAttributeLabels(event)].join(' ').toLowerCase();

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
