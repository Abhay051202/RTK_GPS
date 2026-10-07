import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { calcDistanceMeters, wgs84ToUtm } from '../utils/coordinateUtils';

export function SimpleMap({ 
  base, 
  rover, 
  mapType,
  surveyLines = [],
  currentDrawingPoints = [],
  isDrawingMode = false,
  onMapClick,
  activeLineId,
  onSelectLine,
  showContainerBays = true,
  onRemoveActiveWaypoint,
  onRemoveSavedWaypoint
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const baseMarkerRef = useRef(null);
  const roverMarkerRef = useRef(null);
  const baselinePolylineRef = useRef(null);
  const streetLayerRef = useRef(null);
  const satelliteLayerRef = useRef(null);
  const hasCenteredRef = useRef(false);

  // Layer groups for survey lines and drawing preview
  const surveyLayersRef = useRef(null);
  const drawingLayerRef = useRef(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialLat = base?.latitude || 18.90387;
    const initialLng = base?.longitude || 73.04675;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 18,
      maxZoom: 21,
      zoomControl: false
    });

    mapRef.current = map;

    // Zoom control at bottom right
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
        maxZoom: 20,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
      }
    );

    streetLayerRef.current = streetLayer;
    satelliteLayerRef.current = satelliteLayer;
    satelliteLayer.addTo(map);

    // Feature group layers for survey lines & dynamic drawing
    surveyLayersRef.current = L.featureGroup().addTo(map);
    drawingLayerRef.current = L.featureGroup().addTo(map);

    // 1. Base Station Marker
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
        <strong style="color: #0284c7;">📍 Base Station (Master Anchor)</strong><br/>
        <strong>Status:</strong> Live RTK Base (COM3)<br/>
        <strong>Lat:</strong> ${initialLat.toFixed(6)}°<br/>
        <strong>Lng:</strong> ${initialLng.toFixed(6)}°
      </div>
    `);

    baseMarkerRef.current = baseMarker;

    // 2. Rover Marker
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
        <strong style="color: #d97706;">🚜 Rover Unit (RS-01)</strong><br/>
        <strong>Status:</strong> Active RTK Rover<br/>
        <strong>Fix:</strong> RTK FIXED (cm accuracy)
      </div>
    `);

    roverMarkerRef.current = roverMarker;

    // 3. Baseline Polyline
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

  // 4. Map Click Handler for Drawing Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e) => {
      if (isDrawingMode && onMapClick) {
        onMapClick({
          lat: Number(e.latlng.lat.toFixed(8)),
          lng: Number(e.latlng.lng.toFixed(8))
        });
      }
    };

    if (isDrawingMode) {
      map.getContainer().style.cursor = 'crosshair';
      map.on('click', handleClick);
    } else {
      map.getContainer().style.cursor = '';
    }

    return () => {
      map.off('click', handleClick);
      if (map.getContainer()) {
        map.getContainer().style.cursor = '';
      }
    };
  }, [isDrawingMode, onMapClick]);

  // 5. Render Completed Survey Lines & Vertices
  useEffect(() => {
    const map = mapRef.current;
    const group = surveyLayersRef.current;
    if (!map || !group) return;

    group.clearLayers();

    surveyLines.forEach((line) => {
      if (!line.points || line.points.length === 0) return;

      const latlngs = line.points.map(p => [p.lat, p.lng]);
      const color = line.color || '#00f0ff';
      const isSelected = line.id === activeLineId;

      // Calculate total line length
      let totalDist = 0;
      for (let i = 0; i < line.points.length - 1; i++) {
        totalDist += calcDistanceMeters(
          line.points[i].lat, line.points[i].lng,
          line.points[i+1].lat, line.points[i+1].lng
        );
      }

      // Draw Main Survey Polyline
      const polyline = L.polyline(latlngs, {
        color: color,
        weight: isSelected ? 5 : 3.5,
        opacity: isSelected ? 1.0 : 0.88
      });

      // Interactive popup
      const startUtm = wgs84ToUtm(line.points[0].lat, line.points[0].lng);
      polyline.bindPopup(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; color: #0f172a; min-width: 220px; line-height: 1.5;">
          <div style="font-weight: 700; color: #0284c7; font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px;">
            📏 ${line.name || 'Surveyed Line'}
          </div>
          <div><strong>Category:</strong> ${line.category || 'Container Bay'}</div>
          <div><strong>Length:</strong> <span style="font-family: monospace; font-weight: 700;">${totalDist.toFixed(2)} m</span> (${(totalDist * 3.28084).toFixed(1)} ft)</div>
          <div><strong>Vertices:</strong> ${line.points.length} points</div>
          <div><strong>Est. 20ft Bays (6.1m):</strong> ~${Math.floor(totalDist / 6.1)} slots</div>
          <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
            Start UTM: E ${startUtm.easting} | N ${startUtm.northing} (${startUtm.zone})
          </div>
        </div>
      `);

      polyline.on('click', () => {
        if (onSelectLine) onSelectLine(line.id);
      });

      group.addLayer(polyline);

      // Draw Vertex markers with REMOVE WAYPOINT BUTTON in popup
      line.points.forEach((pt, pIdx) => {
        const isStart = pIdx === 0;
        const isEnd = pIdx === line.points.length - 1;

        const vertexHtml = `
          <div style="
            width: ${isStart || isEnd ? '12px' : '9px'};
            height: ${isStart || isEnd ? '12px' : '9px'};
            border-radius: 50%;
            background-color: ${isStart ? '#22c55e' : (isEnd ? '#ef4444' : color)};
            border: 2px solid #ffffff;
            box-shadow: 0 0 6px rgba(0,0,0,0.6);
            cursor: pointer;
          "></div>
        `;

        const vMarker = L.marker([pt.lat, pt.lng], {
          icon: L.divIcon({
            className: 'survey-vertex-marker',
            html: vertexHtml,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })
        });

        const utm = wgs84ToUtm(pt.lat, pt.lng);

        // Click popup with REMOVE WAYPOINT action
        const popupContent = document.createElement('div');
        popupContent.style.fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
        popupContent.style.fontSize = '12px';
        popupContent.style.lineHeight = '1.4';
        popupContent.style.color = '#0f172a';
        popupContent.style.minWidth = '190px';

        popupContent.innerHTML = `
          <div style="font-weight: 700; color: #0284c7; margin-bottom: 4px;">
            📍 ${line.name} &bull; Point #${pIdx + 1}
          </div>
          <div><strong>Lat:</strong> ${pt.lat.toFixed(8)}°</div>
          <div><strong>Lng:</strong> ${pt.lng.toFixed(8)}°</div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
            UTM: E ${utm.easting}m | N ${utm.northing}m
          </div>
        `;

        if (onRemoveSavedWaypoint) {
          const removeBtn = document.createElement('button');
          removeBtn.innerHTML = '🗑️ Remove This Waypoint';
          removeBtn.style.cssText = 'background: #ef4444; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px;';
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            onRemoveSavedWaypoint(line.id, pIdx);
            map.closePopup();
          };
          popupContent.appendChild(removeBtn);
        }

        vMarker.bindPopup(popupContent);
        group.addLayer(vMarker);
      });

      // Optional: Draw container bay slots (20ft = 6.1m markings)
      if (showContainerBays && line.points.length >= 2) {
        for (let i = 0; i < line.points.length - 1; i++) {
          const p1 = line.points[i];
          const p2 = line.points[i + 1];
          const segDist = calcDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
          const bayCount = Math.floor(segDist / 6.1);

          for (let b = 1; b <= bayCount; b++) {
            const frac = (b * 6.1) / segDist;
            if (frac >= 0.98) break;
            const bLat = p1.lat + frac * (p2.lat - p1.lat);
            const bLng = p1.lng + frac * (p2.lng - p1.lng);

            const slotDot = L.circleMarker([bLat, bLng], {
              radius: 3,
              fillColor: '#ffffff',
              fillOpacity: 0.9,
              color: color,
              weight: 1.5
            });
            slotDot.bindTooltip(`Bay Slot #${b} (6.1m)`, { direction: 'right', offset: [4, 0] });
            group.addLayer(slotDot);
          }
        }
      }
    });
  }, [surveyLines, activeLineId, onSelectLine, showContainerBays, onRemoveSavedWaypoint]);

  // 6. Render Active Line Under Construction with REMOVE WAYPOINT ON CLICK
  useEffect(() => {
    const map = mapRef.current;
    const group = drawingLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (!currentDrawingPoints || currentDrawingPoints.length === 0) return;

    const latlngs = currentDrawingPoints.map(p => [p.lat, p.lng]);

    // Active line polyline (dashed electric blue)
    const activeLine = L.polyline(latlngs, {
      color: '#38bdf8',
      weight: 3.5,
      dashArray: '5, 5',
      opacity: 0.95
    });
    group.addLayer(activeLine);

    // Active vertices with point badges (1, 2, 3...)
    currentDrawingPoints.forEach((pt, idx) => {
      const isStart = idx === 0;
      const badgeHtml = `
        <div style="
          min-width: 20px;
          height: 20px;
          padding: 0 4px;
          border-radius: 10px;
          background-color: ${isStart ? '#22c55e' : '#0284c7'};
          border: 2px solid #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.5);
          color: #ffffff;
          font-weight: 700;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: monospace;
          cursor: pointer;
        ">
          ${idx + 1}
        </div>
      `;

      const marker = L.marker([pt.lat, pt.lng], {
        icon: L.divIcon({
          className: 'active-drawing-vertex',
          html: badgeHtml,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      });

      const utm = wgs84ToUtm(pt.lat, pt.lng);

      // Popup with REMOVE ACTIVE WAYPOINT button
      const popupContent = document.createElement('div');
      popupContent.style.fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
      popupContent.style.fontSize = '12px';
      popupContent.style.lineHeight = '1.4';
      popupContent.style.color = '#0f172a';
      popupContent.style.minWidth = '180px';

      popupContent.innerHTML = `
        <div style="font-weight: 700; color: #0284c7; margin-bottom: 4px;">
          📍 Active Waypoint #${idx + 1}
        </div>
        <div><strong>Lat:</strong> ${pt.lat.toFixed(8)}°</div>
        <div><strong>Lng:</strong> ${pt.lng.toFixed(8)}°</div>
        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">
          UTM: E ${utm.easting}m | N ${utm.northing}m
        </div>
      `;

      if (onRemoveActiveWaypoint) {
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '🗑️ Remove This Waypoint';
        removeBtn.style.cssText = 'background: #ef4444; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px;';
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          onRemoveActiveWaypoint(idx);
          map.closePopup();
        };
        popupContent.appendChild(removeBtn);
      }

      marker.bindPopup(popupContent);
      group.addLayer(marker);
    });
  }, [currentDrawingPoints, onRemoveActiveWaypoint]);

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

export default SimpleMap;
