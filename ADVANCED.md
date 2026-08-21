# Advanced usage and API

## Rebuilding and live updates

Shape changes rebuild the field and geometry:

```js
sigil.userData.sigil.rebuild(stroke, { thickness: 0.2 });
// await sigil.userData.sigil.rebuildAsync(stroke, options);
```

This includes changes to the stroke, symmetry, mirror, phase, center, thickness, resolution, field backend, smoothing, taper, relief, base, and Laplacian options.

Material updates keep the existing geometry:

```js
import { updateChromeMaterial } from 'three-sigils';

updateChromeMaterial(sigil.material, {
  peakHeight: 0.5,
  roughness: 0.02,
  envMapIntensity: 1.2,
});
```

`color` and `metalness` can be set directly on the material. Changing `profile` requires a fresh `createChromeMaterial()` because it changes the TSL graph.

Path tracing and GLB export bake displacement into vertices. Re-export after changing displacement values.

## Async WebGPU field

```js
import { createSigilAsync } from 'three-sigils';

const sigil = await createSigilAsync(stroke, {
  renderer,
  fieldBackend: 'hybrid',
  thickness: 0.16,
  resolution: 460,
  laplacian: 36,
  depthMode: 'boundary',
});

console.log(sigil.geometry.userData.fieldBackend); // "gpu" or "cpu"
```

The hybrid backend falls back to CPU when WebGPU compute is unavailable. Both paths return ordinary exportable `BufferGeometry`.

## Main API

```js
import {
  createSigil,
  createSigilAsync,
  createChromeMaterial,
  updateChromeMaterial,
  bspline,
  radialSymmetry,
} from 'three-sigils';
```

## Geometry and surface API

```js
import {
  buildSigilGeometry,
  buildSigilGeometryAsync,
  buildSparseCurveGeometry,
  buildSparseCurveGeometryAsync,
  buildGpuDistanceField,
  buildGpuFieldMeshAsync,
  buildGpuBlurredField,
  finishSigilGeometryFromField,
  finishSigilGeometryFromFieldAsync,
  gpuLaplacianPositions,
  cpuLaplacianPositions,
  laplacianPositionsAsync,
  buildSurfaceVineGeometry,
  buildSurfaceVineFieldGeometry,
  buildSurfaceSigilGeometry,
  SURFACE_SIGIL_DEFAULTS,
  createMeshIndex,
} from 'three-sigils';
```

Lower-level exports include `prepareStrokes`, `cullPointsByReference`, `resolveFieldThreshold`, `resolveBoundaryFalloff`, `DistanceField`, and `fillRegion`. Path helpers include `toPolyline`, `toPathSet`, `boundsOf`, `centroidOf`, and `resampleByLength`.

Creator state and meshless raymarch code under `examples/` are not part of the published package API.

## B-spline strokes

```js
import { createSigil, bspline } from 'three-sigils';

const stroke = bspline(
  [[0, 1], [0.9, 0.4], [0.5, -0.8], [-0.5, -0.8], [-0.9, 0.4]],
  { closed: true },
);

const sigil = createSigil(stroke, { symmetry: 3, thickness: 0.18 });
```

## Geometry attributes

| Attribute | Type | Meaning |
| --- | --- | --- |
| `aDepth` | float | Relief depth: rim to raised interior or centerline. |
| `aGrad` | vec2 | Depth gradient used for analytic normals. |
| `aNormal` | vec3 | Flat normal for the base and walls. |
| `aDome` | float | `1` on the top surface, `0` on the base and walls. |

## Choosing a build path

| Path | Best for |
| --- | --- |
| `buildSparseCurveGeometry` | Cheap live drawing previews. |
| `createSigilAsync` / `buildGpuFieldMeshAsync` | Final meshes, welded junctions, and GLB export. |
| Creator raymarch mode | Meshless WebGPU preview in the demo. |

For merged builds, `resolution` around 280–460 and `laplacian` around 0–54 are practical starting points. Higher values produce softer results at greater cost.

Surface painting uses `buildSurfaceVineFieldGeometry` or `buildSurfaceSigilGeometry`, with optional normal-direction conformance.
