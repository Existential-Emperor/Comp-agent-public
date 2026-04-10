import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Cleanup cron job: strips ephemeral CDN URLs from raw_content every 24 hours.
 *
 * Preserves:
 *   - <!-- APPROVED_MEDIA_START --> ... <!-- APPROVED_MEDIA_END --> blocks
 *     (permanent storage URLs + context metadata from quality gate)
 *   - Plain text / markdown prose (no image URLs)
 *
 * Removes:
 *   - Inline CDN image URLs (document360, cloudfront, amazonaws, blob.core, etc.)
 *     that use signed/expiring tokens (SAS, Expires, X-Amz-*)
 *   - Markdown image references ![...](https://cdn...)
 *   - HTML <img> tags pointing to CDN URLs
 */

// Patterns for expiring CDN URLs
const EXPIRING_CDN_PATTERNS = [
  /!\[[^\]]*\]\(https?:\/\/[^\s)]*(?:cdn\.document360|cloudfront|amazonaws|blob\.core\.windows)[^\s)]*\)/gi,
  /<img[^>]*src=["']https?:\/\/[^\s"']*(?:cdn\.document360|cloudfront|amazonaws|blob\.core\.windows)[^\s"']*["'][^>]*\/?>/gi,
  /https?:\/\/[^\s"'<>]*(?:cdn\.document360|cloudfront|amazonaws|blob\.core\.windows)[^\s"'<>]*(?:\?[^\s"'<>]*(?:sig=|se=|Expires=|X-Amz-)[^\s"'<>]*)/gi,
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch all competitor_pages with raw_content
    const { data: pages, error } = await supabase
      .from("competitor_pages")
      .select("id, raw_content")
      .not("raw_content", "is", null)
      .neq("raw_content", "");

    if (error) throw error;
    if (!pages || pages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No pages to clean", cleaned: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cleaned = 0;

    for (const page of pages) {
      let content = page.raw_content as string;
      if (!content) continue;

      // Extract and preserve approved media block
      const approvedMediaMatch = content.match(/<!-- APPROVED_MEDIA_START -->[\s\S]*?<!-- APPROVED_MEDIA_END -->/);
      const approvedMediaBlock = approvedMediaMatch ? approvedMediaMatch[0] : "";

      // Strip approved media block temporarily
      let strippedContent = content.replace(/\n?\n?<!-- APPROVED_MEDIA_START -->[\s\S]*?<!-- APPROVED_MEDIA_END -->/g, "");

      // Remove expiring CDN URLs
      let changed = false;
      for (const pattern of EXPIRING_CDN_PATTERNS) {
        const before = strippedContent;
        strippedContent = strippedContent.replace(pattern, "");
        if (strippedContent !== before) changed = true;
      }

      if (!changed) continue;

      // Clean up empty markdown image placeholders left behind
      strippedContent = strippedContent.replace(/!\[\]\(\s*\)/g, "");
      // Clean up consecutive blank lines
      strippedContent = strippedContent.replace(/\n{3,}/g, "\n\n");

      // Re-append approved media block
      const newContent = approvedMediaBlock
        ? strippedContent + "\n\n" + approvedMediaBlock
        : strippedContent;

      await supabase
        .from("competitor_pages")
        .update({ raw_content: newContent })
        .eq("id", page.id);

      cleaned++;
    }

    console.log(`[cleanup-raw-content] Cleaned ${cleaned}/${pages.length} pages`);

    return new Response(
      JSON.stringify({ success: true, cleaned, total: pages.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[cleanup-raw-content] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
