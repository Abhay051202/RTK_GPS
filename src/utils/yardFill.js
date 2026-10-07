/**
 * Yard Auto-Fill Engine
 * Fills a user-drawn yard boundary polygon with a grid of 20ft container slots.
 *
 * Layout: blocks of 2 rows (A/B) of 20ft containers, separated by truck lanes.
 * Grid orientation follows the longest edge of the boundary so rows run parallel
 * to the main yard fence.
 *
 * Works in a local East/North tangent plane (metres) centred on the boundary,
 * using WGS-84 meridional / prime-vertical radii -> sub-centimetre error over
 * a few hundred metres, which is far below RTK survey error.
 */
import { wgs84ToUtm } from './coordinateUtils';

const A_WGS = 6378137.0;
const F_WGS = 1 / 298.257223563;
const E2_WGS = F_WGS * (2 - F_WGS);

export const CONTAINER_20FT = { length: 6.058, width: 2.438, height: 2.591 };

export const DEFAULT_FILL_OPTIONS = {
  laneWidth: 12.0,     // truck lane between blocks (m)
  bayGap: 0.3,         // gap between consecutive containers in a row (m)
  rowGap: 0.2,         // gap between row A and row B in a block (m)
  fenceMargin: 3.0,    // clearance from boundary fence (m)
  rowsPerBlock: 2
};

const BLOCK_COLORS = [
  ['#00f0ff', '#0284c7'],
  ['#3b82f6', '#1d4ed8'],
  ['#10b981', '#059669'],
  ['#f59e0b', '#d97706'],
  ['#a855f7', '#7e22ce'],
  ['#ec4899', '#be185d'],
  ['#84cc16', '#4d7c0f'],
  ['#f97316', '#c2410c']
];

function makeProjection(lat0, lng0) {
  const phi = (lat0 * Math.PI) / 180;
  const s = Math.sin(phi);
  const w = Math.sqrt(1 - E2_WGS * s * s);
  const M = (A_WGS * (1 - E2_WGS)) / (w * w * w); // meridional radius
  const N = A_WGS / w;                             // prime vertical radius
  const mPerDegLat = (Math.PI / 180) * M;
  const mPerDegLng = (Math.PI / 180) * N * Math.cos(phi);
  return {
    toXY: (lat, lng) => [(lng - lng0) * mPerDegLng, (lat - lat0) * mPerDegLat],
    toLatLng: (x, y) => [lat0 + y / mPerDegLat, lng0 + x / mPerDegLng]
  };
}

const rotate = ([x, y], ang) => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [x * c - y * s, x * s + y * c];
};

