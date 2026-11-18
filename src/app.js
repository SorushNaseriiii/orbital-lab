import { OrbitMath as M } from './core/math.js';
import { OrbitPhysics as P } from './core/orbit.js';
import { OrbitalRenderer as Renderer } from './scene/OrbitalRenderer.js';

const $ = (id) => document.getElementById(id);
const q = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'orbital-lab-settings-v106';
const LEGACY_STORAGE_KEY = 'orbital-lab-settings-v105';
const OLDER_STORAGE_KEY = 'orbital-lab-settings-v104';
const THIRD_OLDEST_STORAGE_KEY = 'orbital-lab-settings-v103';
const OLDEST_STORAGE_KEY = 'orbital-lab-settings-v102';
const persianDateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { day: 'numeric', month: 'long' });
const H_SLIDER_STEPS = 1000;
const SOLAR_YEAR_START_UTC = Date.UTC(2026, 2, 21, 12, 0, 0);
const SOLAR_YEAR_DAYS = 365;
const DAY_MS = 86400000;

function solarDateFromDayIndex(dayIndex) {
  const index = M.clamp(Number(dayIndex) || 0, 0, SOLAR_YEAR_DAYS - 1);
  return new Date(SOLAR_YEAR_START_UTC + index * DAY_MS);
}

function solarDayIndexFromDate(date) {
  const value = new Date(date);
  const dayStart = Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0);
  return M.clamp(
    Math.round((dayStart - SOLAR_YEAR_START_UTC) / DAY_MS),
    0,
    SOLAR_YEAR_DAYS - 1
  );
}
let textureRefreshTimer = null;

const state = {
  bodyKey: 'earth',
  target: P.defaultElements('earth'),
  display: P.defaultElements('earth'),
  running: false,
  speed: 600,
  timeSec: 0,
  lastFrame: 0,
  pulseStart: 0,
  renderer: null,
  settings: null,
  viewMode: 'earth',
  plotFrameCounter: 0,
  plotGeometry: null
};

const sliderMap = { h: 'h', e: 'e', i: 'i', raan: 'raan', argp: 'argp', theta: 'theta' };
const visualDefaults = JSON.parse(JSON.stringify(Renderer.defaults));
const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultSettings() {
  return {
    planetOpacity: 1,
    textureStrength: 1,
    atmosphereOpacity: 0.15,
    showAtmosphere: true,
    glowOnChange: true,
    equatorialScale: 1.35,
    showEarthSolarOrbit: false,
    rangeSettings: { hMin: 1e10, hMax: 2.8e11, eMin: 0, eMax: 1.5 },
    angleAnnotations: { raan: true, inclination: true, argp: true, theta: true },
    visuals: clone(visualDefaults)
  };
}

function mergeSettings(base, stored) {
  const out = clone(base);
  if (!stored || typeof stored !== 'object') return out;
  for (const key of ['planetOpacity', 'textureStrength', 'atmosphereOpacity', 'showAtmosphere', 'glowOnChange', 'equatorialScale', 'showEarthSolarOrbit']) {
    if (stored[key] !== undefined) out[key] = stored[key];
  }
  if (stored.rangeSettings) out.rangeSettings = { ...out.rangeSettings, ...stored.rangeSettings };
  if (stored.angleAnnotations) out.angleAnnotations = { ...out.angleAnnotations, ...stored.angleAnnotations };
  if (stored.visuals) {
    for (const key of Object.keys(out.visuals)) {
      if (stored.visuals[key]) out.visuals[key] = { ...out.visuals[key], ...stored.visuals[key] };
    }
  }
  return out;
}

function loadSettings() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    let legacy = null;
    let legacyVersion = null;
    if (!current) {
      legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) legacyVersion = 'v105';
      else {
        legacy = localStorage.getItem(OLDER_STORAGE_KEY);
        if (legacy) legacyVersion = 'v104';
        else {
          legacy = localStorage.getItem(THIRD_OLDEST_STORAGE_KEY);
          if (legacy) legacyVersion = 'v103';
          else {
            legacy = localStorage.getItem(OLDEST_STORAGE_KEY);
            if (legacy) legacyVersion = 'v102';
          }
        }
      }
    }
    const stored = JSON.parse(current || legacy || 'null');
    const merged = mergeSettings(defaultSettings(), stored);
   if (stored) {
  if (merged.atmosphereOpacity === 0.58) {
    merged.atmosphereOpacity = 0.15;
  }

  if (merged.visuals?.equatorialPlane?.opacity === 0.075) {
    merged.visuals.equatorialPlane.opacity = 0.04;
  }
}

if (!current) {
  // v1.0.4 introduced the 10% Sun-direction default; preserve any custom v1.0.4 setting.
  if (legacyVersion === 'v103' || legacyVersion === 'v102') merged.visuals.sunDirection.opacity = 0.10;

  // v1.0.2 could persist Orbital Plane as visible; migrate that old default only.
  if (legacyVersion === 'v102') merged.visuals.orbitalPlane.visible = false;
}
    return merged;
  } catch {
    return defaultSettings();
  }
}

function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings)); }
  catch { /* Storage may be unavailable in private or file contexts. */ }
}

function superscript(value) {
  return String(value).replace(/-/g, '⁻').replace(/0/g, '⁰').replace(/1/g, '¹').replace(/2/g, '²').replace(/3/g, '³').replace(/4/g, '⁴').replace(/5/g, '⁵').replace(/6/g, '⁶').replace(/7/g, '⁷').replace(/8/g, '⁸').replace(/9/g, '⁹');
}

