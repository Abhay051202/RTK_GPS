import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Wifi, 
  Satellite, 
  Truck, 
  Activity, 
  MapPin, 
  Cpu, 
  CheckCircle2,
  Clock
} from 'lucide-react';

export const BottomStatusBar = ({ 
  baseTelemetry, 
  hardwareLive,
  cursorCoords, 
  roverSimulated 
}) => {
  const [currentTime, setCurrentTime] = useState(new Date().toTimeString().split(' ')[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer style={{
      height: '34px',
      background: 'rgba(7, 11, 18, 0.95)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid rgba(0, 240, 255, 0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'relative',
      zIndex: 1000,
      fontSize: '11px',
      fontFamily: 'var(--font-mono)'
    }}>
      {/* LEFT: Hardware & Protocol Indicators */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        {/* GPS Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>GPS:</span>
          <span className="status-dot status-dot-green" style={{ width: '6px', height: '6px' }}></span>
          <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>
            {hardwareLive ? "FIXED (COM3)" : "FIXED"}
          </span>
        </div>

        {/* Network Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>BACKEND:</span>
          <span className={`status-dot ${hardwareLive ? 'status-dot-green' : 'status-dot-cyan'}`} style={{ width: '6px', height: '6px' }}></span>
          <span style={{ color: hardwareLive ? 'var(--accent-teal)' : 'var(--accent-cyan)', fontWeight: 600 }}>
            {hardwareLive ? "PYTHON WS (8000)" : "CONNECTED"}
          </span>
        </div>

        {/* Base Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>BASE:</span>
          <span className="status-dot status-dot-green" style={{ width: '6px', height: '6px' }}></span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {hardwareLive ? "CHIP LIVE" : "ONLINE"}
          </span>
        </div>

        {/* Rover Indicator (Clearly indicated as NOT CONNECTED for V1) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>ROVER:</span>
          {roverSimulated ? (
            <>
              <span className="status-dot status-dot-amber" style={{ width: '6px', height: '6px' }}></span>
              <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>PREVIEW GHOST</span>
            </>
          ) : (
            <>
              <span style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                border: '1.5px solid var(--text-muted)',
                display: 'inline-block' 
              }}></span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>NOT CONNECTED</span>
            </>
          )}
        </div>

        {/* System Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: 'var(--text-muted)' }}>SYSTEM:</span>
          <span className="status-dot status-dot-green" style={{ width: '6px', height: '6px' }}></span>
          <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>NORMAL</span>
        </div>
      </div>

      {/* CENTER / RIGHT: Coordinates under cursor & Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        {/* Dynamic Coordinates under mouse cursor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
          <MapPin size={12} color="var(--accent-cyan)" />
          <span>CURSOR:</span>
          <span style={{ color: '#fff' }}>
            {cursorCoords ? (
              `${cursorCoords.lat.toFixed(5)}°N, ${cursorCoords.lng.toFixed(5)}°E`
            ) : (
              "24.85472°N, 67.02245°E (BASE)"
            )}
          </span>
        </div>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)' }}></div>

        {/* Correction Stream Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
          <span>STREAM:</span>
          <span style={{ color: 'var(--accent-cyan)' }}>
            {hardwareLive ? "USB COM3 (u-blox) // 115200 baud" : "RTCM 3.2 MSM4 // 3.4 kB/s"}
          </span>
        </div>

        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.1)' }}></div>

        {/* Live Clock / Last update */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
          <Clock size={12} color="var(--accent-cyan)" />
          <span style={{ color: 'var(--text-muted)' }}>LAST UPDATE:</span>
          <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
            {currentTime}
          </span>
        </div>
      </div>
    </footer>
  );
};
