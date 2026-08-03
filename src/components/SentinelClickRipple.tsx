import { useEffect } from "react";

/**
 * Global click ripple for the Sentinel theme.
 * Mounted once at the app root; spawns a short cyan ring at the click point
 * for any pointer-down interaction (skipped for inputs/textareas/contenteditable).
 */
const SentinelClickRipple = () => {
  useEffect(() => {
    const handle = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const ripple = document.createElement("span");
      ripple.className = "sentinel-ripple";
      const size = 24;
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - size / 2}px`;
      ripple.style.top = `${e.clientY - size / 2}px`;
      ripple.style.position = "fixed";
      ripple.style.zIndex = "9999";

      document.body.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 650);
    };

    window.addEventListener("pointerdown", handle, { passive: true });
    return () => window.removeEventListener("pointerdown", handle);
  }, []);

  return null;
};

export default SentinelClickRipple;