function formatH(value) {
  const exponent = Math.floor(Math.log10(Math.abs(value) || 1));
  const coefficient = value / Math.pow(10, exponent);
  return `${coefficient.toFixed(2)} × 10${superscript(exponent)}`;
}

function formatTime(seconds, period) {
  const sign = seconds < 0 ? '−' : '+';
  const t = Math.abs(seconds);
  const cycle = Number.isFinite(period) && period > 0 ? t % period : t;
  let whole = Math.floor(cycle);
  const days = Math.floor(whole / 86400); whole %= 86400;
  const hours = Math.floor(whole / 3600); whole %= 3600;
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return days ? `T${sign} ${days}d ${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `T${sign} ${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${String(secs).padStart(2, '0')}s`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${String(hours).padStart(2, '0')}h`;
}

function formatKm(metres) {
  return `${(metres / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 })} km`;
}

function formatComponent(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1e-12) return '0.00';
  return `${value < 0 ? '−' : '+'}${Math.abs(value).toExponential(2).replace('e+', 'e')}`;
}

function currentHBounds() {
  const ranges = state.settings?.rangeSettings || { hMin: 1e10, hMax: 2.8e11 };
  return P.getHBounds('earth', state.target?.e ?? 0.2, ranges.hMin, ranges.hMax);
}

function hToSlider(value) {
  const bounds = currentHBounds();
  const ratio = Math.log(value / bounds.min) / Math.log(bounds.max / bounds.min);
  return M.clamp(ratio * H_SLIDER_STEPS, 0, H_SLIDER_STEPS);
}

function sliderToH(sliderValue) {
  const bounds = currentHBounds();
  const ratio = M.clamp(Number(sliderValue) / H_SLIDER_STEPS, 0, 1);
  return bounds.min * Math.pow(bounds.max / bounds.min, ratio);
}

function updateRangeFill(input) {
  const min = Number(input.min), max = Number(input.max), value = Number(input.value);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty('--range-progress', `${M.clamp(percent, 0, 100)}%`);
}

function setSlider(key, value) {
  const input = $(`slider-${key}`);
  if (!input) return;
  input.value = String(key === 'h' ? hToSlider(value) : value);
  updateRangeFill(input);
}

function syncHBounds() {
  const bounds = currentHBounds();
  const input = $('slider-h');
  input.min = '0';
  input.max = String(H_SLIDER_STEPS);
  input.step = '1';
  $('min-h').textContent = formatH(bounds.min);
  $('max-h').textContent = formatH(bounds.max);
}

function updateConicRange() {
  const input = $('slider-theta');
  const limits = input.parentElement.querySelector('.element-limits');
  if (state.target.e < 1 - 1e-8) {
    input.min = '0'; input.max = '360';
    limits.innerHTML = '<span>0° · PERIGEE</span><span>°</span><span>360°</span>';
    state.target.theta = M.mod(state.target.theta, 360);
  } else if (state.target.e > 1 + 1e-8) {
    const asymptote = Math.acos(-1 / state.target.e) * M.RAD;
    const safeLimit = asymptote * 0.94;
    input.min = String(-safeLimit); input.max = String(safeLimit);
    limits.innerHTML = `<span>−${safeLimit.toFixed(1)}°</span><span>ASYMPTOTE ±${asymptote.toFixed(1)}°</span><span>+${safeLimit.toFixed(1)}°</span>`;
    state.target.theta = M.clamp(state.target.theta, -safeLimit, safeLimit);
  } else {
    input.min = '-160'; input.max = '160';
    limits.innerHTML = '<span>−160°</span><span>PERIGEE</span><span>+160°</span>';
    state.target.theta = M.clamp(state.target.theta, -155, 155);
  }
  updateRangeFill(input);
}

function syncElementControls() {
  syncHBounds();
  $('slider-e').min = String(state.settings.rangeSettings.eMin);
  $('slider-e').max = String(state.settings.rangeSettings.eMax);
  $('min-e').textContent = Number(state.settings.rangeSettings.eMin).toFixed(2);
  $('max-e').textContent = Number(state.settings.rangeSettings.eMax).toFixed(2);
  updateConicRange();
  for (const key of Object.keys(sliderMap)) {
    setSlider(key, state.target[key]);
    const output = $(`value-${key}`);
    if (!output) continue;
    if (key === 'h') output.textContent = formatH(state.target.h);
    else if (key === 'e') output.textContent = state.target.e.toFixed(3);
    else output.textContent = `${state.target[key].toFixed(2)}°`;
  }
  $('slider-theta').disabled = state.running;
  $('animateToggle').checked = state.running;
  $('timeScale').value = String(state.speed);
}

