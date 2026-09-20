/**
 * Resolution-specified PNG export (raster + path-traced beauty).
 *
 * The renderer backing store is temporarily resized to the export resolution
 * and the camera is re-framed to the export aspect, so raster exports are true
 * pixel-for-pixel renders and path-traced exports re-trace at the export
 * resolution instead of upscaling converged screen pixels. Everything
 * (pixel ratio, canvas size, camera projection) is restored afterwards.
 */

import {
  canvasImageData,
  compositeMatte,
  downloadBlob,
  encodePng,
  makeButtonLabeler,
  makeFilename,
  renderCoverage,
} from './saveImage.js';

const STORAGE_KEY = 'sigils.export.v1';
const MIN_DIM = 16;
const MAX_DIM = 8192;

const EXPORT_PRESETS = [
  ['view', 'View size'],
  ['1280x720', '1280 × 720 — 16:9'],
  ['1920x1080', '1920 × 1080 — 16:9'],
  ['2560x1440', '2560 × 1440 — 16:9'],
  ['3840x2160', '3840 × 2160 — 16:9'],
  ['1440x1080', '1440 × 1080 — 4:3'],
  ['1080x1080', '1080 × 1080 — 1:1'],
  ['1080x1920', '1080 × 1920 — 9:16'],
  ['custom', 'Custom'],
];

function clampDim(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MIN_DIM;
  return Math.min(MAX_DIM, Math.max(MIN_DIM, n));
}

function loadSettings() {
  const fallback = { preset: 'view', width: 1920, height: 1080 };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return { ...fallback };
    const settings = { ...fallback };
    if (EXPORT_PRESETS.some(([id]) => id === saved.preset)) settings.preset = saved.preset;
    if (Number.isFinite(saved.width)) settings.width = clampDim(saved.width);
    if (Number.isFinite(saved.height)) settings.height = clampDim(saved.height);
    return settings;
  } catch {
    return { ...fallback };
  }
}

function persistSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best effort — private mode or full storage.
  }
}

function noop() {}

/** Temporarily point the renderer's drawing buffer at an exact pixel size. */
function resizeRenderer(renderer, THREE, width, height) {
  const target = new THREE.Vector2();
  renderer.getDrawingBufferSize(target);
  if (Math.round(target.x) === width && Math.round(target.y) === height) return noop;
  const prevRatio = renderer.getPixelRatio?.() ?? 1;
  const prevSize = renderer.getSize(new THREE.Vector2());
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  return () => {
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(
      Math.max(1, Math.round(prevSize.x)),
      Math.max(1, Math.round(prevSize.y)),
      false,
    );
  };
}

/** Re-frame the camera to the export aspect without changing its placement. */
function applyExportAspect(camera, aspect) {
  if (camera.isPerspectiveCamera) {
    const prev = camera.aspect;
    if (Math.abs(prev - aspect) < 1e-9) return noop;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    return () => {
      camera.aspect = prev;
      camera.updateProjectionMatrix();
    };
  }
  if (camera.isOrthographicCamera) {
    const prev = {
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
    };
    const height = prev.top - prev.bottom;
    if (height <= 0) return noop;
    const width = height * aspect;
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    return () => {
      Object.assign(camera, prev);
      camera.updateProjectionMatrix();
    };
  }
  return noop;
}

function resolveSize(settings, renderer, THREE) {
  if (settings.preset === 'view') return null;
  const width = clampDim(settings.width);
  const height = clampDim(settings.height);
  // Already the live drawing-buffer size? Skip the resize dance entirely so a
  // path-traced export can keep its accumulated buffers.
  const target = new THREE.Vector2();
  renderer.getDrawingBufferSize(target);
  if (Math.round(target.x) === width && Math.round(target.y) === height) return null;
  return { width, height };
}

/**
 * @param {HTMLButtonElement} button
 * @param {object} opts
 * @param {AbortSignal} [opts.signal]
 * @param {HTMLElement} opts.sectionHost
 *   Element the "Export size" settings section is mounted into.
 * @param {() => ({renderer, scene, camera, THREE})} opts.getView
 * @param {() => (() => void)} [opts.prepareCapture]
 *   Hide editor chrome / guides; return a restore callback.
 * @param {() => void} opts.drawBeauty
 *   Draw the beauty frame at the CURRENT renderer size (raster or traced).
 * @param {() => boolean} [opts.isTracing]
 *   True while the path-trace rig owns the beauty.
 * @param {{begin: () => Promise<void>, end: () => void}} [opts.traceExport]
 *   Path-trace export driver: begin() traces at the (already resized) renderer
 *   size up to the rig's sample limit and presents; end() restores live mode.
 */
