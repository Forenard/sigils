<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/sigils-logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset=".github/assets/sigils-logo-black.png">
    <img alt="Sigils" src=".github/assets/sigils-logo-black.png" width="645">
  </picture>
</p>

# three-sigils

Procedural metallic shape generation for [three.js](https://threejs.org/).

**[Open Sigils Creator](https://cl0nazepamm.github.io/sigils/)** — draw, edit, surface-paint, path trace, and export sigils in the WebGPU demo.

## Sigils Creator

| Mode | What it does |
| --- | --- |
| **Drawing** | Draw freehand strokes or editable B-spline curves on a planar canvas. Select strokes to reshape control points, adjust width, or change symmetry and material settings. |
| **Raymarch** | Experimental meshless WebGPU preview. The distance field is raymarched per pixel instead of displayed as geometry. GLB export still generates a mesh. |
| **Paint on Mesh** | Paint freehand or editable curves onto a built-in mesh or imported GLB. Each stroke supports symmetry and mirroring. Build a welded result, use **Manual meshing** for separate per-stroke meshes, and use **Conform** to pull the result into the surface. |

### Controls

- Left-drag draws; right-drag orbits; middle-drag pans.
- Curve mode: click to place points, click the first point to close, or press Enter/double-click to commit.
- Click a stroke or press Tab to select it. Drag control points to reshape it and drag their rings to change width.
- Delete/Backspace removes the selection. Ctrl/Cmd+Z undoes; add Shift to redo.
- Drop a GLB into **Paint on Mesh** to use your own surface.

### Overlay workflow (Drawing)

- **Frame guide** — Stroke → Frame guide overlays an origin-centered aspect-ratio frame (16:9, 9:16, 4:3, 3:2, 1:1, 2.39:1 …) with optional rule-of-thirds lines, sized in world units via Frame height. Guides never appear in exports.
- **Axis camera** — the Camera section and the F/B/R/L/T/D keys snap the view to origin-centered +Z/−Z/+X/−X/+Y/−Y axis-aligned cameras (H returns home), Unity-Editor style. Current distance is preserved.
- **Export size** — Save PNG honors the Export size section: the live view, a common preset (1280×720 … 3840×2160, 4:3, 1:1, 9:16) or a custom width × height. The renderer backing store is resized for the capture, so raster exports are true full-resolution renders — and path-traced exports re-trace at the export resolution instead of upscaling the screen image. Transparent alpha is preserved.

Creator state is saved locally. GLB export bakes the visible displaced mesh into vertices.

## Install

```bash
npm install three-sigils three
```

`three` is a peer dependency (`>=0.176`).

## Quick start

```js
import * as THREE from 'three/webgpu';
import { createSigil } from 'three-sigils';

const renderer = new THREE.WebGPURenderer({ antialias: true });
await renderer.init();

const scene = new THREE.Scene();
const stroke = [[-0.5, 0.8], [0.7, 0.6], [0.4, -0.9], [-0.6, -0.4]];

const sigil = createSigil(stroke, {
  thickness: 0.16,
  peakHeight: 0.3,
  roughness: 0.06,
});

scene.add(sigil);
```

A stroke can be `[[x, y], ...]`, `[{ x, y }, ...]`, a flat coordinate array, or an array of multiple curves. Chrome materials need a reflected environment, so set `scene.environment` to a PMREM.

## Creator locally

```bash
git clone https://github.com/cl0nazepamm/sigils.git
cd sigils
npm install
npm run example
```

For async WebGPU fields, rebuild behavior, surface-paint builders, geometry attributes, and the advanced API, see [ADVANCED.md](ADVANCED.md).

## Acknowledgements

Main inspiration for this WebGPU experiment: [Joe Bowers](https://no3dtools.com/).

## License

MIT