function updateTargetFromUI(key, sliderValue) {
  const value = key === 'h' ? sliderToH(sliderValue) : sliderValue;
  if (key === 'h' || key === 'e') {
    const currentTheta = state.target.theta;
    state.target[key] = value;
    if (key === 'e') {
      updateConicRange();
      state.display.theta = state.target.theta;
      const safeBounds = currentHBounds();
      if (state.target.h < safeBounds.min) state.target.h = safeBounds.min;
      if (state.target.h > safeBounds.max) state.target.h = safeBounds.max;
      syncHBounds();
      setSlider('h', state.target.h);
    }
    if (state.running) state.timeSec = P.timeSincePerigee(state.target.theta, state.target, state.bodyKey);
  } else {
    state.target[key] = value;
  }
  if (!state.running) state.timeSec = P.timeSincePerigee(state.target.theta, state.target, state.bodyKey);
  state.pulseStart = performance.now();
  if (state.settings.glowOnChange) state.renderer.pulseStart = state.pulseStart;
  const output = $(`value-${key}`);
  if (output) output.textContent = key === 'h' ? formatH(value) : key === 'e' ? value.toFixed(3) : `${value.toFixed(2)}°`;
}

function updateSolarDateReadout() {
  const dateOutput = $('solarDateValue');
  if (!dateOutput) return;

  const simulationDate = state.renderer?.getSimulationDate?.(state.timeSec) || new Date();
  dateOutput.textContent = persianDateFormatter.format(simulationDate);
  dateOutput.dateTime = simulationDate.toISOString();

  const slider = $('solarDateSlider');
  const pickerValue = $('solarDatePickerValue');
  const startValue = $('solarDateStart');
  const endValue = $('solarDateEnd');

  if (!slider) return;

  const dayIndex = solarDayIndexFromDate(simulationDate);

  slider.value = String(dayIndex);

  if (pickerValue) {
    pickerValue.textContent = persianDateFormatter.format(solarDateFromDayIndex(dayIndex));
  }

  if (startValue) {
    startValue.textContent = persianDateFormatter.format(solarDateFromDayIndex(0));
  }

  if (endValue) {
    endValue.textContent = persianDateFormatter.format(solarDateFromDayIndex(SOLAR_YEAR_DAYS - 1));
  }
}

function renderVectors(elements) {
  const orbitalState = P.state(elements, state.bodyKey, elements.theta);
  const renderComponent = (axis, value, vectorName, frameName) => `<span title="${vectorName} · ${axis} component · ${frameName}">${axis}<b>${formatComponent(value)}</b></span>`;
  $('positionVector').innerHTML = ['X', 'Y', 'Z'].map((axis, index) => renderComponent(axis, orbitalState.r[index], 'Position vector r', 'ECI')).join('');
  $('velocityVector').innerHTML = ['X', 'Y', 'Z'].map((axis, index) => renderComponent(axis, orbitalState.v[index], 'Velocity vector v', 'ECI')).join('');
  $('positionMagnitudeValue').innerHTML = `${orbitalState.radius.toFixed(1)} <small>m</small>`;
  $('speedValue').innerHTML = `${orbitalState.speed.toFixed(1)} <small>m/s</small>`;

  const metrics = P.orbitalMetrics(elements, state.bodyKey);
  $('semiMajorValue').textContent = metrics.isParabolic ? '∞' : formatKm(metrics.a);
  $('perigeeValue').textContent = formatKm(metrics.perigeeAltitude);
  $('apogeeValue').textContent = metrics.isElliptic ? formatKm(metrics.apogeeAltitude) : 'OPEN';
  $('periodReadout').textContent = metrics.isElliptic ? formatDuration(metrics.period) : 'NON-PERIODIC';
  $('timeReadout').textContent = formatTime(state.timeSec, metrics.period);
  updateSolarDateReadout();

  const status = $('orbitStatus');
  if (metrics.perigeeAltitude <= 0) {
    status.textContent = 'BODY INTERSECTION';
    status.dataset.state = 'invalid';
  } else if (metrics.isHyperbolic) {
    status.textContent = 'HYPERBOLIC ESCAPE';
    status.dataset.state = 'special';
  } else if (metrics.isParabolic) {
    status.textContent = 'PARABOLIC TRAJECTORY';
    status.dataset.state = 'special';
  } else if (elements.e < 1e-4) {
    status.textContent = 'CIRCULAR · PERIGEE UNDEFINED';
    status.dataset.state = 'special';
  } else if (Math.abs(Math.sin(elements.i * M.DEG)) < 1e-4) {
    status.textContent = 'EQUATORIAL · REFERENCE NODE';
    status.dataset.state = 'special';
  } else {
    status.textContent = 'VALID ELLIPTIC ORBIT';
    status.dataset.state = 'valid';
  }
  document.querySelector('.scene-time .readout-label').textContent = elements.e < 1e-4 ? 'TIME FROM REFERENCE' : 'TIME FROM PERIGEE';
}

function updateSimulationUI() {
  $('simulationStrip').classList.toggle('running', state.running);
  $('simStateText').textContent = state.running ? 'RUNNING' : 'PAUSED';
  $('animateToggle').checked = state.running;
  $('slider-theta').disabled = state.running;
}

function toggleAnimation(enabled) {
  if (enabled === state.running) return;
  if (enabled) {
    state.timeSec = P.timeSincePerigee(state.target.theta, state.target, state.bodyKey);
    state.lastFrame = performance.now();
    state.running = true;
  } else {
    state.running = false;
    state.target.theta = P.thetaAtTime(state.timeSec, state.target, state.bodyKey);
  }
  updateSimulationUI();
}

function openSettings() {
  $('settingsOverlay').hidden = false;
  document.body.classList.add('settings-open');
  state.renderer?.refreshTooltipState?.();
}

function closeSettings() {
  $('settingsOverlay').hidden = true;
  document.body.classList.remove('settings-open');
}

