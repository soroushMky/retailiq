"use client";

import { OrbitControls, PerspectiveCamera, Stars } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { Hand, Moon, Sun, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { GeoPoint } from "@/lib/api";
import { Atmosphere, Earth, type Look, PlainEarth, PulseRings, toVec } from "./GlobeLayers";
import { StatesLayer } from "./StatesLayer";

type GlobeProps = {
  points: GeoPoint[];                               // fine-grained areas (for the pulsing hotspots)
  states: { region: string; orders: number }[];     // orders per state (colours the map)
  selected: string | null;                          // currently filtered state, if any
  onStateClick?: (code: string) => void;
};

/** true on phones and tablets (finger instead of mouse) */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia("(pointer: coarse)");
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/** Width / height of an element, kept up to date when it resizes. */
function useAspect(ref: React.RefObject<HTMLDivElement | null>): number {
  const [aspect, setAspect] = useState(1.4);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (height > 0) setAspect(width / height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return aspect;
}

export default function Globe({ points, states, selected, onStateClick }: GlobeProps) {
  const reduce = useReducedMotion() ?? false;
  const [look, setLook] = useState<Look>("night");
  const [hovering, setHovering] = useState(false); // desktop: pause auto-rotation while the mouse is on the globe
  const touch = useCoarsePointer();
  const [touchExplore, setTouchExplore] = useState(false); // touch: the globe only grabs the finger after a tap
  const locked = touch && !touchExplore;

  // The camera's field of view is vertical, so on a narrow (portrait) box the sphere would be cut off
  // at the sides. Move the camera back just enough to keep the whole globe in view.
  const box = useRef<HTMLDivElement>(null);
  const aspect = useAspect(box);
  const distance = aspect >= 1.1 ? 2.7 : Math.min(4.5, (2.7 * 1.1) / aspect);

  const cameraPosition = useMemo(
    () => toVec(-14, -52, distance).toArray() as [number, number, number],
    [distance],
  );
  const sunPosition = useMemo(() => toVec(-5, -25, 6).toArray() as [number, number, number], []);
  const autoRotate = !reduce && (touch ? !touchExplore : !hovering);

  return (
    <div
      ref={box}
      className="relative h-full w-full"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovering(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovering(false)}
    >
      <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <PerspectiveCamera makeDefault position={cameraPosition} fov={40} />
        <OrbitControls
          enabled={!locked}
          enablePan={false}
          minDistance={1.5}
          maxDistance={Math.max(4, distance + 0.5)}
          autoRotate={autoRotate}
          autoRotateSpeed={0.3}
          enableDamping
        />

        <ambientLight intensity={look === "day" ? 0.9 : 1.6} />
        <directionalLight position={sunPosition} intensity={look === "day" ? 2.2 : 0.6} />
        <Stars radius={60} depth={30} count={touch ? 1200 : 2500} factor={3} fade speed={reduce ? 0 : 0.6} />

        <Suspense fallback={<PlainEarth />}>
          <Earth look={look} />
        </Suspense>
        <Atmosphere />
        <StatesLayer orders={states} selected={selected} onSelect={onStateClick} />
        <PulseRings points={points} animate={!reduce} />
      </Canvas>

      {/* Touch: until tapped, a transparent layer lets the finger scroll the page instead of spinning the globe */}
      {locked && (
        <button
          type="button"
          onClick={() => setTouchExplore(true)}
          aria-label="Tap to explore the globe"
          style={{ touchAction: "pan-y" }}
          className="absolute inset-0 z-10 flex items-end justify-center pb-14"
        >
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-page/80 px-3 py-1.5 text-xs text-white backdrop-blur">
            <Hand size={13} aria-hidden /> Tap to explore
          </span>
        </button>
      )}
      {touch && touchExplore && (
        <button
          type="button"
          onClick={() => setTouchExplore(false)}
          className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-xl border border-line bg-page/80 px-3 py-1.5 text-xs text-white backdrop-blur"
        >
          <X size={13} aria-hidden /> Done
        </button>
      )}

      <div
        role="radiogroup"
        aria-label="Earth imagery"
        className="absolute right-3 top-3 z-10 flex rounded-xl border border-line bg-page/80 p-1 backdrop-blur sm:right-4 sm:top-4"
      >
        {(["day", "night"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={look === l}
            onClick={() => setLook(l)}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-brand sm:px-3 ${
              look === l ? "bg-brand font-medium text-ink-on-accent" : "text-muted hover:text-white"
            }`}
          >
            {l === "day" ? <Sun size={13} aria-hidden /> : <Moon size={13} aria-hidden />}
            {l === "day" ? "Day" : "Night"}
          </button>
        ))}
      </div>

      {/* legend + credits: side by side when there is room, stacked on narrow screens */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-1 text-[10px] text-muted sm:inset-x-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2">
          <span>Fewer orders</span>
          <span className="h-1.5 w-20 rounded-full bg-gradient-to-r from-[#0EB582] via-[#FBBF24] to-[#FF6B4A] sm:w-24" />
          <span>More</span>
        </div>
        <p className="text-muted/70">
          <span className="sm:hidden">Imagery: NASA · Borders: Code for Germany</span>
          <span className="hidden sm:inline">Earth imagery: NASA · State borders: Code for Germany (open data)</span>
        </p>
      </div>
    </div>
  );
}
