import { useCallback, useEffect, useRef } from "react";

const NOTIFICATION_TAG = "sentinel-analysis-complete";
export type NotificationArmResult = NotificationPermission | "embedded" | "unsupported";

const isTopLevelWindow = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
};

/**
 * Request notification permission from a user gesture.
 *
 * Module-level so EVERY analysis-initiating gesture across both agents (Comp
 * "Let's Go!" + follow-ups, Feed chips + panel send) can arm permission through
 * one code path. Must be called synchronously inside the gesture so it runs
 * within the browser's transient-activation window.
 */
export async function armNotificationPermission(): Promise<NotificationArmResult> {
  if (typeof Notification === "undefined") return "unsupported";
  if (!isTopLevelWindow()) return "embedded";
  if (Notification.permission !== "default") return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Foreground browser notification for completed analyses.
 *
 * Fires a Notifications-API notification on the `loading` true -> false
 * transition, but ONLY when the tab is hidden/unfocused — so users who stay on
 * the tab keep seeing the in-app result, while those who switched away get
 * pinged. No service worker, no background push: this only works while the app
 * is open in a tab.
 */
export function useCompletionNotification(loading: boolean) {
  const prevLoading = useRef(loading);

  /** Request permission lazily, ideally from a user gesture (e.g. send). */
  const armPermission = useCallback(() => armNotificationPermission(), []);

  useEffect(() => {
    const was = prevLoading.current;
    prevLoading.current = loading;

    // Only act on the completion edge (true -> false).
    if (!was || loading) return;
    if (typeof Notification === "undefined") return;
    if (!isTopLevelWindow()) return;
    if (Notification.permission !== "granted") return;
    // Foreground-only intent: skip when the tab is already visible/focused.
    if (typeof document !== "undefined" && !document.hidden) return;

    try {
      const notification = new Notification("Sentinel analysis complete", {
        body: "Your competitive analysis is ready to view.",
        tag: NOTIFICATION_TAG,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Notification construction can throw in some browsers; fail silently.
    }
  }, [loading]);

  return { armPermission };
}
