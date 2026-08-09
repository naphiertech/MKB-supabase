import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { accountActionState, authorizeAdminUserAction } from '../_shared/userActionPolicy.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const accessToken = authorization?.replace(/^Bearer\s+/i, '');
  if (!accessToken) return json({ ok: false, error: 'Authentication is required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ ok: false, error: 'Server configuration is incomplete.' }, 500);

  let payload: { action?: unknown; userId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'A valid JSON request body is required.' }, 400);
  }
  const action = payload.action;
  const userId = payload.userId;
  if ((action !== 'suspend' && action !== 'reactivate') || typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return json({ ok: false, error: 'Invalid account action request.' }, 400);
  }

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerAuth, error: callerAuthError } = await authClient.auth.getUser(accessToken);
  if (callerAuthError || !callerAuth.user) return json({ ok: false, error: 'Your session is invalid or expired.' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [{ data: caller, error: callerError }, { data: target, error: targetError }] = await Promise.all([
    adminClient.from('users').select('id, full_name, role, status').eq('id', callerAuth.user.id).single(),
    adminClient.from('users').select('id, full_name, role, status').eq('id', userId).single(),
  ]);
  if (callerError || !caller) return json({ ok: false, error: 'Caller profile was not found.' }, 403);
  if (targetError || !target) return json({ ok: false, error: 'Target user was not found.' }, 404);

  const authorizationResult = authorizeAdminUserAction(caller.role, caller.id, target.id, target.role);
  if (!authorizationResult.allowed) return json({ ok: false, error: authorizationResult.reason }, 403);

  const { status: nextStatus, banDuration: nextBanDuration } = accountActionState(action);
  const previousStatus = target.status;
  const previousBanDuration = previousStatus === 'suspended' ? '876000h' : 'none';

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: nextBanDuration });
  if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400);

  const { error: profileUpdateError } = await adminClient.from('users').update({ status: nextStatus }).eq('id', userId);
  if (profileUpdateError) {
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: previousBanDuration });
    return json({ ok: false, error: 'The public account status could not be synchronized.' }, 500);
  }

  const { error: auditError } = await adminClient.from('activity_logs').insert({
    user_id: caller.id,
    event_type: action === 'suspend' ? 'user_suspended' : 'user_reactivated',
    description: `${caller.full_name} ${action === 'suspend' ? 'suspended' : 'reactivated'} the account for "${target.full_name}".`,
    metadata: {
      target_user_id: target.id,
      target_role: target.role,
      previous_status: previousStatus,
      new_status: nextStatus,
      source: 'admin-user-actions',
    },
  });
  if (auditError) {
    await adminClient.from('users').update({ status: previousStatus }).eq('id', userId);
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: previousBanDuration });
    return json({ ok: false, error: 'The account action was rolled back because its audit record could not be saved.' }, 500);
  }

  return json({ ok: true, status: nextStatus });
});
