/**
 * sanitizeImageUrl — defensive normalizer for image URLs flowing in from
 * markdown-like LLM/scrape output.
 *
 * Why: upstream content occasionally produces malformed Markdown image syntax
 *   ![alt](https://x.com/a.png "https://other.com/page
 * with the closing `"` missing or the title fragment fused into the URL by a
 * loose regex. The browser correctly rejects the resulting string as an
 * invalid URL, which then trips SmartImage's retry chain and lights up the
 * Visual Overview gallery with fallback icons.
 *
 * This function is the single source of truth for cleaning those URLs. Run it
 * at every parser boundary that constructs an `image` block. It is a pure
 * function and fully unit-tested.
 *
 * Returns a normalized URL string, or `null` if the input cannot be salvaged
 * into a valid http(s) URL.
 */
export function sanitizeImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;

  let s = raw.trim();
  if (!s) return null;

  // 1) Strip everything from the first whitespace onward — markdown title
  //    fragments (`url "title"`) and any accidental URL concatenation live
  //    after the first space.
  const wsIdx = s.search(/\s/);
  if (wsIdx >= 0) s = s.slice(0, wsIdx);

  // 2) Strip stray trailing quote/paren chars left over from broken markdown.
  s = s.replace(/[)\]"'`>]+$/g, "");

  // 3) Decode the most common HTML entities we see from scraped sources.
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");

  if (!s) return null;

  // 4) Validate. Only http(s) URLs are renderable as <img src>.
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
