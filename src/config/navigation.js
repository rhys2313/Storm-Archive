import { CloudLightning, Map, Image as ImageIcon, BarChart2 } from 'lucide-react';

/**
 * Single source of truth for the tab bar, shared by the desktop header and the
 * mobile bottom navigation so labels and order cannot drift apart.
 */
export const NAV_TABS = [
  { id: 'events', label: 'Архив', icon: CloudLightning, showCount: true },
  { id: 'map', label: 'Карта', icon: Map },
  { id: 'gallery', label: 'Галерея', icon: ImageIcon },
  { id: 'stats', label: 'Статистика', icon: BarChart2 }
];
