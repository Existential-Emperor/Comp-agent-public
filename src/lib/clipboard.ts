/**
 * Copy text to the clipboard with a legacy fallback for environments
 * (sandboxed iframes, insecure contexts) where the async Clipboard API
 * is blocked. Returns true if the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try the modern async API first.
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function" &&
      window.isSecureContext !== false
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }

  // Legacy fallback using a hidden textarea + execCommand("copy").
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const previousRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }

    return ok;
  } catch {
    return false;
  }
}
