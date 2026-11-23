/**
 * Slow, ambient "aurora" background: three blurred colour fields drifting, plus a faint dot grid.
 * Pure CSS (no JavaScript), so it costs almost nothing and runs on the GPU.
 */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora aurora-green" />
      <div className="aurora aurora-blue" />
      <div className="aurora aurora-orange" />
      <div className="dot-grid" />
    </div>
  );
}