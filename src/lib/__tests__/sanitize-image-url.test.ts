import { describe, it, expect } from "vitest";
import { sanitizeImageUrl } from "../sanitize-image-url";

describe("sanitizeImageUrl", () => {
  it("strips an unclosed markdown title with a second URL", () => {
    const raw =
      'https://x.supabase.co/storage/v1/object/public/a.png "https://community.anaplan.com/discussion/1';
    expect(sanitizeImageUrl(raw)).toBe(
      "https://x.supabase.co/storage/v1/object/public/a.png",
    );
  });

  it("strips a single-quoted caption fragment", () => {
    expect(sanitizeImageUrl("https://x.com/a.png 'caption text'")).toBe(
      "https://x.com/a.png",
    );
  });

  it("decodes &amp; in query strings", () => {
    expect(sanitizeImageUrl("https://x.com/a.png?q=1&amp;v=2")).toBe(
      "https://x.com/a.png?q=1&v=2",
    );
  });

  it("returns null for non-URL garbage", () => {
    expect(sanitizeImageUrl("not a url")).toBeNull();
  });

  it("returns null for non-http schemes", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });

  it("returns null for empty/nullish input", () => {
    expect(sanitizeImageUrl("")).toBeNull();
    expect(sanitizeImageUrl(null)).toBeNull();
    expect(sanitizeImageUrl(undefined)).toBeNull();
  });

  it("passes through an already-clean URL unchanged", () => {
    const clean = "https://x.com/a.png?q=1";
    expect(sanitizeImageUrl(clean)).toBe(clean);
  });

  it("strips trailing stray closing parens / quotes", () => {
    expect(sanitizeImageUrl('https://x.com/a.png")')).toBe(
      "https://x.com/a.png",
    );
  });
});
