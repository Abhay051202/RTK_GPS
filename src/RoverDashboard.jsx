import { useEffect, useMemo, useState } from 'react';
import LiveMap from './LiveMap';
import './rover.css';

const API = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';
const apiFetch = (path, options = {}) => fetch(API + path, {
  ...options,
  headers: { ...(options.headers || {}), ...(API_TOKEN ? { 'X-API-Key': API_TOKEN } : {}) }
});

const num = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
const accuracy = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value < 1 ? `${(value * 100).toFixed(1)} cm` : `${value.toFixed(2)} m`;
};
const age = value => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} s` : '—';

function RtkBadge({ rover }) {
  const fixed = rover?.carrier_solution === 2 && rover?.connected;
  const float = rover?.carrier_solution === 1 && rover?.connected;
  const cls = fixed ? 'rtk-badge fixed' : float ? 'rtk-badge float' : 'rtk-badge nofix';
  return <span className={cls}>{fixed ? 'RTK FIXED' : float ? 'RTK FLOAT' : rover?.fix_status_text || 'NO RTK'}</span>;
}

export default function RoverDashboard() {
  const [base, setBase] = useState({});
  const [rovers, setRovers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [log, setLog] = useState({ recording: false, count: 0, rows: [] });
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    async function refresh() {
      try {
        const [tResp, rResp] = await Promise.all([
          apiFetch('/api/telemetry', { signal: controller.signal }),
          apiFetch('/api/recording', { signal: controller.signal })
        ]);
        if (!tResp.ok || !rResp.ok) throw new Error('Backend unavailable');
        const telemetry = await tResp.json();
        const recording = await rResp.json();
        if (!stopped) {
          setBase(telemetry.base || {});
          setRovers(telemetry.rovers || []);
          setLog(recording);
          setOnline(true);
          if (!selectedId && telemetry.rovers?.length) setSelectedId(telemetry.rovers[0].device_id);
        }
      } catch {
        if (!stopped) setOnline(false);
      }
      if (!stopped) timer = setTimeout(refresh, 1000);
    }
    refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [selectedId]);

  const rover = useMemo(() => {
    if (!rovers.length) return {};
    return rovers.find(item => item.device_id === selectedId) || rovers[0];
  }, [rovers, selectedId]);

  const baseLive = online && base.connected;
  const roverLive = online && rover.connected;
  const rtcmHealthy = roverLive && rover.ntrip_connected && typeof rover.correction_age_s === 'number' && rover.correction_age_s <= 5;

  async function toggleRecording() {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`/api/recording/${log.recording ? 'stop' : 'start'}`, { method: 'POST' });
      if (!response.ok) throw new Error('Unable to change recording state');
      const result = await response.json();
      setLog(previous => ({ ...previous, recording: result.recording }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function exportExcel() {
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/recording/export');
      if (!response.ok) throw new Error('Excel export failed');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'Prosper_RTK_Rover_Readings.xlsx'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  const card = ([label, value, tone]) => <article key={label} className={tone ? `metric-${tone}` : ''}><p>{label}</p><strong>{value}</strong></article>;

  return <main className="rover-dashboard">
    <header>
      <div><p className="eyebrow">PROSPER CONTAINERVISION AI · RTK</p><h1>RTK Control Center</h1><p>Dedicated Base + Reach Stacker centimeter-level positioning telemetry</p></div>
      <span className={online ? 'status live' : 'status'}>{online ? 'Backend online' : 'Backend offline'}</span>
    </header>

    <div className="section-head">
      <div><h2>Base station {base.port ? `(${base.port})` : ''}</h2><p>{base.base_mode || '—'} mode · {base.azure_caster?.host || ''}/{base.azure_caster?.mountpoint || ''}</p></div>
      <span className={baseLive ? 'status live' : 'status'}>{baseLive ? 'Base connected' : 'Base unavailable'}</span>
    </div>
    <section className="metrics">
      {[
        ['Latitude', baseLive ? num(base.latitude, 9) : '—'],
        ['Longitude', baseLive ? num(base.longitude, 9) : '—'],
        ['Ellipsoid height', baseLive ? `${num(base.height_ellipsoid_m, 3)} m` : '—'],
        ['Base mode', base.base_mode || '—'],
        ['Satellites', baseLive ? base.satellites_used ?? '—' : '—'],
        ['Horizontal accuracy', baseLive ? accuracy(base.horizontal_accuracy_m) : '—'],
        ['RTCM frames', base.rtcm_frames_seen ?? 0],
        ['RTCM 1005/1077/1087', `${base.rtcm_message_counts?.['1005'] || 0} / ${base.rtcm_message_counts?.['1077'] || 0} / ${base.rtcm_message_counts?.['1087'] || 0}`],
        ['Caster', base.azure_caster?.connected ? 'STREAMING' : (base.azure_caster?.status_text || 'DOWN'), base.azure_caster?.connected ? 'good' : 'warn'],
        ['Caster bytes sent', `${num((base.azure_caster?.bytes_sent || 0) / 1024, 1)} KB`],
        ['Survey valid', base.base_mode === 'SURVEY_IN' ? (base.survey_valid ? 'YES' : 'NO') : 'N/A'],
        ['Survey mean accuracy', base.base_mode === 'SURVEY_IN' ? accuracy(base.survey_mean_accuracy_m) : 'N/A']
      ].map(card)}
    </section>

    <div className="section-head rover-head">
      <div><h2>Reach Stacker Rover</h2><p>{rovers.length} configured/seen rover{rovers.length === 1 ? '' : 's'}</p></div>
      <div className="rover-select-wrap">
        {rovers.length > 0 && <select value={rover.device_id || ''} onChange={e => setSelectedId(e.target.value)}>{rovers.map(r => <option key={r.device_id} value={r.device_id}>{r.device_id}{r.connected ? ' · online' : ' · offline'}</option>)}</select>}
        <RtkBadge rover={rover} />
      </div>
    </div>

    <section className="health-strip">
      <span className={roverLive ? 'health ok' : 'health bad'}>EdgeBox {roverLive ? 'ONLINE' : 'OFFLINE'}</span>
      <span className={rover.ntrip_connected ? 'health ok' : 'health bad'}>NTRIP {rover.ntrip_connected ? 'CONNECTED' : 'DISCONNECTED'}</span>
      <span className={rtcmHealthy ? 'health ok' : 'health warn'}>Correction age {age(rover.correction_age_s)}</span>
      <span className={rover.carrier_solution === 2 ? 'health ok' : 'health warn'}>{rover.carrier_solution_text || 'NO RTK'}</span>
      <span className={rover.precision_ready ? 'health ok' : 'health bad'}>{rover.precision_ready ? 'PRECISION READY' : `PRECISION BLOCKED${rover.precision_block_reason ? ` · ${rover.precision_block_reason}` : ''}`}</span>
    </section>

    <section className="metrics">
      {[
        ['Latitude', roverLive ? num(rover.latitude, 9) : '—'],
        ['Longitude', roverLive ? num(rover.longitude, 9) : '—'],
        ['Horizontal accuracy', roverLive ? accuracy(rover.horizontal_accuracy_m) : '—', rover.carrier_solution === 2 ? 'good' : 'warn'],
        ['Vertical accuracy', roverLive ? accuracy(rover.vertical_accuracy_m) : '—'],
        ['Fix status', roverLive ? rover.fix_status_text || 'Unknown' : 'No live data'],
        ['Carrier solution', roverLive ? rover.carrier_solution_text || 'NO RTK' : '—'],
        ['Satellites', roverLive ? rover.satellites_used ?? '—' : '—'],
        ['PDOP', roverLive ? num(rover.pdop, 2) : '—'],
        ['Speed', roverLive ? `${num(rover.speed_kmh, 2)} km/h` : '—'],
        ['Heading', roverLive ? `${num(rover.heading, 1)}°` : '—'],
        ['RTCM received', roverLive ? `${num((rover.rtcm_bytes_injected || 0) / 1024, 1)} KB` : '—'],
        ['RTCM frames', roverLive ? rover.rtcm_frames_injected ?? 0 : '—'],
        ['Correction age', roverLive ? age(rover.correction_age_s) : '—'],
        ['Distance to base', roverLive && baseLive ? `${num(rover.distance_to_base_meters, 2)} m` : '—'],
        ['Accuracy source', roverLive ? rover.accuracy_source || '—' : '—'],
        ['Precision ready', rover.precision_ready ? 'YES' : 'NO', rover.precision_ready ? 'good' : 'warn'],
        ['Device', rover.device_id || '—']
      ].map(card)}
    </section>

    <LiveMap base={base} rover={rover} baseLive={baseLive} roverLive={roverLive} />

    <section className="recordings">
      <div className="toolbar"><div><h2>Recorded RTK readings</h2><p>{log.count.toLocaleString()} saved readings · {log.recording ? 'recording' : 'stopped'}</p></div><div className="actions"><button disabled={!online || busy} onClick={toggleRecording}>{log.recording ? 'Stop recording' : 'Start recording'}</button><button className="secondary" disabled={!online || busy || !log.count} onClick={exportExcel}>Download Excel</button></div></div>
      <p className="help">All Reach Stackers are stored in the same SQLite log with device ID, RTK state, receiver hAcc/vAcc, correction age, speed, heading and RTCM counters.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="table-scroll"><table><thead><tr>{['UTC', 'Device', 'Lat', 'Lng', 'hAcc', 'Speed', 'Fix', 'Corr. age'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {log.rows.map(row => <tr key={row.id}><td>{row.received_utc}</td><td>{row.device_id}</td><td>{num(row.latitude, 8)}</td><td>{num(row.longitude, 8)}</td><td>{accuracy(row.horizontal_accuracy_m)}</td><td>{num(row.speed_kmh, 2)}</td><td>{row.fix_status_text}</td><td>{age(row.correction_age_s)}</td></tr>)}
        {!log.rows.length && <tr><td colSpan="8" className="empty">Start recording and connect a Reach Stacker Rover.</td></tr>}
      </tbody></table></div>
    </section>
  </main>;
}
