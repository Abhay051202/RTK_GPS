import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DEFAULT_CENTER = [18.90387, 73.04675];
const MAX_TRAIL = 1000;

const dotIcon = (color, ring) => L.divIcon({
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div class="map-dot" style="--c:${color}">${ring ? '<span class="map-ring"></span>' : ''}<span class="map-core"></span></div>`
});

const valid = (p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number'
  && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

/** Live satellite map showing the Base station, the Rover, the baseline between them and the rover trail. */
export default function LiveMap({ base, rover, baseLive, roverLive }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef({});
  const trailPts = useRef([]);
  const centered = useRef(false);
  const [mapType, setMapType] = useState('satellite');
  const [follow, setFollow] = useState(false);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { center: DEFAULT_CENTER, zoom: 18, maxZoom: 22, zoomControl: true });
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 22, maxNativeZoom: 19, attribution: 'Tiles &copy; Esri' }
    );
    const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 22, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors' });
    satellite.addTo(map);

    const baseMarker = L.marker(DEFAULT_CENTER, { icon: dotIcon('#22d3ee', true) });
    const roverMarker = L.marker(DEFAULT_CENTER, { icon: dotIcon('#f59e0b', false) });
    const baseline = L.polyline([], { color: '#facc15', weight: 2, dashArray: '6 6' });
    const trail = L.polyline([], { color: '#f59e0b', weight: 3, opacity: 0.8 });
    trail.addTo(map);
    baseline.addTo(map);

    layers.current = { satellite, street, baseMarker, roverMarker, baseline, trail };
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Tile layer switch
  useEffect(() => {
    const map = mapRef.current;
    const { satellite, street } = layers.current;
    if (!map) return;
    const [on, off] = mapType === 'satellite' ? [satellite, street] : [street, satellite];
    if (map.hasLayer(off)) map.removeLayer(off);
    if (!map.hasLayer(on)) on.addTo(map);
  }, [mapType]);

  // Base marker
  useEffect(() => {
    const map = mapRef.current;
    const { baseMarker } = layers.current;
    if (!map) return;
    if (baseLive && valid(base)) {
      const ll = [base.latitude, base.longitude];
      baseMarker.setLatLng(ll);
      baseMarker.bindTooltip(
        `<b>Base station</b> ${base.port || ''}<br>${base.latitude.toFixed(8)}, ${base.longitude.toFixed(8)}<br>${base.fix_status_text || ''}`,
        { direction: 'top', offset: [0, -14] }
      );
      if (!map.hasLayer(baseMarker)) baseMarker.addTo(map);
      if (!centered.current) { map.setView(ll, 19); centered.current = true; }
    } else if (map.hasLayer(baseMarker)) {
      map.removeLayer(baseMarker);
    }
  }, [baseLive, base?.latitude, base?.longitude, base?.fix_status_text, base?.port]);

  // Rover marker, trail, baseline
  useEffect(() => {
    const map = mapRef.current;
    const { roverMarker, baseline, trail } = layers.current;
    if (!map) return;
    if (roverLive && valid(rover)) {
      const ll = [rover.latitude, rover.longitude];
      roverMarker.setLatLng(ll);
      roverMarker.bindTooltip(
        `<b>Rover</b> ${rover.device_id || ''}<br>${rover.latitude.toFixed(8)}, ${rover.longitude.toFixed(8)}<br>${rover.fix_status_text || ''}`,
        { direction: 'top', offset: [0, -14] }
      );
      if (!map.hasLayer(roverMarker)) roverMarker.addTo(map);

      const last = trailPts.current[trailPts.current.length - 1];
      if (!last || last[0] !== ll[0] || last[1] !== ll[1]) {
        trailPts.current.push(ll);
        if (trailPts.current.length > MAX_TRAIL) trailPts.current.shift();
        trail.setLatLngs(trailPts.current);
      }
      baseline.setLatLngs(baseLive && valid(base) ? [[base.latitude, base.longitude], ll] : []);
      if (follow) map.panTo(ll, { animate: true });
      else if (!centered.current) { map.setView(ll, 19); centered.current = true; }
    } else {
      if (map.hasLayer(roverMarker)) map.removeLayer(roverMarker);
      baseline.setLatLngs([]);
    }
  }, [roverLive, rover?.latitude, rover?.longitude, rover?.fix_status_text, baseLive, base?.latitude, base?.longitude, follow]);

  const centerOn = (p) => { if (mapRef.current && valid(p)) mapRef.current.setView([p.latitude, p.longitude], 20); };
  const clearTrail = () => { trailPts.current = []; layers.current.trail?.setLatLngs([]); };

  return <section className="map-card">
    <div className="map-toolbar">
      <div className="seg">
        <button className={mapType === 'satellite' ? 'on' : ''} onClick={() => setMapType('satellite')}>Satellite</button>
        <button className={mapType === 'street' ? 'on' : ''} onClick={() => setMapType('street')}>Street</button>
      </div>
      <div className="map-actions">
        <button className="secondary" disabled={!baseLive} onClick={() => centerOn(base)}>Center on base</button>
        <button className="secondary" disabled={!roverLive} onClick={() => centerOn(rover)}>Center on rover</button>
        <button className={follow ? '' : 'secondary'} disabled={!roverLive} onClick={() => setFollow(f => !f)}>{follow ? 'Following rover' : 'Follow rover'}</button>
        <button className="secondary" onClick={clearTrail}>Clear trail</button>
      </div>
    </div>
    <div ref={elRef} className="map-view" />
    <div className="map-legend">
      <span><i style={{ background: '#22d3ee' }} /> Base</span>
      <span><i style={{ background: '#f59e0b' }} /> Rover + trail</span>
      <span><i style={{ background: '#facc15' }} /> Baseline</span>
    </div>
  </section>;
}
