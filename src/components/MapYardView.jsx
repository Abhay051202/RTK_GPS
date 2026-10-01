import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  YARD_CONFIG, 
  BASE_STATION, 
  YARD_BLOCKS, 
  YARD_ROADS, 
  GEOFENCES, 
  FUTURE_ROVER_SPEC 
} from '../data/yardData';
import { 
  Compass, 
  Crosshair, 
  Maximize2, 
  Minimize2, 
  Plus, 
  Minus, 
  Layers, 
  Radio, 
  Truck, 
  ShieldAlert,
  MapPin,
  Navigation
} from 'lucide-react';

export const MapYardView = ({ 
  baseCoords,
  mapLayers, 
  onSelectBase, 
  onCursorMove, 
  roverSimulated,
  recenterTrigger
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const baseMarkerRef = useRef(null);
  const rangeCircleRef = useRef(null);
  const roverMarkerRef = useRef(null);
  const hasAutoCenteredRef = useRef(false);
  const layerGroupsRef = useRef({
    tileLayer: null,
    roads: null,
    zones: null,
    geofence: null,
    baseRange: null,
    grid: null
  });

  const [currentZoom, setCurrentZoom] = useState(YARD_CONFIG.defaultZoom);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Create Leaflet Map Instance
    const map = L.map(mapContainerRef.current, {
      center: BASE_STATION.position,
      zoom: YARD_CONFIG.defaultZoom,
      minZoom: YARD_CONFIG.minZoom,
      maxZoom: YARD_CONFIG.maxZoom,
      zoomControl: false,
      attributionControl: false
    });

    mapInstanceRef.current = map;

    // Tactical Dark Vector Basemap
    const darkTileLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 20
      }
    ).addTo(map);

    // Satellite Basemap Layer (pre-created for toggling)
    const satTileLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19
      }
    );

    layerGroupsRef.current.darkTiles = darkTileLayer;
    layerGroupsRef.current.satTiles = satTileLayer;

    // Create Layer Groups
    const zonesGroup = L.layerGroup().addTo(map);
    const roadsGroup = L.layerGroup().addTo(map);
    const geofenceGroup = L.layerGroup().addTo(map);
    const baseRangeGroup = L.layerGroup().addTo(map);
    const gridGroup = L.layerGroup().addTo(map);

    layerGroupsRef.current.zones = zonesGroup;
    layerGroupsRef.current.roads = roadsGroup;
    layerGroupsRef.current.geofence = geofenceGroup;
    layerGroupsRef.current.baseRange = baseRangeGroup;
    layerGroupsRef.current.grid = gridGroup;

    // 1. Render Yard Roads & Corridors
    YARD_ROADS.forEach(road => {
      // Road casing (dark outline)
      L.polyline(road.path, {
        color: '#0e1726',
        weight: 14,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(roadsGroup);

      // Road surface (guideway)
      L.polyline(road.path, {
        color: '#1e293b',
        weight: 10,
        opacity: 0.85,
        lineCap: 'round'
      }).addTo(roadsGroup);

      // Centerline guide (dashed cyan / amber)
      L.polyline(road.path, {
        color: road.id.includes('MID') ? '#ffb703' : '#00f0ff',
        weight: 1.5,
        dashArray: '8, 8',
        opacity: 0.7
      }).addTo(roadsGroup);
    });

    // 2. Render Container Yard Blocks & Slots
    YARD_BLOCKS.forEach(block => {
      let fillColor = '#0f172a';
      let strokeColor = '#334155';

      if (block.type === 'CONTAINER_STACK') {
        fillColor = 'rgba(15, 23, 42, 0.75)';
        strokeColor = 'rgba(56, 189, 248, 0.4)';
      } else if (block.type === 'REEFER') {
        fillColor = 'rgba(6, 78, 59, 0.4)';
        strokeColor = 'rgba(0, 229, 163, 0.5)';
      } else if (block.type === 'HAZMAT') {
        fillColor = 'rgba(127, 29, 29, 0.45)';
        strokeColor = 'rgba(255, 51, 102, 0.7)';
      } else if (block.type === 'MAINTENANCE') {
        fillColor = 'rgba(120, 53, 15, 0.4)';
        strokeColor = 'rgba(255, 183, 3, 0.6)';
      }

      const polygon = L.polygon(block.bounds, {
        color: strokeColor,
        weight: 1.5,
        fillColor: fillColor,
        fillOpacity: 0.75
      }).addTo(zonesGroup);

      // Calculate center for block label
      const latAvg = (block.bounds[0][0] + block.bounds[2][0]) / 2;
      const lngAvg = (block.bounds[0][1] + block.bounds[1][1]) / 2;

      const labelHtml = `
        <div style="
          background: rgba(8, 12, 20, 0.88);
          border: 1px solid ${strokeColor};
          padding: 2px 6px;
          border-radius: 2px;
          color: #f8fafc;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.05em;
          white-space: nowrap;
          box-shadow: 0 2px 8px rgba(0,0,0,0.7);
          pointer-events: none;
        ">
          ${block.name}
        </div>
      `;

      L.marker([latAvg, lngAvg], {
        icon: L.divIcon({
          className: 'yard-block-label',
          html: labelHtml,
          iconSize: [120, 20],
          iconAnchor: [60, 10]
        }),
        interactive: false
      }).addTo(zonesGroup);
    });

    // 3. Render Geofences
    GEOFENCES.forEach(geo => {
      L.polygon(geo.polygon, {
        color: geo.color,
        weight: 2,
        dashArray: '6, 6',
        fillColor: geo.color,
        fillOpacity: 0.06
      }).addTo(geofenceGroup);
    });

    // 4. Render Base Station Coverage Ring
    const rangeCircle = L.circle(BASE_STATION.position, {
      radius: BASE_STATION.coverageRadiusMeters,
      color: '#00f0ff',
      weight: 1,
      dashArray: '4, 8',
      fillColor: '#00f0ff',
      fillOpacity: 0.03
    }).addTo(baseRangeGroup);
    rangeCircleRef.current = rangeCircle;

    // 5. Render Coordinate Grid Lines (tactical RTK survey grid)
    for (let lat = 24.8510; lat <= 24.8570; lat += 0.001) {
      L.polyline([[lat, 67.019], [lat, 67.027]], {
        color: 'rgba(255, 255, 255, 0.05)',
        weight: 1,
        dashArray: '2, 4'
      }).addTo(gridGroup);
    }
    for (let lng = 67.0190; lng <= 67.0270; lng += 0.001) {
      L.polyline([[24.851, lng], [24.857, lng]], {
        color: 'rgba(255, 255, 255, 0.05)',
        weight: 1,
        dashArray: '2, 4'
      }).addTo(gridGroup);
    }

    // 6. CUSTOM ANIMATED BASE STATION MARKER
    const baseIconHtml = `
      <div class="base-marker-container" id="base-beacon-marker">
        <div class="base-radar-wave"></div>
        <div class="base-radar-wave"></div>
        <div class="base-radar-wave"></div>
        <div class="base-sweep-cone"></div>
        <div class="base-beacon-core">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
            <circle cx="12" cy="12" r="2.5" fill="#00f0ff"/>
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
            <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
          </svg>
        </div>
        <div class="base-marker-badge">
          <span class="status-dot status-dot-green" style="width: 5px; height: 5px;"></span>
          <span>BASE // ONLINE</span>
        </div>
      </div>
    `;

    const baseMarker = L.marker(BASE_STATION.position, {
      icon: L.divIcon({
        className: 'custom-base-marker',
        html: baseIconHtml,
        iconSize: [80, 80],
        iconAnchor: [40, 40]
      }),
      zIndexOffset: 1000
    }).addTo(map);

    baseMarker.on('click', () => {
      onSelectBase();
    });

    baseMarkerRef.current = baseMarker;

    // 7. FUTURE ROVER PLACEHOLDER MARKER (Reach Stacker RS-01)
    const roverIconHtml = `
      <div class="rover-marker-container">
        <div class="rover-beacon-core">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffb703" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
        </div>
        <div class="rover-marker-badge">
          <span>ROVER RS-01 [STANDBY]</span>
        </div>
      </div>
    `;

    const roverMarker = L.marker(FUTURE_ROVER_SPEC.placeholderPosition, {
      icon: L.divIcon({
        className: 'custom-rover-marker',
        html: roverIconHtml,
        iconSize: [64, 64],
        iconAnchor: [32, 32]
      }),
      zIndexOffset: 500
    });

    roverMarker.bindPopup(`
      <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #1e293b; padding: 4px;">
        <strong style="color: #d97706;">ROVER RS-01 (REACH STACKER)</strong><br/>
        Status: Awaiting Hardware Telemetry Link<br/>
        Planned Interface: RTK Rover + J1939 CANbus<br/>
        Docking Stall: DEPOT STALL-02
      </div>
    `);

    roverMarkerRef.current = roverMarker;

    // Map Event Listeners
    map.on('mousemove', (e) => {
      onCursorMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map.on('zoomend', () => {
      setCurrentZoom(map.getZoom());
    });

    // Cleanup
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Handle Layer Visibility Toggles
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Satellite vs Dark vector tiles
    if (mapLayers.satellite) {
      if (map.hasLayer(layerGroupsRef.current.darkTiles)) {
        map.removeLayer(layerGroupsRef.current.darkTiles);
      }
      if (!map.hasLayer(layerGroupsRef.current.satTiles)) {
        map.addLayer(layerGroupsRef.current.satTiles);
      }
    } else {
      if (map.hasLayer(layerGroupsRef.current.satTiles)) {
        map.removeLayer(layerGroupsRef.current.satTiles);
      }
      if (!map.hasLayer(layerGroupsRef.current.darkTiles)) {
        map.addLayer(layerGroupsRef.current.darkTiles);
      }
    }

    // Roads
    if (mapLayers.roads && !map.hasLayer(layerGroupsRef.current.roads)) {
      map.addLayer(layerGroupsRef.current.roads);
    } else if (!mapLayers.roads && map.hasLayer(layerGroupsRef.current.roads)) {
      map.removeLayer(layerGroupsRef.current.roads);
    }

    // Zones
    if (mapLayers.zones && !map.hasLayer(layerGroupsRef.current.zones)) {
      map.addLayer(layerGroupsRef.current.zones);
    } else if (!mapLayers.zones && map.hasLayer(layerGroupsRef.current.zones)) {
      map.removeLayer(layerGroupsRef.current.zones);
    }

    // Geofences
    if (mapLayers.geofence && !map.hasLayer(layerGroupsRef.current.geofence)) {
      map.addLayer(layerGroupsRef.current.geofence);
    } else if (!mapLayers.geofence && map.hasLayer(layerGroupsRef.current.geofence)) {
      map.removeLayer(layerGroupsRef.current.geofence);
    }

    // Base Station & Range Ring
    if (mapLayers.base) {
      if (!map.hasLayer(layerGroupsRef.current.baseRange)) {
        map.addLayer(layerGroupsRef.current.baseRange);
      }
      if (baseMarkerRef.current && !map.hasLayer(baseMarkerRef.current)) {
        map.addLayer(baseMarkerRef.current);
      }
    } else {
      if (map.hasLayer(layerGroupsRef.current.baseRange)) {
        map.removeLayer(layerGroupsRef.current.baseRange);
      }
      if (baseMarkerRef.current && map.hasLayer(baseMarkerRef.current)) {
        map.removeLayer(baseMarkerRef.current);
      }
    }

    // Grid
    if (mapLayers.grid && !map.hasLayer(layerGroupsRef.current.grid)) {
      map.addLayer(layerGroupsRef.current.grid);
    } else if (!mapLayers.grid && map.hasLayer(layerGroupsRef.current.grid)) {
      map.removeLayer(layerGroupsRef.current.grid);
    }
  }, [mapLayers]);

  // Handle Rover Layer & Simulation
  useEffect(() => {
    const map = mapInstanceRef.current;
    const roverMarker = roverMarkerRef.current;
    if (!map || !roverMarker) return;

    if (mapLayers.rover && roverSimulated) {
      if (!map.hasLayer(roverMarker)) {
        map.addLayer(roverMarker);
      }
    } else {
      if (map.hasLayer(roverMarker)) {
        map.removeLayer(roverMarker);
      }
    }
  }, [mapLayers.rover, roverSimulated]);

  // Handle live hardware baseCoords update
  useEffect(() => {
    if (!baseCoords || !baseCoords[0] || !baseCoords[1]) return;
    const [lat, lng] = baseCoords;

    if (baseMarkerRef.current) {
      baseMarkerRef.current.setLatLng([lat, lng]);
    }
    if (rangeCircleRef.current) {
      rangeCircleRef.current.setLatLng([lat, lng]);
    }

    // Auto-center map on physical hardware location when first received
    if (!hasAutoCenteredRef.current && mapInstanceRef.current) {
      hasAutoCenteredRef.current = true;
      mapInstanceRef.current.flyTo([lat, lng], 17, { duration: 1.5 });
    }
  }, [baseCoords]);

  // Handle Re-center trigger
  useEffect(() => {
    if (recenterTrigger && mapInstanceRef.current) {
      const targetPos = (baseCoords && baseCoords[0]) ? baseCoords : BASE_STATION.position;
      mapInstanceRef.current.flyTo(targetPos, YARD_CONFIG.defaultZoom, {
        duration: 1.2
      });
    }
  }, [recenterTrigger, baseCoords]);

  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleResetNorth = () => {
    mapInstanceRef.current?.flyTo(BASE_STATION.position, mapInstanceRef.current.getZoom());
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Map Target Canvas */}
      <div 
        ref={mapContainerRef} 
        style={{ width: '100%', height: '100%', outline: 'none' }}
      />

      {/* FLOATING INDUSTRIAL MAP HUD OVERLAYS */}

      {/* 1. Compass Rose & North Indicator */}
      <div style={{
        position: 'absolute',
        top: '72px',
        right: '20px',
        zIndex: 800,
        pointerEvents: 'auto'
      }}>
        <button 
          onClick={handleResetNorth}
          title="Reset Heading to North"
          style={{
            width: '38px',
            height: '38px',
            background: 'rgba(10, 16, 26, 0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-tech)',
            borderRadius: '4px',
            color: 'var(--accent-cyan)',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
          }}
        >
          <Navigation size={18} style={{ transform: 'rotate(-45deg)', filter: 'drop-shadow(0 0 4px #00f0ff)' }} />
          <span style={{ fontSize: '8px', fontFamily: 'var(--font-mono)', fontWeight: 700, marginTop: '-2px' }}>N</span>
        </button>
      </div>

      {/* 2. Floating Zoom & Navigation Controls */}
      <div style={{
        position: 'absolute',
        bottom: '54px',
        right: '20px',
        zIndex: 800,
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        pointerEvents: 'auto'
      }}>
        {/* Zoom In */}
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          style={{
            width: '36px',
            height: '36px',
            background: 'rgba(10, 16, 26, 0.88)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-tech)',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-cyan)'}
          onMouseLeave={e => e.currentTarget.style.color = '#fff'}
        >
          <Plus size={18} />
        </button>

        {/* Zoom Out */}
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          style={{
            width: '36px',
            height: '36px',
            background: 'rgba(10, 16, 26, 0.88)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--border-tech)',
            borderRadius: '4px',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-cyan)'}
          onMouseLeave={e => e.currentTarget.style.color = '#fff'}
        >
          <Minus size={18} />
        </button>

        {/* Re-center Base Button */}
        <button
          onClick={() => {
            mapInstanceRef.current?.flyTo(BASE_STATION.position, YARD_CONFIG.defaultZoom, { duration: 1 });
            onSelectBase();
          }}
          title="Center on Base Station Beacon"
          style={{
            width: '36px',
            height: '36px',
            background: 'rgba(10, 16, 26, 0.88)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--accent-cyan)',
            borderRadius: '4px',
            color: 'var(--accent-cyan)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(0, 240, 255, 0.25)'
          }}
        >
          <Crosshair size={18} />
        </button>
      </div>

      {/* 3. Tactical Scale & Coordinate Reference Bar */}
      <div style={{
        position: 'absolute',
        bottom: '54px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 800,
        background: 'rgba(9, 14, 24, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '3px',
        padding: '4px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        fontSize: '10.5px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-secondary)',
        pointerEvents: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--accent-cyan)' }}>DATUM:</span>
          <span>{YARD_CONFIG.datum}</span>
        </div>

        <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.1)' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>ZOOM:</span>
          <span style={{ color: '#fff' }}>LVL {currentZoom}</span>
        </div>

        <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.1)' }}></div>

        {/* 50m Scale Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '60px',
            height: '4px',
            background: 'linear-gradient(to right, #00f0ff 0%, #00f0ff 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 100%)',
            border: '1px solid rgba(0, 240, 255, 0.5)',
            borderRadius: '1px'
          }}></div>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>50m</span>
        </div>
      </div>
    </div>
  );
};
