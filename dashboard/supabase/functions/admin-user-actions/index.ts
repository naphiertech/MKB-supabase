import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  accountActionState,
  authorizeAdminUserAction,
  authorizeEmploymentLifecycleAction,
  authorizeRiderAccessAction,
} from '../_shared/userActionPolicy.ts';

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

  let payload: {
    action?: unknown;
    userId?: unknown;
    reason?: unknown;
    effectiveDate?: unknown;
    remarks?: unknown;
    requestId?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'A valid JSON request body is required.' }, 400);
  }
  const action = payload.action;
  const userId = payload.userId;
  if (!['suspend', 'reactivate', 'restrict', 'restore_access', 'archive', 'restore'].includes(String(action)) || typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return json({ ok: false, error: 'Invalid account action request.' }, 400);
  }
  const validatedAction = action as 'suspend' | 'reactivate' | 'restrict' | 'restore_access' | 'archive' | 'restore';

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerAuth, error: callerAuthError } = await authClient.auth.getUser(accessToken);
  if (callerAuthError || !callerAuth.user) return json({ ok: false, error: 'Your session is invalid or expired.' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const [
    { data: caller, error: callerError },
    { data: target, error: targetError },
    { data: targetAuthData, error: targetAuthError },
  ] = await Promise.all([
    adminClient.from('users').select('id, full_name, role, status, employment_status').eq('id', callerAuth.user.id).single(),
    adminClient.from('users').select('id, full_name, role, status, employment_status').eq('id', userId).single(),
    adminClient.auth.admin.getUserById(userId),
  ]);
  if (callerError || !caller) return json({ ok: false, error: 'Caller profile was not found.' }, 403);
  if (targetError || !target) return json({ ok: false, error: 'Target user was not found.' }, 404);
  if (targetAuthError || !targetAuthData.user) return json({ ok: false, error: 'Target Auth user was not found.' }, 404);
  const targetWasBanned = Boolean(
    targetAuthData.user.banned_until
    && new Date(targetAuthData.user.banned_until).getTime() > Date.now()
  );

  const isEmploymentAction = validatedAction === 'archive' || validatedAction === 'restore';
  const isRiderAccessAction = validatedAction === 'restrict' || validatedAction === 'restore_access';
  const authorizationResult = isEmploymentAction
    ? authorizeEmploymentLifecycleAction(validatedAction as 'archive' | 'restore', caller.role, caller.id, target.id, target.role)
    : isRiderAccessAction
      ? authorizeRiderAccessAction(validatedAction, caller.role, caller.id, target.id, target.role, target.employment_status)
      : authorizeAdminUserAction(validatedAction as 'suspend' | 'reactivate', caller.role, caller.id, target.id, target.role, target.employment_status);
  if (!authorizationResult.allowed) return json({ ok: false, error: authorizationResult.reason }, 403);

  if (isEmploymentAction) {
    if (typeof payload.reason !== 'string' || typeof payload.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.requestId)) {
      return json({ ok: false, error: 'A reason and valid request identifier are required.' }, 400);
    }
    if (validatedAction === 'archive' && (typeof payload.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveDate))) {
      return json({ ok: false, error: 'A valid archive effective date is required.' }, 400);
    }

    const previousBanDuration = targetWasBanned ? '876000h' : 'none';
    if (validatedAction === 'archive') {
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400);
    }

    const { data: transitionResult, error: transitionError } = await adminClient.rpc('transition_employee_lifecycle', {
      p_actor_id: caller.id,
      p_target_user_id: target.id,
      p_action: validatedAction,
      p_effective_date: validatedAction === 'archive' ? payload.effectiveDate : null,
      p_reason: payload.reason,
      p_remarks: typeof payload.remarks === 'string' ? payload.remarks : null,
      p_request_id: payload.requestId,
    });
    if (transitionError) {
      if (validatedAction === 'archive') {
        await adminClient.auth.admin.updateUserById(userId, { ban_duration: previousBanDuration });
      }
      return json({ ok: false, error: transitionError.message }, transitionError.code === '42501' ? 403 : 400);
    }
    return json({ ok: true, result: transitionResult });
  }

  if (isRiderAccessAction) {
    if (typeof payload.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.requestId)) {
      return json({ ok: false, error: 'A valid request identifier is required.' }, 400);
    }

    const previousBanDuration = targetWasBanned ? '876000h' : 'none';
    if (validatedAction === 'restore_access') {
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: 'none' });
      if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400);
    }

    const { data: transitionResult, error: transitionError } = await adminClient.rpc('transition_rider_account_access', {
      p_actor_id: caller.id,
      p_target_user_id: target.id,
      p_action: validatedAction,
      p_request_id: payload.requestId,
    });
    if (transitionError) {
      if (validatedAction === 'restore_access') {
        await adminClient.auth.admin.updateUserById(userId, { ban_duration: previousBanDuration });
      }
      return json({ ok: false, error: transitionError.message }, transitionError.code === '42501' ? 403 : 400);
    }
    return json({ ok: true, result: transitionResult });
  }

  const { status: nextStatus, banDuration: nextBanDuration } = accountActionState(validatedAction as 'suspend' | 'reactivate');
  const previousStatus = target.status;
  const previousBanDuration = targetWasBanned ? '876000h' : 'none';

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, { ban_duration: nextBanDuration });
  if (authUpdateError) return json({ ok: false, error: authUpdateError.message }, 400);

  const { error: profileUpdateError } = await adminClient.from('users').update({ status: nextStatus }).eq('id', userId);
  if (profileUpdateError) {
    await adminClient.auth.admin.updateUserById(userId, { ban_duration: previousBanDuration });
    return json({ ok: false, error: 'The public account status could not be synchronized.' }, 500);
  }

  const { error: auditError } = await adminClient.from('activity_logs').insert({
    user_id: caller.id,
    event_type: validatedAction === 'suspend' ? 'user_suspended' : 'user_reactivated',
    description: `${caller.full_name} ${validatedAction === 'suspend' ? 'suspended' : 'reactivated'} the account for "${target.full_name}".`,
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
