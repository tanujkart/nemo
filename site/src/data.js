// ─── Variable Definitions ───────────────────────────────────────
// Color scales based on scientific ocean color palettes
// Reference: Thyng et al. (2016) — "True colors of oceanography"
// https://doi.org/10.5670/oceanog.2016.66

export const variables = {
  sst: {
    name: "Temperature",
    unit: "°C",
    min: -2,
    max: 32,
    globalAvg: "17.8",
    colors: [
      [0.0,  "#081668"],
      [0.12, "#1636a0"],
      [0.25, "#2166ac"],
      [0.38, "#4393c3"],
      [0.50, "#92c5de"],
      [0.62, "#f4a582"],
      [0.75, "#d6604d"],
      [0.88, "#b2182b"],
      [1.0,  "#67001f"],
    ],
  },
  turbidity: {
    name: "Turbidity",
    unit: "NTU",
    min: 0,
    max: 20,
    globalAvg: "1.2",
    colors: [
      [0.0,  "#081668"],
      [0.12, "#1636a0"],
      [0.25, "#2166ac"],
      [0.38, "#4393c3"],
      [0.50, "#92c5de"],
      [0.62, "#f4a582"],
      [0.75, "#d6604d"],
      [0.88, "#b2182b"],
      [1.0,  "#67001f"],
    ],
  },
  ph: {
    name: "pH",
    unit: "",
    min: 7.7,
    max: 8.3,
    globalAvg: "8.07",
    colors: [
      [0.0,  "#081668"],
      [0.12, "#1636a0"],
      [0.25, "#2166ac"],
      [0.38, "#4393c3"],
      [0.50, "#92c5de"],
      [0.62, "#f4a582"],
      [0.75, "#d6604d"],
      [0.88, "#b2182b"],
      [1.0,  "#67001f"],
    ],
  },
};

// ─── Synthetic Data Generation ───────────────────────────────────
// Purely analytical models for smooth, clean gradients.
// No noise functions are used to ensure artifact-free rendering.
//
// Calibrated against published climatological ranges:
//   - NOAA OISST v2.1 monthly climatology (SST)
//   - WOA23 (World Ocean Atlas 2023) annual means
//   - NASA OceanColor L3 (turbidity proxy via Kd490)

function gaussianInfluence(lat, lon, cLat, cLon, sigma, strength) {
  const dLat = lat - cLat;
  let dLon = lon - cLon;
  // Handle longitude wrapping for correct distance
  while (dLon < -180) dLon += 360;
  while (dLon > 180) dLon -= 360;
  
  const dist2 = dLat * dLat + dLon * dLon;
  // Use a slightly wider distribution for smoother blending
  return strength * Math.exp(-dist2 / (2 * sigma * sigma));
}