function applySettings(refreshTexture = false) {
  state.renderer.setSettings(state.settings, false);
  if (refreshTexture) {
    window.clearTimeout(textureRefreshTimer);
    textureRefreshTimer = window.setTimeout(() => state.renderer?.refreshBodyTexture?.(), 45);
  }
  saveSettings();
}

function syncSettingsControls() {
  $('planetOpacity').value = state.settings.planetOpacity;
  $('planetOpacityValue').textContent = `${Math.round(state.settings.planetOpacity * 100)}%`;
  $('textureStrength').value = state.settings.textureStrength;
  $('textureStrengthValue').textContent = `${Math.round(state.settings.textureStrength * 100)}%`;
  $('atmosphereOpacity').value = state.settings.atmosphereOpacity;
  $('atmosphereOpacityValue').textContent = `${Math.round(state.settings.atmosphereOpacity * 100)}%`;
  $('equatorialScale').value = state.settings.equatorialScale;
  $('equatorialScaleValue').textContent = `${state.settings.equatorialScale.toFixed(2)}×`;
  $('rangeHMin').value = String(state.settings.rangeSettings.hMin);
  $('rangeHMax').value = String(state.settings.rangeSettings.hMax);
  $('rangeEMin').value = String(state.settings.rangeSettings.eMin);
  $('rangeEMax').value = String(state.settings.rangeSettings.eMax);
  $('showEarthSolarOrbit').checked = !!state.settings.showEarthSolarOrbit;
  $('atmosphereToggle').checked = state.settings.showAtmosphere;
  $('changeGlowToggle').checked = state.settings.glowOnChange;
  $('bodyTint').value = state.settings.visuals.body.color;
  for (const [key, checked] of Object.entries(state.settings.angleAnnotations)) {
    const input = $(`angle-${key}`);
    if (input) input.checked = checked;
  }
  ['planetOpacity', 'textureStrength', 'atmosphereOpacity', 'equatorialScale'].forEach((id) => updateRangeFill($(id)));

  document.querySelectorAll('.layer-setting').forEach((row) => {
    const visual = state.settings.visuals[row.dataset.key];
    if (!visual) return;
    row.querySelector('input[type="color"]').value = visual.color;
    row.querySelector('.layer-visible').checked = visual.visible;
    const legend = row.querySelector('.layer-legend');
    if (legend) legend.checked = visual.legend !== false;
    const range = row.querySelector('input[type="range"]');
    range.value = visual.opacity;
    row.querySelector('.layer-opacity-value').textContent = `${Math.round(visual.opacity * 100)}%`;
    updateRangeFill(range);
  });
  state.renderer.setSettings(state.settings, false);
}

function buildLayerSettings() {
  const host = $('layerSettingsList');
  host.innerHTML = '';
  const keys = ['orbit', 'orbitalPlane', 'equatorialPlane', 'eclipticPlane', 'rVector', 'vVector', 'hVector', 'eVector', 'nodeLine', 'satellite', 'trail', 'axes', 'atmosphere', 'sunDirection'];
  for (const key of keys) {
    const visual = state.settings.visuals[key];
    if (!visual) continue;
    const row = document.createElement('div');
    row.className = 'layer-setting';
    row.dataset.key = key;
    const supportsLegend = ['rVector','vVector','hVector','eVector','axes'].includes(key);
    row.innerHTML = `
      <div class="layer-setting-main"><input type="color" aria-label="${visual.label} color" value="${visual.color}"><span>${visual.label}</span></div>
      <label class="layer-visibility"><input class="layer-visible" type="checkbox" ${visual.visible ? 'checked' : ''}> SHOW</label>
      ${supportsLegend ? `<label class="layer-visibility"><input class="layer-legend" type="checkbox" ${visual.legend !== false ? 'checked' : ''}> LEGEND</label>` : ''}
      <div class="layer-opacity-label"><span>OPACITY</span><span class="layer-opacity-value">${Math.round(visual.opacity * 100)}%</span></div>
      <input type="range" min="0" max="1" step="0.01" value="${visual.opacity}" aria-label="${visual.label} opacity">`;
    const color = row.querySelector('input[type="color"]');
    const visible = row.querySelector('.layer-visible');
    const range = row.querySelector('input[type="range"]');
    color.addEventListener('input', () => { state.settings.visuals[key].color = color.value; applySettings(); });
    visible.addEventListener('change', () => { state.settings.visuals[key].visible = visible.checked; applySettings(); });
    const legend = row.querySelector('.layer-legend');
    if (legend) legend.addEventListener('change', () => { state.settings.visuals[key].legend = legend.checked; applySettings(); });
    range.addEventListener('input', () => {
      state.settings.visuals[key].opacity = Number(range.value);
      row.querySelector('.layer-opacity-value').textContent = `${Math.round(Number(range.value) * 100)}%`;
      updateRangeFill(range);
      applySettings();
    });
    updateRangeFill(range);
    host.appendChild(row);
  }
}

