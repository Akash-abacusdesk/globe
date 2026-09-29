import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Country } from "../data/locations";

export type World = {
  land: Feature | FeatureCollection;
  coast: MultiLineString;
  borders: MultiLineString;
  countries: Map<string, Feature>;
};

// Shared by both renderers so they look identical.
export const GLOBE_COLORS = {
  ocean: "#15324b",
  grid: "#1d4060",
  land: "#6d8b61",
  landActive: "#b9c99a",
  coast: "#4f6b47",
  marker: "#e4e7df",
  markerHover: "#ffffff",
  signal: "#d6392b",
};

// cubic-bezier(0.22, 1, 0.36, 1) from the spec.
export const EASE = [0.22, 1, 0.36, 1] as const;
export const TRANSITION_S = 1.4;
export const STORE_ZOOM_FACTOR = 1.8;
export const MAX_ZOOM = 12;

type Atlas = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
const cache = new Map<string, Promise<World>>();

function toWorld(topo: Atlas): World {
  const countries = new Map<string, Feature>();
  for (const f of (feature(topo, topo.objects.countries) as FeatureCollection).features) {
    // First wins: "036" is both Australia and Ashmore Is. in the atlas.
    if (!countries.has(String(f.id))) countries.set(String(f.id), f);
  }
  return {
    land: feature(topo, topo.objects.land),
    coast: mesh(topo, topo.objects.land),
    borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
    countries,
  };
}

// Lazy so the atlas stays out of the initial bundle. 110m (~100KB) for the whole globe,
// 50m (~750KB) for close-ups where 110m coastlines turn blocky.
export function loadWorld(detail: "110m" | "50m") {
  let world = cache.get(detail);
  if (!world) {
    const json = detail === "50m" ? import("world-atlas/countries-50m.json") : import("world-atlas/countries-110m.json");
    world = json.then((m) => toWorld(m.default as unknown as Atlas));
    cache.set(detail, world);
  }
  return world;
}

export type Focus = { latitude: number; longitude: number; zoom: number };

/** Where the globe should look: the open store, else the open country, else null (whole globe). */
export function focusFor(countries: Country[], countryId: string | null, storeId: string | null): Focus | null {
  const country = countries.find((c) => c.id === countryId);
  if (!country) return null;
  const store = country.stores.find((s) => s.id === storeId);
  if (store) return { ...store, zoom: Math.min(country.zoom * STORE_ZOOM_FACTOR, MAX_ZOOM) };
  return country;
}

/** `to` shifted by whole periods so the move from `from` is the short way round. */
export function shortestAngle(from: number, to: number, period: number) {
  return from + ((((to - from) % period) + period * 1.5) % period) - period / 2;
}

/** Zoom interpolated in log space so 1x to 9x feels even, not front-loaded. */
export function lerpZoom(from: number, to: number, t: number) {
  return from * (to / from) ** t;
}
