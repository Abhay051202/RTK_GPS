import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Satellite, 
  Wifi, 
  Sliders, 
  Maximize2, 
  Minimize2, 
  Crosshair, 
  Workflow, 
  ShieldCheck,
  HelpCircle
} from 'lucide-react';

export const TopBar = ({ 
  baseTelemetry, 
  hardwareLive,
  onRecenterBase, 
  onOpenSettings, 
  onOpenRoadmap,
  onOpenGuide,
  roverConnected 
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date().toTimeString().split(' ')[0]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn(`Fullscreen error: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  return (
    <header style={{
      height: '52px',
      background: 'rgba(9, 13, 22, 0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0, 240, 255, 0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'relative',
      zIndex: 1000
    }}>
      {/* LEFT: Branding & Base Control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.25), rgba(0, 229, 163, 0.15))',
            border: '1.5px solid var(--accent-cyan)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 10px rgba(0, 240, 255, 0.3)'
          }}>
            <Radio size={18} color="#00f0ff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="font-display" style={{ 
                fontSize: '17px', 
                fontWeight: 700, 
                color: '#fff', 
                letterSpacing: '0.06em' 
              }}>
                BASE CONTROL
              </span>
              <span className={`tech-tag ${hardwareLive ? 'tech-tag-green' : 'tech-tag-cyan'}`} style={{ fontSize: '10px' }}>
                <span className={`status-dot ${hardwareLive ? 'status-dot-green' : 'status-dot-cyan'}`} style={{ width: '4px', height: '4px' }}></span>
                {hardwareLive ? "CHIP LIVE (COM3)" : "ONLINE"}
              </span>
            </div>
            <div style={{ 
              fontSize: '10px', 
              color: 'var(--text-secondary)', 
              fontFamily: 'var(--font-mono)' 
            }}>
              {hardwareLive ? "u-blox GNSS / RTK Receiver • 115200 baud" : "CONTAINER YARD-01 AUTOMATION"}
            </div>
          </div>
        </div>
      </div>

      {/* CENTER: Site & GPS Positioning Status */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px',
        background: 'rgba(15, 23, 38, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '5px 16px',
        borderRadius: '3px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>LOCATION:</span>
          <span className="font-display" style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', letterSpacing: '0.04em' }}>
            YARD-01 SOUTH BASIN
          </span>
        </div>

        <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.1)' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Satellite size={15} color="var(--accent-cyan)" />
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 700 }}>
            GPS FIXED (±6mm)
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            • 28 SATS
          </span>
        </div>
      </div>

      {/* RIGHT: Actions, System Guide, Roadmap, Settings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        
        {/* YARD GUIDE / SYSTEM TOUR BUTTON */}
        <button 
          onClick={onOpenGuide}
          title="How to understand and use this system"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(0, 229, 163, 0.15))',
            border: '1px solid var(--accent-cyan)',
            color: '#fff',
            padding: '5px 12px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            transition: 'all 0.2s',
            boxShadow: '0 0 8px rgba(0, 240, 255, 0.2)'
          }}
        >
          <HelpCircle size={14} color="var(--accent-cyan)" />
          <span>SYSTEM GUIDE</span>
        </button>

        {/* System Architecture Roadmap Button */}
        <button 
          onClick={onOpenRoadmap}
          title="View Base → Rover → Reach Stacker Roadmap"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 183, 3, 0.1)',
            border: '1px solid rgba(255, 183, 3, 0.35)',
            color: 'var(--accent-amber)',
            padding: '5px 10px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600
          }}
        >
          <Workflow size={14} />
          <span>ROVER ROADMAP</span>
        </button>

        {/* Re-center Map on Base */}
        <button 
          onClick={onRecenterBase}
          title="Center Map on Base Station"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(18, 26, 42, 0.8)',
            border: '1px solid var(--border-tech)',
            color: '#fff',
            padding: '5px 9px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)'
          }}
        >
          <Crosshair size={14} color="var(--accent-cyan)" />
          <span>CENTER BASE</span>
        </button>

        {/* Fullscreen Button */}
        <button 
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
          style={{
            background: 'rgba(18, 26, 42, 0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
            padding: '6px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>

        {/* Settings Button */}
        <button 
          onClick={onOpenSettings}
          title="Base Station Settings"
          style={{
            background: 'rgba(18, 26, 42, 0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
            padding: '6px',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          <Sliders size={15} />
        </button>
      </div>
    </header>
  );
};
