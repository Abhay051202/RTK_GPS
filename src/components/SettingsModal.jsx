import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sliders, 
  Save, 
  RefreshCw, 
  Wifi, 
  Radio, 
  Check, 
  Cpu, 
  Usb, 
  Globe 
} from 'lucide-react';
import { BASE_STATION } from '../data/yardData';

export const SettingsModal = ({ isOpen, onClose }) => {
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("COM3");
  const [selectedBaud, setSelectedBaud] = useState(115200);
  const [isPortConnected, setIsPortConnected] = useState(false);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [ntripPort, setNtripPort] = useState(BASE_STATION.ntripCaster.port);
  const [mountpoint, setMountpoint] = useState(BASE_STATION.ntripCaster.mountpoint);
  const [rateHz, setRateHz] = useState("10");
  const [coordFormat, setCoordFormat] = useState("DD");
  const [saved, setSaved] = useState(false);

  // Fetch available ports from Python backend
  const fetchPorts = async () => {
    setLoadingPorts(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/ports');
      if (res.ok) {
        const data = await res.json();
        setPorts(data.ports || []);
        if (data.active_port) setSelectedPort(data.active_port);
        if (data.active_baud) setSelectedBaud(data.active_baud);
        setIsPortConnected(Boolean(data.is_connected));
      }
    } catch (e) {
      console.warn("Python backend not responding on 8000:", e);
    } finally {
      setLoadingPorts(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPorts();
    }
  }, [isOpen]);

  const handleConnectPort = async () => {
    setConnecting(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: selectedPort, baudrate: Number(selectedBaud) })
      });
      if (res.ok) {
        setIsPortConnected(true);
        setTimeout(fetchPorts, 1000);
      }
    } catch (e) {
      console.error("Failed to connect to port:", e);
    } finally {
      setConnecting(false);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  if (!isOpen) return null;

  return (
    <div className="industrial-modal-overlay" onClick={onClose}>
      <div 
        className="industrial-modal-content corner-accents"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '620px' }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-tech)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(16, 23, 38, 0.95)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sliders size={18} color="var(--accent-cyan)" />
            </div>
            <div>
              <div className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.06em' }}>
                HARDWARE & BASE STATION SETTINGS
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Python GNSS Serial Bridge & Telemetry Options
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          
          {/* 1. USB HARDWARE CHIP DETECTION */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.85)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            borderRadius: '4px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                <Usb size={15} />
                <span>USB HARDWARE CHIP INTERFACE (PYTHON)</span>
              </div>
              <span className={`tech-tag ${isPortConnected ? 'tech-tag-green' : 'tech-tag-amber'}`} style={{ fontSize: '10px' }}>
                <span className={`status-dot ${isPortConnected ? 'status-dot-green' : 'status-dot-amber'}`} style={{ width: '4px', height: '4px' }}></span>
                {isPortConnected ? "ACTIVE ON COM3" : "STANDBY"}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '10.5px', marginBottom: '5px' }}>
                  DETECTED COM PORT:
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    value={selectedPort}
                    onChange={e => setSelectedPort(e.target.value)}
                    style={{
                      flex: 1,
                      background: '#0a0e17',
                      border: '1px solid var(--border-tech)',
                      color: '#fff',
                      padding: '6px 8px',
                      borderRadius: '2px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px'
                    }}
                  >
                    {ports.length > 0 ? (
                      ports.map(p => (
                        <option key={p.device} value={p.device}>
                          {p.device} - {p.description || p.name} {p.is_ublox ? '(u-blox detected)' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="COM3">COM3 - USB Serial Device (u-blox GNSS)</option>
                    )}
                  </select>

                  <button
                    onClick={fetchPorts}
                    title="Refresh COM Ports"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'var(--text-secondary)',
                      padding: '0 8px',
                      borderRadius: '2px',
                      cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={13} className={loadingPorts ? "spin-animation" : ""} />
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '10.5px', marginBottom: '5px' }}>
                  BAUD RATE:
                </label>
                <select
                  value={selectedBaud}
                  onChange={e => setSelectedBaud(Number(e.target.value))}
                  style={{
                    width: '100%',
                    background: '#0a0e17',
                    border: '1px solid var(--border-tech)',
                    color: '#fff',
                    padding: '6px 8px',
                    borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px'
                  }}
                >
                  <option value={115200}>115200 (Default)</option>
                  <option value={38400}>38400</option>
                  <option value={9600}>9600</option>
                  <option value={460800}>460800</option>
                  <option value={921600}>921600</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleConnectPort}
                disabled={connecting}
                style={{
                  background: 'rgba(0, 240, 255, 0.15)',
                  border: '1px solid var(--accent-cyan)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '2px',
                  cursor: connecting ? 'not-allowed' : 'pointer',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={12} className={connecting ? "spin-animation" : ""} />
                <span>{connecting ? "CONNECTING..." : "RECONNECT CHIP ON COM3"}</span>
              </button>
            </div>
          </div>

          {/* 2. NTRIP CASTER & BROADCAST SETTINGS */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-teal)', fontWeight: 600 }}>
              <Wifi size={14} />
              <span>NTRIP CASTER CONFIGURATION</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '10.5px', marginBottom: '5px' }}>
                  NTRIP PORT:
                </label>
                <input 
                  type="number" 
                  value={ntripPort} 
                  onChange={e => setNtripPort(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0a0e17',
                    border: '1px solid var(--border-tech)',
                    color: '#fff',
                    padding: '6px 8px',
                    borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '10.5px', marginBottom: '5px' }}>
                  MOUNTPOINT:
                </label>
                <input 
                  type="text" 
                  value={mountpoint} 
                  onChange={e => setMountpoint(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#0a0e17',
                    border: '1px solid var(--border-tech)',
                    color: '#fff',
                    padding: '6px 8px',
                    borderRadius: '2px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '10.5px', marginBottom: '5px' }}>
                CORRECTION BROADCAST RATE:
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {["1", "5", "10", "20"].map(hz => (
                  <button
                    key={hz}
                    type="button"
                    onClick={() => setRateHz(hz)}
                    style={{
                      flex: 1,
                      padding: '6px',
                      background: rateHz === hz ? 'rgba(0, 240, 255, 0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${rateHz === hz ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)'}`,
                      color: rateHz === hz ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    {hz} Hz
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. COORDINATE DISPLAY FORMAT */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 600 }}>COORDINATE DISPLAY FORMAT</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>Decimal Degrees vs UTM Grid</div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {["DD", "DMS", "UTM"].map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setCoordFormat(fmt)}
                  style={{
                    padding: '4px 10px',
                    background: coordFormat === fmt ? 'rgba(0, 240, 255, 0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${coordFormat === fmt ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)'}`,
                    color: coordFormat === fmt ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Save / Close Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--text-secondary)',
                padding: '8px 16px',
                borderRadius: '2px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)'
              }}
            >
              CANCEL
            </button>

            <button
              onClick={handleSave}
              style={{
                background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.3), rgba(0, 229, 163, 0.3))',
                border: '1px solid var(--accent-cyan)',
                color: '#fff',
                padding: '8px 20px',
                borderRadius: '2px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {saved ? <Check size={14} color="var(--accent-teal)" /> : <Save size={14} />}
              <span>{saved ? "CONFIG SAVED" : "SAVE & APPLY"}</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
