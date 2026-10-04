import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAR_WIDTH_WORLD } from '../constants';

/**
 * An authored car body (`?look=models`, ADR-0013 route D, #584).
 *
 * `tools/cars/kestrel.py` writes the .glb in metres with its nose on +z. The
 * loader keeps the contract the procedural cars already have: the paintable body
 * is a car's first child, the wheels are separate meshes flagged
 * `userData.wheel` (so `poseWheels` spins and steers them), and the lamps use
 * the names and unlit materials the night code looks for. Geometry is baked
 * into game units here, so a model costs nothing per frame.
 */

/** The model's own width, from the script's `HW`: body half-width 0.86 m. */
const MODEL_WIDTH = 1.72;
/** The procedural body is `half = w * 0.47` either side, so 0.94 of the car width. */
const BODY_SHARE = 0.94;

let source: THREE.Group | null = null;

/** Fetch and parse the model once. Resolves whether or not it loaded: the procedural car is the fallback. */
export async function loadKestrelModel(url = `${import.meta.env.BASE_URL}models/kestrel.glb`): Promise<void> {
  if (source) return;
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    source = gltf.scene;
  } catch (error) {
    console.warn('kestrel model not loaded, keeping the procedural car', error);
    // Said on screen too: the fallback looks like a model that was never built.
    const note = document.createElement('div');
    note.textContent = 'models: kestrel.glb failed to load, showing the procedural car';
    note.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9;padding:4px 8px;font:12px monospace;color:#fff;background:#a33;border-radius:4px';
    document.body.append(note);
  }
}

export function hasKestrelModel(): boolean {
  return source !== null;
}

/**
 * Metallic lacquer (#620): a hard clear coat over a satin metallic base, with
 * flake under the coat. The model has no UVs, so the flake is hashed from the
 * object-space position: a cell under a centimetre across gets a random tilt of the
 * base normal (the clear coat keeps the true normal, which is why it reads as
 * flake under glass) and a small brightness change. It fades out where a cell
 * is smaller than a pixel, so at chase distance it is a faint shimmer and never
 * noise. One program for every car; the colour is the only per-car part.
 */
const FLAKE_SCALE = 0.4;      // cells per model unit: 2.5 units is 0.7 cm at 355 units a metre
const FLAKE_TILT = 0.12;
const FLAKE_SHINE = 0.06;

function lacquer(): THREE.MeshPhysicalMaterial {
  // Wear (#620 2d): 0 is a clean coat, 1 is a wreck. The view sets it from the sim's damage.
  const wear = { value: 0 };
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.42, metalness: 0.12, envMapIntensity: 0.7, clearcoat: 0.8, clearcoatRoughness: 0.08,
    vertexColors: true, name: 'paint',
  });
  material.userData.wear = wear;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWear = wear;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlake = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vFlake;
