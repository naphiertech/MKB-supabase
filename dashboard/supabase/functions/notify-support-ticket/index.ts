import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed.' }, 405);
  }

  let body: {
    ticket?: {
      id?: string;
      ticket_number?: string;
      subject?: string;
      category?: string;
      description?: string;
      status?: string;
      creator?: {
        full_name?: string;
        email?: string;
        role?: string;
      } | null;
    };
  };

  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }

  const ticket = body.ticket;
  if (!ticket || !ticket.subject || !ticket.description) {
    return json({ ok: false, error: 'Ticket details are missing.' }, 400);
  }

  const developerEmail = Deno.env.get('DEVELOPER_EMAIL') || 'naphier.tech@gmail.com';
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  const senderName = ticket.creator?.full_name || 'System User';
  const senderEmail = ticket.creator?.email || 'N/A';
  const senderRole = ticket.creator?.role || 'N/A';
  const ticketNum = ticket.ticket_number || 'N/A';
  const category = ticket.category || 'technical_issue';

  const emailSubject = `[MKB Bug / Support] ${ticketNum} (${category}): ${ticket.subject}`;
  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #b85a00; margin-top: 0;">MKB Support Ticket Alert</h2>
      <p style="font-size: 14px; color: #475569;">A new system issue was reported and routed to engineering.</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #b85a00; padding: 12px 16px; margin: 16px 0;">
        <p style="margin: 4px 0; font-size: 13px;"><strong>Ticket Number:</strong> ${ticketNum}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Category:</strong> ${category}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Subject:</strong> ${ticket.subject}</p>
        <p style="margin: 4px 0; font-size: 13px;"><strong>Reported By:</strong> ${senderName} (${senderEmail}) - <em>${senderRole}</em></p>
      </div>

      <div style="margin-top: 16px;">
        <h4 style="color: #1e293b; margin-bottom: 8px;">Description:</h4>
        <pre style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; color: #334155; white-space: pre-wrap; font-family: monospace;">${ticket.description}</pre>
      </div>

      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;" />
      <p style="font-size: 11px; color: #94a3b8; margin: 0;">
        MKB Systems Operational Telemetry & Support Desk &bull; Lead Systems Developer: Naphier
      </p>
    </div>
  `;

  if (resendApiKey) {
    const sendToEmail = async (targetEmail: string) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'MKB System Alert <onboarding@resend.dev>',
          to: [targetEmail],
          subject: emailSubject,
          html: emailHtml,
        }),
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    };

    try {
      let result = await sendToEmail(developerEmail);
      if (!result.ok && result.data?.message?.includes('You can only send testing emails to your own email address')) {
        const match = result.data.message.match(/\(([^)]+)\)/);
        const fallbackEmail = match ? match[1] : 'naphiera@gmail.com';
        console.log(`[SupportTicket] Resend free tier sandbox restriction. Dispatching to verified account email: ${fallbackEmail}`);
        result = await sendToEmail(fallbackEmail);
      }

      return json({
        ok: result.ok,
        delivered: result.ok,
        provider: 'resend',
        developerEmail,
        response: result.data,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Resend dispatch failed';
      return json({ ok: false, error: message, developerEmail }, 500);
    }
  }

  // Graceful fallback if no RESEND_API_KEY is configured in Supabase secrets yet
  console.log(`[SupportTicket] Email notification prepared for ${developerEmail}: ${emailSubject}`);
  return json({
    ok: true,
    delivered: false,
    reason: 'RESEND_API_KEY_NOT_CONFIGURED',
    developerEmail,
    ticketNumber: ticketNum,
  });
});
