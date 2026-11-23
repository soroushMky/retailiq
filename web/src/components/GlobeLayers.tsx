"use client";

import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { GeoPoint } from "@/lib/api";

export type Look = "day" | "night";

const TEXTURES = {
  day: "/textures/earth-blue-marble.jpg",
  night: "/textures/earth-night.jpg",
  bump: "/textures/earth-topology.png",
  water: "/textures/earth-water.png",
};

const LOW = new THREE.Color("#0EB582");   // few orders: brand green
const MID = new THREE.Color("#FBBF24");   // more orders: gold
const HIGH = new THREE.Color("#FF6B4A");  // busiest areas: coral
const HOTSPOTS = 6;                       // pulsing rings on the busiest areas

/** Latitude / longitude -> a point on a sphere of radius r (matches the texture layout). */
export function toVec(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

/** 0..1 -> green, gold, coral */
function rampColor(t: number, out: THREE.Color): THREE.Color {
  return t < 0.6 ? out.copy(LOW).lerp(MID, t / 0.6) : out.copy(MID).lerp(HIGH, (t - 0.6) / 0.4);
}

// ---------------------------------------------------------------- Earth
export function Earth({ look }: { look: Look }) {
  const [map, bump, water] = useTexture([TEXTURES[look], TEXTURES.bump, TEXTURES.water], (loaded) => {
  const [m] = loaded as THREE.Texture[];
  m.colorSpace = THREE.SRGBColorSpace;
  m.anisotropy = 8;
  });
  return (
    <mesh>
      <sphereGeometry args={[1, 96, 96]} />
      <meshPhongMaterial
        map={map}
        bumpMap={bump}
        bumpScale={0.03}
        specularMap={water}
        specular={new THREE.Color(look === "day" ? "#3a5a7a" : "#1a2a3a")}
        shininess={14}
      />
    </mesh>
  );
}

export function PlainEarth() {
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <meshBasicMaterial color="#131A32" />
    </mesh>
  );
}

// ---------------------------------------------------------------- atmosphere rim
const atmosphereShader = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
      gl_FragColor = vec4(0.35, 0.65, 1.0, 1.0) * intensity;
    }`,
};

export function Atmosphere() {
  return (
    <mesh scale={1.15}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        args={[atmosphereShader]}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------- glowing dots
const glowShader = {
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute vec3 aColor;
    uniform float uGrow;
    uniform float uPixelRatio;
    varying vec3 vColor;
    void main() {
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uGrow * uPixelRatio * (2.7 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    varying vec3 vColor;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float glow = pow(1.0 - d * 2.0, 1.8);
      float core = smoothstep(0.22, 0.0, d);
      // softer light so overlapping dots keep their colour instead of burning to white
      gl_FragColor = vec4(vColor * glow * 0.9 + vColor * core * 0.6, glow * 0.8);
    }`,
};

export function GlowDots({ points, animate }: { points: GeoPoint[]; animate: boolean }) {
  const material = useRef<THREE.ShaderMaterial>(null);
  const grow = useRef(animate ? 0 : 1);
  const { gl } = useThree();

  const geometry = useMemo(() => {
    const max = Math.max(1, ...points.map((p) => p.orders));
    const positions = new Float32Array(points.length * 3);
    const sizes = new Float32Array(points.length);
    const colors = new Float32Array(points.length * 3);
    const c = new THREE.Color();
    points.forEach((p, i) => {
      const t = Math.log1p(p.orders) / Math.log1p(max);
      toVec(p.lat, p.lng, 1.004).toArray(positions, i * 3);
      sizes[i] = 8 + t * 26;                 // bigger minimum: small areas stay visible
      rampColor(t, c).toArray(colors, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    return g;
  }, [points]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(() => ({ uGrow: { value: animate ? 0 : 1 }, uPixelRatio: { value: 1 } }), [animate]);

  useLayoutEffect(() => {
    grow.current = animate ? 0 : 1;
  }, [geometry, animate]);

  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    m.uniforms.uPixelRatio.value = gl.getPixelRatio();
    if (grow.current < 1) grow.current = Math.min(1, grow.current + delta / 1.2);
    m.uniforms.uGrow.value = 1 - Math.pow(1 - grow.current, 3);
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={material}
        args={[glowShader]}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ---------------------------------------------------------------- pulsing rings
export function PulseRings({ points, animate }: { points: GeoPoint[]; animate: boolean }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);

  const spots = useMemo(
    () =>
      points.slice(0, HOTSPOTS).map((p) => ({
        position: toVec(p.lat, p.lng, 1.006),
        quaternion: new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          toVec(p.lat, p.lng, 1).normalize(),
        ),
      })),
    [points],
  );

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.getElapsedTime();
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      const phase = (t * 0.45 + i / HOTSPOTS) % 1;
      ring.scale.setScalar(0.015 + phase * 0.085);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - phase);
    });
  });

  return (
    <>
      {spots.map((s, i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={s.position}
          quaternion={s.quaternion}
          scale={0.05}
        >
          <ringGeometry args={[0.82, 1, 48]} />
          <meshBasicMaterial
            color="#FF6B4A"
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}