function initSettings() {
  $('settingsOpen').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  $('settingsBackdrop').addEventListener('click', closeSettings);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('settingsOverlay').hidden) closeSettings();
  });

  const tabPanels = { display: 'settingsDisplay', layers: 'settingsLayers', angles: 'settingsAngles' };
  document.querySelectorAll('.settings-tab').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.settings-tab').forEach((tab) => tab.classList.toggle('active', tab === button));
    for (const [key, panelId] of Object.entries(tabPanels)) $(panelId).hidden = button.dataset.tab !== key;
  }));

  $('planetOpacity').addEventListener('input', (event) => {
    state.settings.planetOpacity = Number(event.target.value);
    $('planetOpacityValue').textContent = `${Math.round(state.settings.planetOpacity * 100)}%`;
    updateRangeFill(event.target); applySettings();
  });
  $('textureStrength').addEventListener('input', (event) => {
    state.settings.textureStrength = Number(event.target.value);
    $('textureStrengthValue').textContent = `${Math.round(state.settings.textureStrength * 100)}%`;
    updateRangeFill(event.target); applySettings(true);
  });
  $('atmosphereOpacity').addEventListener('input', (event) => {
    state.settings.atmosphereOpacity = Number(event.target.value);
    $('atmosphereOpacityValue').textContent = `${Math.round(state.settings.atmosphereOpacity * 100)}%`;
    updateRangeFill(event.target); applySettings();
  });
  $('equatorialScale').addEventListener('input', (event) => {
    state.settings.equatorialScale = Number(event.target.value);
    $('equatorialScaleValue').textContent = `${state.settings.equatorialScale.toFixed(2)}×`;
    updateRangeFill(event.target); applySettings();
  });
  $('atmosphereToggle').addEventListener('change', (event) => { state.settings.showAtmosphere = event.target.checked; applySettings(); });
  $('changeGlowToggle').addEventListener('change', (event) => { state.settings.glowOnChange = event.target.checked; applySettings(); });
  $('showEarthSolarOrbit').addEventListener('change', (event) => { state.settings.showEarthSolarOrbit = event.target.checked; applySettings(); });
  $('bodyTint').addEventListener('input', (event) => { state.settings.visuals.body.color = event.target.value; applySettings(true); });
  const applyRanges = () => {
    const ranges = state.settings.rangeSettings;
    ranges.eMin = M.clamp(Number($('rangeEMin').value) || 0, 0, 0.99);
    ranges.eMax = M.clamp(Number($('rangeEMax').value) || 1.5, Math.max(0.01, ranges.eMin + 0.01), 3);
    ranges.hMin = Math.max(1e9, Number($('rangeHMin').value) || 1e10);
    ranges.hMax = Math.max(ranges.hMin * 1.01, Number($('rangeHMax').value) || 2.8e11);
    state.target.e = M.clamp(state.target.e, ranges.eMin, ranges.eMax);
    const safe = currentHBounds();
    state.target.h = M.clamp(state.target.h, safe.min, safe.max);
    state.display = clone(state.target);
    state.timeSec = P.timeSincePerigee(state.target.theta, state.target, 'earth');
    syncElementControls();
    renderVectors(state.target);
    state.renderer.setState(state.display, state.timeSec, state.running, state.speed, state.pulseStart);
    saveSettings();
  };
  ['rangeHMin','rangeHMax','rangeEMin','rangeEMax'].forEach((id) => $(id).addEventListener('change', applyRanges));
  for (const key of Object.keys(state.settings.angleAnnotations)) {
    $(`angle-${key}`).addEventListener('change', (event) => {
      state.settings.angleAnnotations[key] = event.target.checked;
      applySettings();
    });
  }

  $('restoreSettings').addEventListener('click', () => {
    const defaults = defaultSettings();
    for (const key of ['planetOpacity', 'textureStrength', 'atmosphereOpacity', 'showAtmosphere', 'glowOnChange', 'equatorialScale', 'showEarthSolarOrbit', 'rangeSettings', 'angleAnnotations']) {
      state.settings[key] = clone(defaults[key]);
    }
    state.settings.visuals.body.color = defaults.visuals.body.color;
    syncSettingsControls(); applySettings(true);
  });
  $('restoreLayerDefaults').addEventListener('click', () => {
    state.settings.visuals = clone(visualDefaults);
    buildLayerSettings(); syncSettingsControls(); saveSettings();
  });

  buildLayerSettings();
  syncSettingsControls();
}

function setViewMode(mode) {
  state.viewMode = mode === '2d' ? '2d' : 'earth';
  state.renderer.setViewMode(state.viewMode);
  const toggle = $('sunViewToggle');
  const label = $('sunViewToggleLabel');
  if (toggle) {
    toggle.classList.toggle('active', state.viewMode === '2d');
    toggle.dataset.mode = state.viewMode;
  }
  if (label) label.textContent = state.viewMode === '2d' ? 'EARTH VIEW' : '2D VIEW';

  $('referenceFrameName').textContent = state.viewMode === '2d' ? 'ORBITAL PLANE NORMAL' : 'GEOCENTRIC INERTIAL';
  $('frameCoordinates').textContent = state.viewMode === '2d'
    ? 'Fixed normal view · orbital plane'
    : 'X · vernal equinox · Y · 90° E · Z · north';
  $('bodyNameHud').textContent = 'EARTH';
  $('bodyMetaHud').textContent = 'μ 3.986 × 10¹⁴ m³/s²';

  const metrics = P.orbitalMetrics(state.display, 'earth');
  $('orbitStatus').textContent = metrics.perigeeAltitude <= 0
    ? 'BODY INTERSECTION'
    : metrics.isHyperbolic ? 'HYPERBOLIC ESCAPE'
    : metrics.isParabolic ? 'PARABOLIC TRAJECTORY'
    : 'VALID ELLIPTIC ORBIT';
  $('orbitStatus').dataset.state = metrics.isElliptic && metrics.perigeeAltitude > 0 ? 'valid' : 'special';
  document.querySelector('.scene-time .readout-label').textContent = 'TIME FROM PERIGEE';
  document.querySelector('.scene-period .readout-label').textContent = 'ORBITAL PERIOD';
  $('frameSubtitle').textContent = state.viewMode === '2d' ? '2D ORBITAL VIEW' : 'ECI FRAME';
  $('frameLabel').textContent = 'ECI · CARTESIAN';
  syncPlotOptions();
  if (!$('plotDock').hidden) drawPlot();
  renderVectors(state.display);
}