function pointInPolygon([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function minDistToEdges(pt, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    d = Math.min(d, distToSegment(pt, poly[j], poly[i]));
  }
  return d;
}

/** Area of a lat/lng polygon in square metres. */
export function polygonAreaSqM(boundary) {
  if (!boundary || boundary.length < 3) return 0;
  const lat0 = boundary.reduce((s, p) => s + p.lat, 0) / boundary.length;
  const lng0 = boundary.reduce((s, p) => s + p.lng, 0) / boundary.length;
  const proj = makeProjection(lat0, lng0);
  const pts = boundary.map(p => proj.toXY(p.lat, p.lng));
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(area / 2);
}

/**
 * Fill boundary (array of {lat, lng}, >= 3 points) with 20ft container slots.
 * Returns array of container objects in the same shape as PROSPER_CONTAINERS.
 */
export function fillYardWithContainers(boundary, opts = {}) {
  if (!boundary || boundary.length < 3) return [];
  const o = { ...DEFAULT_FILL_OPTIONS, ...opts };
  const { length: L, width: W } = CONTAINER_20FT;

  const lat0 = boundary.reduce((s, p) => s + p.lat, 0) / boundary.length;
  const lng0 = boundary.reduce((s, p) => s + p.lng, 0) / boundary.length;
  const proj = makeProjection(lat0, lng0);
  const polyXY = boundary.map(p => proj.toXY(p.lat, p.lng));

  // Orientation: align rows with the longest boundary edge
  let bestLen = 0;
  let theta = 0;
  for (let i = 0, j = polyXY.length - 1; i < polyXY.length; j = i++) {
    const dx = polyXY[i][0] - polyXY[j][0];
    const dy = polyXY[i][1] - polyXY[j][1];
    const len = Math.hypot(dx, dy);
    if (len > bestLen) {
      bestLen = len;
      theta = Math.atan2(dy, dx);
    }
  }
  if (o.orientationDeg !== undefined && o.orientationDeg !== null && o.orientationDeg !== '') {
    // Optional manual override: bearing of rows in degrees from North (clockwise)
    theta = ((90 - Number(o.orientationDeg)) * Math.PI) / 180;
  }

  // Work in a rotated frame where rows run along +u
  const polyUV = polyXY.map(p => rotate(p, -theta));
  const us = polyUV.map(p => p[0]);
  const vs = polyUV.map(p => p[1]);
  const minU = Math.min(...us);
  const maxU = Math.max(...us);
  const minV = Math.min(...vs);
  const maxV = Math.max(...vs);

  const blockDepth = o.rowsPerBlock * W + (o.rowsPerBlock - 1) * o.rowGap;
  const blockPitch = blockDepth + o.laneWidth;
  const bayPitch = L + o.bayGap;
  const rowLetters = 'ABCDEFGH';

  const fits = corners =>
    corners.every(c => pointInPolygon(c, polyUV) && minDistToEdges(c, polyUV) >= o.fenceMargin);

  const containers = [];
  let blockNo = 0;

  for (let v0 = minV + o.fenceMargin; v0 + blockDepth <= maxV - o.fenceMargin + 1e-9; v0 += blockPitch) {
    let blockHasSlots = false;
    const blockIdx = blockNo + 1;
    const [fill, border] = BLOCK_COLORS[blockNo % BLOCK_COLORS.length];

    for (let r = 0; r < o.rowsPerBlock; r++) {
      const vLo = v0 + r * (W + o.rowGap);
      const vHi = vLo + W;
      let bay = 0;

      for (let u0 = minU + o.fenceMargin; u0 + L <= maxU - o.fenceMargin + 1e-9; u0 += bayPitch) {
        const uv = [
          [u0, vHi],     // corner 1
          [u0 + L, vHi], // corner 2
          [u0 + L, vLo], // corner 3
          [u0, vLo]      // corner 4
        ];
        if (!fits(uv)) continue;

        bay += 1;
        blockHasSlots = true;

        const cornersLL = uv.map(p => {
          const [lat, lng] = proj.toLatLng(...rotate(p, theta));
          return [Number(lat.toFixed(8)), Number(lng.toFixed(8))];
        });
        const [cLat, cLng] = proj.toLatLng(...rotate([u0 + L / 2, (vLo + vHi) / 2], theta));
        const centerLat = Number(cLat.toFixed(8));
        const centerLng = Number(cLng.toFixed(8));
        const cUtm = wgs84ToUtm(centerLat, centerLng);
        const blockId = `BLK-${String(blockIdx).padStart(2, '0')}`;

        containers.push({
          id: `${blockId}-${String(bay).padStart(3, '0')}${rowLetters[r]}`,
          bayNumber: bay,
          row: rowLetters[r],
          stackId: blockId,
          stackName: `Block ${String(blockIdx).padStart(2, '0')}`,
          type: '20ft Standard (ISO 668)',
          dimensionsMeters: `${L.toFixed(2)} x ${W.toFixed(2)} x ${CONTAINER_20FT.height.toFixed(2)}`,
          color: fill,
          borderColor: border,
          center: {
            lat: centerLat,
            lng: centerLng,
            alt: 14.1,
            easting: cUtm.easting,
            northing: cUtm.northing,
            zone: cUtm.zone
          },
          corners: cornersLL,
          cornersUtm: cornersLL.map(([la, ln]) => wgs84ToUtm(la, ln))
        });
      }
    }
    if (blockHasSlots) blockNo += 1;
  }

  return containers;
}
