"use client";

import { geoCentroid, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { animate, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { GlobeProps } from "../data/locations";
import {
  EASE,
  focusFor,
  GLOBE_COLORS as C,
  type Focus,
  lerpZoom,
  loadWorld,
  shortestAngle,
  TRANSITION_S,
  type World,
} from "../utils/geo";

const SIZE = 600;
const RADIUS = 270;
const IDLE_DEG_PER_S = 3;
const DETAIL_FROM_ZOOM = 1.8;
const REST = { phi: -20, k: 1 };
const graticule = geoGraticule10();

type Region = { feature: Feature; centroid: [number, number]; radius: number };

// Each 50m country's centre and angular radius, so close-ups can skip everything off screen.
// The full 50m atlas costs ~60-90ms per frame to project; the countries around one focus cost a few.
function indexRegions(world: World): Region[] {
  return [...world.countries.values()].map((feature) => {
    const centroid = geoCentroid(feature);
    let radius = 0;
    const visit = (coords: unknown): void => {
      if (typeof (coords as number[])[0] === "number") radius = Math.max(radius, geoDistance(centroid, coords as [number, number]));
      else (coords as unknown[]).forEach(visit);
    };
    visit((feature.geometry as Polygon | MultiPolygon).coordinates);
    return { feature, centroid, radius };
  });
}

function regionAround(regions: Region[], focus: Focus): FeatureCollection {
  // Visible half-angle through the circular window at this zoom, plus margin.
  const reach = Math.asin(Math.min(1, 1 / focus.zoom)) * 1.5;
  const center: [number, number] = [focus.longitude, focus.latitude];
  return {
    type: "FeatureCollection",
    features: regions.filter((r) => geoDistance(center, r.centroid) - r.radius < reach).map((r) => r.feature),
  };
}

// Orthographic projection redrawn per frame: real rotation, but plain SVG paths and no WebGL.
// Zooming grows the sphere inside a fixed circular window, so the silhouette never changes size.
export default function SVGGlobe({ countries, activeCountryId, activeStoreId, hoveredId, inView, reducedMotion }: GlobeProps) {
  const ocean = useRef<SVGCircleElement>(null);
  const gridPath = useRef<SVGPathElement>(null);
  const landPath = useRef<SVGPathElement>(null);
  const highlightPath = useRef<SVGPathElement>(null);
  const borderPath = useRef<SVGPathElement>(null);
  const markers = useRef<(SVGGElement | null)[]>([]);
  const coarse = useRef<World | null>(null);
  const detailed = useRef<{ world: World; regions: Region[] } | null>(null);
  const focus = useRef<Focus | null>(null);
  const region = useRef<FeatureCollection | null>(null);
  const highlight = useRef<string | null>(null);
  const tweening = useRef(false);
  const view = useRef({ lambda: 10, ...REST });

  const stores = useMemo(
    () => countries.flatMap((c) => c.stores.map((s) => ({ ...s, countryId: c.id }))),
    [countries],
  );

  const projection = useMemo(
    () =>
      geoOrthographic()
        .translate([SIZE / 2, SIZE / 2])
        .clipAngle(90)
        .clipExtent([
          [0, 0],
          [SIZE, SIZE],
        ]),
    [],
  );

  const draw = useCallback(() => {
    const { lambda, phi, k } = view.current;
    projection.rotate([lambda, phi]).scale(RADIUS * k);
    const path = geoPath(projection);
    // Moving: cheap 110m everywhere. Settled on a close-up: 50m, but only the countries in view.
    const detail = !tweening.current && k >= DETAIL_FROM_ZOOM && region.current && detailed.current;
    const world = detail ? detailed.current!.world : coarse.current;

    ocean.current?.setAttribute("r", String(RADIUS * k));
    gridPath.current?.setAttribute("d", path(graticule) ?? "");
    gridPath.current?.style.setProperty("opacity", String(Math.min(Math.max((4 - k) / 3, 0), 1)));
    if (world) {
      // In detail mode the land stroke already traces every border.
      landPath.current?.setAttribute("d", path(detail ? region.current! : world.land) ?? "");
      borderPath.current?.setAttribute("d", detail ? "" : (path(world.borders) ?? ""));
      const country = countries.find((c) => c.id === highlight.current);
      const shape = country && world.countries.get(country.isoNumeric);
      highlightPath.current?.setAttribute("d", (shape && path(shape)) || "");
    }

    const center: [number, number] = [-lambda, -phi];
    stores.forEach((store, i) => {
      const el = markers.current[i];
      if (!el) return;
      const point: [number, number] = [store.longitude, store.latitude];
      const [x, y] = projection(point) ?? [0, 0];
      // Fade near the horizon instead of popping; hide once outside the circular window.
      const horizon = (Math.PI / 2 - geoDistance(point, center)) / 0.2;
      const inside = Math.hypot(x - SIZE / 2, y - SIZE / 2) < RADIUS;
      el.setAttribute("transform", `translate(${x} ${y})`);
      el.style.opacity = inside ? String(Math.min(Math.max(horizon, 0), 1)) : "0";
    });
  }, [countries, stores, projection]);

  useLayoutEffect(draw, [draw]);

  useEffect(() => {
    loadWorld("110m").then((w) => {
      coarse.current = w;
      draw();
    });
    // Warm the close-up atlas in the background so the first zoom is already sharp.
    loadWorld("50m").then((w) => {
      detailed.current = { world: w, regions: indexRegions(w) };
      if (focus.current) region.current = regionAround(detailed.current.regions, focus.current);
      draw();
    });
  }, [draw]);

  useEffect(() => {
    highlight.current = activeCountryId;
    const target = focusFor(countries, activeCountryId, activeStoreId);
    focus.current = target;
    region.current = target && detailed.current ? regionAround(detailed.current.regions, target) : null;
    const from = { ...view.current };
    const to = target
      ? { lambda: shortestAngle(from.lambda, -target.longitude, 360), phi: -target.latitude, k: target.zoom }
      : { lambda: from.lambda, ...REST };
    if (reducedMotion) {
      view.current = to;
      draw();
      return;
    }
    tweening.current = true;
    const controls = animate(0, 1, {
      duration: TRANSITION_S,
      ease: EASE,
      onUpdate: (t) => {
        view.current = {
          lambda: from.lambda + (to.lambda - from.lambda) * t,
          phi: from.phi + (to.phi - from.phi) * t,
          k: lerpZoom(from.k, to.k, t),
        };
        draw();
      },
      onComplete: () => {
        tweening.current = false;
        draw(); // swap in the detailed close-up
      },
    });
    return () => {
      controls.stop();
      tweening.current = false;
    };
  }, [activeCountryId, activeStoreId, countries, reducedMotion, draw]);

  // Idle spin only while nothing is open and the globe is on screen.
  useEffect(() => {
    if (activeCountryId || !inView || reducedMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!tweening.current) {
        view.current.lambda += (Math.min(now - last, 50) / 1000) * IDLE_DEG_PER_S;
        draw();
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeCountryId, inView, reducedMotion, draw]);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <clipPath id="svg-globe-window">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
        </clipPath>
        <radialGradient id="svg-globe-shade" cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000814" stopOpacity="0.55" />
        </radialGradient>
        <radialGradient id="svg-globe-halo">
          <stop offset="80%" stopColor="#66a8ff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#66a8ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Atmosphere: only the ring outside the planet shows. */}
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS * 1.11} fill="url(#svg-globe-halo)" />
      <g clipPath="url(#svg-globe-window)">
        <circle ref={ocean} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill={C.ocean} />
        <path ref={gridPath} fill="none" stroke={C.grid} strokeWidth={0.6} />
        <path ref={landPath} fill={C.land} stroke={C.coast} strokeWidth={0.5} />
        <path
          ref={highlightPath}
          fill={C.landActive}
          stroke={C.coast}
          strokeWidth={0.6}
          className="transition-opacity duration-700"
          style={{ opacity: activeCountryId ? 1 : 0 }}
        />
        <path ref={borderPath} fill="none" stroke={C.coast} strokeWidth={0.6} />
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="url(#svg-globe-shade)" />

        {stores.map((store, i) => {
          const active = store.id === activeStoreId;
          const inCountry = store.countryId === activeCountryId;
          return (
            <g key={store.id} ref={(el) => void (markers.current[i] = el)} style={{ opacity: 0 }}>
              {active ? (
                <g key={activeStoreId}>
                  {!reducedMotion && (
                    <motion.circle
                      r={12}
                      fill="none"
                      stroke={C.signal}
                      strokeWidth={1.2}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1.8, opacity: [0, 0.8, 0] }}
                      transition={{ delay: 0.75, duration: 1.2, ease: EASE }}
                    />
                  )}
                  <motion.circle
                    r={5.5}
                    fill={C.signal}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: reducedMotion ? 0 : 0.7, duration: 0.4, ease: EASE }}
                  />
                </g>
              ) : (
                <circle
                  r={inCountry ? 4 : 3}
                  fill={inCountry ? C.signal : store.countryId === hoveredId ? C.markerHover : C.marker}
                  stroke={inCountry ? "#ffffff" : "none"}
                  strokeWidth={1}
                  className="transition-[fill] duration-300"
                />
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