export function bindResolutionExport(button, {
  signal,
  sectionHost,
  getView,
  prepareCapture,
  drawBeauty,
  isTracing = null,
  traceExport = null,
}) {
  const settings = loadSettings();
  const setLabel = makeButtonLabeler(button, signal);
  const doc = button.ownerDocument ?? document;

  // --- export size section -------------------------------------------------

  const section = doc.createElement('details');
  section.className = 'control-section control-details export-section';
  const title = doc.createElement('summary');
  title.className = 'section-title';
  title.textContent = 'Export size';
  section.appendChild(title);

  function makeSelectRow(labelText, select) {
    const row = doc.createElement('div');
    row.className = 'control-row';
    const label = doc.createElement('label');
    label.textContent = labelText;
    row.appendChild(label);
    row.appendChild(select);
    return row;
  }

  const presetSelect = doc.createElement('select');
  for (const [value, label] of EXPORT_PRESETS) {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    presetSelect.appendChild(option);
  }
  section.appendChild(makeSelectRow('Preset', presetSelect));

  const sizeRow = doc.createElement('div');
  sizeRow.className = 'export-size-row';
  const widthLabel = doc.createElement('label');
  widthLabel.textContent = 'W';
  const widthInput = doc.createElement('input');
  widthInput.type = 'number';
  widthInput.min = MIN_DIM;
  widthInput.max = MAX_DIM;
  widthInput.step = 2;
  const heightLabel = doc.createElement('label');
  heightLabel.textContent = 'H';
  const heightInput = doc.createElement('input');
  heightInput.type = 'number';
  heightInput.min = MIN_DIM;
  heightInput.max = MAX_DIM;
  heightInput.step = 2;
  sizeRow.append(widthLabel, widthInput, heightLabel, heightInput);
  section.appendChild(sizeRow);
  sectionHost.appendChild(section);

  function syncInputs() {
    presetSelect.value = settings.preset;
    widthInput.value = settings.width;
    heightInput.value = settings.height;
    const locked = settings.preset === 'view';
    widthInput.disabled = locked;
    heightInput.disabled = locked;
  }

  presetSelect.addEventListener('change', () => {
    settings.preset = presetSelect.value;
    if (settings.preset !== 'view' && settings.preset !== 'custom') {
      const [w, h] = settings.preset.split('x').map(Number);
      if (Number.isFinite(w) && Number.isFinite(h)) {
        settings.width = clampDim(w);
        settings.height = clampDim(h);
      }
    }
    persistSettings(settings);
    syncInputs();
  }, { signal });

  widthInput.addEventListener('change', () => {
    settings.width = clampDim(widthInput.value);
    settings.preset = 'custom';
    persistSettings(settings);
    syncInputs();
  }, { signal });

  heightInput.addEventListener('change', () => {
    settings.height = clampDim(heightInput.value);
    settings.preset = 'custom';
    persistSettings(settings);
    syncInputs();
  }, { signal });

  signal?.addEventListener('abort', () => section.remove(), { once: true });
  syncInputs();

  // --- export --------------------------------------------------------------

  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    setLabel('Exporting…');
    let restoreChrome = null;
    try {
      const view = getView();
      if (!view?.renderer || !view?.scene || !view?.camera || !view?.THREE) {
        throw new Error('nothing to export');
      }
      restoreChrome = prepareCapture?.() ?? noop;
      const size = resolveSize(settings, view.renderer, view.THREE);
      const traced = isTracing?.() === true && traceExport;
      const blob = traced
        ? await exportTraced(view, size, traced)
        : await exportRaster(view, size, drawBeauty);
      if (!blob) throw new Error('PNG encode failed');
      downloadBlob(blob, makeFilename());
      setLabel('Saved', 1200);
    } catch (error) {
      console.error('PNG export failed', error);
      setLabel('Export failed', 1600);
    } finally {
      try { restoreChrome?.(); } catch { /* ignore */ }
      button.disabled = false;
    }
  }, { signal });

  async function exportRaster(view, size, drawFn) {
    const { renderer, scene, camera, THREE } = view;
    const restoreSize = size ? resizeRenderer(renderer, THREE, size.width, size.height) : noop;
    const restoreAspect = size ? applyExportAspect(camera, size.width / size.height) : noop;
    const prevBg = scene.background;
    const prevClearAlpha = renderer.getClearAlpha?.() ?? 0;
    try {
      scene.background = null;
      renderer.setClearColor?.(0x000000, 0);
      renderer.setClearAlpha?.(0);
      drawFn();
      const beauty = canvasImageData(renderer.domElement);
      renderCoverage(renderer, scene, camera, THREE);
      const cover = canvasImageData(renderer.domElement);
      compositeMatte(beauty, cover);
      const blob = await encodePng(beauty);
      // Restore the on-screen view after the passes overwrote the canvas.
      scene.background = prevBg;
      renderer.setClearAlpha?.(prevClearAlpha);
      restoreAspect();
      restoreSize();
      drawFn();
      return blob;
    } catch (error) {
      scene.background = prevBg;
      try {
        restoreAspect();
        restoreSize();
      } catch { /* ignore */ }
      throw error;
    }
  }

  async function exportTraced(view, size, trace) {
    const { renderer, scene, camera, THREE } = view;
    const restoreSize = size ? resizeRenderer(renderer, THREE, size.width, size.height) : noop;
    const restoreAspect = size ? applyExportAspect(camera, size.width / size.height) : noop;
    try {
      await trace.begin();
      const beauty = canvasImageData(renderer.domElement);
      renderCoverage(renderer, scene, camera, THREE);
      const cover = canvasImageData(renderer.domElement);
      compositeMatte(beauty, cover);
      const blob = await encodePng(beauty);
      return blob;
    } finally {
      restoreAspect();
      restoreSize();
      trace.end();
      drawBeauty();
    }
  }
}