"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { num } from "@/lib/format";
import { toVec } from "./GlobeLayers";

// ---------------------------------------------------------------- Brazilian states
const STATES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
  MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

/** "São Paulo" -> "sao paulo", so names match whatever accents the map file uses */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATES).map(([code, name]) => [norm(name), code]),
);

/** Finds the state code in a GeoJSON feature, whether the file stores "SP" or "São Paulo". */
function codeOf(props: Record<string, unknown> | null): string | null {
  if (!props) return null;
  for (const v of Object.values(props)) {
    if (typeof v !== "string") continue;
    if (v.length === 2 && STATES[v.toUpperCase()]) return v.toUpperCase();
    const byName = NAME_TO_CODE[norm(v)];
    if (byName) return byName;
  }
  return null;
}

// ---------------------------------------------------------------- colours (same ramp as the dots)
const LOW = new THREE.Color("#0EB582");
const MID = new THREE.Color("#FBBF24");
const HIGH = new THREE.Color("#FF6B4A");
const NEUTRAL = new THREE.Color("#64748B");

function ramp(t: number): THREE.Color {
  const c = new THREE.Color();
  return t < 0.6 ? c.copy(LOW).lerp(MID, t / 0.6) : c.copy(MID).lerp(HIGH, (t - 0.6) / 0.4);
}

// ---------------------------------------------------------------- geometry: flat lat/lng polygons -> curved shells
type Ring = number[][]; // [[lng, lat], ...]
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
type Feature = { properties: Record<string, unknown> | null; geometry: Geometry | null };

const MAX_EDGE = 2; // degrees: longer triangle edges are split so the shape hugs the curved Earth

function toPoints(ring: Ring): THREE.Vector2[] {
  const pts = ring.map(([lng, lat]) => new THREE.Vector2(lng, lat));
  if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop(); // drop the repeated closing point
  return pts;
}

/** Triangulates one polygon (outer ring + holes) and writes curved triangles into `out`. */
function addPolygon(rings: Ring[], radius: number, out: number[]) {
  const outer = toPoints(rings[0]);
  const holes = rings.slice(1).map(toPoints);
  if (outer.length < 3) return;
  const triangles = THREE.ShapeUtils.triangulateShape(outer, holes);
  const all = [outer, ...holes].flat();

  const emit = (a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2, depth: number) => {
    const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    if (depth < 6 && longest > MAX_EDGE) {
      // split into 4 smaller triangles
      const ab = a.clone().add(b).multiplyScalar(0.5);
      const bc = b.clone().add(c).multiplyScalar(0.5);
      const ca = c.clone().add(a).multiplyScalar(0.5);
      emit(a, ab, ca, depth + 1);
      emit(ab, b, bc, depth + 1);
      emit(ca, bc, c, depth + 1);
      emit(ab, bc, ca, depth + 1);
      return;
    }
    for (const p of [a, b, c]) {
      const v = toVec(p.y, p.x, radius);
      out.push(v.x, v.y, v.z);
    }
  };
  triangles.forEach(([i, j, k]) => emit(all[i], all[j], all[k], 0));
}

