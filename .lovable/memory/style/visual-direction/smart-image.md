---
name: SmartImage usage rule
description: Mandatory image primitive — bounded retries, IO lazy-load, React-rendered fallback. Replaces destructive img onError pattern.
type: constraint
---
All `<img>` rendering MUST go through `SmartImage` (`src/components/SmartImage.tsx`).

**Why:** The legacy pattern `onError={(e) => e.currentTarget.style.display = "none"}` permanently hides nodes on transient CDN failures (Cloudflare cold cache, CORS preflight reorder, brief 5xx). It produced empty Visual Overview tiles even though the underlying Supabase Storage URLs returned 200.

**How to apply:**
- Pass `width`/`height` (or `aspectRatio`) so the fallback fills the same box and layout never jumps.
- Use `eager` for above-the-fold images; let the IntersectionObserver gate the rest.
- For domain-level URL substitution chains (e.g. YouTube `maxresdefault → hqdefault`), use `srcFallbacks`. Do NOT mutate `el.src` from an onError handler.
- Override the default fallback at high-intent surfaces (lightbox) with `LightboxRetryFallback` so users can recover manually.
- Never use `loading="lazy"` directly on `<img>` — it races with React commits and CDN cold-starts; SmartImage replaces it with an explicit IntersectionObserver gated on the retry state machine.
