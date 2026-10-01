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
  ArrowRight,
  Battery,
  Gauge,
  Compass
} from 'lucide-react';

export function App() {
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

  const [rover, setRover] = useState({
    connected: false,
    device_id: "ROVER-RS-01",
    latitude: null,
    longitude: null,
    altitude: null,
    speed_kmh: 0.0,
    heading: 0.0,
    battery_percent: null,
    fix_quality: 0,
    fix_status_text: "NOT CONNECTED",
    distance_to_base_meters: 0.0,
    is_simulated: false
  });

  const [mapType, setMapType] = useState('satellite');
  const [copied, setCopied] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showApiSnippet, setShowApiSnippet] = useState(false);
  const wsRef = useRef(null);

  // Connect to Python WebSocket for live Base & Rover telemetry
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
      backgroundColor: '#0f172a',
      color: '#f8fafc',
      overflow: 'hidden'
    }}>
      {/* 1. CLEAN TOP HEADER */}
      <header style={{
        height: '56px',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 1000
      }}>
        {/* Left: Device & App Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <MapPin size={18} color="#ffffff" />
            </div>
            <div>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                BASE & ROVER RTK TRACKER
              </span>
              <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                Real-time Dual GNSS Positioning
              </div>
            </div>
          </div>

          {/* Base Status Badge */}
          <span style={{
            backgroundColor: base.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
            color: base.connected ? '#4ade80' : '#facc15',
            border: `1px solid ${base.connected ? 'rgba(34, 197, 94, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
            padding: '2px 8px',
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
            padding: '2px 8px',
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
            ROVER: {rover.connected ? (rover.is_simulated ? "SIMULATED (MOVING)" : "ONLINE (API)") : "WAITING FOR NETWORK"}
          </span>
        </div>

        {/* Right: Controls & Simulation Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Simulation Toggle Button */}
          <button
            onClick={handleToggleSimulation}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isSimulating ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              color: isSimulating ? '#f87171' : '#fbbf24',
              border: `1px solid ${isSimulating ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {isSimulating ? <Square size={13} /> : <Play size={13} />}
            <span>{isSimulating ? "Stop Simulation" : "Simulate Moving Rover"}</span>
          </button>

          {/* Network API Info Button */}
          <button
            onClick={() => setShowApiSnippet(prev => !prev)}
            style={{
              backgroundColor: '#1e293b',
              color: '#38bdf8',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {showApiSnippet ? "Hide API Info" : "Rover API Info"}
          </button>

          {/* Map Layer Switcher */}
          <div style={{
            display: 'flex',
            backgroundColor: '#1e293b',
            borderRadius: '6px',
            padding: '3px',
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

          {/* Copy Coordinates */}
          <button
            onClick={handleCopyCoords}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1e293b',
              color: copied ? '#4ade80' : '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy Base"}</span>
          </button>
        </div>
      </header>

      {/* 2. MAP AREA & FLOATING TELEMETRY CARDS */}
      <main style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100vh - 56px)' }}>
        {/* Full-screen Leaflet Map */}
        <SimpleMap 
          base={base} 
          rover={rover} 
          mapType={mapType} 
        />

        {/* FLOATING DUAL TELEMETRY HUD */}
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 900
        }}>
          {/* CARD 1: BASE STATION */}
          <div style={{
            width: '310px',
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            borderRadius: '8px',
            padding: '14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00f0ff' }}></div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#00f0ff' }}>
                  📍 BASE STATION
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
                USB COM3
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Latitude:</span>
                <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                  {base.latitude ? base.latitude.toFixed(6) : "18.903870"}° N
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Longitude:</span>
                <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                  {base.longitude ? base.longitude.toFixed(6) : "73.046748"}° E
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Altitude (MSL):</span>
                <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                  {base.altitude ? base.altitude.toFixed(1) : "13.7"} m
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Satellites:</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                  {base.satellites_used || 12} in fix ({base.satellites_tracked || 53} tracked)
                </span>
              </div>
            </div>
          </div>

          {/* CARD 2: ROVER (REACH STACKER RS-01) */}
          <div style={{
            width: '310px',
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${rover.connected ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: '8px',
            padding: '14px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '2px',
                  backgroundColor: rover.connected ? '#f59e0b' : '#64748b'
                }}></div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: rover.connected ? '#fbbf24' : '#94a3b8' }}>
                  🚜 ROVER (RS-01)
                </span>
              </div>

              <span style={{
                backgroundColor: rover.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                color: rover.connected ? '#4ade80' : '#94a3b8',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 700
              }}>
                {rover.connected ? (rover.fix_status_text || "RTK FIXED") : "STANDBY"}
              </span>
            </div>

            {rover.connected ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                {/* Baseline Distance */}
                <div style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>Distance to Base:</span>
                  <span style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', fontSize: '13px' }}>
                    {rover.distance_to_base_meters.toFixed(1)} meters
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Latitude:</span>
                  <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                    {rover.latitude.toFixed(6)}° N
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Longitude:</span>
                  <span style={{ fontWeight: 600, color: '#fff', fontFamily: 'monospace' }}>
                    {rover.longitude.toFixed(6)}° E
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Speed:</span>
                  <span style={{ fontWeight: 600, color: '#4ade80' }}>
                    {rover.speed_kmh ? rover.speed_kmh.toFixed(1) : "0.0"} km/h
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Heading:</span>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                    {rover.heading ? `${rover.heading.toFixed(0)}°` : "0°"}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Battery:</span>
                  <span style={{ fontWeight: 600, color: '#4ade80' }}>
                    {rover.battery_percent}%
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
                Rover module is listening for HTTP POST or WebSocket stream over Wi-Fi / Local Network.
                <button
                  onClick={handleToggleSimulation}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    backgroundColor: '#1e293b',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '6px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  ▶ Start Simulation to Preview Rover
                </button>
              </div>
            )}
          </div>

          {/* NETWORK API POPUP (HELPER FOR USER) */}
          {showApiSnippet && (
            <div style={{
              width: '310px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '11px',
              color: '#e2e8f0',
              fontFamily: 'monospace'
            }}>
              <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '6px' }}>
                HOW TO SEND ROVER DATA:
              </div>
              <p style={{ color: '#94a3b8', marginBottom: '6px', fontFamily: 'sans-serif' }}>
                Send HTTP POST from your vehicle / ESP32 / Raspberry Pi to:
              </p>
              <div style={{
                backgroundColor: '#090d16',
                padding: '6px',
                borderRadius: '4px',
                color: '#4ade80',
                wordBreak: 'break-all'
              }}>
                POST http://&lt;laptop-ip&gt;:8000/api/rover/telemetry<br/><br/>
                &#123;<br/>
                &nbsp;&nbsp;"latitude": 18.90392,<br/>
                &nbsp;&nbsp;"longitude": 73.04683,<br/>
                &nbsp;&nbsp;"speed_kmh": 12.0,<br/>
                &nbsp;&nbsp;"battery_percent": 95<br/>
                &#125;
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
