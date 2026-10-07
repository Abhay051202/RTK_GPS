import React, { useState, useEffect, useRef } from 'react';
import { SimpleMap } from './components/SimpleMap';
import { 
  MapPin, 
  Truck, 
  Crosshair, 
  Copy, 
  Check, 
  Wifi, 
  Activity, 
  Play, 
  Square,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Layers,
  Eye,
  Ruler,
  Save,
  X,
  Undo2,
  ChevronRight,
  ChevronLeft,
  Navigation,
  RotateCcw
} from 'lucide-react';
import { 
  calcDistanceMeters, 
  wgs84ToUtm, 
  exportSurveyToExcel 
} from './utils/coordinateUtils';

const DEFAULT_SAMPLE_LINES = [
  {
    id: "LINE_001",
    name: "Bay Row 01 (Import Stack)",
    category: "Container Stack Bay",
    color: "#00f0ff",
    points: [
      { name: "PT_001", lat: 18.903620, lng: 73.046310, alt: 13.85, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:30:15" },
      { name: "PT_002", lat: 18.903150, lng: 73.046350, alt: 13.90, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:34:22" },
      { name: "PT_003", lat: 18.902680, lng: 73.046390, alt: 13.92, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:38:40" }
    ]
  },
  {
    id: "LINE_002",
    name: "Bay Row 02 (Export Stack)",
    category: "Container Stack Bay",
    color: "#10b981",
    points: [
      { name: "PT_004", lat: 18.903650, lng: 73.046520, alt: 14.10, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:42:10" },
      { name: "PT_005", lat: 18.903180, lng: 73.046560, alt: 14.05, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:46:05" },
      { name: "PT_006", lat: 18.902710, lng: 73.046600, alt: 14.02, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:50:18" }
    ]
  },
  {
    id: "LINE_003",
    name: "Bay Row 03 (Customs Hold)",
    category: "Container Stack Bay",
    color: "#f59e0b",
    points: [
      { name: "PT_007", lat: 18.903680, lng: 73.046710, alt: 13.95, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:55:00" },
      { name: "PT_008", lat: 18.902740, lng: 73.046790, alt: 13.98, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 09:59:45" }
    ]
  },
  {
    id: "LINE_004",
    name: "Main Internal Truck Lane",
    category: "Traffic Lane",
    color: "#a855f7",
    points: [
      { name: "PT_009", lat: 18.903850, lng: 73.046180, alt: 13.75, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 10:05:12" },
      { name: "PT_010", lat: 18.903820, lng: 73.046950, alt: 13.80, fixQuality: "RTK FIXED (cm accuracy)", isRtkLogged: true, timestamp: "2026-10-07 10:10:30" }
    ]
  }
];

export function App() {
  // Base Station Telemetry
  const [base, setBase] = useState({
    connected: false,
    port: "COM3",
    latitude: 18.903870,
    longitude: 73.046748,
    altitude: 13.7,
    satellites_used: 12,
    satellites_tracked: 53,
    fix_status_text: "DGPS / DIFFERENTIAL",
    hdop: 0.48,
    last_sentence: ""
  });

  // Rover Telemetry
  const [rover, setRover] = useState({
    connected: false,
    device_id: "ROVER-RS-01",
    latitude: 18.903250,
    longitude: 73.046420,
    altitude: 13.9,
    speed_kmh: 0.0,
    heading: 0.0,
    battery_percent: 94,
    fix_quality: 4,
    fix_status_text: "RTK FIXED (cm level)",
    distance_to_base_meters: 76.4,
    is_simulated: false
  });

  // UI States
  const [mapType, setMapType] = useState('satellite');
  const [copied, setCopied] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showApiSnippet, setShowApiSnippet] = useState(false);
  const [showSurveySidebar, setShowSurveySidebar] = useState(true);
  const [showTelemetryHUD, setShowTelemetryHUD] = useState(true);
  const [showContainerBays, setShowContainerBays] = useState(true);
  const [activeLineId, setActiveLineId] = useState(null);
  const [notification, setNotification] = useState(null);

  // Survey & Drawing States
  const [surveyLines, setSurveyLines] = useState(DEFAULT_SAMPLE_LINES);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentDrawingPoints, setCurrentDrawingPoints] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newLineForm, setNewLineForm] = useState({
    name: "",
    category: "Container Stack Bay",
    color: "#00f0ff"
  });

  const wsRef = useRef(null);

  // Show transient toast notification
  const showToast = (msg, duration = 3000) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), duration);
  };

  // 1. Fetch saved features from backend on start
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/survey/features')
      .then(res => res.json())
      .then(data => {
        if (data && data.features && data.features.length > 0) {
          setSurveyLines(data.features);
        }
      })
      .catch(err => {
        console.warn("Backend features fetch fallback to local:", err);
      });
  }, []);

  // 2. Connect to Python WebSocket for live Base & Rover telemetry
  useEffect(() => {
    let timeout = null;

    const connect = () => {
      try {
        const ws = new WebSocket('ws://127.0.0.1:8000/ws/telemetry');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[GNSS] WebSocket connected');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.base) {
              setBase(data.base);
            }
            if (data.rover) {
              setRover(data.rover);
              setIsSimulating(Boolean(data.rover.is_simulated));
            }
          } catch (err) {
            console.error(err);
          }
        };

        ws.onclose = () => {
          timeout = setTimeout(connect, 1500);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        timeout = setTimeout(connect, 1500);
      }
    };

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  // Save survey lines to backend disk
  const syncLinesToBackend = async (linesToSave) => {
    try {
      await fetch('http://127.0.0.1:8000/api/survey/features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: linesToSave })
      });
    } catch (err) {
      console.warn("Failed to sync to backend disk:", err);
    }
  };

  // Handle map click when in drawing mode
  const handleMapClick = (latlng) => {
    if (!isDrawingMode) return;

    const newPt = {
      name: `PT_${String(currentDrawingPoints.length + 1).padStart(3, '0')}`,
      lat: Number(latlng.lat.toFixed(8)),
      lng: Number(latlng.lng.toFixed(8)),
      alt: rover.altitude || base.altitude || 14.0,
      fixQuality: "UI Survey Map (Sub-meter)",
      isRtkLogged: false,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    setCurrentDrawingPoints(prev => [...prev, newPt]);
  };

  // Log current physical RTK hardware position into the active survey line
  const handleLogCurrentRtkPoint = () => {
    const lat = rover.latitude || base.latitude;
    const lng = rover.longitude || base.longitude;
    const alt = rover.altitude || base.altitude || 14.0;
    const isRover = Boolean(rover.latitude && rover.connected);

    if (!lat || !lng) {
      showToast("❌ No RTK position fix available yet.");
      return;
    }

    const newPt = {
      name: `RTK_${String(currentDrawingPoints.length + 1).padStart(3, '0')}`,
      lat: Number(lat.toFixed(8)),
      lng: Number(lng.toFixed(8)),
      alt: Number(alt.toFixed(3)),
      fixQuality: isRover ? rover.fix_status_text || "RTK FIXED (cm accuracy)" : base.fix_status_text || "DGPS BASE",
      isRtkLogged: true,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    if (!isDrawingMode) {
      setIsDrawingMode(true);
      setCurrentDrawingPoints([newPt]);
      showToast(`📍 Started new survey line at RTK position (${lat.toFixed(6)}°, ${lng.toFixed(6)}°)`);
    } else {
      setCurrentDrawingPoints(prev => [...prev, newPt]);
      showToast(`📌 Added RTK Point #${currentDrawingPoints.length + 1} with cm-level accuracy!`);
    }
  };

  // Undo last point
  const handleUndoPoint = () => {
    if (currentDrawingPoints.length === 0) return;
    setCurrentDrawingPoints(prev => prev.slice(0, -1));
  };

  // Cancel drawing
  const handleCancelDrawing = () => {
    setIsDrawingMode(false);
    setCurrentDrawingPoints([]);
  };

  // Prompt save line modal
  const handleFinishDrawing = () => {
    if (currentDrawingPoints.length < 2) {
      showToast("⚠️ A line requires at least 2 points. Click on the map or log RTK points.");
      return;
    }

    const defaultName = `Bay Row ${String(surveyLines.length + 1).padStart(2, '0')}`;
    setNewLineForm({
      name: defaultName,
      category: "Container Stack Bay",
      color: ["#00f0ff", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"][surveyLines.length % 5]
    });
    setShowSaveModal(true);
  };

  // Confirm save line
  const handleSaveConfirmed = () => {
    const lineId = `LINE_${String(Date.now()).slice(-5)}`;
    const lineObj = {
      id: lineId,
      name: newLineForm.name.trim() || `Survey Line ${surveyLines.length + 1}`,
      category: newLineForm.category,
      color: newLineForm.color,
      points: currentDrawingPoints
    };

    const updated = [...surveyLines, lineObj];
    setSurveyLines(updated);
    syncLinesToBackend(updated);

    setIsDrawingMode(false);
    setCurrentDrawingPoints([]);
    setShowSaveModal(false);
    setActiveLineId(lineId);
    showToast(`✅ Saved line "${lineObj.name}" with ${lineObj.points.length} vertices!`);
  };

  // Delete line
  const handleDeleteLine = (id) => {
    const updated = surveyLines.filter(l => l.id !== id);
    setSurveyLines(updated);
    syncLinesToBackend(updated);
    if (activeLineId === id) setActiveLineId(null);
    showToast("🗑️ Line deleted.");
  };

  // Reset to default Prosper CFS sample lines
  const handleResetDefaults = () => {
    if (window.confirm("Reset all survey lines to Prosper CFS defaults?")) {
      setSurveyLines(DEFAULT_SAMPLE_LINES);
      syncLinesToBackend(DEFAULT_SAMPLE_LINES);
      showToast("🔄 Restored Prosper CFS yard defaults.");
    }
  };

  // Export to Excel (.xlsx) with cm-level accuracy
  const handleExportExcel = () => {
    if (surveyLines.length === 0) {
      showToast("⚠️ No surveyed lines to export. Draw a line first!");
      return;
    }

    try {
      const fileName = exportSurveyToExcel(surveyLines, {
        yardName: "Prosper_CFS_Nhava_Sheva",
        slotSpacing: 6.1 // 20ft container bay
      });
      showToast(`📊 Downloaded Excel: ${fileName} (Centimeter Precision)`);
    } catch (err) {
      console.error(err);
      // Fallback to backend python endpoint
      window.open('http://127.0.0.1:8000/api/survey/export-excel', '_blank');
      showToast("📊 Generated Excel via Python backend!");
    }
  };

  // Calculate live drawing length
  let liveDrawingDist = 0;
  for (let i = 0; i < currentDrawingPoints.length - 1; i++) {
    liveDrawingDist += calcDistanceMeters(
      currentDrawingPoints[i].lat, currentDrawingPoints[i].lng,
      currentDrawingPoints[i+1].lat, currentDrawingPoints[i+1].lng
    );
  }

  const handleCopyCoords = () => {
    const text = `BASE: ${base.latitude.toFixed(6)}, ${base.longitude.toFixed(6)}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleSimulation = async () => {
    const nextState = !isSimulating;
    setIsSimulating(nextState);
    try {
      await fetch(`http://127.0.0.1:8000/api/rover/simulate?enable=${nextState}`, {
        method: 'POST'
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: '#090d16',
      color: '#f8fafc',
      overflow: 'hidden'
    }}>
      {/* 1. TOP HEADER & MAIN CONTROLS */}
      <header style={{
        height: '56px',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        zIndex: 1000,
        gap: '12px'
      }}>
        {/* Left: Branding & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 10px rgba(2, 132, 199, 0.5)'
            }}>
              <MapPin size={18} color="#ffffff" />
            </div>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', letterSpacing: '0.3px' }}>
                PROSPER CFS RTK YARD SURVEY
              </span>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                Nhava Sheva Terminal &bull; Centimeter-Accuracy Mapping
              </div>
            </div>
          </div>

          {/* Base Status Badge */}
          <span style={{
            backgroundColor: base.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
            color: base.connected ? '#4ade80' : '#facc15',
            border: `1px solid ${base.connected ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: base.connected ? '#4ade80' : '#facc15'
            }}></span>
            BASE: {base.connected ? `LIVE ON ${base.port || 'COM3'}` : 'SEARCHING...'}
          </span>

          {/* Rover Status Badge */}
          <span style={{
            backgroundColor: rover.connected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: rover.connected ? '#fbbf24' : '#94a3b8',
            border: `1px solid ${rover.connected ? 'rgba(245, 158, 11, 0.4)' : 'rgba(148, 163, 184, 0.3)'}`,
            padding: '3px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: rover.connected ? '#fbbf24' : '#94a3b8'
            }}></span>
            ROVER: {rover.connected ? (rover.is_simulated ? "SIMULATED (MOVING)" : "ONLINE (API)") : "STANDBY"}
          </span>
        </div>

        {/* Center / Right: Primary Survey Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 1. DRAW LINE TOOL */}
          <button
            onClick={() => {
              if (isDrawingMode) {
                handleCancelDrawing();
              } else {
                setIsDrawingMode(true);
                setCurrentDrawingPoints([]);
                showToast("✏️ Click on map to add points, or walk and tap 'Log RTK Point'");
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isDrawingMode ? '#ef4444' : '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isDrawingMode ? '0 0 12px rgba(239, 68, 68, 0.5)' : '0 0 10px rgba(2, 132, 199, 0.3)'
            }}
          >
            {isDrawingMode ? <X size={14} /> : <Crosshair size={14} />}
            <span>{isDrawingMode ? "Exit Drawing" : "✏️ Draw Yard Line"}</span>
          </button>

          {/* 2. LOG RTK POINT FROM PHYSICAL CHIP */}
          <button
            onClick={handleLogCurrentRtkPoint}
            title="Log the physical RTK Base/Rover coordinates into the survey line"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.5)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Navigation size={14} />
            <span>📌 Log RTK Point</span>
          </button>

          {/* 3. EXPORT EXCEL (.xlsx) WITH CM ACCURACY */}
          <button
            onClick={handleExportExcel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#10b981',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
            }}
          >
            <FileSpreadsheet size={15} />
            <span>Export Excel (.xlsx)</span>
          </button>

          <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255, 255, 255, 0.2)', margin: '0 4px' }} />

          {/* Map Layer Switcher (Satellite vs Street) */}
          <div style={{
            display: 'flex',
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            padding: '2px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <button
              onClick={() => setMapType('satellite')}
              style={{
                backgroundColor: mapType === 'satellite' ? '#0284c7' : 'transparent',
                color: mapType === 'satellite' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Satellite
            </button>
            <button
              onClick={() => setMapType('street')}
              style={{
                backgroundColor: mapType === 'street' ? '#0284c7' : 'transparent',
                color: mapType === 'street' ? '#ffffff' : '#94a3b8',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Street
            </button>
          </div>

          {/* Survey Lines Sidebar Toggle */}
          <button
            onClick={() => setShowSurveySidebar(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: showSurveySidebar ? '#334155' : '#1e293b',
              color: '#e2e8f0',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Layers size={14} />
            <span>Lines ({surveyLines.length})</span>
          </button>
        </div>
      </header>

      {/* TOAST NOTIFICATION */}
      {notification && (
        <div style={{
          position: 'absolute',
          top: '68px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          border: '1px solid #38bdf8',
          padding: '8px 18px',
          borderRadius: '20px',
          fontSize: '12px',
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7)',
          zIndex: 2000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {notification}
        </div>
      )}

      {/* 2. DRAWING MODE ACTION BANNER (When Active) */}
      {isDrawingMode && (
        <div style={{
          backgroundColor: '#1e293b',
          borderBottom: '2px solid #0284c7',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 950,
          fontSize: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Crosshair size={15} /> DRAWING MODE ACTIVE:
            </span>
            <span style={{ color: '#cbd5e1' }}>
              Click anywhere on the map to place vertices, or carry your RTK rover and tap <strong>Log RTK Point</strong>.
            </span>
            <div style={{
              display: 'flex',
              gap: '12px',
              backgroundColor: '#0f172a',
              padding: '4px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <span>Points: <strong style={{ color: '#fff' }}>{currentDrawingPoints.length}</strong></span>
              <span>Length: <strong style={{ color: '#34d399', fontFamily: 'monospace' }}>{liveDrawingDist.toFixed(2)} m</strong> ({(liveDrawingDist * 3.28084).toFixed(1)} ft)</span>
              <span>Est. 20ft Bays: <strong style={{ color: '#fbbf24' }}>{Math.floor(liveDrawingDist / 6.1)}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleUndoPoint}
              disabled={currentDrawingPoints.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#334155',
                color: currentDrawingPoints.length === 0 ? '#64748b' : '#fff',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: currentDrawingPoints.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              <Undo2 size={13} /> Undo Point
            </button>

            <button
              onClick={handleFinishDrawing}
              disabled={currentDrawingPoints.length < 2}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: currentDrawingPoints.length < 2 ? '#475569' : '#10b981',
                color: '#fff',
                border: 'none',
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: currentDrawingPoints.length < 2 ? 'not-allowed' : 'pointer'
              }}
            >
              <Save size={13} /> Finish & Save Line
            </button>

            <button
              onClick={handleCancelDrawing}
              style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* 3. MAIN WORKSPACE: MAP & SIDEBAR */}
      <main style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 56px)', display: 'flex' }}>
        {/* Full-width Map View */}
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          <SimpleMap 
            base={base} 
            rover={rover} 
            mapType={mapType}
            surveyLines={surveyLines}
            currentDrawingPoints={currentDrawingPoints}
            isDrawingMode={isDrawingMode}
            onMapClick={handleMapClick}
            activeLineId={activeLineId}
            onSelectLine={(id) => setActiveLineId(id)}
            showContainerBays={showContainerBays}
          />

          {/* TELEMETRY HUD (Floating on Top Left) */}
          {showTelemetryHUD && (
            <div style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              zIndex: 900
            }}>
              {/* CARD 1: BASE STATION ANCHOR */}
              <div style={{
                width: '290px',
                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(0, 240, 255, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00f0ff' }}></div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#00f0ff' }}>
                      📍 BASE STATION (COM3)
                    </span>
                  </div>
                  <span style={{
                    backgroundColor: 'rgba(0, 240, 255, 0.12)',
                    color: '#38bdf8',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 600
                  }}>
                    {base.fix_status_text || 'DGPS'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Lat / Lng:</span>
                    <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                      {base.latitude ? base.latitude.toFixed(6) : "18.903870"}°, {base.longitude ? base.longitude.toFixed(6) : "73.046748"}°
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>UTM Zone 43N:</span>
                    <span style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'monospace' }}>
                      E: {wgs84ToUtm(base.latitude, base.longitude).easting}m
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Satellites:</span>
                    <span style={{ fontWeight: 600, color: '#4ade80' }}>
                      {base.satellites_used || 12} fixed ({base.satellites_tracked || 53} tracked)
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 2: ROVER TELEMETRY */}
              <div style={{
                width: '290px',
                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '8px',
                padding: '12px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: '#f59e0b' }}></div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>
                      🚜 ROVER UNIT (RS-01)
                    </span>
                  </div>
                  <span style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.15)',
                    color: '#4ade80',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 700
                  }}>
                    {rover.fix_status_text || "RTK FIXED (cm)"}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
                  <div style={{
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ color: '#fbbf24', fontWeight: 600 }}>Distance to Base:</span>
                    <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace' }}>
                      {calcDistanceMeters(base.latitude, base.longitude, rover.latitude || base.latitude, rover.longitude || base.longitude).toFixed(2)} m
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Rover Lat/Lng:</span>
                    <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                      {rover.latitude ? rover.latitude.toFixed(6) : "18.903250"}°, {rover.longitude ? rover.longitude.toFixed(6) : "73.046420"}°
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={handleLogCurrentRtkPoint}
                      style={{
                        flex: 1,
                        backgroundColor: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        padding: '5px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      📌 Record RTK Point
                    </button>
                    <button
                      onClick={handleToggleSimulation}
                      style={{
                        backgroundColor: '#1e293b',
                        color: isSimulating ? '#f87171' : '#fbbf24',
                        border: '1px solid rgba(255,255,255,0.15)',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      {isSimulating ? "Stop Sim" : "Simulate"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. SURVEY FEATURES SIDEBAR */}
        {showSurveySidebar && (
          <aside style={{
            width: '360px',
            backgroundColor: '#0f172a',
            borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 900
          }}>
            {/* Sidebar Header */}
            <div style={{
              padding: '14px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                  Yard Survey Lines
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {surveyLines.length} lines &bull; WGS-84 & UTM Zone 43N
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleExportExcel}
                  title="Export to Excel (.xlsx)"
                  style={{
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Download size={12} /> Excel
                </button>
                <button
                  onClick={() => setShowSurveySidebar(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* View options & 20ft Bay Slots toggle */}
            <div style={{
              padding: '8px 16px',
              backgroundColor: '#1e293b',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px'
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#cbd5e1' }}>
                <input 
                  type="checkbox" 
                  checked={showContainerBays} 
                  onChange={(e) => setShowContainerBays(e.target.checked)} 
                />
                Show 20ft (6.1m) Bay Markings
              </label>

              <button
                onClick={handleResetDefaults}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px'
                }}
              >
                <RotateCcw size={11} /> Reset Defaults
              </button>
            </div>

            {/* List of Surveyed Lines */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {surveyLines.length === 0 ? (
                <div style={{
                  padding: '30px 16px',
                  textAlign: 'center',
                  color: '#64748b',
                  fontSize: '12px'
                }}>
                  No lines surveyed yet.<br/>
                  Click <strong>Draw Yard Line</strong> or <strong>Log RTK Point</strong> to begin.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {surveyLines.map((line, idx) => {
                    let totalLen = 0;
                    for (let i = 0; i < line.points.length - 1; i++) {
                      totalLen += calcDistanceMeters(
                        line.points[i].lat, line.points[i].lng,
                        line.points[i+1].lat, line.points[i+1].lng
                      );
                    }
                    const isSelected = line.id === activeLineId;
                    const bays20 = Math.floor(totalLen / 6.1);
                    const bays40 = Math.floor(totalLen / 12.2);

                    return (
                      <div
                        key={line.id}
                        onClick={() => setActiveLineId(line.id)}
                        style={{
                          backgroundColor: isSelected ? 'rgba(2, 132, 199, 0.15)' : '#1e293b',
                          border: `1px solid ${isSelected ? line.color : 'rgba(255, 255, 255, 0.1)'}`,
                          borderRadius: '6px',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '2px',
                              backgroundColor: line.color
                            }} />
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                              {line.name}
                            </span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLine(line.id);
                            }}
                            title="Delete Line"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: '2px'
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span>{line.category || 'Container Bay'}</span>
                          <span>{line.points.length} vertices</span>
                        </div>

                        {/* Length & Bay Slot Stats */}
                        <div style={{
                          backgroundColor: '#0f172a',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px'
                        }}>
                          <div>
                            <span style={{ color: '#94a3b8' }}>Length: </span>
                            <span style={{ color: '#4ade80', fontWeight: 700, fontFamily: 'monospace' }}>
                              {totalLen.toFixed(2)} m
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#94a3b8' }}>20ft Bays: </span>
                            <span style={{ color: '#fbbf24', fontWeight: 700 }}>~{bays20}</span>
                          </div>
                        </div>

                        {/* First and Last Coordinate Preview */}
                        {line.points.length > 0 && (
                          <div style={{ marginTop: '6px', fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>
                            Start: {line.points[0].lat.toFixed(6)}°, {line.points[0].lng.toFixed(6)}°
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar Bottom Export CTA */}
            <div style={{
              padding: '12px 16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              backgroundColor: '#0f172a'
            }}>
              <button
                onClick={handleExportExcel}
                style={{
                  width: '100%',
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                }}
              >
                <FileSpreadsheet size={16} />
                <span>Export Survey to Excel (.xlsx)</span>
              </button>
              <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', marginTop: '6px' }}>
                Centimeter accuracy (8-decimal Lat/Lon & UTM Zone 43N)
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* 5. MODAL: SAVE NEW SURVEY LINE */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div style={{
            width: '400px',
            backgroundColor: '#0f172a',
            border: '1px solid #38bdf8',
            borderRadius: '8px',
            padding: '20px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.8)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff', fontWeight: 700 }}>
                📏 Save Surveyed Line
              </h3>
              <button 
                onClick={() => setShowSaveModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                  Line Name / Stack ID:
                </label>
                <input
                  type="text"
                  value={newLineForm.name}
                  onChange={(e) => setNewLineForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Bay Row 05 - Import"
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>
                  Category:
                </label>
                <select
                  value={newLineForm.category}
                  onChange={(e) => setNewLineForm(prev => ({ ...prev, category: e.target.value }))}
                  style={{
                    width: '100%',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    fontSize: '13px'
                  }}
                >
                  <option value="Container Stack Bay">Container Stack Bay</option>
                  <option value="Traffic Lane">Traffic / Truck Lane</option>
                  <option value="Perimeter Boundary">Perimeter Boundary</option>
                  <option value="Crane Track">Crane Track / Rail</option>
                  <option value="Inspection Bay">Inspection Bay</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  Line Display Color:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {["#00f0ff", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"].map(c => (
                    <div
                      key={c}
                      onClick={() => setNewLineForm(prev => ({ ...prev, color: c }))}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '4px',
                        backgroundColor: c,
                        cursor: 'pointer',
                        border: newLineForm.color === c ? '2px solid #ffffff' : '1px solid transparent',
                        boxShadow: newLineForm.color === c ? '0 0 8px ' + c : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Line Summary in Modal */}
              <div style={{
                backgroundColor: '#1e293b',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#cbd5e1'
              }}>
                <div>Total Vertices: <strong>{currentDrawingPoints.length}</strong></div>
                <div>Calculated Length: <strong style={{ color: '#4ade80' }}>{liveDrawingDist.toFixed(2)} m</strong> ({(liveDrawingDist * 3.28084).toFixed(1)} ft)</div>
                <div>Estimated 20ft Bays (6.1m): <strong style={{ color: '#fbbf24' }}>~{Math.floor(liveDrawingDist / 6.1)} slots</strong></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={() => setShowSaveModal(false)}
                  style={{
                    backgroundColor: '#334155',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConfirmed}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Save Line
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
