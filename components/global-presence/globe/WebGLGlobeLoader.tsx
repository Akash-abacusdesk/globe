"use client";

import dynamic from "next/dynamic";
import { Component, useState, type ReactNode } from "react";
import type { GlobeProps } from "../data/locations";
import SVGGlobe from "./SVGGlobe";

// three.js only downloads once this renders, which GlobalPresence delays until the section is near.
const WebGLGlobe = dynamic(() => import("./WebGLGlobe"), { ssr: false });

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

class FallbackOnError extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function WebGLGlobeLoader(props: GlobeProps) {
  const [supported] = useState(hasWebGL);
  const [ready, setReady] = useState(false);

  const fallback = <SVGGlobe {...props} />;
  if (!supported) return fallback;

  return (
    <FallbackOnError fallback={fallback}>
      {/* Crossfades in over the static silhouette, so no spinner and no layout shift. */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${ready ? "opacity-100" : "opacity-0"}`}
      >
        <WebGLGlobe {...props} onReady={() => setReady(true)} />
      </div>
    </FallbackOnError>
  );
}
