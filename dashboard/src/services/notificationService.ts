import { supabase } from '../lib/supabaseClient';

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  rider_id: string | null;
  violation_id: string | null;
  read: boolean;
  target_roles: string[];
  created_at?: string;
  [key: string]: unknown;
}

// Fetch all violation-flagged notifications
export const getFlaggedViolationIds = async (): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('violation_id')
    .eq('type', 'violation')
    .not('violation_id', 'is', null);

  if (error) throw error;
  return new Set((data ?? []).map((n: { violation_id: string }) => n.violation_id));
};

// Create a new notification alert
export const createNotificationAlert = async (input: {
  type: string;
  title: string;
  message: string;
  riderId: string | null;
  violationId: string | null;
  targetRoles: string[];
}): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .insert({
      type: input.type,
      title: input.title,
      message: input.message,
      rider_id: input.riderId,
      violation_id: input.violationId,
      read: false,
      target_roles: input.targetRoles
    });

  if (error) throw error;
};
