import { requireAuth } from "../_shared/auth.ts";
import { firecrawlFetch, hasFirecrawlKey } from "../_shared/firecrawl-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const { url, options } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!hasFirecrawlKey()) {
      return new Response(
        JSON.stringify({ success: false, error: "Firecrawl not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let formattedUrl = String(url).trim();
    if (formattedUrl.length > 2048) {
      return new Response(
        JSON.stringify({ success: false, error: "URL too long" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // SSRF guard: only allow public http(s) hosts; block internal/loopback/metadata targets.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(formattedUrl);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const host = parsedUrl.hostname.toLowerCase();
    const isBlockedHost =
      host === "localhost" || host.endsWith(".localhost") ||
      host === "0.0.0.0" || host === "[::1]" || host === "::1" ||
      host === "metadata.google.internal" || host === "169.254.169.254" ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host) ||
      host.endsWith(".internal") || host.endsWith(".local");
    if ((parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") || isBlockedHost) {
      return new Response(
        JSON.stringify({ success: false, error: "URL not allowed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraping URL:", formattedUrl);

    const response = await firecrawlFetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      body: JSON.stringify({
        url: formattedUrl,
        formats: options?.formats || ["markdown"],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl API error:", data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Scrape error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Failed to scrape" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
