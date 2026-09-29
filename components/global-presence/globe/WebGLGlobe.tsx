"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { geoEquirectangular, geoPath } from "d3-geo";
import type { Feature, MultiLineString, MultiPolygon, Polygon, Position } from "geojson";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { GlobeProps } from "../data/locations";
import { focusFor, GLOBE_COLORS as C, lerpZoom, loadWorld, shortestAngle, TRANSITION_S, type World } from "../utils/geo";

type Tier = { dpr: [number, number]; segments: number; day: string; clouds: boolean; idle: boolean };
type View = { yaw: number; pitch: number; k: number };
type LatLon = { latitude: number; longitude: number };

// Globe fills 90% of the canvas at zoom 1, the same as the SVG globe. Zoom is camera.zoom.
const FOV = 25;
const CAMERA_Z = 5.1;
const REST_PITCH = 20;
const IDLE_RAD_PER_S = 0.05;
const CLOUD_DRIFT_RAD_PER_S = 0.006;
const MARKER_DELAY_MS = 700;
const MARKER_IN_MS = 400;
const DEG = Math.PI / 180;
// Fixed relative to the camera (upper left), so whatever is in focus is in daylight
// and the terminator with its city lights sits on the right-hand limb.
const SUN = new THREE.Vector3(-0.55, 0.35, 0.76).normalize();

// Imagery: NASA Blue Marble, Black Marble and cloud cover (public domain), via three-globe's examples.
const TEX = "/textures";

// ~easeOutQuint, the same curve as the UI's cubic-bezier(0.22, 1, 0.36, 1).
const ease = (t: number) => 1 - (1 - t) ** 5;

// ponytail: static heuristic from cores/memory/pointer; swap for a measured FPS probe if it misjudges devices.
function detectTier(): Tier {
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const small = `${TEX}/earth-day-2048.webp`;
  if (cores <= 4 || memory <= 2) return { dpr: [1, 1], segments: 48, day: small, clouds: false, idle: false };
  if (matchMedia("(pointer: coarse)").matches || cores <= 6)
    return { dpr: [1, 1.25], segments: 64, day: small, clouds: true, idle: true };
  return { dpr: [1, 1.5], segments: 96, day: `${TEX}/earth-day-4096.webp`, clouds: true, idle: true };
}

// Same position a SphereGeometry vertex gets for this lat/lon on an equirectangular texture.
function toVec3({ latitude, longitude }: LatLon, r: number) {
  const phi = (longitude + 180) * DEG;
  const lat = latitude * DEG;
  return new THREE.Vector3(-r * Math.cos(phi) * Math.cos(lat), r * Math.sin(lat), r * Math.sin(phi) * Math.cos(lat));
}

// Yaw/pitch that bring a point to face the camera on +Z.
function facing(point: LatLon) {
  const p = toVec3(point, 1);
  return { yaw: -Math.atan2(p.x, p.z), pitch: point.latitude * DEG };
}

function lineGeometry(lines: Position[][], r: number) {
  const points: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = toVec3({ longitude: line[i - 1][0], latitude: line[i - 1][1] }, r);
      const b = toVec3({ longitude: line[i][0], latitude: line[i][1] }, r);
      points.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
}

function outline(shape: Feature | undefined): Position[][] {
  const g = shape?.geometry as Polygon | MultiPolygon | undefined;
  if (!g) return [];
  return g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
}

// Soft wash over the open country. Transparent everywhere else, so repainting it is cheap.
function paintHighlight(texture: THREE.CanvasTexture, shape: Feature | undefined) {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (shape) {
    const w = canvas.width;
    ctx.beginPath();
    geoPath(geoEquirectangular().scale(w / (2 * Math.PI)).translate([w / 2, w / 4]), ctx)(shape);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fill();
  }
  texture.needsUpdate = true;
}

function prepare(day: THREE.Texture, night: THREE.Texture, water: THREE.Texture, clouds?: THREE.Texture) {
  for (const t of [day, night]) t.colorSpace = THREE.SRGBColorSpace;
  for (const t of [day, night, water, clouds]) if (t) t.anisotropy = 8;
}

const earthShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vPosW = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D dayMap;
    uniform sampler2D nightMap;
    uniform sampler2D waterMap;
    uniform vec3 sunDir;
    varying vec2 vUv;
    varying vec3 vNormalW;
    varying vec3 vPosW;
    void main() {
      vec3 n = normalize(vNormalW);
      vec3 v = normalize(cameraPosition - vPosW);
      float ndl = dot(n, sunDir);
      float daylight = smoothstep(-0.18, 0.28, ndl);

      vec3 day = texture2D(dayMap, vUv).rgb * (0.1 + 1.1 * max(ndl, 0.0));
      vec3 lights = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.82, 0.58) * 1.8;
      vec3 color = mix(lights, day, daylight);

      // Sun glint on water only.
      float water = texture2D(waterMap, vUv).r;
      vec3 h = normalize(sunDir + v);
      color += vec3(1.0, 0.94, 0.84) * pow(max(dot(n, h), 0.0), 160.0) * water * 0.12 * daylight;

      // Rayleigh-ish haze towards the limb on the lit side.
      float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
      color = mix(color, vec3(0.36, 0.62, 1.0), fresnel * 0.6 * smoothstep(-0.3, 0.6, ndl));

      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `,
};

const haloShader = {
  vertexShader: /* glsl */ `
    varying vec3 vNormalV;
    void main() {
      vNormalV = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vNormalV;
    void main() {
      // Back faces of a 1.1x shell: strongest at the planet's edge, zero at the shell's.
      float glow = pow(clamp(-vNormalV.z * 2.4, 0.0, 1.0), 2.2);
      gl_FragColor = vec4(vec3(0.4, 0.66, 1.0), glow * 0.55);
      #include <colorspace_fragment>
    }
  `,
};

type SceneProps = GlobeProps & { tier: Tier; world: World; onReady: () => void };

function Scene({ countries, activeCountryId, activeStoreId, hoveredId, inView, reducedMotion, tier, world, onReady }: SceneProps) {
  const invalidate = useThree((s) => s.invalidate);
  const yawGroup = useRef<THREE.Group>(null);
  const pitchGroup = useRef<THREE.Group>(null);
  const cloudMesh = useRef<THREE.Mesh>(null);
  const cloudMaterial = useRef<THREE.MeshLambertMaterial>(null);
  const markerRefs = useRef<(THREE.Mesh | null)[]>([]);
  const view = useRef<View>({ ...facing({ latitude: REST_PITCH, longitude: -10 }), k: 1 });
  const tween = useRef<{ from: View; to: View; start: number } | null>(null);
  const selectedAt = useRef(0);

  const urls = [tier.day, `${TEX}/earth-night-2048.webp`, `${TEX}/earth-water-2048.webp`];
  if (tier.clouds) urls.push(`${TEX}/clouds-2048.webp`);
  const [day, night, water, clouds] = useLoader(THREE.TextureLoader, urls);
  useMemo(() => prepare(day, night, water, clouds), [day, night, water, clouds]);

  const uniforms = useMemo(
    () => ({ dayMap: { value: day }, nightMap: { value: night }, waterMap: { value: water }, sunDir: { value: SUN } }),
    [day, night, water],
  );

  const highlight = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => highlight.dispose(), [highlight]);

  const activeCountry = countries.find((c) => c.id === activeCountryId);
  const shape = activeCountry && world.countries.get(activeCountry.isoNumeric);

  const borders = useMemo(() => lineGeometry((world.borders as MultiLineString).coordinates, 1.0015), [world]);
  const edge = useMemo(() => lineGeometry(outline(shape), 1.002), [shape]);
  useEffect(() => () => borders.dispose(), [borders]);
  useEffect(() => () => edge.dispose(), [edge]);

  const stores = useMemo(
    () => countries.flatMap((c) => c.stores.map((s) => ({ ...s, countryId: c.id, position: toVec3(s, 1.003) }))),
    [countries],
  );

  useEffect(onReady, [onReady]);

  useEffect(() => {
    paintHighlight(highlight, shape);
    invalidate();
  }, [highlight, shape, invalidate]);

  useEffect(() => {
    const focus = focusFor(countries, activeCountryId, activeStoreId);
    const from = { ...view.current };
    const target = focus ? facing(focus) : { yaw: from.yaw, pitch: REST_PITCH * DEG };
    const to = { yaw: shortestAngle(from.yaw, target.yaw, Math.PI * 2), pitch: target.pitch, k: focus?.zoom ?? 1 };
    selectedAt.current = performance.now() - (reducedMotion ? MARKER_DELAY_MS + MARKER_IN_MS : 0);
    if (reducedMotion) {
      view.current = to;
      tween.current = null;
    } else {
      tween.current = { from, to, start: performance.now() };
    }
    invalidate();
  }, [activeCountryId, activeStoreId, countries, reducedMotion, invalidate]);

  // Hover colour or coming back on screen needs one fresh frame (which restarts idle spin).
  useEffect(() => invalidate(), [hoveredId, inView, invalidate]);

  // frameloop="demand": a frame renders only when something below asks for the next one.
  useFrame(({ camera }, delta) => {
    const v = view.current;
    let busy = false;
    const now = performance.now();
    const dt = Math.min(delta, 0.05);

    const t = tween.current;
    if (t) {
      const p = Math.min((now - t.start) / (TRANSITION_S * 1000), 1);
      const e = ease(p);
      v.yaw = t.from.yaw + (t.to.yaw - t.from.yaw) * e;
      v.pitch = t.from.pitch + (t.to.pitch - t.from.pitch) * e;
      v.k = lerpZoom(t.from.k, t.to.k, e);
      if (p < 1) busy = true;
      else tween.current = null;
    } else if (!activeCountryId && inView && tier.idle && !reducedMotion) {
      v.yaw += dt * IDLE_RAD_PER_S;
      busy = true;
    }

    yawGroup.current!.rotation.y = v.yaw;
    pitchGroup.current!.rotation.x = v.pitch;
    const cam = camera as THREE.PerspectiveCamera;
    if (cam.zoom !== v.k) {
      cam.zoom = v.k;
      cam.updateProjectionMatrix();
    }

    // Clouds drift a little faster than the ground and clear away on close-ups.
    if (cloudMesh.current && cloudMaterial.current) {
      if (busy && !reducedMotion) cloudMesh.current.rotation.y += dt * CLOUD_DRIFT_RAD_PER_S;
      const opacity = Math.min(Math.max((3 - v.k) / 1.8, 0), 1) * 0.9;
      cloudMaterial.current.opacity = opacity;
      cloudMesh.current.visible = opacity > 0.01;
    }

    // Markers keep a constant on-screen size whatever the zoom.
    const pop = Math.min(Math.max((now - selectedAt.current - MARKER_DELAY_MS) / MARKER_IN_MS, 0), 1);
    stores.forEach((s, i) => {
      const m = markerRefs.current[i];
      if (!m) return;
      const grow = s.id === activeStoreId ? (pop === 0 ? 0.0001 : 1.6 * (0.5 + 0.5 * ease(pop))) : 1;
      m.scale.setScalar(grow / v.k);
    });
    if (activeStoreId && pop < 1) busy = true;

    if (busy) invalidate();
  });

  return (
    <>
      <directionalLight position={SUN.clone().multiplyScalar(5)} intensity={1.4} />
      <ambientLight intensity={0.25} />
      <mesh scale={1.1}>
        <sphereGeometry args={[1, 64, 48]} />
        <shaderMaterial {...haloShader} side={THREE.BackSide} transparent depthWrite={false} />
      </mesh>
      <group ref={pitchGroup}>
        <group ref={yawGroup}>
          <mesh>
            <sphereGeometry args={[1, tier.segments, Math.round(tier.segments * 0.75)]} />
            <shaderMaterial {...earthShader} uniforms={uniforms} />
          </mesh>
          <mesh scale={1.0008}>
            <sphereGeometry args={[1, tier.segments, Math.round(tier.segments * 0.75)]} />
            <meshBasicMaterial map={highlight} transparent depthWrite={false} />
          </mesh>
          <lineSegments geometry={borders}>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
          </lineSegments>
          <lineSegments geometry={edge}>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.85} depthWrite={false} />
          </lineSegments>
          {stores.map((s, i) => {
            const inCountry = s.countryId === activeCountryId;
            const color = inCountry ? C.signal : s.countryId === hoveredId ? C.markerHover : C.marker;
            return (
              <mesh key={s.id} ref={(m) => void (markerRefs.current[i] = m)} position={s.position}>
                <sphereGeometry args={[inCountry ? 0.013 : 0.01, 12, 12]} />
                <meshBasicMaterial color={color} />
              </mesh>
            );
          })}
          {clouds && (
            <mesh ref={cloudMesh} scale={1.008}>
              <sphereGeometry args={[1, 64, 48]} />
              <meshLambertMaterial ref={cloudMaterial} color="#ffffff" alphaMap={clouds} transparent depthWrite={false} />
            </mesh>
          )}
        </group>
      </group>
    </>
  );
}

export default function WebGLGlobe({ onReady, ...props }: GlobeProps & { onReady: () => void }) {
  const [tier] = useState(detectTier);
  const [world, setWorld] = useState<World | null>(null);

  useEffect(() => {
    loadWorld("50m").then(setWorld);
  }, []);

  if (!world) return null;
  return (
    <Canvas
      dpr={tier.dpr}
      frameloop="demand"
      flat
      // Circular window: zooming grows the sphere past it. Slightly wider than the planet for the halo.
      style={{ clipPath: "circle(50% at 50% 50%)" }}
      camera={{ fov: FOV, position: [0, 0, CAMERA_Z], near: 0.1, far: 20 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
    >
      <Suspense fallback={null}>
        <Scene {...props} tier={tier} world={world} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
