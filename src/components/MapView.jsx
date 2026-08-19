import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { EVENT_TYPES } from '../types/storm';
import { MapPin, Navigation, Info } from 'lucide-react';

export default function MapView({ events, onViewEvent, onOpenAddModal }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  const eventsWithCoords = events.filter(e => e.latitude && e.longitude && !isNaN(e.latitude) && !isNaN(e.longitude));

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default initial view: Russia / Europe coordinates [55.75, 37.61]
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([55.75, 37.61], 5);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Dark theme map tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'dark-map-tiles'
      }).addTo(map);

      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    if (eventsWithCoords.length > 0) {
      const bounds = L.latLngBounds();

      eventsWithCoords.forEach(evt => {
        const eventType = EVENT_TYPES[evt.eventType] || EVENT_TYPES.other;
        const pinColor = eventType.color || '#38bdf8';

        // Custom Leaflet DivIcon with colored pin
        const customIcon = L.divIcon({
          className: 'custom-map-pin',
          html: `<div class="pin-inner" style="background-color: ${pinColor}; box-shadow: 0 0 12px ${pinColor}80;"></div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        const marker = L.marker([evt.latitude, evt.longitude], { icon: customIcon });

        const formattedDate = evt.date ? new Date(evt.date).toLocaleDateString('ru-RU') : '';
        const popupContent = document.createElement('div');
        popupContent.className = 'map-popup-card';
        popupContent.innerHTML = `
          <div className="popup-type" style="color: ${pinColor}; font-weight: 600; font-size: 11px; text-transform: uppercase;">
            ${eventType.label}
          </div>
          <h4 style="margin: 4px 0; font-size: 14px; color: #f1f5f9;">${evt.title}</h4>
          <div style="font-size: 12px; color: #94a3b8; margin-bottom: 8px;">
            ${formattedDate} ${evt.location ? `• ${evt.location}` : ''}
          </div>
          <button id="btn-popup-${evt.id}" style="
            background: #2563eb; color: white; border: none; border-radius: 6px;
            padding: 6px 12px; font-size: 12px; font-weight: 500; cursor: pointer; width: 100%;
          ">Открыть событие</button>
        `;

        marker.bindPopup(popupContent, { className: 'custom-leaflet-popup' });
        
        marker.on('popupopen', () => {
          const btn = document.getElementById(`btn-popup-${evt.id}`);
          if (btn) {
            btn.onclick = () => onViewEvent(evt);
          }
        });

        markersLayer.addLayer(marker);
        bounds.extend([evt.latitude, evt.longitude]);
      });

      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }

    return () => {
      // Map stays initialized
    };
  }, [eventsWithCoords]);

  return (
    <div className="map-view-container">
      <div className="map-header-info">
        <div className="map-stats-badge">
          <MapPin size={16} />
          <span>Событий с координатами на карте: <strong>{eventsWithCoords.length}</strong></span>
        </div>
      </div>

      {eventsWithCoords.length === 0 && (
        <div className="map-overlay-empty">
          <Info size={24} />
          <p className="empty-map-title">На карте пока нет отмеченных метеособытий</p>
          <p className="empty-map-sub">
            Укажите координаты (широту и долготу) при создании наблюдения или добавьте фотографию с сохранением GPS из EXIF
          </p>
          <button className="btn-primary" onClick={onOpenAddModal}>
            Добавить первое наблюдение
          </button>
        </div>
      )}

      <div ref={mapContainerRef} className="leaflet-map-element"></div>
    </div>
  );
}
