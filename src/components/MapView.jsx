import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getClassificationLabel, getEventTypeInfo } from '../types/storm';
import { formatEventDateShort, hasCoordinates, sortEvents } from '../services/events';
import { accentTextColor } from '../services/presentation';
import { MapPin, Info } from 'lucide-react';

const DEFAULT_CENTER = [55.75, 37.61];
const DEFAULT_ZOOM = 4;

/**
 * Builds the popup as DOM nodes instead of an HTML string.
 * Titles, locations and captions are user input, so interpolating them into
 * innerHTML would break the markup on characters like `<` and allow script
 * injection from an imported backup.
 */
const buildPopupContent = (event, color, onOpen) => {
  const root = document.createElement('div');
  root.className = 'map-popup-card';

  const type = document.createElement('span');
  type.className = 'map-popup-type';
  type.style.color = accentTextColor(color);
  type.textContent = getClassificationLabel(event);
  root.appendChild(type);

  const title = document.createElement('h4');
  title.className = 'map-popup-title';
  title.textContent = event.title;
  root.appendChild(title);

  const metaParts = [formatEventDateShort(event), event.location].filter(Boolean);
  if (metaParts.length > 0) {
    const meta = document.createElement('p');
    meta.className = 'map-popup-meta';
    meta.textContent = metaParts.join(' · ');
    root.appendChild(meta);
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-popup-btn';
  button.textContent = 'Открыть наблюдение';
  // A direct listener on the node avoids the fragile getElementById lookup the
  // previous implementation used, which broke on duplicate or reused ids.
  button.addEventListener('click', () => onOpen(event));
  root.appendChild(button);

  return root;
};

const buildLocationPopup = (events, color, onOpen) => {
  if (events.length === 1) return buildPopupContent(events[0], color, onOpen);
  const root = document.createElement('div');
  root.className = 'map-popup-card';
  const heading = document.createElement('h4');
  heading.className = 'map-popup-title';
  heading.textContent = `Наблюдений в этой точке: ${events.length}`;
  root.appendChild(heading);
  const list = document.createElement('ul');
  list.className = 'map-popup-list';
  for (const event of sortEvents(events, 'newest')) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-popup-btn map-popup-list-btn';
    button.textContent = [formatEventDateShort(event), event.title].filter(Boolean).join(' — ');
    button.addEventListener('click', () => onOpen(event));
    item.appendChild(button);
    list.appendChild(item);
  }
  root.appendChild(list);
  return root;
};

export default function MapView({ events, onViewEvent, onOpenAddModal, onOpenArchive }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);
  const fittedSignatureRef = useRef(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(() => !navigator.onLine);

  // Keeping the callback in a ref means marker popups always call the latest
  // handler without having to rebuild every marker when the parent re-renders.
  const onViewEventRef = useRef(onViewEvent);
  onViewEventRef.current = onViewEvent;

  const mappable = useMemo(
    () => (Array.isArray(events) ? events.filter(hasCoordinates) : []),
    [events]
  );

  // Markers are rebuilt only when the mapped positions actually change, not on
  // every render of the parent.
  const markerSignature = useMemo(
    () => mappable.map(event => `${event.id}:${event.latitude}:${event.longitude}:${event.title}:${event.severity}`).join('|'),
    [mappable]
  );

  /* ------------------------------------------------- create / destroy map */

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      className: 'dark-map-tiles',
      // OpenStreetMap's tile usage policy requires visible attribution.
      attribution: '© OpenStreetMap'
    });
    tiles.on('tileerror', () => setTilesUnavailable(true));
    tiles.on('tileload', () => setTilesUnavailable(false));
    tiles.addTo(map);
    const reconnect = () => tiles.redraw();
    window.addEventListener('online', reconnect);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // The container has no height until the tab is painted, so Leaflet must be
    // told to re-measure. This also covers Windows window resizing and the
    // Android on-screen keyboard.
    const invalidate = () => map.invalidateSize();
    const raf = requestAnimationFrame(invalidate);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(invalidate) : null;
    observer?.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener('online', reconnect);
      // Without remove() the instance keeps its window listeners and DOM
      // handlers alive every time the user leaves and returns to the map tab.
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      fittedSignatureRef.current = null;
    };
  }, []);

  /* ------------------------------------------------------------- markers */

  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;

    markers.clearLayers();
    if (mappable.length === 0) return;

    const bounds = L.latLngBounds();

    const locations = new Map();
    for (const event of mappable) {
      const key = `${event.latitude}:${event.longitude}`;
      if (!locations.has(key)) locations.set(key, []);
      locations.get(key).push(event);
    }
    for (const group of locations.values()) {
      const event = group[0];
      const color = group.length > 1 ? '#38bdf8' : getEventTypeInfo(event).color || '#38bdf8';
      const icon = L.divIcon({
        className: 'custom-map-pin',
        html: `<span class="pin-inner ${group.length > 1 ? 'pin-group' : ''}" style="background-color:${color};box-shadow:0 0 12px ${color}80">${group.length > 1 ? group.length : ''}</span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const marker = L.marker([event.latitude, event.longitude], { icon, title: group.length > 1 ? `Наблюдений в этой точке: ${group.length}` : event.title });
      marker.bindPopup(
        () => buildLocationPopup(group, color, evt => onViewEventRef.current?.(evt)),
        { className: 'custom-leaflet-popup', minWidth: 220, maxWidth: 280 }
      );
      markers.addLayer(marker);
      bounds.extend([event.latitude, event.longitude]);
    }

    // Only refit when the set of points changed, so viewing a popup or coming
    // back to the tab does not yank the viewport away from the user.
    if (fittedSignatureRef.current !== markerSignature) {
      fittedSignatureRef.current = markerSignature;
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 11 });
    }
  }, [mappable, markerSignature]);

  return (
    <div className="map-view-container">
      <div className="map-header-info">
        <div className="map-stats-badge">
          <MapPin size={16} aria-hidden="true" />
          <span>Наблюдений на карте: <strong>{mappable.length}</strong></span>
        </div>
        {tilesUnavailable && <div className="map-stats-badge map-tiles-notice" role="status">
          <span>Подложка карты недоступна. Локальные отметки и записи доступны.</span>
        </div>}
      </div>

      {mappable.length === 0 && (
        <div className="map-overlay-empty">
          <Info size={24} aria-hidden="true" />
          <p className="empty-map-title">На карте пока нет отмеченных наблюдений</p>
          <p className="empty-map-sub">
            Укажите широту и долготу при создании записи или добавьте фотографию с сохранённым GPS в EXIF —
            координаты подставятся автоматически.
          </p>
          <button type="button" className="btn-primary" onClick={onOpenAddModal}>
            Добавить наблюдение
          </button>
          {events.length > 0 && <button type="button" className="btn-secondary" onClick={onOpenArchive}>Открыть архив</button>}
        </div>
      )}

      <div ref={containerRef} className="leaflet-map-element" role="application" aria-label="Карта наблюдений" />
    </div>
  );
}