function syncPlotOptions() {
  const select = $('plotType');
  const current = select.value;
  const options = [
    ['speed', 'Speed vs time'],
    ['radius', 'Radius vs time'],
    ['anomaly', 'True anomaly vs time']
  ];
  select.innerHTML = options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  if (options.some(([value]) => value === current)) select.value = current;
  $('plotTitle').textContent = 'ORBITAL PLOTS';
}

function plotSeries() {
  const mode = $('plotType').value;
  const el = state.display;
  const metrics = P.orbitalMetrics(el, 'earth');
  const points = [];
  const unit = mode === 'speed' ? 'km/s' : mode === 'radius' ? 'km' : 'deg';

  if (metrics.isElliptic) {
    const period = metrics.period;
    const currentTime = state.timeSec;
    const start = currentTime - period;
    const end = currentTime + period;
    const samples = 720;
    for (let index = 0; index <= samples; index++) {
      const t = start + (end - start) * index / samples;
      const theta = P.thetaAtTime(t, el, 'earth');
      const sample = P.state(el, 'earth', theta);
      const y = mode === 'speed' ? sample.speed / 1000 : mode === 'radius' ? sample.radius / 1000 : theta;
      points.push({ x: t / 86400, y });
    }
    const currentDays = currentTime / 86400;
    const periodDays = period / 86400;
    const nearestPerigee = Math.round(currentTime / period) * period;
    const nearestApogee = (Math.round((currentTime - period / 2) / period) * period) + period / 2;
    return {
      points,
      xLabel: 'Days from perigee',
      yLabel: unit,
      currentX: currentDays,
      perigeeX: nearestPerigee / 86400,
      apogeeX: nearestApogee / 86400
    };
  }

  const limit = metrics.isHyperbolic ? Math.acos(-1 / el.e) * M.RAD * 0.94 : 155;
  for (let index = 0; index <= 720; index++) {
    const theta = -limit + (2 * limit * index / 720);
    const sample = P.state(el, 'earth', theta);
    points.push({
      x: theta,
      y: mode === 'speed' ? sample.speed / 1000 : mode === 'radius' ? sample.radius / 1000 : theta
    });
  }
  return { points, xLabel: 'True anomaly', yLabel: unit, currentX: state.display.theta, perigeeX: 0, apogeeX: null };
}

function modeAxisLabel(unit) { return unit === 'deg' ? 'True anomaly (deg)' : unit === 'km/s' ? 'Speed (km/s)' : 'Radius (km)'; }

