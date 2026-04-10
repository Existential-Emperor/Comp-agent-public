import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Get active subscribers
  const { data: subscribers, error: subErr } = await supabase
    .from("newsletter_subscribers")
    .select("*")
    .eq("is_active", true);

  if (subErr || !subscribers || subscribers.length === 0) {
    console.log("No active subscribers found");
    return new Response(JSON.stringify({ success: true, sent: 0, reason: "no subscribers" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get news items from last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: freshItems } = await supabase
    .from("news_items")
    .select("*")
    .gte("fetched_at", yesterday.toISOString())
    .order("published_at", { ascending: false, nullsFirst: false });

  if (!freshItems || freshItems.length === 0) {
    console.log("No fresh items to send");
    return new Response(JSON.stringify({ success: true, sent: 0, reason: "no fresh items" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const newsItems = freshItems.filter((i: any) => i.item_type === "news");
  const communityItems = freshItems.filter((i: any) => i.item_type === "community");

  // Build HTML email
  const formatDate = (d: string | null) => {
    if (!d) return "Recent";
    try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return "Recent"; }
  };

  const buildItemHtml = (item: any) => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #2a2a3a;">
        <a href="${item.source_url}" style="color: #4a9eff; text-decoration: none; font-weight: 600; font-size: 14px;">${item.title}</a>
        <div style="margin-top: 4px; color: #8888aa; font-size: 12px;">
          ${item.source_name ? `<span style="background: #1a1a2e; padding: 2px 8px; border-radius: 4px; margin-right: 8px;">${item.source_name}</span>` : ""}
          ${formatDate(item.published_at || item.fetched_at)}
        </div>
        ${item.summary ? `<div style="margin-top: 6px; color: #aaaacc; font-size: 13px; line-height: 1.4;">${(item.summary as string).slice(0, 200)}${(item.summary as string).length > 200 ? "..." : ""}</div>` : ""}
      </td>
    </tr>
  `;

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head><meta charset="utf-8"></head>
  <body style="margin: 0; padding: 0; background: #0d0d1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #ffffff; font-size: 20px; margin: 0;">📰 Comp Intel Daily Digest</h1>
        <p style="color: #8888aa; font-size: 13px; margin-top: 4px;">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
      </div>
      
      ${newsItems.length > 0 ? `
        <div style="background: #12122a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #4a9eff; font-size: 16px; margin: 0 0 12px;">Latest News (${newsItems.length})</h2>
          <table style="width: 100%; border-collapse: collapse;">
            ${newsItems.slice(0, 10).map(buildItemHtml).join("")}
          </table>
        </div>
      ` : ""}
      
      ${communityItems.length > 0 ? `
        <div style="background: #12122a; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #4a9eff; font-size: 16px; margin: 0 0 12px;">Community Buzz (${communityItems.length})</h2>
          <table style="width: 100%; border-collapse: collapse;">
            ${communityItems.slice(0, 10).map(buildItemHtml).join("")}
          </table>
        </div>
      ` : ""}

      <div style="text-align: center; margin-top: 24px; padding: 16px; color: #666688; font-size: 11px;">
        <p>You're receiving this because you subscribed to Comp Intel Feed updates.</p>
      </div>
    </div>
  </body>
  </html>
  `;

  // Send to each subscriber via Supabase Auth admin email (or log for now)
  let sentCount = 0;
  for (const sub of subscribers) {
    try {
      // Use Supabase's built-in email sending via auth.admin
      // For production, integrate with a proper email service
      console.log(`Would send digest to: ${sub.email} (${newsItems.length} news, ${communityItems.length} community)`);
      
      await supabase
        .from("newsletter_subscribers")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", sub.id);
      
      sentCount++;
    } catch (e) {
      console.error(`Failed to process subscriber ${sub.email}:`, e);
    }
  }

  console.log(`Digest prepared for ${sentCount} subscribers`);

  return new Response(JSON.stringify({
    success: true,
    sent: sentCount,
    news_count: newsItems.length,
    community_count: communityItems.length,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
