import { continents } from "./continents.js";
import {
  variables,
  getVariableValue,
  getVariableColorRgb,
  getAllReadings,
  alerts,
  missionTracks,
  passQueue,
  nemoFloat,
} from "./data.js";

// ─── DOM References ──────────────────────────────────────────────
const canvas = document.getElementById("globe-canvas");
const ctx = canvas.getContext("2d");
const container = document.getElementById("globe-container");
const varRail = document.getElementById("var-rail");
const activeLabel = document.getElementById("active-label");
const colorBar = document.getElementById("color-bar");
const colorBarLabels = document.getElementById("color-bar-labels");
const readingsGrid = document.getElementById("readings-grid");
const alertsList = document.getElementById("alerts-list");
const tracksEl = document.getElementById("mission-tracks");
const queueEl = document.getElementById("pass-queue");
const utcPill = document.getElementById("utc-pill");
const measureCard = document.getElementById("measure-card");
const measureTitle = document.getElementById("measure-title");
const measureRows = document.getElementById("measure-rows");
const measureSpark = document.getElementById("measure-spark");
const measureClose = document.getElementById("measure-close");

// ─── Globe State ─────────────────────────────────────────────────
let rotLon = -20;
let rotLat = 15;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartLon = 0;
let dragStartLat = 0;
let dragMoved = false;
let zoom = 1;
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
let activeVar = "sst";
let dpr = window.devicePixelRatio || 1;
let W = 0;
let H = 0;
let viewMode = "3d"; // "3d" or "2d"
const btn3d = document.getElementById("btn-3d");
const btn2d = document.getElementById("btn-2d");
const floatCard = document.getElementById("float-card");

// ─── Pre-baked World Grids ───────────────────────────────────────
const GRID_SCALE = 2;
const GRID_W = 360 * GRID_SCALE;
const GRID_H = 180 * GRID_SCALE;
const LAND_MASK   = new Uint8Array(GRID_W * GRID_H);
const LAND_COLORS = new Uint8Array(GRID_W * GRID_H * 3);
const OCEAN_COLORS = new Uint8Array(GRID_W * GRID_H * 3);

function pointInPolygon(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Pre-compute polygon bounding boxes for fast rejection
const polyBounds = continents.map((poly) => {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [ln, lt] of poly) {
    if (ln < minLon) minLon = ln;
    if (ln > maxLon) maxLon = ln;
    if (lt < minLat) minLat = lt;
    if (lt > maxLat) maxLat = lt;
  }
  return { minLon, maxLon, minLat, maxLat, poly };
});

function buildMasks() {
  for (let li = 0; li < GRID_H; li++) {
    const lat = (li + 0.5) / GRID_SCALE - 90;
    const absLat = Math.abs(lat);

    for (let lj = 0; lj < GRID_W; lj++) {
      const lon = (lj + 0.5) / GRID_SCALE - 180;
      const idx = li * GRID_W + lj;

      let land = false;
      for (const { minLon, maxLon, minLat, maxLat, poly } of polyBounds) {
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) continue;
        if (pointInPolygon(lon, lat, poly)) { land = true; break; }
      }
      LAND_MASK[idx] = land ? 1 : 0;

      if (land) {
        // Subtle noise for texture variation
        const n = Math.abs(
          Math.sin(lat * 7.3 + lon * 13.1) * 0.6 +
          Math.sin(lat * 2.1 + lon * 5.7) * 0.4
        );
        const jitter = Math.round(n * 22 - 11);

        let r, g, b;
        if (absLat > 68) {
          r = 228 + jitter; g = 232 + jitter; b = 238 + jitter; // snow/ice
        } else if (absLat > 55) {
          r = 145 + jitter; g = 142 + jitter; b = 132 + jitter; // tundra
        } else if (absLat > 40) {
          r = 158 + jitter; g = 152 + jitter; b = 137 + jitter; // temperate
        } else if (absLat > 22) {
          r = 182 + jitter; g = 172 + jitter; b = 148 + jitter; // subtropical/desert
        } else {
          r = 162 + jitter; g = 155 + jitter; b = 135 + jitter; // tropical
        }

        const ci = idx * 3;
        LAND_COLORS[ci]     = Math.max(80, Math.min(255, r));
        LAND_COLORS[ci + 1] = Math.max(70, Math.min(255, g));
        LAND_COLORS[ci + 2] = Math.max(60, Math.min(255, b));
      }
    }
  }
}