function drawPlot() {
  const canvas = $('plotCanvas');
  if (!canvas || $('plotDock').hidden) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width*ratio));
  canvas.height = Math.max(1, Math.floor(rect.height*ratio));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio,0,0,ratio,0,0);
  const width=rect.width, height=rect.height, pad={l:48,r:16,t:18,b:34};
  ctx.clearRect(0,0,width,height);
  const series=plotSeries(), pts=series.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  if (pts.length<2) return;
  const xmin=Math.min(...pts.map(p=>p.x)), xmax=Math.max(...pts.map(p=>p.x));
  let ymin=Math.min(...pts.map(p=>p.y)), ymax=Math.max(...pts.map(p=>p.y));
  if (ymax-ymin<1e-9) { ymin-=1; ymax+=1; }
  const ypad=(ymax-ymin)*.12; ymin-=ypad; ymax+=ypad;
  const xmap=x=>pad.l+(x-xmin)/(xmax-xmin||1)*(width-pad.l-pad.r);
  const ymap=y=>height-pad.b-(y-ymin)/(ymax-ymin)*(height-pad.t-pad.b);
  state.plotGeometry = { series, pts, pad, width, height, xmap, ymap };
  ctx.strokeStyle='rgba(140,166,198,.15)'; ctx.lineWidth=1;
  ctx.fillStyle='#8092aa'; ctx.font='10px ui-monospace, monospace';
  for(let i=0;i<=4;i++) { const y=pad.t+(height-pad.t-pad.b)*i/4; ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(width-pad.r,y);ctx.stroke(); const val=ymax-(ymax-ymin)*i/4;ctx.fillText(val.toFixed(2),5,y+3); }
  ctx.beginPath(); pts.forEach((p,i)=>{const x=xmap(p.x),y=ymap(p.y);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
  ctx.strokeStyle='#6bd8ed';ctx.lineWidth=2.2;ctx.shadowColor='rgba(107,216,237,.45)';ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0;
  if (Number.isFinite(series.perigeeX)) {
    const px = xmap(series.perigeeX);
    ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(244,199,109,.82)'; ctx.beginPath(); ctx.moveTo(px,pad.t); ctx.lineTo(px,height-pad.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#f4c76d'; ctx.fillText('Perigee', M.clamp(px + 5, pad.l + 3, width - 58), pad.t + 11);
  }
  if (Number.isFinite(series.apogeeX)) {
    const ax = xmap(series.apogeeX);
    ctx.setLineDash([3,4]); ctx.strokeStyle='rgba(155,140,255,.78)'; ctx.beginPath(); ctx.moveTo(ax,pad.t); ctx.lineTo(ax,height-pad.b); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#b9a9ff'; ctx.fillText('Apogee', M.clamp(ax + 5, pad.l + 3, width - 55), pad.t + 23);
  }
  if (Number.isFinite(series.currentX)) {
    const index = Math.max(0, Math.min(pts.length - 1, Math.round(((series.currentX - xmin) / (xmax - xmin || 1)) * (pts.length - 1))));
    const cp = pts[index]; const cx = xmap(series.currentX); const cy = ymap(cp.y);
    ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.fillStyle='#ffffff'; ctx.shadowColor='rgba(255,255,255,.48)'; ctx.shadowBlur=9; ctx.fill(); ctx.shadowBlur=0;
  }
  ctx.fillStyle='#91a4bd'; ctx.textAlign='center'; ctx.fillText(series.xLabel, width/2, height-7); ctx.textAlign='left';
  ctx.save(); ctx.translate(13,height/2); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.fillText(modeAxisLabel(series.yLabel),0,0); ctx.restore();
}

function handlePlotPointer(event) {
  const geometry = state.plotGeometry;
  const tooltip = $('plotTooltip');
  if (!geometry || $('plotDock').hidden) { tooltip.hidden = true; return; }
  const rect = $('plotCanvas').getBoundingClientRect();
  const x = event.clientX - rect.left;
  const usable = geometry.width - geometry.pad.l - geometry.pad.r;
  const ratio = M.clamp((x - geometry.pad.l) / usable, 0, 1);
  const index = Math.round(ratio * (geometry.pts.length - 1));
  const point = geometry.pts[index];
  if (!point) { tooltip.hidden = true; return; }
  tooltip.innerHTML = `${point.x.toFixed(2)} ${geometry.series.xLabel}<br><strong>${point.y.toFixed(3)}</strong> ${geometry.series.yLabel}`;
  tooltip.style.left = `${M.clamp(x + 12, 8, rect.width - 170)}px`;
  tooltip.style.top = `${$('plotCanvas').offsetTop + M.clamp(event.clientY - rect.top - 42, 6, rect.height - 58)}px`;
  tooltip.hidden = false;
}

function initPlotDragging() {
  const dock = $('plotDock');
  const head = dock?.querySelector('.plot-dock-head');
  if (!dock || !head) return;
  let dragging = false;
  let startX = 0, startY = 0, baseX = 0, baseY = 0;
  head.addEventListener('pointerdown', (event) => {
    if (event.target.closest('select,button')) return;
    dragging = true;
    dock.classList.add('dragging');
    const rect = dock.getBoundingClientRect();
    const parentRect = dock.offsetParent.getBoundingClientRect();
    startX = event.clientX; startY = event.clientY; baseX = rect.left - parentRect.left; baseY = rect.top - parentRect.top;
    dock.style.left = `${baseX}px`; dock.style.top = `${baseY}px`;
    dock.style.right = 'auto'; dock.style.bottom = 'auto';
    head.setPointerCapture?.(event.pointerId);
  });
  head.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const parentRect = dock.offsetParent.getBoundingClientRect();
    const maxX = Math.max(8, parentRect.width - dock.offsetWidth - 8);
    const maxY = Math.max(8, parentRect.height - dock.offsetHeight - 8);
    dock.style.left = `${M.clamp(baseX + event.clientX - startX, 8, maxX)}px`;
    dock.style.top = `${M.clamp(baseY + event.clientY - startY, 8, maxY)}px`;
  });
  const stop = (event) => {
    dragging = false;
    dock.classList.remove('dragging');
    head.releasePointerCapture?.(event.pointerId);
  };
  head.addEventListener('pointerup', stop);
  head.addEventListener('pointercancel', stop);
}

function initControls() {
  for (const key of Object.keys(sliderMap)) {
    const input = $(`slider-${key}`);
    input.addEventListener('input', () => {
      if (state.running && key === 'theta') return;
      updateTargetFromUI(key, Number(input.value));
      updateRangeFill(input);
    });
    updateRangeFill(input);
  }

  $('animateToggle').addEventListener('change', (event) => toggleAnimation(event.target.checked));
  $('timeScale').addEventListener('change', (event) => { state.speed = Number(event.target.value); });
  $('resetButton').addEventListener('click', () => {
    state.running = false;
    state.target = P.defaultElements('earth');
    state.display = clone(state.target);
    state.timeSec = P.timeSincePerigee(state.target.theta, state.target, 'earth');
    state.pulseStart = performance.now();
    syncElementControls(); updateSimulationUI(); renderVectors(state.display);
    state.renderer.resetTrail();
  });

  $('sunViewToggle').addEventListener('click', () => { setViewMode(state.viewMode === 'earth' ? '2d' : 'earth'); });
  $('sceneCanvas').addEventListener('orbital-camera-home', () => setViewMode('earth'));
  $('plotToggle').addEventListener('click', () => {
    $('plotDock').hidden = !$('plotDock').hidden;
    if (!$('plotDock').hidden) { syncPlotOptions(); drawPlot(); }
  });
  $('plotDockClose').addEventListener('click', () => { $('plotDock').hidden = true; });
  $('plotType').addEventListener('change', drawPlot);
  $('plotCanvas').addEventListener('pointermove', handlePlotPointer);
  $('plotCanvas').addEventListener('pointerleave', () => { $('plotTooltip').hidden = true; });
  initPlotDragging();

  const fullscreenToggle = $('fullscreenToggle');
  const syncFullscreenLabel = () => {
    if (!fullscreenToggle) return;
    const active = !!document.fullscreenElement;
    fullscreenToggle.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenToggle.setAttribute('aria-label', fullscreenToggle.title);
    fullscreenToggle.classList.toggle('active', active);
  };
  fullscreenToggle?.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch (error) {
      console.info('[ORBITAL LAB] Fullscreen is not available in this browser context.', error);
    }
    syncFullscreenLabel();
  });
  document.addEventListener('fullscreenchange', syncFullscreenLabel);
  syncFullscreenLabel();

  initSettings();
}

