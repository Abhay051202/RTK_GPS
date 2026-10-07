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
  RotateCcw,
  Radio,
  Sliders
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

  // Live Rover Path Recording States
  const [isRecordingRover, setIsRecordingRover] = useState(false);
  const isRecordingRoverRef = useRef(false);
  const [recordIntervalMeters, setRecordIntervalMeters] = useState(0.5); // auto-drop point every 0.5m
  const recordIntervalMetersRef = useRef(0.5);
  const recordedRoverPointsRef = useRef([]);

  // Waypoint Management States
  const [expandedLineId, setExpandedLineId] = useState(null);
  const [showActivePointsDrawer, setShowActivePointsDrawer] = useState(false);

  const wsRef = useRef(null);

  // Sync ref with state
  useEffect(() => {
    isRecordingRoverRef.current = isRecordingRover;
  }, [isRecordingRover]);

  useEffect(() => {
    recordIntervalMetersRef.current = recordIntervalMeters;
  }, [recordIntervalMeters]);

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

              // AUTOMATIC MOVEMENT RECORDING (Supports Rover or Base COM3 hardware)
              if (isRecordingRoverRef.current) {
                // Determine active tracking source: Rover if active/moving, else Base hardware (COM3)
                const activeDevice = (data.rover && data.rover.connected && data.rover.latitude) 
                  ? data.rover 
                  : ((data.base && data.base.latitude) ? data.base : null);

                if (activeDevice && activeDevice.latitude && activeDevice.longitude) {
                  const lat = activeDevice.latitude;
                  const lng = activeDevice.longitude;
                  const pts = recordedRoverPointsRef.current;
                  const isRover = Boolean(data.rover && data.rover.connected && data.rover.latitude);
                  const devicePrefix = isRover ? "ROVER" : "BASE_WALK";

                  if (pts.length === 0) {
                    // Anchor initial point
                    const p0 = {
                      name: `${devicePrefix}_PT_001`,
                      lat: Number(lat.toFixed(8)),
                      lng: Number(lng.toFixed(8)),
                      alt: Number((activeDevice.altitude || 14.0).toFixed(3)),
                      speed: activeDevice.speed_kmh || activeDevice.speed_knots || 0.0,
                      fixQuality: activeDevice.fix_status_text || "RTK / DGPS FIXED (cm accuracy)",
                      isRtkLogged: true,
                      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
                    };
                    pts.push(p0);
                    setCurrentDrawingPoints([p0]);
                  } else {
                    const last = pts[pts.length - 1];
                    const dist = calcDistanceMeters(last.lat, last.lng, lat, lng);
                    const threshold = recordIntervalMetersRef.current;

                    // Append point when device moves beyond threshold
                    if (dist >= (threshold > 0 ? threshold : 0.25)) {
                      const nextPt = {
                        name: `${devicePrefix}_PT_${String(pts.length + 1).padStart(3, '0')}`,
                        lat: Number(lat.toFixed(8)),
                        lng: Number(lng.toFixed(8)),
                        alt: Number((activeDevice.altitude || 14.0).toFixed(3)),
                        speed: activeDevice.speed_kmh || activeDevice.speed_knots || 0.0,
                        fixQuality: activeDevice.fix_status_text || "RTK / DGPS FIXED (cm accuracy)",
                        isRtkLogged: true,
                        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
                      };
                      pts.push(nextPt);
                      setCurrentDrawingPoints([...pts]);
                    }
                  }
                }
              }
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

  // --- LIVE ROVER MOVEMENT TRACKING CONTROLS ---

  // Start Live Rover Path Recording
  const handleStartRoverTracking = () => {
    const lat = rover.latitude || base.latitude;
    const lng = rover.longitude || base.longitude;
    const alt = rover.altitude || base.altitude || 14.0;

    if (!lat || !lng) {
      showToast("❌ No Rover or Base RTK fix found. Please connect rover or start simulation.");
      return;
    }

    // Anchor first point immediately
    const initialPt = {
      name: `ROVER_PT_001`,
      lat: Number(lat.toFixed(8)),
      lng: Number(lng.toFixed(8)),
      alt: Number(alt.toFixed(3)),
      speed: rover.speed_kmh || 0.0,
      fixQuality: rover.fix_status_text || "RTK FIXED (cm accuracy)",
      isRtkLogged: true,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };

    recordedRoverPointsRef.current = [initialPt];
    setCurrentDrawingPoints([initialPt]);
    setIsRecordingRover(true);
    isRecordingRoverRef.current = true;
    setIsDrawingMode(true);

    showToast(`▶ ROVER TRACKING STARTED! Walk or drive with rover to calculate movement line.`);
  };

  // Stop Live Rover Recording & Prompt Save
  const handleStopRoverTracking = () => {
    setIsRecordingRover(false);
    isRecordingRoverRef.current = false;

    if (currentDrawingPoints.length < 2) {
      showToast("⚠️ Rover moved less than 2 points. Move further or keep tracking.");
      return;
    }

    const defaultName = `Rover Track ${String(surveyLines.length + 1).padStart(2, '0')}`;
    setNewLineForm({
      name: defaultName,
      category: "Container Stack Bay",
      color: "#f59e0b"
    });
    setShowSaveModal(true);
  };

  // Manual point click on map
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

    recordedRoverPointsRef.current = [...currentDrawingPoints, newPt];
    setCurrentDrawingPoints(prev => [...prev, newPt]);
  };

  // Log single RTK Point manually
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

    recordedRoverPointsRef.current = [...currentDrawingPoints, newPt];
    setCurrentDrawingPoints(prev => [...prev, newPt]);
    showToast(`📌 Dropped Waypoint #${currentDrawingPoints.length + 1} (${lat.toFixed(6)}°, ${lng.toFixed(6)}°)`);
  };

  // Remove last point
  const handleUndoPoint = () => {
    if (currentDrawingPoints.length === 0) return;
    const updated = currentDrawingPoints.slice(0, -1);
    recordedRoverPointsRef.current = updated;
    setCurrentDrawingPoints(updated);
    showToast(`🗑️ Removed last waypoint.`);
  };

  // Remove specific waypoint from active drawing
  const handleRemoveActiveWaypoint = (index) => {
    const updated = currentDrawingPoints.filter((_, idx) => idx !== index);
    recordedRoverPointsRef.current = updated;
    setCurrentDrawingPoints(updated);
    showToast(`🗑️ Removed active waypoint #${index + 1}`);
  };

  // Remove specific waypoint from a saved line
  const handleRemoveSavedWaypoint = (lineId, pointIndex) => {
    const updated = surveyLines.map(line => {
      if (line.id === lineId) {
        const newPts = line.points.filter((_, idx) => idx !== pointIndex);
        return { ...line, points: newPts };
      }
      return line;
    });
    setSurveyLines(updated);
    syncLinesToBackend(updated);
    showToast(`🗑️ Removed waypoint #${pointIndex + 1} from line.`);
  };

  // Cancel drawing
  const handleCancelDrawing = () => {
    setIsDrawingMode(false);
    setIsRecordingRover(false);
    isRecordingRoverRef.current = false;
    recordedRoverPointsRef.current = [];
    setCurrentDrawingPoints([]);
  };

  // Save current line
  const handleSaveConfirmed = (andDownloadExcel = false) => {
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
    setIsRecordingRover(false);
    isRecordingRoverRef.current = false;
    recordedRoverPointsRef.current = [];
    setCurrentDrawingPoints([]);
    setShowSaveModal(false);
    setActiveLineId(lineId);

    if (andDownloadExcel) {
      try {
        const fileName = exportSurveyToExcel([lineObj], {
          yardName: lineObj.name.replace(/\s+/g, '_'),
          slotSpacing: 6.1
        });
        showToast(`✅ Saved & Downloaded Excel: ${fileName}!`);
      } catch (err) {
        window.open('http://127.0.0.1:8000/api/survey/export-excel', '_blank');
        showToast(`✅ Saved & Downloaded Excel via Python backend!`);
      }
    } else {
      showToast(`✅ Saved line "${lineObj.name}" (${lineObj.points.length} points)!`);
    }
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
      showToast("⚠️ No surveyed lines to export. Draw or record a line first!");
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
          {/* 🌟 1. PRIMARY ROVER LIVE TRACKING BUTTON */}
          {!isRecordingRover ? (
            <button
              onClick={handleStartRoverTracking}
              title="Start recording live movement as the Rover walks in the yard"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#f59e0b',
                color: '#000000',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 16px rgba(245, 158, 11, 0.6)',
                animation: 'pulseGlow 2s infinite'
              }}
            >
              <Play size={14} fill="#000" />
              <span>▶ START ROVER LIVE RECORDING</span>
            </button>
          ) : (
            <button
              onClick={handleStopRoverTracking}
              title="Stop recording and save the surveyed path"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 0 18px rgba(239, 68, 68, 0.7)'
              }}
            >
              <Square size={14} fill="#fff" />
              <span>⏹ STOP & SAVE LINE ({liveDrawingDist.toFixed(1)}m)</span>
            </button>
          )}

          {/* 2. MANUAL CLICK-TO-DRAW TOOL */}
          <button
            onClick={() => {
              if (isDrawingMode && !isRecordingRover) {
                handleCancelDrawing();
              } else {
                setIsDrawingMode(true);
                setCurrentDrawingPoints([]);
                showToast("✏️ Click anywhere on the map to place vertices");
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: (isDrawingMode && !isRecordingRover) ? '#ef4444' : '#1e293b',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Crosshair size={14} />
            <span>{(isDrawingMode && !isRecordingRover) ? "Exit Drawing" : "Manual Map Draw"}</span>
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
          zIndex: 2000
        }}>
          {notification}
        </div>
      )}

      {/* 2. LIVE ROVER MOVEMENT RECORDING BANNER */}
      {isRecordingRover && (
        <div style={{
          backgroundColor: '#78350f',
          borderBottom: '2px solid #f59e0b',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 950,
          fontSize: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ color: '#fbbf24', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                animation: 'recordBlink 1s infinite'
              }}></span>
              RECORDING ROVER MOVEMENT LIVE:
            </span>
            <span style={{ color: '#fef3c7' }}>
              Walk or drive along the container row. Live coordinates are plotted automatically with centimeter accuracy.
            </span>

            {/* Live Stats Pill */}
            <div style={{
              display: 'flex',
              gap: '12px',
              backgroundColor: '#451a03',
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid #b45309'
            }}>
              <span>Points: <strong style={{ color: '#fff' }}>{currentDrawingPoints.length}</strong></span>
              <span>Distance: <strong style={{ color: '#4ade80', fontFamily: 'monospace', fontSize: '13px' }}>{liveDrawingDist.toFixed(2)} m</strong> ({(liveDrawingDist * 3.28084).toFixed(1)} ft)</span>
              <span>Speed: <strong style={{ color: '#38bdf8' }}>{rover.speed_kmh ? rover.speed_kmh.toFixed(1) : "0.0"} km/h</strong></span>
              <span>Est. 20ft Bays: <strong style={{ color: '#fbbf24' }}>~{Math.floor(liveDrawingDist / 6.1)}</strong></span>
            </div>

            {/* Sampling Interval Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fde68a', fontSize: '11px' }}>
              <span>Drop Point Every:</span>
              <select
                value={recordIntervalMeters}
                onChange={(e) => setRecordIntervalMeters(Number(e.target.value))}
                style={{
                  backgroundColor: '#451a03',
                  color: '#fff',
                  border: '1px solid #b45309',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                <option value={0.25}>0.25 meters (Very High Density)</option>
                <option value={0.5}>0.5 meters (Recommended)</option>
                <option value={1.0}>1.0 meter (Standard)</option>
                <option value={2.0}>2.0 meters (Coarse)</option>
                <option value={0}>Continuous (Every GNSS Fix)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleLogCurrentRtkPoint}
              title="Force drop a waypoint right now"
              style={{
                backgroundColor: '#92400e',
                color: '#fff',
                border: '1px solid #d97706',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              📌 Drop Waypoint
            </button>

            <button
              onClick={handleUndoPoint}
              disabled={currentDrawingPoints.length === 0}
              title="Remove last recorded waypoint"
              style={{
                backgroundColor: '#334155',
                color: currentDrawingPoints.length === 0 ? '#64748b' : '#fff',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: currentDrawingPoints.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Undo2 size={12} /> Remove Last
            </button>

            <button
              onClick={() => setShowActivePointsDrawer(prev => !prev)}
              disabled={currentDrawingPoints.length === 0}
              title="View & remove individual waypoints"
              style={{
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: currentDrawingPoints.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              📋 Waypoints ({currentDrawingPoints.length})
            </button>

            <button
              onClick={handleStopRoverTracking}
              style={{
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
              }}
            >
              ⏹ Finish & Save Line
            </button>

            <button
              onClick={handleCancelDrawing}
              style={{
                backgroundColor: '#ef4444',
                color: '#fff',
                border: 'none',
                padding: '6px 10px',
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

      {/* 3. MANUAL DRAWING MODE BANNER (When Active but not recording rover) */}
      {(isDrawingMode && !isRecordingRover) && (
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
              <Crosshair size={15} /> MANUAL MAP DRAWING:
            </span>
            <span style={{ color: '#cbd5e1' }}>
              Click on the map to add points, or click <strong>Start Rover Live Recording</strong> to draw via physical walking.
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
              <span>Length: <strong style={{ color: '#34d399', fontFamily: 'monospace' }}>{liveDrawingDist.toFixed(2)} m</strong></span>
              <span>Est. 20ft Bays: <strong style={{ color: '#fbbf24' }}>{Math.floor(liveDrawingDist / 6.1)}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={handleUndoPoint}
              disabled={currentDrawingPoints.length === 0}
              title="Remove last recorded point"
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
              <Undo2 size={13} /> Remove Last
            </button>

            <button
              onClick={() => setShowActivePointsDrawer(prev => !prev)}
              disabled={currentDrawingPoints.length === 0}
              style={{
                backgroundColor: '#1e293b',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                padding: '5px 10px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: currentDrawingPoints.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              📋 Waypoints ({currentDrawingPoints.length})
            </button>

            <button
              onClick={() => {
                if (currentDrawingPoints.length < 2) {
                  showToast("⚠️ Add at least 2 points to complete a line.");
                  return;
                }
                setNewLineForm({
                  name: `Bay Row ${String(surveyLines.length + 1).padStart(2, '0')}`,
                  category: "Container Stack Bay",
                  color: "#00f0ff"
                });
                setShowSaveModal(true);
              }}
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

      {/* 4. MAIN WORKSPACE: MAP & SIDEBAR */}
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
            onRemoveActiveWaypoint={handleRemoveActiveWaypoint}
            onRemoveSavedWaypoint={handleRemoveSavedWaypoint}
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
                width: '300px',
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

              {/* CARD 2: ROVER TELEMETRY & LIVE TRACKING ACTION */}
              <div style={{
                width: '300px',
                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${isRecordingRover ? '#f59e0b' : 'rgba(245, 158, 11, 0.35)'}`,
                borderRadius: '8px',
                padding: '12px',
                boxShadow: isRecordingRover ? '0 0 20px rgba(245, 158, 11, 0.35)' : '0 8px 24px rgba(0, 0, 0, 0.5)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '2px',
                      backgroundColor: '#f59e0b'
                    }}></div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>
                      🚜 ROVER UNIT (RS-01)
                    </span>
                  </div>
                  <span style={{
                    backgroundColor: isRecordingRover ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.15)',
                    color: isRecordingRover ? '#f87171' : '#4ade80',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 700
                  }}>
                    {isRecordingRover ? "🔴 RECORDING PATH" : (rover.fix_status_text || "RTK FIXED")}
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

                  {/* Primary Start / Stop Button in HUD */}
                  <div style={{ marginTop: '8px' }}>
                    {!isRecordingRover ? (
                      <button
                        onClick={handleStartRoverTracking}
                        style={{
                          width: '100%',
                          backgroundColor: '#f59e0b',
                          color: '#000',
                          border: 'none',
                          padding: '8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Play size={13} fill="#000" />
                        <span>Start Recording Rover Movement</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleStopRoverTracking}
                        style={{
                          width: '100%',
                          backgroundColor: '#10b981',
                          color: '#fff',
                          border: 'none',
                          padding: '8px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Save size={14} />
                        <span>Finish & Save Line ({liveDrawingDist.toFixed(1)}m)</span>
                      </button>
                    )}
                  </div>

                  {/* Secondary Simulation & Log Waypoint Controls */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <button
                      onClick={handleLogCurrentRtkPoint}
                      style={{
                        flex: 1,
                        backgroundColor: '#1e293b',
                        color: '#38bdf8',
                        border: '1px solid rgba(255,255,255,0.15)',
                        padding: '5px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      📌 Drop Waypoint
                    </button>
                    <button
                      onClick={handleToggleSimulation}
                      style={{
                        backgroundColor: '#1e293b',
                        color: isSimulating ? '#f87171' : '#fbbf24',
                        border: '1px solid rgba(255,255,255,0.15)',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        cursor: 'pointer'
                      }}
                    >
                      {isSimulating ? "Stop Sim" : "Simulate Rover"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 5. SURVEY FEATURES SIDEBAR */}
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
                  Click <strong>Start Rover Live Recording</strong> to begin walking.
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

                        {/* Waypoints Expand & Delete Controls */}
                        <div style={{ marginTop: '8px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedLineId(expandedLineId === line.id ? null : line.id);
                            }}
                            style={{
                              width: '100%',
                              backgroundColor: expandedLineId === line.id ? '#0284c7' : '#0f172a',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: expandedLineId === line.id ? '#fff' : '#38bdf8',
                              padding: '4px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px'
                            }}
                          >
                            {expandedLineId === line.id ? "▲ Close Waypoints List" : `▼ Edit Waypoints (${line.points.length})`}
                          </button>

                          {expandedLineId === line.id && (
                            <div style={{
                              marginTop: '6px',
                              maxHeight: '180px',
                              overflowY: 'auto',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              padding: '4px',
                              backgroundColor: '#090d16',
                              borderRadius: '4px',
                              border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}>
                              {line.points.map((pt, pIdx) => (
                                <div
                                  key={pIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: '#1e293b',
                                    padding: '4px 6px',
                                    borderRadius: '3px',
                                    fontSize: '10px'
                                  }}
                                >
                                  <div>
                                    <strong style={{ color: '#38bdf8' }}>#{pIdx + 1}</strong>
                                    <span style={{ color: '#cbd5e1', marginLeft: '6px', fontFamily: 'monospace' }}>
                                      {pt.lat.toFixed(6)}°, {pt.lng.toFixed(6)}°
                                    </span>
                                  </div>

                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveSavedWaypoint(line.id, pIdx);
                                    }}
                                    title="Delete this waypoint from line"
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                      padding: '2px',
                                      display: 'flex',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
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

      {/* 6. MODAL: SAVE & EXPORT SURVEYED ROVER LINE */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000
        }}>
          <div style={{
            width: '440px',
            backgroundColor: '#0f172a',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '22px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🚜</span>
                <span>Save Surveyed Rover Path</span>
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
                  Line Name / Container Bay ID:
                </label>
                <input
                  type="text"
                  value={newLineForm.name}
                  onChange={(e) => setNewLineForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Bay Row 05 - Import Stack"
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
                  <option value="Traffic Lane">Traffic / Haul Route Lane</option>
                  <option value="Perimeter Boundary">Perimeter Boundary</option>
                  <option value="Crane Rail Track">Crane Rail Track</option>
                  <option value="Inspection Bay">Inspection Bay</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
                  Display Color:
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {["#f59e0b", "#00f0ff", "#10b981", "#ec4899", "#8b5cf6"].map(c => (
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

              {/* Calculated Survey Stats */}
              <div style={{
                backgroundColor: '#1e293b',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: '1.6'
              }}>
                <div>Recorded Points: <strong>{currentDrawingPoints.length} vertices</strong> (RTK cm fix)</div>
                <div>Calculated Distance: <strong style={{ color: '#4ade80', fontSize: '13px' }}>{liveDrawingDist.toFixed(2)} m</strong> ({(liveDrawingDist * 3.28084).toFixed(1)} ft)</div>
                <div>Estimated 20ft Bays (6.1m): <strong style={{ color: '#fbbf24' }}>~{Math.floor(liveDrawingDist / 6.1)} slots</strong></div>
                {currentDrawingPoints.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', fontFamily: 'monospace' }}>
                    Start UTM: E {wgs84ToUtm(currentDrawingPoints[0].lat, currentDrawingPoints[0].lng).easting}m | N {wgs84ToUtm(currentDrawingPoints[0].lat, currentDrawingPoints[0].lng).northing}m
                  </div>
                )}
              </div>

              {/* Action Buttons */}
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
                  onClick={() => handleSaveConfirmed(false)}
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Save Line to Map
                </button>
                <button
                  onClick={() => handleSaveConfirmed(true)}
                  style={{
                    backgroundColor: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <FileSpreadsheet size={14} />
                  <span>Save & Download Excel</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: MANAGE ACTIVE DRAWING WAYPOINTS */}
      {showActivePointsDrawer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3500
        }}>
          <div style={{
            width: '420px',
            maxHeight: '80vh',
            backgroundColor: '#0f172a',
            border: '1px solid #38bdf8',
            borderRadius: '8px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#ffffff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>📍</span>
                <span>Active Line Waypoints ({currentDrawingPoints.length})</span>
              </h3>
              <button 
                onClick={() => setShowActivePointsDrawer(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {currentDrawingPoints.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', fontSize: '12px' }}>
                  No waypoints recorded yet.
                </div>
              ) : (
                currentDrawingPoints.map((pt, idx) => {
                  const utm = wgs84ToUtm(pt.lat, pt.lng);
                  return (
                    <div 
                      key={idx}
                      style={{
                        backgroundColor: '#1e293b',
                        padding: '8px 10px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '11px'
                      }}
                    >
                      <div>
                        <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                          #{idx + 1} {pt.name}
                        </div>
                        <div style={{ color: '#cbd5e1', fontFamily: 'monospace', fontSize: '10px' }}>
                          {pt.lat.toFixed(8)}°, {pt.lng.toFixed(8)}°
                        </div>
                        <div style={{ color: '#64748b', fontSize: '10px' }}>
                          UTM: E {utm.easting}m | N {utm.northing}m
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveActiveWaypoint(idx)}
                        title="Delete this waypoint"
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600
                        }}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px' }}>
              <button
                onClick={() => {
                  if (window.confirm("Clear all active waypoints?")) {
                    handleCancelDrawing();
                    setShowActivePointsDrawer(false);
                  }
                }}
                disabled={currentDrawingPoints.length === 0}
                style={{
                  backgroundColor: 'transparent',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: currentDrawingPoints.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Clear All Points
              </button>

              <button
                onClick={() => setShowActivePointsDrawer(false)}
                style={{
                  backgroundColor: '#0284c7',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global CSS for subtle glowing and recording pulse */}
      <style>{`
        @keyframes recordBlink {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes pulseGlow {
          0% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
          50% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.9); }
          100% { box-shadow: 0 0 10px rgba(245, 158, 11, 0.5); }
        }
      `}</style>
    </div>
  );
}

export default App;
