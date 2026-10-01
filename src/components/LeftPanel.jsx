import React from 'react';
import { 
  Radio, 
  Truck, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  Globe, 
  ShieldAlert, 
  Route, 
  Grid3X3, 
  ExternalLink,
  Eye,
  EyeOff,
  Crosshair,
  Satellite
} from 'lucide-react';
import { BASE_STATION } from '../data/yardData';

export const LeftPanel = ({ 
  baseTelemetry, 
  hardwareLive,
  mapLayers, 
  onToggleLayer, 
  onInspectBase,
  roverSimulated,
  onToggleRoverSimulation,
  isCollapsed,
  onToggleCollapse
}) => {
  return (
    <aside style={{
      position: 'absolute',
      top: '66px',
      left: '16px',
      bottom: '46px',
      width: isCollapsed ? '46px' : '290px',
      transition: 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: 900,
      display: 'flex',
      flexDirection: 'column',
      pointerEvents: 'auto'
    }}>
      <div className="industrial-border corner-accents" style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'rgba(10, 15, 25, 0.92)'
      }}>
        {/* Panel Header */}
        <div style={{
          height: '40px',
          borderBottom: '1px solid var(--border-tech)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          padding: isCollapsed ? '0' : '0 12px',
          background: 'rgba(16, 23, 38, 0.8)'
        }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '4px', height: '14px', background: 'var(--accent-cyan)' }}></div>
              <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', color: '#fff' }}>
                YARD CONTROLS
              </span>
            </div>
          )}

          <button 
            onClick={onToggleCollapse}
            title={isCollapsed ? "Expand Panel" : "Collapse Panel"}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--accent-cyan)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '2px'
            }}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Collapsed Mode Icons */}
        {isCollapsed ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '16px',
            gap: '16px'
          }}>
            <button 
              onClick={onToggleCollapse} 
              title="Base Station Overview"
              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer' }}
            >
              <Radio size={20} />
            </button>
            <button 
              onClick={onToggleCollapse} 
              title="Rover (Reach Stacker)"
              style={{ background: 'none', border: 'none', color: 'var(--accent-amber)', cursor: 'pointer' }}
            >
              <Truck size={20} />
            </button>
            <button 
              onClick={onToggleCollapse} 
              title="Map Layers"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <Layers size={20} />
            </button>
          </div>
        ) : (
          /* Expanded Content */
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>

            {/* SECTION 1: BASE STATION */}
            <div style={{
              background: 'rgba(16, 23, 38, 0.75)',
              border: '1px solid rgba(0, 240, 255, 0.25)',
              borderRadius: '3px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Radio size={14} color="var(--accent-cyan)" />
                  <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
                    BASE STATION
                  </span>
                </div>
                <span className={`tech-tag ${hardwareLive ? 'tech-tag-green' : 'tech-tag-cyan'}`} style={{ fontSize: '10px' }}>
                  <span className={`status-dot ${hardwareLive ? 'status-dot-green' : 'status-dot-cyan'}`} style={{ width: '4px', height: '4px' }}></span>
                  {hardwareLive ? "CHIP LIVE" : "ONLINE"}
                </span>
              </div>

              {/* Simplified Plain-English Metrics */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Source:</span>
                  <span style={{ color: hardwareLive ? 'var(--accent-teal)' : '#fff', fontWeight: 600 }}>
                    {hardwareLive ? "USB COM3 (u-blox)" : BASE_STATION.id}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>
                    {baseTelemetry.gnssStatus || "DGPS / DIFFERENTIAL"}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Accuracy:</span>
                  <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>
                    ±{(baseTelemetry.horizontalAccuracy * 1000).toFixed(0)} mm (Precision)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Satellites:</span>
                  <span style={{ color: 'var(--accent-cyan)' }}>
                    {baseTelemetry.usedSatellites} Active / {baseTelemetry.trackedSatellites} Tracked
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Location:</span>
                  <span style={{ color: '#e2e8f0' }}>
                    {baseTelemetry.latitude.toFixed(5)}°N, {baseTelemetry.longitude.toFixed(5)}°E
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Altitude:</span>
                  <span style={{ color: '#fff' }}>{baseTelemetry.altitude.toFixed(1)} m</span>
                </div>
              </div>

              {/* Button to open detailed Inspector */}
              <button 
                onClick={onInspectBase}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  background: 'rgba(0, 240, 255, 0.1)',
                  border: '1px solid rgba(0, 240, 255, 0.35)',
                  color: 'var(--accent-cyan)',
                  padding: '7px 8px',
                  borderRadius: '2px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 240, 255, 0.1)'}
              >
                <Crosshair size={13} />
                <span>INSPECT BASE DETAILS</span>
              </button>
            </div>

            {/* SECTION 2: ROVER (REACH STACKER) */}
            <div style={{
              background: 'rgba(16, 23, 38, 0.6)',
              border: '1px dashed rgba(255, 183, 3, 0.35)',
              borderRadius: '3px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={14} color="var(--accent-amber)" />
                  <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-amber)', letterSpacing: '0.04em' }}>
                    ROVER (REACH STACKER)
                  </span>
                </div>
                <span className="tech-tag tech-tag-amber" style={{ fontSize: '10px' }}>
                  STANDBY
                </span>
              </div>

              <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4', marginBottom: '8px' }}>
                Rover integration is planned for <strong>Version 2</strong>. In this release, the Base Station is configured and ready to connect.
              </p>

              {/* Preview Button */}
              <button
                onClick={onToggleRoverSimulation}
                style={{
                  width: '100%',
                  background: roverSimulated ? 'rgba(255, 183, 3, 0.18)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${roverSimulated ? 'var(--accent-amber)' : 'rgba(255,255,255,0.12)'}`,
                  color: roverSimulated ? 'var(--accent-amber)' : 'var(--text-secondary)',
                  padding: '6px 8px',
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
                {roverSimulated ? <Eye size={13} /> : <EyeOff size={13} />}
                <span>{roverSimulated ? "HIDE ROVER PREVIEW" : "SHOW ROVER PREVIEW ON MAP"}</span>
              </button>
            </div>

            {/* SECTION 3: MAP LAYERS */}
            <div style={{
              background: 'rgba(16, 23, 38, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '3px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Layers size={14} color="var(--accent-cyan)" />
                <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
                  MAP LAYERS
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Satellite */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Globe size={13} color="var(--text-secondary)" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Satellite View
                    </span>
                  </div>
                  <label className="tech-switch">
                    <input 
                      type="checkbox" 
                      checked={mapLayers.satellite} 
                      onChange={() => onToggleLayer('satellite')} 
                    />
                    <span className="tech-slider"></span>
                  </label>
                </div>

                {/* Roads */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Route size={13} color="var(--accent-cyan)" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Driving Roads & Lanes
                    </span>
                  </div>
                  <label className="tech-switch">
                    <input 
                      type="checkbox" 
                      checked={mapLayers.roads} 
                      onChange={() => onToggleLayer('roads')} 
                    />
                    <span className="tech-slider"></span>
                  </label>
                </div>

                {/* Container Stacks */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Grid3X3 size={13} color="var(--accent-teal)" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Container Stacks & Bays
                    </span>
                  </div>
                  <label className="tech-switch">
                    <input 
                      type="checkbox" 
                      checked={mapLayers.zones} 
                      onChange={() => onToggleLayer('zones')} 
                    />
                    <span className="tech-slider"></span>
                  </label>
                </div>

                {/* Geofences */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <ShieldAlert size={13} color="var(--accent-danger)" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Safety Geofences
                    </span>
                  </div>
                  <label className="tech-switch">
                    <input 
                      type="checkbox" 
                      checked={mapLayers.geofence} 
                      onChange={() => onToggleLayer('geofence')} 
                    />
                    <span className="tech-slider"></span>
                  </label>
                </div>

                {/* Base Range */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Radio size={13} color="var(--accent-cyan)" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Base Station Range Ring
                    </span>
                  </div>
                  <label className="tech-switch">
                    <input 
                      type="checkbox" 
                      checked={mapLayers.base} 
                      onChange={() => onToggleLayer('base')} 
                    />
                    <span className="tech-slider"></span>
                  </label>
                </div>

                {/* Grid */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <Grid3X3 size={13} color="var(--text-muted)" />
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                      Yard Survey Grid
                    </span>
                  </div>
                  <label className="tech-switch">
                    <input 
                      type="checkbox" 
                      checked={mapLayers.grid} 
                      onChange={() => onToggleLayer('grid')} 
                    />
                    <span className="tech-slider"></span>
                  </label>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </aside>
  );
};