export function getVariableValue(varId, lat, lon) {
  const absLat = Math.abs(lat);
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  switch (varId) {
    case "sst": {
      // Latitude base: warm equator, cold poles — use cos^1.3 for wider tropics
      const latFactor = Math.pow(Math.cos(latRad), 1.3);
      let t = -2 + 34 * latFactor;

      // East-west asymmetry: western ocean basins are warmer (warm pools)
      // Uses a slow sinusoidal modulation keyed to longitude
      t += 2.5 * Math.sin(lonRad * 1.2 + 0.8) * latFactor;

      // Western Pacific warm pool (large, smooth dome of warmth)
      t += gaussianInfluence(lat, lon, 0, 150, 40, 3);

      // Gulf Stream — broad warmth pushed NE
      t += gaussianInfluence(lat, lon, 35, -65, 25, 5);
      t += gaussianInfluence(lat, lon, 48, -40, 20, 3);

      // Kuroshio — warm tongue off Japan
      t += gaussianInfluence(lat, lon, 30, 140, 22, 4);

      // Agulhas retroflection — warm water leaking around S. Africa
      t += gaussianInfluence(lat, lon, -35, 25, 18, 3);

      // Cold eastern boundary upwelling — California, Peru/Humboldt, Benguela, Canary
      t -= gaussianInfluence(lat, lon, 32, -122, 15, 6);
      t -= gaussianInfluence(lat, lon, -15, -78, 18, 7);
      t -= gaussianInfluence(lat, lon, -22, 10, 15, 5);
      t -= gaussianInfluence(lat, lon, 28, -16, 14, 3);

      // Equatorial cold tongue in eastern Pacific
      t -= gaussianInfluence(lat, lon, 0, -100, 30, 4);

      // Southern Ocean cold ring
      t -= gaussianInfluence(lat, lon, -58, 0, 50, 2);

      // North Atlantic subpolar cooling
      t -= gaussianInfluence(lat, lon, 60, -30, 25, 3);

      return Math.max(-2, Math.min(32, t));
    }
    case "turbidity": {
      // Deep open ocean is very clear (~0.3 NTU)
      let t = 0.3;

      // Broad equatorial productivity band
      t += 1.5 * Math.exp(-lat * lat / 200);

      // Coastal / river plume hotspots (large sigma for smooth blending)
      t += gaussianInfluence(lat, lon, 0, -48, 14, 16);    // Amazon
      t += gaussianInfluence(lat, lon, 22, 89, 12, 15);    // Ganges-Brahmaputra
      t += gaussianInfluence(lat, lon, 29, -89, 12, 12);   // Mississippi
      t += gaussianInfluence(lat, lon, 31, 122, 12, 13);   // Yangtze / East China Sea
      t += gaussianInfluence(lat, lon, 4, 7, 10, 10);      // Niger Delta
      t += gaussianInfluence(lat, lon, -34, 19, 10, 7);    // Agulhas
      t += gaussianInfluence(lat, lon, 54, 2, 15, 8);      // North Sea / Baltic
      t += gaussianInfluence(lat, lon, 23, 52, 12, 6);     // Persian Gulf

      // Upwelling zones have moderate turbidity
      t += gaussianInfluence(lat, lon, -15, -78, 15, 5);
      t += gaussianInfluence(lat, lon, 32, -122, 12, 4);

      return Math.max(0, Math.min(20, t));
    }
    case "ph": {
      // Smooth base: higher pH in warm subtropical gyres, lower at poles
      const base = 8.08 + 0.08 * Math.cos(latRad) - 0.06 * Math.cos(latRad * 2);
      let p = base;

      // Longitudinal modulation: slight east-west variation
      p += 0.02 * Math.sin(lonRad * 0.8);

      // Subtropical gyres (high pH, low CO2)
      p += gaussianInfluence(lat, lon, 25, -45, 25, 0.08);   // N. Atlantic gyre
      p += gaussianInfluence(lat, lon, 25, 170, 30, 0.06);   // N. Pacific gyre
      p += gaussianInfluence(lat, lon, -25, -90, 28, 0.06);  // S. Pacific gyre

      // Upwelling / high-CO2 zones (low pH)
      p -= gaussianInfluence(lat, lon, -15, -78, 18, 0.18);  // Peru upwelling
      p -= gaussianInfluence(lat, lon, 0, -110, 25, 0.12);   // Eq. Pacific cold tongue
      p -= gaussianInfluence(lat, lon, 10, 60, 18, 0.10);    // Arabian Sea
      p -= gaussianInfluence(lat, lon, -60, 0, 40, 0.10);    // Southern Ocean

      return Math.max(7.7, Math.min(8.3, p));
    }
    default:
      return 0;
  }
}

// ─── Color Interpolation ────────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function getVariableColor(varId, value) {
  const v = variables[varId];
  const t = Math.max(0, Math.min(1, (value - v.min) / (v.max - v.min)));
  const stops = v.colors;
  let i = 0;
  while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
  if (i >= stops.length - 1) return stops[stops.length - 1][1];
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const f = (t - t0) / (t1 - t0);
  const rgb0 = hexToRgb(c0);
  const rgb1 = hexToRgb(c1);
  const r = Math.round(rgb0[0] + (rgb1[0] - rgb0[0]) * f);
  const g = Math.round(rgb0[1] + (rgb1[1] - rgb0[1]) * f);
  const b = Math.round(rgb0[2] + (rgb1[2] - rgb0[2]) * f);
  return `rgb(${r},${g},${b})`;
}

