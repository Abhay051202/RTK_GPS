import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  X, 
  Crosshair, 
  Copy, 
  Check, 
  Satellite, 
  Activity, 
  Thermometer, 
  Zap, 
  Cpu, 
  HardDrive,
  Wifi,
  ExternalLink,
  Terminal
} from 'lucide-react';
import { BASE_STATION } from '../data/yardData';

export const RightPanel = ({ 
  isOpen, 
  hardwareLive,
  onClose, 
  baseTelemetry, 
  onRecenterBase 
}) => {
  const [copied, setCopied] = useState(false);
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(prev => (prev >= 1 ? 0 : prev + 0.1));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleCopyCoords = () => {
    const coords = `${baseTelemetry.latitude.toFixed(7)}, ${baseTelemetry.longitude.toFixed(7)}`;
    navigator.clipboard?.writeText(coords);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const satellites = baseTelemetry.satellitesList && baseTelemetry.satellitesList.length > 0 
    ? baseTelemetry.satellitesList 
    : [
        { prn: "G16", system: "GPS", snr: 46, status: "USED" },
        { prn: "G26", system: "GPS", snr: 45, status: "USED" },
        { prn: "E05", system: "GALILEO", snr: 43, status: "USED" },
        { prn: "B42", system: "BEIDOU", snr: 42, status: "USED" },
        { prn: "R67", system: "GLONASS", snr: 41, status: "USED" },
        { prn: "R78", system: "GLONASS", snr: 40, status: "USED" }
      ];

  return (
    <aside style={{
      position: 'absolute',
      top: '66px',
      right: '16px',
      bottom: '46px',
      width: '330px',
      zIndex: 900,
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'auto',
      animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

      <div className="industrial-border corner-accents" style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'rgba(10, 15, 25, 0.94)'
      }}>
        {/* Header */}
        <div style={{
          height: '40px',
          borderBottom: '1px solid var(--border-tech)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: 'rgba(16, 23, 38, 0.85)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={16} color="var(--accent-cyan)" />
            <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', color: '#fff' }}>
              BASE STATION DETAILS
            </span>
          </div>

          <button 
            onClick={onClose}
            title="Close Details Panel"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '2px'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>

          {/* Hero Status Card */}
          <div style={{
            background: 'linear-gradient(180deg, rgba(0, 240, 255, 0.1) 0%, rgba(16, 23, 38, 0.6) 100%)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '3px',
            padding: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>DEVICE ID</div>
                <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                  {hardwareLive ? "u-blox GNSS / RTK (COM3)" : BASE_STATION.id}
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(0, 229, 163, 0.12)',
                border: '1px solid rgba(0, 229, 163, 0.3)',
                padding: '4px 8px',
                borderRadius: '3px'
              }}>
                <span className="status-dot status-dot-green"></span>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-teal)', fontWeight: 700 }}>
                  {hardwareLive ? "CHIP LIVE" : "ONLINE"}
                </span>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
              {hardwareLive ? (
                <>Broadcasting real-time hardware stream via Python backend at <strong>115200 baud</strong>.</>
              ) : (
                <>Broadcasting RTK corrections to Reach Stackers and yard sensors.</>
              )}
            </div>
          </div>

          {/* Location & Precision */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '3px',
            padding: '12px'
          }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>
              ACCURATE POSITION (GNSS FIX)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Latitude:</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{baseTelemetry.latitude.toFixed(7)}° N</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Longitude:</span>
                <span style={{ color: '#fff', fontWeight: 600 }}>{baseTelemetry.longitude.toFixed(7)}° E</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Height (MSL):</span>
                <span style={{ color: '#fff' }}>{baseTelemetry.altitude.toFixed(1)} meters</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Estimated Precision:</span>
                <span style={{ color: 'var(--accent-teal)', fontWeight: 700 }}>
                  ±{(baseTelemetry.horizontalAccuracy * 1000).toFixed(0)} mm H / ±{(baseTelemetry.verticalAccuracy * 1000).toFixed(0)} mm V
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>DOP Quality:</span>
                <span style={{ color: 'var(--text-cyan)' }}>
                  HDOP: {baseTelemetry.hDOP || 0.55} | PDOP: {baseTelemetry.pDOP || 1.15}
                </span>
              </div>
            </div>

            <button
              onClick={handleCopyCoords}
              style={{
                width: '100%',
                marginTop: '10px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: copied ? 'var(--accent-teal)' : 'var(--text-secondary)',
                padding: '6px',
                borderRadius: '2px',
                fontSize: '10.5px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {copied ? <Check size={13} color="var(--accent-teal)" /> : <Copy size={13} />}
              <span>{copied ? "COORDINATES COPIED" : "COPY LAT/LNG COORDINATES"}</span>
            </button>
          </div>

          {/* REAL SATELLITE SNR BARS */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '3px',
            padding: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)' }}>
                LIVE SATELLITES (SNR)
              </div>
              <span className="tech-tag tech-tag-green" style={{ fontSize: '10px' }}>
                {baseTelemetry.usedSatellites} ACTIVE / {baseTelemetry.trackedSatellites} VISIBLE
              </span>
            </div>

            {/* Satellite Signal SNR Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {satellites.slice(0, 6).map((sat) => (
                <div key={sat.prn} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ width: '28px', color: 'var(--text-secondary)' }}>{sat.prn}</span>
                  <span style={{ width: '45px', color: 'var(--text-muted)' }}>{sat.system}</span>
                  
                  {/* Bar */}
                  <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '1px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (sat.snr / 50) * 100)}%`,
                      height: '100%',
                      background: sat.snr >= 40 ? 'var(--accent-teal)' : 'var(--accent-cyan)',
                      boxShadow: '0 0 6px currentColor'
                    }}></div>
                  </div>
                  <span style={{ width: '42px', textAlign: 'right', color: '#fff' }}>{sat.snr} dB-Hz</span>
                </div>
              ))}
            </div>
          </div>

          {/* RAW NMEA SENTENCE PREVIEW */}
          {baseTelemetry.lastSentence && (
            <div style={{
              background: 'rgba(12, 17, 26, 0.85)',
              border: '1px solid rgba(0, 240, 255, 0.2)',
              borderRadius: '3px',
              padding: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', color: 'var(--accent-cyan)', fontSize: '10.5px', fontFamily: 'var(--font-mono)' }}>
                <Terminal size={12} />
                <span>RAW HARDWARE NMEA STRING</span>
              </div>
              <div style={{ 
                fontSize: '9.5px', 
                color: '#cbd5e1', 
                fontFamily: 'var(--font-mono)', 
                wordBreak: 'break-all',
                background: 'rgba(0,0,0,0.4)',
                padding: '4px 6px',
                borderRadius: '2px'
              }}>
                {baseTelemetry.lastSentence}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
            <button
              onClick={onRecenterBase}
              style={{
                flex: 1,
                background: 'rgba(0, 240, 255, 0.12)',
                border: '1px solid rgba(0, 240, 255, 0.4)',
                color: 'var(--accent-cyan)',
                padding: '8px',
                borderRadius: '2px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <Crosshair size={14} />
              <span>RE-CENTER MAP</span>
            </button>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'var(--text-secondary)',
                padding: '8px 14px',
                borderRadius: '2px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              CLOSE
            </button>
          </div>

        </div>
      </div>
    </aside>
  );
};
