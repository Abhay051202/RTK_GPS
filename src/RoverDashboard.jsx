import { useEffect, useState } from 'react';
import './rover.css';

const API = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
const display = (value, digits = 3) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

export default function RoverDashboard() {
  const [rover, setRover] = useState({});
  const [log, setLog] = useState({ recording: false, count: 0, rows: [] });
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    async function refresh() {
      try {
        const responses = await Promise.all(['/api/telemetry', '/api/recording'].map(path => fetch(API + path, { signal: controller.signal })));
        if (responses.some(response => !response.ok)) throw new Error('Backend unavailable');
        const [telemetry, saved] = await Promise.all(responses.map(response => response.json()));
        if (!stopped) { setRover(telemetry.rover); setLog(saved); setOnline(true); }
      } catch { if (!stopped) setOnline(false); }
      if (!stopped) timer = setTimeout(refresh, 1000);
    }
    refresh();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, []);
  async function toggleRecording() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API}/api/recording/${log.recording ? 'stop' : 'start'}`, { method: 'POST' });
      if (!response.ok) throw new Error('Unable to change recording. Check the backend connection.');
      const result = await response.json();
      setLog(previous => ({ ...previous, recording: result.recording }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function exportExcel() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API}/api/recording/export`);
      if (!response.ok) throw new Error('Excel export failed. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'Rover_Readings.xlsx'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const live = online && rover.connected;
  return <main className="rover-dashboard">
    <header><div><p className="eyebrow">RTK TELEMETRY</p><h1>Rover tracking</h1><p>Live receiver data and Excel recording</p></div><span className={live ? 'status live' : 'status'}>{!online ? 'Backend offline' : live ? 'Rover connected' : 'Waiting for rover'}</span></header>
    <section className="metrics" aria-label="Live rover telemetry">
      {[
        ['Latitude', live ? display(rover.latitude, 8) : '—'],
        ['Longitude', live ? display(rover.longitude, 8) : '—'],
        ['Altitude (m)', live ? display(rover.altitude) : '—'],
        ['Speed (km/h)', live ? display(rover.speed_kmh, 2) : '—'],
        ['Fix status', live ? rover.fix_status_text || 'Unknown' : 'No live data'],
        ['Device', rover.device_id || '—']
      ].map(([label, value]) => <article key={label}><p>{label}</p><strong>{value}</strong></article>)}
    </section>
    <section className="recordings">
      <div className="toolbar"><div><h2>Recorded readings</h2><p>{log.count.toLocaleString()} saved readings · {online ? log.recording ? 'Recording incoming data' : 'Recording stopped' : 'Recording status unavailable'}</p></div><div className="actions"><button disabled={!online || busy} onClick={toggleRecording}>{log.recording ? 'Stop recording' : 'Start recording'}</button><button className="secondary" disabled={!online || busy || !log.count} onClick={exportExcel}>Download Excel</button></div></div>
      <p className="help">Records each incoming rover packet, including stationary readings. Data stays saved after refresh or restart. Start recording again after restarting the backend. Times are UTC.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="table-scroll"><table><thead><tr>{['Received (UTC)', 'Latitude', 'Longitude', 'Altitude (m)', 'Speed (km/h)', 'Fix'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {log.rows.map(row => <tr key={row.id}><td>{row.received_utc}</td><td>{display(row.latitude, 8)}</td><td>{display(row.longitude, 8)}</td><td>{display(row.altitude)}</td><td>{display(row.speed_kmh, 2)}</td><td>{row.fix_status_text}</td></tr>)}
        {!log.rows.length && <tr><td colSpan="6" className="empty">Start recording and connect your rover to collect readings.</td></tr>}
      </tbody></table></div><p className="help">Showing the latest 100 readings. Excel includes every saved reading, fix quality, heading, device ID, and reported battery level.</p>
    </section>
  </main>;
}
