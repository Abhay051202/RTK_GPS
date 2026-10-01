import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export function SimpleMap({ base, rover, mapType }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const baseMarkerRef = useRef(null);
  const roverMarkerRef = useRef(null);
  const baselinePolylineRef = useRef(null);
  const streetLayerRef = useRef(null);
  const satelliteLayerRef = useRef(null);
  const hasCenteredRef = useRef(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = base?.latitude || 18.90387;
    const initialLng = base?.longitude || 73.04675;

    // Create Leaflet map instance
    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 18,
      maxZoom: 20,
      zoomControl: false
    });

    mapRef.current = map;

    // Add zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Standard OpenStreetMap Streets
    const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    });

    // Satellite Imagery (Esri World Imagery)
    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
      }
    );

    streetLayerRef.current = streetLayer;
    satelliteLayerRef.current = satelliteLayer;

    // Default to satellite
    satelliteLayer.addTo(map);

    // 1. Base Station Marker (Cyan)
    const baseIconHtml = `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(0, 240, 255, 0.35);
          animation: pulseRing 1.8s cubic-bezier(0.2, 0.8, 0.4, 1) infinite;
        "></div>
        <div style="
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00f0ff;
          border: 2.5px solid #ffffff;
          box-shadow: 0 0 10px #00f0ff;
        "></div>
      </div>
      <style>
        @keyframes pulseRing {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      </style>
    `;

    const baseMarker = L.marker([initialLat, initialLng], {
      icon: L.divIcon({
        className: 'live-base-marker',
        html: baseIconHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      })
    }).addTo(map);

    baseMarker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #111;">
        <strong style="color: #0284c7;">📍 Base Station (Anchor)</strong><br/>
        <strong>Status:</strong> Active (USB COM3)<br/>
        <strong>Lat:</strong> ${initialLat.toFixed(6)}°<br/>
        <strong>Lng:</strong> ${initialLng.toFixed(6)}°
      </div>
    `);

    baseMarkerRef.current = baseMarker;

    // 2. Rover Marker (Amber / Orange with vehicle styling)
    const roverIconHtml = `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
        <div style="
          position: absolute;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: rgba(245, 158, 11, 0.3);
          animation: roverPulse 2s infinite;
        "></div>
        <div style="
          width: 20px;
          height: 20px;
          border-radius: 4px;
          background: #f59e0b;
          border: 2.5px solid #ffffff;
          box-shadow: 0 0 12px #f59e0b;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 6px; height: 6px; background: #ffffff; border-radius: 50%;"></div>
        </div>
      </div>
      <style>
        @keyframes roverPulse {
          0% { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(2.0); opacity: 0; }
        }
      </style>
    `;

    const roverMarker = L.marker([initialLat + 0.00015, initialLng + 0.00015], {
      icon: L.divIcon({
        className: 'live-rover-marker',
        html: roverIconHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 19]
      })
    });

    roverMarker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px; line-height: 1.5; color: #111;">
        <strong style="color: #d97706;">🚜 Rover (Reach Stacker RS-01)</strong><br/>
        <strong>RTK Baseline:</strong> Active<br/>
        <strong>Fix:</strong> RTK FIXED
      </div>
    `);

    roverMarkerRef.current = roverMarker;

    // 3. Baseline Polyline connecting Base and Rover
    const baseline = L.polyline([], {
      color: '#f59e0b',
      weight: 2,
      dashArray: '6, 6',
      opacity: 0.85
    }).addTo(map);

    baselinePolylineRef.current = baseline;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Base Marker position
  useEffect(() => {
    if (!base?.latitude || !base?.longitude || !mapRef.current) return;

    if (baseMarkerRef.current) {
      baseMarkerRef.current.setLatLng([base.latitude, base.longitude]);
    }

    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true;
      mapRef.current.setView([base.latitude, base.longitude], 18);
    }
  }, [base?.latitude, base?.longitude]);

  // Update Rover Marker & Baseline
  useEffect(() => {
    const map = mapRef.current;
    const roverMarker = roverMarkerRef.current;
    const baseline = baselinePolylineRef.current;
    if (!map || !roverMarker || !baseline) return;

    if (rover && rover.connected && rover.latitude && rover.longitude) {
      if (!map.hasLayer(roverMarker)) {
        map.addLayer(roverMarker);
      }
      roverMarker.setLatLng([rover.latitude, rover.longitude]);

      if (base?.latitude && base?.longitude) {
        baseline.setLatLngs([
          [base.latitude, base.longitude],
          [rover.latitude, rover.longitude]
        ]);
      }
    } else {
      if (map.hasLayer(roverMarker)) {
        map.removeLayer(roverMarker);
      }
      baseline.setLatLngs([]);
    }
  }, [rover, base]);

  // Toggle Street vs Satellite layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (mapType === 'satellite') {
      if (map.hasLayer(streetLayerRef.current)) map.removeLayer(streetLayerRef.current);
      if (!map.hasLayer(satelliteLayerRef.current)) map.addLayer(satelliteLayerRef.current);
    } else {
      if (map.hasLayer(satelliteLayerRef.current)) map.removeLayer(satelliteLayerRef.current);
      if (!map.hasLayer(streetLayerRef.current)) map.addLayer(streetLayerRef.current);
    }
  }, [mapType]);

  return (
    <div 
      ref={mapContainerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        outline: 'none',
        backgroundColor: '#111827'
      }} 
    />
  );
}