function lerpAngle(current, target, alpha) {
  const delta = ((target - current + 540) % 360) - 180;
  return M.mod(current + delta * alpha, 360);
}

function animationFrame(now) {
  const dt = state.lastFrame ? Math.min((now - state.lastFrame) / 1000, 0.05) : 0.016;
  state.lastFrame = now;

  if (state.running) {
    state.timeSec += dt * state.speed;
    let nextTheta = P.thetaAtTime(state.timeSec, state.target, state.bodyKey);
    if (state.target.e >= 1 - 1e-8) {
      const limit = state.target.e > 1 + 1e-8 ? Math.acos(-1 / state.target.e) * M.RAD * 0.94 : 155;
      if (Math.abs(nextTheta) >= limit) {
        nextTheta = Math.sign(nextTheta || 1) * limit;
        state.timeSec = P.timeSincePerigee(nextTheta, state.target, state.bodyKey);
        state.running = false;
        updateSimulationUI();
      }
    }
    state.target.theta = nextTheta;
    setSlider('theta', state.target.theta);
    $('value-theta').textContent = `${state.target.theta.toFixed(2)}°`;
  }

  const alpha = 1 - Math.exp(-dt * 10.5);
  for (const key of Object.keys(sliderMap)) {
    if ((key === 'raan' || key === 'argp' || key === 'theta') && state.target.e < 1) state.display[key] = lerpAngle(state.display[key], state.target[key], alpha);
    else if (key === 'raan' || key === 'argp' || key === 'theta') state.display[key] = M.lerp(state.display[key], state.target[key], alpha);
    else state.display[key] = M.lerp(state.display[key], state.target[key], alpha);
  }
  if (!state.running) state.timeSec = P.timeSincePerigee(state.display.theta, state.display, 'earth');

  state.renderer.setState(state.display, state.timeSec, state.running, state.speed, state.pulseStart);
  renderVectors(state.display);
  state.renderer.render(now);
  if (!$('plotDock').hidden && (++state.plotFrameCounter % 8 === 0)) drawPlot();
  requestAnimationFrame(animationFrame);
}

function hideSplash() {
  const splash = $('splashScreen');
  if (!splash) return;
  window.setTimeout(() => {
    splash.classList.add('is-leaving');
    window.setTimeout(() => splash.remove(), 800);
  }, 1450);
}

function reportInitFailure(error) {
  console.error('[ORBITAL LAB] Initialization failed:', error);
  const loading = $('sceneLoading');
  if (loading) loading.classList.add('hidden');
  const sceneError = $('sceneError');
  if (sceneError) {
    sceneError.hidden = false;
    sceneError.textContent = `ORBITAL LAB could not start: ${error?.message || error || 'Unknown error'}`;
  }
  window.__ORBITAL_REPORT_BOOT_ERROR__?.(error);
}

function init() {
  try {
    state.settings = loadSettings();
    state.timeSec = P.timeSincePerigee(state.target.theta, state.target, 'earth');

    state.renderer = new Renderer($('sceneCanvas'));
    const textureWarning = $('textureWarning');
    $('sceneCanvas').addEventListener('earth-texture-fallback', () => {
      if (textureWarning) {
        textureWarning.textContent = 'Earth surface map unavailable. Check public/assets/earth-blue-marble.jpg, then reload the application.';
        textureWarning.hidden = false;
      }
    });
    $('sceneCanvas').addEventListener('earth-texture-loaded', () => {
      if (textureWarning) textureWarning.hidden = true;
    });
    state.renderer.setSettings(state.settings);
    state.renderer.setState(state.display, state.timeSec, false, state.speed, state.pulseStart);

    initControls();
    syncElementControls();
    setViewMode('earth');
    updateSimulationUI();
    renderVectors(state.display);
    state.renderer.pulseStart = performance.now();
    window.addEventListener('resize', () => { if (!$('plotDock').hidden) drawPlot(); });

    // Only dismiss the splash after the first successful WebGL frame.
    requestAnimationFrame((now) => {
      try {
        $('sceneLoading').classList.add('hidden');
        animationFrame(now);
        window.__ORBITAL_MARK_READY__?.();
        hideSplash();
      } catch (error) {
        reportInitFailure(error);
      }
    });
  } catch (error) {
    reportInitFailure(error);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
