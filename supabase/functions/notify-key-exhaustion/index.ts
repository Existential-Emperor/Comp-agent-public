import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Notify Key Exhaustion – sends an email alert when an API key runs out of credits.
 * Uses Resend API for email delivery.
 */

const ALERT_EMAIL = "shirish.boga@workday.com";

async function sendEmailViaResend(
  resendKey: string,
  subject: string,
  htmlBody: string,
): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "CompAgent Alerts <onboarding@resend.dev>",
        to: [ALERT_EMAIL],
        subject,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend API error: ${res.status} ${err}`);
      return false;
    }

    console.log("Email sent successfully via Resend");
    return true;
  } catch (err) {
    console.error("Resend send error:", err);
    return false;
  }
}

async function sendEmailViaLovableAI(
  subject: string,
  body: string,
): Promise<boolean> {
  // Fallback: log the alert prominently so it's visible in function logs
  console.error("=".repeat(60));
  console.error(`🚨 API KEY ALERT: ${subject}`);
  console.error(body);
  console.error("=".repeat(60));

  // Also try to store as a high-priority event for dashboard visibility
  return false;
}

function buildEmailHtml(data: {
  keyName: string;
  service: string;
  eventType: string;
  httpStatus?: number;
  errorMessage?: string;
  edgeFunction?: string;
}): string {
  const timestamp = new Date().toISOString();
  const statusEmoji = data.eventType === "credits_exhausted" ? "💳" 
    : data.eventType === "rate_limited" ? "⏱️" 
    : "🔑";

  return `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; padding: 20px; }
  .card { background: white; border-radius: 12px; padding: 32px; max-width: 560px; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; }
  .badge-red { background: #fef2f2; color: #dc2626; }
  .badge-yellow { background: #fffbeb; color: #d97706; }
  .badge-gray { background: #f4f4f5; color: #71717a; }
  .detail { background: #f9fafb; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .detail-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
  .detail-label { color: #6b7280; font-size: 13px; }
  .detail-value { font-weight: 600; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .subtitle { color: #6b7280; font-size: 14px; margin: 0 0 24px; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px; }
</style></head>
<body>
  <div class="card">
    <div style="font-size: 32px; margin-bottom: 12px;">${statusEmoji}</div>
    <h1>API Key Alert: ${data.eventType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</h1>
    <p class="subtitle">An API key issue was detected in your CompAgent system.</p>
    
    <div class="detail">
      <div class="detail-row"><span class="detail-label">Key Name</span><span class="detail-value">${data.keyName}</span></div>
      <div class="detail-row"><span class="detail-label">Service</span><span class="detail-value">${data.service}</span></div>
      <div class="detail-row"><span class="detail-label">Event Type</span><span class="detail-value"><span class="badge ${data.eventType === 'credits_exhausted' ? 'badge-red' : data.eventType === 'rate_limited' ? 'badge-yellow' : 'badge-gray'}">${data.eventType}</span></span></div>
      ${data.httpStatus ? `<div class="detail-row"><span class="detail-label">HTTP Status</span><span class="detail-value">${data.httpStatus}</span></div>` : ""}
      ${data.edgeFunction ? `<div class="detail-row"><span class="detail-label">Edge Function</span><span class="detail-value">${data.edgeFunction}</span></div>` : ""}
      ${data.errorMessage ? `<div class="detail-row"><span class="detail-label">Error</span><span class="detail-value">${data.errorMessage.slice(0, 200)}</span></div>` : ""}
      <div class="detail-row"><span class="detail-label">Timestamp</span><span class="detail-value">${timestamp}</span></div>
    </div>
    
    <p style="font-size: 14px; color: #374151; margin-top: 16px;">
      <strong>Action Required:</strong> ${
        data.eventType === "credits_exhausted" 
          ? "Please top up credits or add a new backup API key."
          : data.eventType === "rate_limited"
          ? "The key is being rate-limited. Requests will retry automatically, but consider reducing usage or upgrading your plan."
          : "The API key may be invalid or expired. Please check and update the key."
      }
    </p>
    
    <div class="footer">CompAgent • Competitive Intelligence Platform</div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth guard (shared): valid user JWT or service-role key required ---
  const authError = await requireAuth(req, corsHeaders);
  if (authError) return authError;

  try {
    const data = await req.json();
    const { keyName, service, eventType, httpStatus, errorMessage, edgeFunction } = data;

    if (!keyName || !service) {
      return new Response(
        JSON.stringify({ success: false, error: "keyName and service are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `⚠️ CompAgent: ${service.toUpperCase()} API Key ${eventType === "credits_exhausted" ? "Credits Exhausted" : eventType === "rate_limited" ? "Rate Limited" : "Error"} — ${keyName}`;
    const htmlBody = buildEmailHtml({ keyName, service, eventType, httpStatus, errorMessage, edgeFunction });

    let emailSent = false;

    // Try Resend first
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY) {
      emailSent = await sendEmailViaResend(RESEND_API_KEY, subject, htmlBody);
    }

    // Fallback: prominent console logging
    if (!emailSent) {
      await sendEmailViaLovableAI(subject, `Key: ${keyName}\nService: ${service}\nEvent: ${eventType}\nHTTP: ${httpStatus}\nFunction: ${edgeFunction}\nError: ${errorMessage}`);
    }

    // Mark event as notified in DB
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("api_key_events")
        .update({ notified: true })
        .eq("key_name", keyName)
        .eq("notified", false);
    }

    return new Response(
      JSON.stringify({ success: true, emailSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Notification error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