/** A border line that follows the curve of the Earth. */
function borderGeometry(ring: Ring, radius: number): THREE.BufferGeometry {
  const pts = toPoints(ring);
  const positions: number[] = [];
  pts.forEach((p, i) => {
    const next = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(p.distanceTo(next) / 1)); // a point at least every degree
    for (let s = 0; s < steps; s++) {
      const q = p.clone().lerp(next, s / steps);
      const v = toVec(q.y, q.x, radius);
      positions.push(v.x, v.y, v.z);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

type StateShape = {
  code: string;
  name: string;
  fill: THREE.BufferGeometry;
  borders: THREE.BufferGeometry[];
  center: THREE.Vector3; // where the label sits
};

function buildShapes(features: Feature[]): StateShape[] {
  const shapes: StateShape[] = [];
  for (const f of features) {
    const code = codeOf(f.properties);
    if (!code || !f.geometry) continue;
    const polygons: Ring[][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;

    const positions: number[] = [];
    const borders: THREE.BufferGeometry[] = [];
    let biggest: Ring = polygons[0][0];
    polygons.forEach((rings) => {
      addPolygon(rings, 1.006, positions);
      borders.push(borderGeometry(rings[0], 1.0065));
      if (rings[0].length > biggest.length) biggest = rings[0];
    });

    const lng = biggest.reduce((s, p) => s + p[0], 0) / biggest.length;
    const lat = biggest.reduce((s, p) => s + p[1], 0) / biggest.length;
    const fill = new THREE.BufferGeometry();
    fill.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    shapes.push({ code, name: STATES[code], fill, borders, center: toVec(lat, lng, 1.035) });
  }
  if (shapes.length < 27) console.warn(`StatesLayer: matched ${shapes.length}/27 states in the map file`);
  return shapes;
}

// ---------------------------------------------------------------- the layer
type StatesLayerProps = {
  orders: { region: string; orders: number }[];
  selected: string | null;
  onSelect?: (code: string) => void;
};

export function StatesLayer({ orders, selected, onSelect }: StatesLayerProps) {
  const [shapes, setShapes] = useState<StateShape[] | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const groups = useRef<Record<string, THREE.Group | null>>({});
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const { camera } = useThree();
  const cameraDir = useMemo(() => new THREE.Vector3(), []);

  // Load the state borders once
  useEffect(() => {
    let alive = true;
    fetch("/geo/brazil-states.geojson")
      .then((r) => r.json())
      .then((gj: { features: Feature[] }) => {
        if (alive) setShapes(buildShapes(gj.features));
      })
      .catch(() => console.warn("StatesLayer: could not load /geo/brazil-states.geojson"));
    return () => {
      alive = false;
    };
  }, []);

  // Free GPU memory if the layer goes away
  useEffect(
    () => () => shapes?.forEach((s) => [s.fill, ...s.borders].forEach((g) => g.dispose())),
    [shapes],
  );

  // Orders -> 0..1 by RANK (quantile colouring): fewest = 0, most = 1, evenly spread in between,
  // so all 27 states get clearly different colours even though São Paulo dwarfs the rest
  const byCode = useMemo(() => {
    const sorted = [...orders].sort((a, b) => a.orders - b.orders);
    const last = Math.max(1, sorted.length - 1);
    return new Map(
      sorted.map((o, i) => [o.region, { orders: o.orders, t: sorted.length === 1 ? 1 : i / last }]),
    );
  }, [orders]);

  // Every frame: lift busy / hovered states, fade labels on the far side of the globe
  useFrame((_, delta) => {
    if (!shapes) return;
    cameraDir.copy(camera.position).normalize();
    shapes.forEach((s) => {
      const group = groups.current[s.code];
      if (group) {
        const info = byCode.get(s.code);
        const lift = (info ? info.t * 0.012 : 0) + (s.code === hovered || s.code === selected ? 0.014 : 0);
        const next = group.scale.x + (1 + lift - group.scale.x) * Math.min(1, delta * 8);
        group.scale.setScalar(next);
      }
      const label = labels.current[s.code];
      if (label) {
        const facing = cameraDir.dot(s.center.clone().normalize());
        label.style.opacity = String(THREE.MathUtils.clamp((facing - 0.4) * 4, 0, 1));
      }
    });
  });

  if (!shapes) return null;

  return (
    <>
      {shapes.map((s) => {
        const info = byCode.get(s.code);
        const active = s.code === hovered || s.code === selected;
        return (
          <group key={s.code} ref={(el) => { groups.current[s.code] = el; }}>
            <mesh
              geometry={s.fill}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                setHovered(s.code);
                if (onSelect) document.body.style.cursor = "pointer";
              }}
              onPointerOut={() => {
                setHovered((h) => (h === s.code ? null : h));
                document.body.style.cursor = "";
              }}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                if (e.delta > 4) return; // it was a drag to rotate, not a click
                e.stopPropagation();
                onSelect?.(s.code);
              }}
            >
              <meshBasicMaterial
                color={info ? ramp(info.t) : NEUTRAL}
                transparent
                opacity={active ? 0.85 : info ? 0.55 : 0.15}
                side={THREE.DoubleSide}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            {s.borders.map((b, i) => (
              <lineLoop key={i} geometry={b}>
                <lineBasicMaterial color={active ? "#FFFFFF" : "#CBD5E1"} transparent opacity={active ? 0.95 : 0.35} />
              </lineLoop>
            ))}
          </group>
        );
      })}

      {/* Labels: every state shows its 2-letter code; hovering expands it to the full name + orders */}
      {shapes.map((s) => {
        const info = byCode.get(s.code);
        const hoveredHere = s.code === hovered;
        const selectedHere = s.code === selected;
        return (
          <Html
            key={`label-${s.code}`}
            position={s.center}
            center
            zIndexRange={hoveredHere ? [100, 90] : [20, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div
              ref={(el) => { labels.current[s.code] = el; }}
              className={`whitespace-nowrap rounded-md border font-medium shadow-lg backdrop-blur transition-all ${
                hoveredHere
                  ? "border-white/40 bg-page/95 px-2 py-1 text-[11px] text-white"
                  : selectedHere
                    ? "border-white/40 bg-page/90 px-1.5 py-0.5 text-[10px] text-white"
                    : "border-line/60 bg-page/60 px-1 py-px text-[9px] text-white/85"
              }`}
            >
              {hoveredHere || selectedHere ? s.name : s.code}
              {hoveredHere && info && <span className="ml-1.5 text-muted">{num(info.orders)} orders</span>}
              {hoveredHere && onSelect && <span className="ml-1.5 text-brand">· click to filter</span>}
            </div>
          </Html>
        );
      })}
    </>
  );
}