function rebuildOceanColors() {
  for (let li = 0; li < GRID_H; li++) {
    const lat = (li + 0.5) / GRID_SCALE - 90;
    for (let lj = 0; lj < GRID_W; lj++) {
      const idx = li * GRID_W + lj;
      if (LAND_MASK[idx]) continue;
      const lon = (lj + 0.5) / GRID_SCALE - 180;
      const val = getVariableValue(activeVar, lat, lon);
      const [r, g, b] = getVariableColorRgb(activeVar, val);
      const ci = idx * 3;
      OCEAN_COLORS[ci]     = r;
      OCEAN_COLORS[ci + 1] = g;
      OCEAN_COLORS[ci + 2] = b;
    }
  }
}

// ─── Resize ──────────────────────────────────────────────────────

function resize() {
  const rect = container.getBoundingClientRect();
  const newW = Math.round(rect.width);
  const newH = Math.round(rect.height);
  if (newW === W && newH === H) return;
  W = newW;
  H = newH;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const resizeObs = new ResizeObserver(() => requestAnimationFrame(resize));
resizeObs.observe(container);
resize();

// ─── Orthographic Inverse Projection ─────────────────────────────

function inverseProject(sx, sy, cx, cy, r) {
  const nx = (sx - cx) / r;
  const ny = -(sy - cy) / r;
  const dist2 = nx * nx + ny * ny;
  if (dist2 > 1) return null;
  const nz = Math.sqrt(1 - dist2);
  const phi0 = rotLat * Math.PI / 180;
  const cosPhi0 = Math.cos(phi0);
  const sinPhi0 = Math.sin(phi0);
  const latRad = Math.asin(Math.max(-1, Math.min(1, ny * cosPhi0 + nz * sinPhi0)));
  const lonRad = Math.atan2(nx, nz * cosPhi0 - ny * sinPhi0);
  const latDeg = latRad * 57.295779513;
  const lonDeg = ((rotLon + lonRad * 57.295779513 + 540) % 360) - 180;
  return { lat: Math.round(latDeg * 100) / 100, lon: Math.round(lonDeg * 100) / 100 };
}

// ─── Globe Pixel Renderer ────────────────────────────────────────
// Precompute trig constants used in inner loop
let _cosPhi0 = 0, _sinPhi0 = 0, _lastRotLat = null;

function renderGlobePixels(cx, cy, r) {
  if (rotLat !== _lastRotLat) {
    const phi0 = rotLat * Math.PI / 180;
    _cosPhi0 = Math.cos(phi0);
    _sinPhi0 = Math.sin(phi0);
    _lastRotLat = rotLat;
  }
  const cosPhi0 = _cosPhi0;
  const sinPhi0 = _sinPhi0;

  const ix0 = Math.max(0, Math.floor(cx - r));
  const iy0 = Math.max(0, Math.floor(cy - r));
  const ix1 = Math.min(canvas.width, Math.ceil(cx + r));
  const iy1 = Math.min(canvas.height, Math.ceil(cy + r));
  const iw = ix1 - ix0;
  const ih = iy1 - iy0;
  if (iw <= 0 || ih <= 0) return;

  const imgData = ctx.createImageData(iw, ih);
  const data = imgData.data;

  const RAD2DEG = 57.295779513;

  for (let py = 0; py < ih; py++) {
    const ny = -(iy0 + py - cy) / r;
    const ny2 = ny * ny;
    const nyC0 = ny * cosPhi0;
    const nyS0 = ny * sinPhi0;
    const rowBase = py * iw;

    for (let px = 0; px < iw; px++) {
      const nx = (ix0 + px - cx) / r;
      const dist2 = nx * nx + ny2;
      const pidx = (rowBase + px) << 2;

      if (dist2 >= 1) {
        data[pidx + 3] = 0; // Transparent
        continue;
      }

      const nz = Math.sqrt(1 - dist2);
      const sinLat = nyC0 + nz * sinPhi0;
      const latRad = Math.asin(sinLat < -1 ? -1 : sinLat > 1 ? 1 : sinLat);
      const lonRad = Math.atan2(nx, nz * cosPhi0 - nyS0);

      const latDeg = latRad * RAD2DEG;
      const lonDeg = rotLon + lonRad * RAD2DEG;

      const latF = (latDeg + 90) * GRID_SCALE;
      const lonF = (((lonDeg + 180) % 360 + 360) % 360) * GRID_SCALE;
      const li0 = Math.max(0, Math.min(GRID_H - 2, latF | 0));
      const lj0 = Math.max(0, Math.min(GRID_W - 1, lonF | 0));
      const li1 = li0 + 1;
      const lj1 = (lj0 + 1) % GRID_W;
      const fLat = latF - li0;
      const fLon = lonF - lj0;
      const w00 = (1 - fLat) * (1 - fLon);
      const w10 = fLat * (1 - fLon);
      const w01 = (1 - fLat) * fLon;
      const w11 = fLat * fLon;

      const g00 = li0 * GRID_W + lj0;
      const g10 = li1 * GRID_W + lj0;
      const g01 = li0 * GRID_W + lj1;
      const g11 = li1 * GRID_W + lj1;

      let rv, gv, bv;
      const isLand = LAND_MASK[g00];
      if (isLand) {
        const c00 = g00 * 3, c10 = g10 * 3, c01 = g01 * 3, c11 = g11 * 3;
        rv = LAND_COLORS[c00] * w00 + LAND_COLORS[c10] * w10 + LAND_COLORS[c01] * w01 + LAND_COLORS[c11] * w11;
        gv = LAND_COLORS[c00+1] * w00 + LAND_COLORS[c10+1] * w10 + LAND_COLORS[c01+1] * w01 + LAND_COLORS[c11+1] * w11;
        bv = LAND_COLORS[c00+2] * w00 + LAND_COLORS[c10+2] * w10 + LAND_COLORS[c01+2] * w01 + LAND_COLORS[c11+2] * w11;
      } else {
        const c00 = g00 * 3, c10 = g10 * 3, c01 = g01 * 3, c11 = g11 * 3;
        rv = OCEAN_COLORS[c00] * w00 + OCEAN_COLORS[c10] * w10 + OCEAN_COLORS[c01] * w01 + OCEAN_COLORS[c11] * w11;
        gv = OCEAN_COLORS[c00+1] * w00 + OCEAN_COLORS[c10+1] * w10 + OCEAN_COLORS[c01+1] * w01 + OCEAN_COLORS[c11+1] * w11;
        bv = OCEAN_COLORS[c00+2] * w00 + OCEAN_COLORS[c10+2] * w10 + OCEAN_COLORS[c01+2] * w01 + OCEAN_COLORS[c11+2] * w11;
      }

      // Diffuse lighting: light from top-left
      const light = 0.68 + 0.32 * nz;

      data[pidx]     = (rv * light + 0.5) | 0;
      data[pidx + 1] = (gv * light + 0.5) | 0;
      data[pidx + 2] = (bv * light + 0.5) | 0;
      data[pidx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, ix0, iy0);
}

// ─── Graticule (drawn on top of pixel layer) ─────────────────────

function project(lon, lat) {
  const lambda = (lon - rotLon) * Math.PI / 180;
  const phi = lat * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const x = cosPhi * Math.sin(lambda);
  const y = _cosPhi0 * sinPhi - _sinPhi0 * cosPhi * Math.cos(lambda);
  const z = _sinPhi0 * sinPhi + _cosPhi0 * cosPhi * Math.cos(lambda);
  return { x, y, visible: z > 0 };
}

function drawGraticule(cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 0.5;

  for (let lat = -80; lat <= 80; lat += 20) {
    ctx.beginPath();
    let started = false;
    for (let lon = -180; lon <= 180; lon += 2) {
      const p = project(lon, lat);
      if (!p.visible) { started = false; continue; }
      const sx = cx + p.x * r, sy = cy - p.y * r;
      if (!started) { ctx.moveTo(sx, sy); started = true; }
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  for (let lon = -180; lon < 180; lon += 20) {
    ctx.beginPath();
    let started = false;
    for (let lat = -85; lat <= 85; lat += 2) {
      const p = project(lon, lat);
      if (!p.visible) { started = false; continue; }
      const sx = cx + p.x * r, sy = cy - p.y * r;
      if (!started) { ctx.moveTo(sx, sy); started = true; }
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  ctx.restore();
}

// ─── Full Render Frame ───────────────────────────────────────────

function render() {
  if (W === 0 || H === 0) return;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(cx, cy) * 0.88 * zoom;

  ctx.fillStyle = "#f0f0eb";
  ctx.fillRect(0, 0, W, H);

  renderGlobePixels(cx * dpr, cy * dpr, r * dpr);
  drawGraticule(cx, cy, r);
  drawTrajectory(cx, cy, r);

  // Thin rim
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ─── NEMO Float Trajectory ──────────────────────────────────────

function drawTrajectory(cx, cy, r) {
  const wps = nemoFloat.waypoints;
  if (!wps.length) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  // Draw connecting line segments
  const projected = wps.map(wp => {
    const p = project(wp.lon, wp.lat);
    return { sx: cx + p.x * r, sy: cy - p.y * r, visible: p.visible };
  });

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  let started = false;
  for (const pt of projected) {
    if (!pt.visible) { started = false; continue; }
    if (!started) { ctx.moveTo(pt.sx, pt.sy); started = true; }
    else ctx.lineTo(pt.sx, pt.sy);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw waypoint dots
  for (let i = 0; i < projected.length; i++) {
    const pt = projected[i];
    if (!pt.visible) continue;
    const isLast = i === projected.length - 1;

    if (isLast) {
      // Current position — larger pulsing dot
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 400);
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, 7 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
    }
  }

  ctx.restore();
}

// ─── 2D Flat Map Renderer ───────────────────────────────────────

function get2DRanges() {
  const lonRange = 360 / zoom;
  const latRange = Math.min(180, lonRange * (H / W));
  return { lonRange, latRange };
}

function lonLatToScreen2D(lon, lat) {
  const { lonRange, latRange } = get2DRanges();
  return {
    sx: W / 2 + (lon - rotLon) / lonRange * W,
    sy: H / 2 - (lat - rotLat) / latRange * H,
  };
}

function render2D() {
  if (W === 0 || H === 0) return;
  const pw = canvas.width;
  const ph = canvas.height;
  const { lonRange, latRange } = get2DRanges();

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const imgData = ctx.createImageData(pw, ph);
  const data = imgData.data;

  for (let py = 0; py < ph; py++) {
    const lat = rotLat + (0.5 - py / ph) * latRange;
    if (lat < -90 || lat > 90) {
      for (let px = 0; px < pw; px++) {
        const pidx = (py * pw + px) << 2;
        data[pidx] = 240; data[pidx+1] = 240; data[pidx+2] = 235; data[pidx+3] = 255;
      }
      continue;
    }

    const latF = (lat + 90) * GRID_SCALE;
    const li0 = Math.max(0, Math.min(GRID_H - 2, latF | 0));
    const li1 = li0 + 1;
    const fLat = latF - li0;

    for (let px = 0; px < pw; px++) {
      const lon = rotLon + (px / pw - 0.5) * lonRange;
      const lonF = (((lon + 180) % 360 + 360) % 360) * GRID_SCALE;
      const lj0 = Math.max(0, Math.min(GRID_W - 1, lonF | 0));
      const lj1 = (lj0 + 1) % GRID_W;
      const fLon = lonF - lj0;

      const w00 = (1 - fLat) * (1 - fLon);
      const w10 = fLat * (1 - fLon);
      const w01 = (1 - fLat) * fLon;
      const w11 = fLat * fLon;

      const g00 = li0 * GRID_W + lj0;
      const g10 = li1 * GRID_W + lj0;
      const g01 = li0 * GRID_W + lj1;
      const g11 = li1 * GRID_W + lj1;

      const pidx = (py * pw + px) << 2;
      const isLand = LAND_MASK[g00];
      const src = isLand ? LAND_COLORS : OCEAN_COLORS;
      const c00 = g00 * 3, c10 = g10 * 3, c01 = g01 * 3, c11 = g11 * 3;

      data[pidx]   = (src[c00] * w00 + src[c10] * w10 + src[c01] * w01 + src[c11] * w11) | 0;
      data[pidx+1] = (src[c00+1] * w00 + src[c10+1] * w10 + src[c01+1] * w01 + src[c11+1] * w11) | 0;
      data[pidx+2] = (src[c00+2] * w00 + src[c10+2] * w10 + src[c01+2] * w01 + src[c11+2] * w11) | 0;
      data[pidx+3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  ctx.restore();

  draw2DGraticule();
  draw2DTrajectory();
}

function draw2DGraticule() {
  const { lonRange, latRange } = get2DRanges();
  const lonMin = rotLon - lonRange / 2;
  const lonMax = rotLon + lonRange / 2;
  const latMin = rotLat - latRange / 2;
  const latMax = rotLat + latRange / 2;

  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 0.5;

  for (let lat = Math.max(-80, Math.ceil(latMin / 20) * 20); lat <= Math.min(80, latMax); lat += 20) {
    const { sy } = lonLatToScreen2D(0, lat);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(W, sy);
    ctx.stroke();
  }

  for (let lon = Math.ceil(lonMin / 20) * 20; lon <= lonMax; lon += 20) {
    const { sx } = lonLatToScreen2D(lon, 0);
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, H);
    ctx.stroke();
  }
}

function draw2DTrajectory() {
  const wps = nemoFloat.waypoints;
  if (!wps.length) return;

  const pts = wps.map(wp => lonLatToScreen2D(wp.lon, wp.lat));

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(pts[0].sx, pts[0].sy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].sx, pts[i].sy);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];
    const isLast = i === pts.length - 1;
    if (isLast) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 400);
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, 7 * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(pt.sx, pt.sy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
    }
  }
}

// ─── Animation Loop ──────────────────────────────────────────────

function loop() {
  if (!isDragging && viewMode === "3d") {
    rotLon = (rotLon + 0.05) % 360;
  }
  if (viewMode === "3d") render();
  else render2D();
  requestAnimationFrame(loop);
}

// ─── Interaction: Drag ───────────────────────────────────────────

function getPos(e) {
  if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function onDragStart(e) {
  isDragging = true;
  dragMoved = false;
  const pos = getPos(e);
  dragStartX = pos.x;
  dragStartY = pos.y;
  dragStartLon = rotLon;
  dragStartLat = rotLat;
  container.style.cursor = "grabbing";
}

function onDragMove(e) {
  if (!isDragging) return;
  const pos = getPos(e);
  const dx = pos.x - dragStartX;
  const dy = pos.y - dragStartY;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;

  if (viewMode === "3d") {
    rotLon = dragStartLon - dx * 0.3;
    rotLat = Math.max(-80, Math.min(80, dragStartLat + dy * 0.3));
  } else {
    const { lonRange, latRange } = get2DRanges();
    rotLon = dragStartLon - (dx / W) * lonRange;
    rotLat = Math.max(-90, Math.min(90, dragStartLat + (dy / H) * latRange));
  }
}

function onDragEnd() {
  isDragging = false;
  container.style.cursor = "grab";
}

container.addEventListener("mousedown", onDragStart);
window.addEventListener("mousemove", onDragMove);
window.addEventListener("mouseup", onDragEnd);
container.addEventListener("touchstart", onDragStart, { passive: true });
window.addEventListener("touchmove", onDragMove, { passive: true });
window.addEventListener("touchend", onDragEnd);

// ─── Interaction: Zoom ───────────────────────────────────────────

container.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.06 : 0.06;
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
}, { passive: false });

// ─── Interaction: Click-to-Measure ───────────────────────────────

container.addEventListener("click", (e) => {
  if (dragMoved) return;

  // If clicking on the measure card itself, do nothing (let it bubble or handle internally)
  // But wait, we want to close if clicking OUTSIDE.
  // The measureCard stopPropagation handles clicks INSIDE.
  // So if we are here, we clicked OUTSIDE the card (on the canvas/container).

  if (measureCard.classList.contains("visible")) {
    measureCard.classList.remove("visible");
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  let geo;
  if (viewMode === "3d") {
    const cx = W / 2, cy = H / 2;
    const r = Math.min(cx, cy) * 0.88 * zoom;
    geo = inverseProject(sx, sy, cx, cy, r);
  } else {
    const { lonRange, latRange } = get2DRanges();
    const lon = rotLon + (sx / W - 0.5) * lonRange;
    const lat = rotLat + (0.5 - sy / H) * latRange;
    if (lat < -90 || lat > 90) geo = null;
    else geo = { lat: Math.round(lat * 100) / 100, lon: Math.round(((lon + 540) % 360 - 180) * 100) / 100 };
  }

  if (!geo) return;
  showMeasurement(geo, e.clientX, e.clientY);
  updateReadingsPanel(geo);
});

// Stop clicks inside the card from closing it via the container listener
measureCard.addEventListener("click", (e) => e.stopPropagation());

// Close button explicitly closes it
measureClose.addEventListener("click", (e) => {
  e.stopPropagation(); // Prevent bubbling to container (though container logic would also close it, this is cleaner)
  measureCard.classList.remove("visible");
});

function showMeasurement(geo, clientX, clientY) {
  const readings = getAllReadings(geo.lat, geo.lon);
  measureTitle.textContent = "Point Data";
  measureRows.innerHTML = readings
    .map((r) => `<div class="measure-row"><span class="mlabel">${r.name}</span><span class="mvalue">${r.value}${r.unit ? " " + r.unit : ""}</span></div>`)
    .join("");

  measureSpark.innerHTML = ""; // Clear sparkline as it doesn't make sense for mixed types

  const cRect = container.getBoundingClientRect();
  let left = clientX - cRect.left + 14;
  let top = clientY - cRect.top - 40;
  if (left + 250 > W) left -= 270;
  if (top < 10) top = 10;
  if (top + 280 > H) top = H - 280;
  measureCard.style.left = left + "px";
  measureCard.style.top = top + "px";
  measureCard.classList.add("visible");
}

function updateReadingsPanel(geo) {
  const readings = getAllReadings(geo.lat, geo.lon);
  const coordRow = `<div class="reading-cell reading-wide"><span class="rl">Location</span><span class="rv">${geo.lat}°, ${geo.lon}°</span></div>`;
  const cells = readings
    .map((r) => `<div class="reading-cell"><span class="rl">${r.name}</span><div><span class="rv">${r.value}</span><span class="ru">${r.unit}</span></div></div>`)
    .join("");
  readingsGrid.innerHTML = coordRow + cells;
}

// ─── Variable Cards ──────────────────────────────────────────────

function buildVarCards() {
  varRail.innerHTML = "";
  for (const [id, v] of Object.entries(variables)) {
    const btn = document.createElement("button");
    btn.className = "var-card" + (id === activeVar ? " active" : "");
    btn.dataset.var = id;
    const stops = v.colors.map(([t, c]) => `${c} ${t * 100}%`).join(", ");
    btn.innerHTML = `
      <div class="var-swatch" style="background:linear-gradient(135deg,${stops})"></div>
      <div class="var-info">
        <span class="var-name">${v.name}</span>
        <span class="var-val">${v.globalAvg}<span class="var-unit">${v.unit}</span></span>
      </div>`;
    btn.addEventListener("click", () => selectVariable(id));
    varRail.append(btn);
  }
}

const legendBar = document.getElementById("legend-bar");
const legendLabels = document.getElementById("legend-labels");

function selectVariable(id) {
  activeVar = id;
  const v = variables[id];
  document.querySelectorAll(".var-card").forEach((c) => {
    c.classList.toggle("active", c.dataset.var === id);
  });
  activeLabel.textContent = v.name;
  const stops = v.colors.map(([t, c]) => `${c} ${t * 100}%`).join(", ");
  colorBar.style.background = `linear-gradient(90deg,${stops})`;
  colorBarLabels.innerHTML = `<span>${v.min}${v.unit}</span><span>${v.max}${v.unit}</span>`;

  if (legendBar) legendBar.style.background = `linear-gradient(90deg,${stops})`;
  if (legendLabels) legendLabels.innerHTML = `<span>${v.min}${v.unit ? " " + v.unit : ""}</span><span>${v.max}${v.unit ? " " + v.unit : ""}</span>`;

  rebuildOceanColors();
}

// ─── Static Panels ───────────────────────────────────────────────

function renderAlerts() {
  alertsList.innerHTML = alerts
    .map((a) => `<li><span class="dot ${a.level}"></span><span class="list-label">${a.label}</span><span class="list-value">${a.region}</span></li>`)
    .join("");
}

function renderTracks() {
  tracksEl.innerHTML = missionTracks
    .map((t) => `<div class="track-item"><span class="label">${t.label}</span><div class="track"><i style="width:${t.progress}%"></i></div></div>`)
    .join("");
}

function renderQueue() {
  queueEl.innerHTML = passQueue
    .map((p) => `<li><span class="queue-dot"></span><span class="queue-meta"><strong>${p.id}</strong><span>${p.region}</span></span><span class="queue-eta">ETA ${p.eta}Z</span></li>`)
    .join("");
}

function startUtcClock() {
  const tick = () => { utcPill.textContent = "UTC " + new Date().toISOString().slice(11, 19); };
  tick();
  setInterval(tick, 1000);
}

// ─── View Toggle ────────────────────────────────────────────────

function setViewMode(mode) {
  viewMode = mode;
  btn3d.classList.toggle("active", mode === "3d");
  btn2d.classList.toggle("active", mode === "2d");
}

btn3d.addEventListener("click", () => setViewMode("3d"));
btn2d.addEventListener("click", () => setViewMode("2d"));

// ─── Center on Float ────────────────────────────────────────────

floatCard.addEventListener("click", () => {
  const last = nemoFloat.waypoints[nemoFloat.waypoints.length - 1];
  rotLon = last.lon;
  rotLat = last.lat;
  zoom = viewMode === "3d" ? 1.8 : 3;
});

// ─── Init ────────────────────────────────────────────────────────
// Build land mask synchronously (runs once, ~50-100ms with bbox optimization)
buildMasks();
rebuildOceanColors();

buildVarCards();
selectVariable("sst");
renderAlerts();
renderTracks();
renderQueue();
startUtcClock();
loop();