export function getVariableColorRgb(varId, value) {
  const v = variables[varId];
  const t = Math.max(0, Math.min(1, (value - v.min) / (v.max - v.min)));
  const stops = v.colors;
  let i = 0;
  while (i < stops.length - 1 && stops[i + 1][0] < t) i++;
  if (i >= stops.length - 1) return hexToRgb(stops[stops.length - 1][1]);
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const f = (t - t0) / (t1 - t0);
  const rgb0 = hexToRgb(c0);
  const rgb1 = hexToRgb(c1);
  return [
    Math.round(rgb0[0] + (rgb1[0] - rgb0[0]) * f),
    Math.round(rgb0[1] + (rgb1[1] - rgb0[1]) * f),
    Math.round(rgb0[2] + (rgb1[2] - rgb0[2]) * f),
  ];
}

// ─── Measurement Readings (all variables at a point) ────────────

export function getAllReadings(lat, lon) {
  const now = new Date();
  const timeString = now.toISOString().slice(11, 19) + " UTC";

  const entries = [
    { id: "time", name: "Time", value: timeString, unit: "" },
    { id: "lat", name: "Latitude", value: lat.toFixed(2) + "°", unit: "" },
    { id: "lon", name: "Longitude", value: lon.toFixed(2) + "°", unit: "" },
  ];

  const varIds = ["sst", "turbidity", "ph"];
  for (const id of varIds) {
    const v = variables[id];
    const val = getVariableValue(id, lat, lon);
    let display;
    if (id === "ph") display = val.toFixed(2);
    else display = val.toFixed(1);
    entries.push({ id, name: v.name, value: display, unit: v.unit });
  }

  return entries;
}

// ─── NEMO Float ─────────────────────────────────────────────────
// Simulated Argo-style profiling float trajectory
// Drift pattern follows the North Atlantic subtropical gyre
// Reference: Argo program — https://argo.ucsd.edu

export const nemoFloat = {
  id: "NEMO-7B",
  status: "Active",
  depth: "1200 m",
  deployed: "2026-01-15",
  battery: "74%",
  waypoints: [
    { lat: 43.2, lon: -54.0, date: "Jan 15" },
    { lat: 42.5, lon: -50.3, date: "Jan 22" },
    { lat: 41.6, lon: -47.1, date: "Jan 30" },
    { lat: 40.3, lon: -44.5, date: "Feb 07" },
    { lat: 39.8, lon: -41.8, date: "Feb 14" },
    { lat: 38.9, lon: -39.2, date: "Feb 22" },
    { lat: 37.4, lon: -37.0, date: "Mar 01" },
    { lat: 36.5, lon: -34.5, date: "Mar 08" },
    { lat: 35.8, lon: -32.1, date: "Mar 15" },
  ],
};

// ─── Alerts ─────────────────────────────────────────────────────

export const alerts = [
  { label: "SST anomaly +2.4°C", region: "Equatorial Pacific", level: "warn" },
  { label: "Turbidity spike", region: "Amazon Plume", level: "medium" },
  { label: "pH drop below 7.85", region: "Southern Ocean 62°S", level: "medium" },
];

// ─── Mission Tracks ─────────────────────────────────────────────

export const missionTracks = [
  { label: "Global SST Assimilation", progress: 86 },
  { label: "Current Vector Reconstruction", progress: 71 },
  { label: "Anomaly Validation Queue", progress: 58 },
];

// ─── Pass Queue ─────────────────────────────────────────────────

export const passQueue = [
  { id: "AQUA-241", region: "South Pacific", eta: "02:14" },
  { id: "S3B-118", region: "Indian Ocean", eta: "04:02" },
  { id: "JPSS-061", region: "North Atlantic", eta: "06:27" },
];
