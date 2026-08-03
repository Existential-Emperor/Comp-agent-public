import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import SmartImage, { LightboxRetryFallback } from "@/components/SmartImage";

/**
 * SmartImage regression suite — pins the state machine that replaced the
 * legacy `e.currentTarget.style.display = "none"` pattern. If any of these
 * break, the band-aid is back.
 */

const SRC = "https://example.com/img.png";

beforeEach(() => {
  // IO: trigger immediately as "intersecting" so we can drive the load chain.
  // Tests that need the deferred behavior install their own mock.
  // @ts-expect-error jsdom has no IO
  window.IntersectionObserver = class {
    private cb: IntersectionObserverCallback;
    constructor(cb: IntersectionObserverCallback) {
      this.cb = cb;
    }
    observe(el: Element) {
      this.cb(
        [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = "";
    thresholds = [];
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function getImg(): HTMLImageElement {
  return screen.getByRole("img") as HTMLImageElement;
}

describe("SmartImage state machine", () => {
  it("recovers after 2 transient errors then a successful load", () => {
    vi.useFakeTimers();
    render(<SmartImage src={SRC} alt="x" eager width={100} height={100} />);

    const img = getImg();
    expect(img.src).toBe(SRC);
    // First failure → schedule retry #1 with 2s backoff.
    fireEvent.error(img);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(getImg().src).toContain("?_r=1");

    // Second failure → retry #2 with 5s backoff.
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(getImg().src).toContain("?_r=2");

    // Recovery — fallback must never appear.
    fireEvent.load(getImg());
    expect(screen.queryByRole("img")).not.toBeNull();
    expect(document.querySelector('[data-smart-image="failed"]')).toBeNull();
  });

  it("renders fallback after exhausting maxRetries (3 total loads)", () => {
    vi.useFakeTimers();
    const onTerminalFailure = vi.fn();
    render(
      <SmartImage
        src={SRC}
        alt="x"
        eager
        width={100}
        height={100}
        onTerminalFailure={onTerminalFailure}
      />,
    );

    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(5000); });
    fireEvent.error(getImg());

    expect(document.querySelector('[data-smart-image="failed"]')).not.toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(onTerminalFailure).toHaveBeenCalledTimes(1);
    expect(onTerminalFailure).toHaveBeenCalledWith({ src: SRC });
  });

  it("uses bounded ?_r=N cache-busters — no timestamps, no unbounded keys", () => {
    vi.useFakeTimers();
    render(<SmartImage src={SRC} alt="x" eager width={100} height={100} />);
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(2000); });
    expect(getImg().src).toMatch(/\?_r=1$/);
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(5000); });
    expect(getImg().src).toMatch(/\?_r=2$/);
  });

  it("walks srcFallbacks BEFORE entering cache-buster retries", () => {
    vi.useFakeTimers();
    const FALLBACK = "https://example.com/fallback.png";
    render(
      <SmartImage
        src={SRC}
        srcFallbacks={[FALLBACK]}
        alt="x"
        eager
        width={100}
        height={100}
      />,
    );
    // First error → swap to fallback URL immediately, no backoff.
    fireEvent.error(getImg());
    expect(getImg().src).toBe(FALLBACK);
    expect(getImg().src).not.toContain("?_r=");
    // Next error → enters cache-buster phase against the fallback URL.
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(2000); });
    expect(getImg().src).toBe(`${FALLBACK}?_r=1`);
  });

  it("calls IntersectionObserver.unobserve on first intersection", () => {
    const unobserve = vi.fn();
    let stored: IntersectionObserverCallback | null = null;
    // @ts-expect-error replace mock
    window.IntersectionObserver = class {
      constructor(cb: IntersectionObserverCallback) { stored = cb; }
      observe(el: Element) {
        stored?.(
          [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
          { unobserve } as unknown as IntersectionObserver,
        );
      }
      unobserve = unobserve;
      disconnect() {}
      takeRecords() { return []; }
      root = null;
      rootMargin = "";
      thresholds = [];
    };
    render(<SmartImage src={SRC} alt="x" width={100} height={100} />);
    expect(unobserve).toHaveBeenCalledTimes(1);
  });

  it("does not fire setTimeout callback after unmount during backoff", () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(
      <SmartImage src={SRC} alt="x" eager width={100} height={100} />,
    );
    fireEvent.error(getImg());
    // Unmount mid-backoff — the pending retry must be cancelled.
    unmount();
    act(() => { vi.advanceTimersByTime(10_000); });
    // No "gave up" log, no thrown state-update-on-unmounted warnings.
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("LightboxRetryFallback retry button resets state and re-renders the img", () => {
    vi.useFakeTimers();
    render(
      <SmartImage
        src={SRC}
        alt="x"
        eager
        width={100}
        height={100}
        fallback={(ctx) => <LightboxRetryFallback {...ctx} />}
      />,
    );
    // Drive to terminal failure.
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.error(getImg());
    act(() => { vi.advanceTimersByTime(5000); });
    fireEvent.error(getImg());
    expect(screen.queryByRole("img")).toBeNull();

    // Click retry → image re-mounts with fresh attempt counter.
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    const img = getImg();
    expect(img.src).toBe(SRC);
    expect(img.src).not.toContain("?_r=");
  });
});