uniform float uWear;
float valueNoise(vec3 p);
vec3 flakeHash(vec3 p) {
  return fract(sin(vec3(dot(p, vec3(12.9898, 78.233, 37.719)), dot(p, vec3(39.346, 11.135, 83.155)),
    dot(p, vec3(73.156, 52.235, 9.151)))) * 43758.5453);
}
float valueNoise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(flakeHash(i).x, flakeHash(i + vec3(1,0,0)).x, f.x), mix(flakeHash(i + vec3(0,1,0)).x, flakeHash(i + vec3(1,1,0)).x, f.x), f.y),
             mix(mix(flakeHash(i + vec3(0,0,1)).x, flakeHash(i + vec3(1,0,1)).x, f.x), mix(flakeHash(i + vec3(0,1,1)).x, flakeHash(i + vec3(1,1,1)).x, f.x), f.y), f.z);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 cell = floor(vFlake * ${FLAKE_SCALE.toFixed(3)});
    vec3 h = flakeHash(cell);
    float cellPx = length(fwidth(vFlake)) * ${FLAKE_SCALE.toFixed(3)};
    float amount = 1.0 - smoothstep(0.35, 1.1, cellPx);
    normal = normalize(normal + (h - 0.5) * ${FLAKE_TILT.toFixed(3)} * amount);
    diffuseColor.rgb *= 1.0 + (h.x - 0.5) * ${FLAKE_SHINE.toFixed(3)} * 2.0 * amount;
    // Scuffs: patches about a hand across where the coat has gone to bare, mostly at the ends.
    if (uWear > 0.001) {
      float wornPatch = valueNoise(vFlake * 0.03) * 0.5 + valueNoise(vFlake * 0.11) * 0.5;
      float ends = 0.35 + 0.65 * smoothstep(0.45, 0.95, abs(vFlake.z) / 650.0);
      float scuff = smoothstep(0.64, 0.74, wornPatch) * uWear * ends;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.055, 0.045), scuff * 0.9);
      roughnessFactor = mix(roughnessFactor, 0.85, scuff);
    }
  }`);
  };
  material.customProgramCacheKey = () => 'kestrel-lacquer';
  return material;
}

/**
 * Glass and trim (#620 2e). The glass is dark and mirror-like with a hard coat,
 * so it picks up the sky and the buildings (`CityView.flagMeshes` gives every
 * physical material the city's environment map); trim is matte rubber and
 * plastic with no sheen, the contrast that makes the paint read as lacquer.
 * One material per kind and per vertex-colour use: a mesh without the bake's
 * colour attribute must not ask for it or it draws black.
 */
const finish = new Map<string, THREE.Material>();
function finished(kind: 'glass' | 'trim', vertexColors: boolean): THREE.Material {
  const key = `${kind}${vertexColors}`;
  let m = finish.get(key);
  if (!m) {
    m = kind === 'glass'
      ? new THREE.MeshPhysicalMaterial({
        color: '#0a1118', roughness: 0.03, metalness: 0.55, envMapIntensity: 1.1, clearcoat: 1,
        clearcoatRoughness: 0.02, vertexColors, name: 'glass',
      })
      : new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.92, metalness: 0, envMapIntensity: 0.25, vertexColors, name: 'trim' });
    finish.set(key, m);
  }
  return m;
}

/** Set a lacquer's wear from the sim's damage (0 to 1): scuffs on the shader and a coat that dulls. */
export function wearPaint(material: THREE.Material, hurt: number): void {
  const wear = material.userData.wear as { value: number } | undefined;
  if (!wear) return;
  wear.value = hurt;
  (material as THREE.MeshPhysicalMaterial).clearcoat = 0.8 * (1 - 0.6 * hurt);
}

/** How dirty a car comes: 0 is showroom, 1 is a car that has lived in the city. */
const DIRT = 0.45;
const GRIME = new THREE.Color('#7a6a58');

/**
 * The paint's vertex colour (#620 2b, 2c): the baked light from the model times
 * the dirt a street car collects.
 *
 * `light` is `tools/cars/kestrel.py`'s bake: R is how open the surface is to the
 * sky, so arches, sills and creases come out dark with no rule written here, and
 * G is convexity, so a crown or a crease catches light. Dirt is physical:
 * heaviest low on the flank, thrown up behind each wheel (the wheels spray
 * rearward), and a film of dust on the upward-facing panels. It tints toward
 * brown rather than only darkening, so a white car looks dusty and not grey.
 */
function shade(geometry: THREE.BufferGeometry, k: number): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const at = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const baked = geometry.attributes.color;
  const rgb = new Float32Array(at.count * 3);
  const height = box.max.y - box.min.y;
  const wheelX = 0.74 * k;
  const wheelZ = 1.23 * k;
  const c = new THREE.Color();
  for (let i = 0; i < at.count; i++) {
    const y = at.getY(i);
    const light = baked ? baked.getX(i) : 1;
    const crown = baked ? baked.getY(i) : 0;
    const low = 1 - THREE.MathUtils.smoothstep(y, box.min.y, box.min.y + height * 0.45);
    // Behind a wheel and low: a plume about 0.4 m long and 0.45 m tall, on the flank beside it.
    let spray = 0;
    for (const wz of [wheelZ, -wheelZ]) {
      const dz = (at.getZ(i) - (wz - 0.45 * k)) / (0.4 * k);
      const dx = (Math.abs(at.getX(i)) - wheelX) / (0.35 * k);
      spray = Math.max(spray, Math.exp(-(dz * dz + dx * dx * 0.5)) * (1 - THREE.MathUtils.smoothstep(y, box.min.y + 0.25 * k, box.min.y + 0.85 * k)));
    }
    const dust = THREE.MathUtils.smoothstep(normal ? normal.getY(i) : 0, 0.75, 1);
    const dirt = Math.min(1, (0.55 * low + 0.5 * spray + 0.22 * dust) * DIRT);
    // The bake's occlusion is sharp (a crevice is nearly black); a car is never that dark in daylight.
    const v = (0.5 + 0.5 * light) * (1 + 0.3 * crown);
    c.set(1, 1, 1).lerp(GRIME, dirt * 0.75).multiplyScalar(v * (1 - 0.18 * dirt));
    rgb.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
}

/** The meshes under one glTF node: a node with several materials loads as a group of primitives. */
function primitives(node: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  node.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) found.push(child as THREE.Mesh);
  });
  return found;
}

/**
 * The model as a new car's children, in game units.
 *
 * The loader splits a multi-material node into one mesh per material, so a
 * wheel is merged back into one mesh (it must spin as one), and the body is left
 * as primitives with the paint one first: `CarPool` and the view repaint
 * `children[0].material.color`, which wants a single material.
 */
export function kestrelParts(): THREE.Mesh[] | null {
  if (!source) return null;
  const k = (CAR_WIDTH_WORLD * BODY_SHARE) / MODEL_WIDTH;
  const out: THREE.Mesh[] = [];
  source.updateMatrixWorld(true);
  const nodes = new Map<string, THREE.Mesh[]>();
  for (const mesh of primitives(source)) {
    // The primitive's own name is the node's, or its parent group's.
    const owner = mesh.parent && mesh.parent !== source && !mesh.parent.name.startsWith('kestrel') ? mesh.parent : mesh;
    const name = (owner.name || mesh.name).toLowerCase();
    nodes.set(name, [...(nodes.get(name) ?? []), mesh]);
  }
  for (const [name, meshes] of nodes) {
    if (name.startsWith('wheel')) {
      // Built about its hub; the node's position is the hub.
      const hub = new THREE.Vector3().setFromMatrixPosition(meshes[0].matrixWorld);
      const geometry = mergeGeometries(meshes.map((m) => m.geometry.clone()), true);
      geometry.scale(k, k, k);
      geometry.computeBoundingSphere();
      const wheel = new THREE.Mesh(geometry, meshes.map((m) => m.material as THREE.Material));
      wheel.name = name;
      wheel.position.copy(hub).multiplyScalar(k);
      wheel.userData.wheel = true;
      wheel.userData.tyreRadius = geometry.boundingSphere?.radius ?? 0;
      out.push(wheel);
      continue;
    }
    for (const mesh of meshes) {
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).scale(k, k, k);
      // The paint is repainted per car, so each car owns its copy: shared, the
      // last car placed would colour every Kestrel in the city. Mirrors are
      // not repainted and stay the model's colour.
      const painted = (mesh.material as THREE.Material).name === 'paint';
      let own = mesh.material;
      if (painted) {
        own = lacquer();
        shade(geometry, k);
      }
      const kind = (mesh.material as THREE.Material).name;
      if (kind === 'glass' || kind === 'trim') own = finished(kind, 'color' in geometry.attributes);
      const part = new THREE.Mesh(geometry, own);
      part.name = name;
      if (name.startsWith('lamp_head')) {
        part.material = new THREE.MeshBasicMaterial({ color: '#6f7481' });
        part.name = 'headlight';
      } else if (name.startsWith('lamp_tail') || name === 'tail_bar') {
        part.material = new THREE.MeshBasicMaterial({ color: '#ff4a38' });
      }
      out.push(part);
    }
  }
  // The paint first, as `CarPool.place` expects.
  const isPaint = (m: THREE.Mesh) => m.name === 'a_body' && (m.material as THREE.Material).name === 'paint';
  out.sort((a, b) => Number(isPaint(b)) - Number(isPaint(a)));
  return out;
}
