import Starfield from "./Starfield";

/**
 * SentinelBackground — futuristic ambient layer.
 * Stack:
 *   1. Starfield (canvas, deepest)
 *   2. Aurora gradient (drifting indigo/cyan glow)
 *   3. Drifting orbs (cyan + violet)
 *   4. Subtle scan-line sweep
 * All layers are pointer-events:none and aria-hidden.
 */
const SentinelBackground = () => {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <Starfield />
      <div className="sentinel-aurora" />

      {/* Drifting orbs */}
      <div
        className="orb-drift absolute -left-32 top-1/4 h-[28rem] w-[28rem] rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(var(--glow-primary) / 0.35), transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="orb-drift absolute -right-24 bottom-0 h-[32rem] w-[32rem] rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(var(--glow-accent) / 0.35), transparent 70%)",
          filter: "blur(70px)",
          animationDelay: "-6s",
        }}
      />
      <div
        className="orb-drift absolute left-1/3 -top-24 h-[24rem] w-[24rem] rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(230 80% 55% / 0.30), transparent 70%)",
          filter: "blur(60px)",
          animationDelay: "-3s",
        }}
      />

      {/* Scan-line sweep across the viewport */}
      <div className="scan-line absolute inset-0" />
    </div>
  );
};

export default SentinelBackground;
