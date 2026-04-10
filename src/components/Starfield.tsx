import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  radius: number;
  baseOpacity: number;
  speed: number;
  phase: number;
  hue: number;
  saturation: number;
  lightness: number;
}

const Starfield = ({ className = "" }: { className?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initStars();
    };

    const initStars = () => {
      // Moderate density — enough to feel like a starry sky without overwhelming UI
      const count = Math.floor((w * h) / 2500);
      starsRef.current = Array.from({ length: count }, () => {
        const isWarm = Math.random() < 0.1;
        const hue = isWarm ? 30 + Math.random() * 30 : 200 + Math.random() * 60;
        const saturation = isWarm ? 40 + Math.random() * 20 : 30 + Math.random() * 40;
        const lightness = 75 + Math.random() * 20;
        const isBright = Math.random() < 0.08;

        return {
          x: Math.random() * w,
          y: Math.random() * h,
          radius: isBright ? 0.8 + Math.random() * 1.0 : 0.2 + Math.random() * 0.7,
          baseOpacity: isBright ? 0.5 + Math.random() * 0.4 : 0.15 + Math.random() * 0.35,
          speed: 0.3 + Math.random() * 0.7,
          phase: Math.random() * Math.PI * 2,
          hue,
          saturation,
          lightness,
        };
      });
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, w, h);

      for (const star of starsRef.current) {
        const twinkle = Math.sin(time * 0.001 * star.speed + star.phase);
        const alpha = star.baseOpacity * (0.6 + twinkle * 0.4);
        const r = star.radius * (0.9 + twinkle * 0.15);

        // Subtle glow for brighter stars
        if (star.radius > 1.0) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, r * 3, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${star.hue}, ${star.saturation}%, ${star.lightness}%, ${alpha * 0.08})`;
          ctx.fill();
        }

        // Star core
        ctx.beginPath();
        ctx.arc(star.x, star.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${star.hue}, ${star.saturation}%, ${star.lightness}%, ${alpha})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    resize();
    rafRef.current = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none fixed inset-0 ${className}`}
      style={{ opacity: 0.6 }}
      aria-hidden="true"
    />
  );
};

export default Starfield;
