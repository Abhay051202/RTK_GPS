import React from 'react';
import { 
  X, 
  Radio, 
  Truck, 
  Workflow, 
  ArrowRight, 
  Cpu, 
  Satellite, 
  Layers, 
  ShieldCheck, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

export const RoadmapModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="industrial-modal-overlay" onClick={onClose}>
      <div 
        className="industrial-modal-content corner-accents"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '780px' }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-tech)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(16, 23, 38, 0.9)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Workflow size={17} color="var(--accent-cyan)" />
            </div>
            <div>
              <div className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.08em' }}>
                FUTURE ARCHITECTURE & INTEGRATION ROADMAP
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Base Station V1 → Rover Telemetry V2 → Reach Stacker Automation
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

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Pipeline Diagram */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.7)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '4px',
            padding: '16px'
          }}>
            <div style={{ 
              fontSize: '11px', 
              fontFamily: 'var(--font-mono)', 
              color: 'var(--text-muted)', 
              marginBottom: '12px',
              textTransform: 'uppercase' 
            }}>
              End-to-End System Pipeline
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              {/* Node 1: Base Station */}
              <div style={{
                flex: 1,
                background: 'rgba(0, 240, 255, 0.08)',
                border: '1.5px solid var(--accent-cyan)',
                borderRadius: '4px',
                padding: '12px',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Radio size={16} color="var(--accent-cyan)" />
                  <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                    1. BASE STATION
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--accent-teal)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                  ● CURRENT RELEASE (V1)
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                  • Multi-band GNSS L1/L2/L5<br/>
                  • RTCM 3.2 MSM4 Caster<br/>
                  • Geofenced Yard Model<br/>
                  • 10Hz Correction Broadcast
                </div>
              </div>

              <ArrowRight size={22} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />

              {/* Node 2: Rover */}
              <div style={{
                flex: 1,
                background: 'rgba(255, 183, 3, 0.08)',
                border: '1.5px dashed var(--accent-amber)',
                borderRadius: '4px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Truck size={16} color="var(--accent-amber)" />
                  <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                    2. ROVER MODULE
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                  ○ PHASE 2 INTEGRATION
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                  • Dual-antenna RTK Heading<br/>
                  • LoRa / 4G Telemetry Bridge<br/>
                  • Centimeter Path Following<br/>
                  • Speed & Battery Monitor
                </div>
              </div>

              <ArrowRight size={22} color="var(--accent-amber)" style={{ flexShrink: 0 }} />

              {/* Node 3: Reach Stacker System */}
              <div style={{
                flex: 1,
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1.5px dashed rgba(59, 130, 246, 0.4)',
                borderRadius: '4px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Cpu size={16} color="#60a5fa" />
                  <span className="font-display" style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>
                    3. REACH STACKER
                  </span>
                </div>
                <div style={{ fontSize: '10px', color: '#60a5fa', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
                  ○ PHASE 3 SYSTEM LINK
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', lineHeight: '1.4' }}>
                  • J1939 CANbus Telematics<br/>
                  • Spreader Twistlock Telemetry<br/>
                  • Container RFID / OCR Scan<br/>
                  • Automated Mission Planner
                </div>
              </div>
            </div>
          </div>

          {/* Architecture Tree Structure */}
          <div style={{
            background: 'rgba(10, 15, 24, 0.95)',
            border: '1px solid var(--border-tech)',
            borderRadius: '4px',
            padding: '16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-primary)'
          }}>
            <div style={{ color: 'var(--accent-cyan)', fontWeight: 700, marginBottom: '10px' }}>
              MODULAR DATA TAXONOMY SCHEMATIC:
            </div>
            <pre style={{ lineHeight: '1.6', color: '#cbd5e1' }}>
{`BASE (Current V1 Focus)
├── GPS (L1/L2/L5 RTK Fixed Reference, ±6mm Accuracy)
├── Communication (NTRIP Caster, RTCM 3.2 MSM4, 1000BASE-T)
├── Site Map (Bays A1-A8, B1-B8, Reefer, Hazmat, Roads)
└── Geofence (Terminal Perimeter, Class 3 Hazmat, Stacker Guideway)
    │
    └── ROVER (Architecture Placeholder / V2 Target)
        ├── Location (Centimeter-accurate Real-time Waypoint Tracking)
        ├── Battery (Pack Voltage, SoC %, Thermal Monitor)
        ├── Status (Active / Standby / Docked / Error)
        ├── Navigation (Corridor Waypoints, Collision Avoidance LiDAR)
        ├── Mission (Bay Pickup, Stack Deposit, Quayside Transfer)
        └── Telemetry (J1939 CANbus, Boom Angle, Twistlocks, 45T Load)`}
            </pre>
          </div>

          {/* Architecture Readiness Confirmation */}
          <div style={{
            background: 'rgba(0, 229, 163, 0.08)',
            border: '1px solid rgba(0, 229, 163, 0.25)',
            borderRadius: '4px',
            padding: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <CheckCircle2 size={24} color="var(--accent-teal)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: '#e2e8f0', lineHeight: '1.4' }}>
              <strong>Zero-Redesign Guarantee:</strong> All map layer hooks, WebSocket listeners, telemetry schemas, and coordinate transformations are isolated in modular files so connecting the Rover module and Reach Stacker CANbus feeds requires no changes to the Base Station UI.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
