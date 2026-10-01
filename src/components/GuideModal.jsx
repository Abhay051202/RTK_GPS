import React from 'react';
import { 
  X, 
  Radio, 
  MapPin, 
  Truck, 
  CheckCircle, 
  Layers, 
  HelpCircle, 
  ArrowRight,
  ShieldCheck,
  Compass
} from 'lucide-react';

export const GuideModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="industrial-modal-overlay" onClick={onClose}>
      <div 
        className="industrial-modal-content corner-accents"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '680px' }}
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
              <HelpCircle size={18} color="var(--accent-cyan)" />
            </div>
            <div>
              <div className="font-display" style={{ fontSize: '16px', fontWeight: 700, color: '#fff', letterSpacing: '0.06em' }}>
                YARD SYSTEM GUIDE & QUICK TOUR
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                How the Base Station and Yard Automation System Works
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
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          
          {/* Quick Summary Card */}
          <div style={{
            background: 'rgba(0, 240, 255, 0.06)',
            border: '1px solid rgba(0, 240, 255, 0.25)',
            borderRadius: '4px',
            padding: '14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <Radio size={22} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '4px', fontFamily: 'var(--font-display)' }}>
                WHAT IS THIS SCREEN SHOWING?
              </div>
              <p style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                You are looking at the <strong>central command map</strong> of Container Terminal Yard-01. The glowing blue beacon in the center is the <strong>RTK Base Station</strong>. It acts as the stationary "anchor" of the yard, calculating satellite corrections so Reach Stacker vehicles can navigate with millimeter accuracy.
              </p>
            </div>
          </div>

          {/* 3 Step Simple Guide */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {/* Step 1 */}
            <div style={{
              background: 'rgba(16, 23, 38, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span className="font-mono" style={{ 
                  background: 'var(--accent-cyan)', 
                  color: '#000', 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '11px'
                }}>1</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Base Station</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Monitors 28+ GPS satellites from a fixed mast. Calculates high-precision corrections 10 times every second.
              </p>
            </div>

            {/* Step 2 */}
            <div style={{
              background: 'rgba(16, 23, 38, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span className="font-mono" style={{ 
                  background: 'var(--accent-teal)', 
                  color: '#000', 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '11px'
                }}>2</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Yard Map</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Shows all container stack bays, driving lanes, and safety geofence zones. Click the Base beacon anytime to view details.
              </p>
            </div>

            {/* Step 3 */}
            <div style={{
              background: 'rgba(16, 23, 38, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '4px',
              padding: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span className="font-mono" style={{ 
                  background: 'var(--accent-amber)', 
                  color: '#000', 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '11px'
                }}>3</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>Future Rover</span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                Reach Stacker vehicles will connect here in Version 2. You can preview where the Rover docks using the left panel.
              </p>
            </div>
          </div>

          {/* How to use the controls */}
          <div style={{
            background: 'rgba(16, 23, 38, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '4px',
            padding: '14px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: '8px', fontFamily: 'var(--font-mono)' }}>
              KEY CONTROLS:
            </div>
            <ul style={{ fontSize: '11.5px', color: '#cbd5e1', lineHeight: '1.7', paddingLeft: '18px' }}>
              <li><strong>Click the Base Beacon</strong> on the map to see its live coordinates, signal health, and satellite status.</li>
              <li><strong>Left Panel Toggles:</strong> Show or hide roads, container bays, geofences, and satellite imagery.</li>
              <li><strong>Target Button (BASE):</strong> Instantly flies the camera back to center on the Base Station.</li>
              <li><strong>Roadmap Button:</strong> View the future integration pipeline from Base to Rover to Reach Stacker.</li>
            </ul>
          </div>

          {/* Close Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.25), rgba(0, 229, 163, 0.25))',
                border: '1px solid var(--accent-cyan)',
                color: '#fff',
                padding: '8px 24px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              GOT IT, RETURN TO MAP
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
