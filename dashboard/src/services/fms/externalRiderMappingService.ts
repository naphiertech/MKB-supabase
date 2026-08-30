import { supabase } from '../../lib/supabaseClient';

export interface ExternalRiderMapping {
  id: string;
  source_system: string;
  external_driver_id: string;
  external_display_name: string | null;
  rider_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  rider?: {
    id: string;
    name: string;
    mkb_id: string;
    hub_id: string | null;
    status: string;
  } | null;
}

/**
 * Lists external rider mappings for a given source system.
 */
export async function listExternalRiderMappings(
  sourceSystem = 'spx_fms'
): Promise<Record<string, ExternalRiderMapping>> {
  const { data, error } = await supabase
    .from('external_rider_mappings')
    .select(`
      id,
      source_system,
      external_driver_id,
      external_display_name,
      rider_id,
      created_by,
      created_at,
      updated_at,
      riders:rider_id (
        id,
        name,
        mkb_id,
        hub_id,
        status
      )
    `)
    .eq('source_system', sourceSystem);

  if (error) {
    console.error('Error fetching external rider mappings:', error);
    throw error;
  }

  const mappingMap: Record<string, ExternalRiderMapping> = {};
  (data || []).forEach((row: any) => {
    mappingMap[row.external_driver_id] = {
      id: row.id,
      source_system: row.source_system,
      external_driver_id: row.external_driver_id,
      external_display_name: row.external_display_name,
      rider_id: row.rider_id,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      rider: Array.isArray(row.riders) ? row.riders[0] : row.riders,
    };
  });

  return mappingMap;
}

/**
 * Saves or updates a mapping between an external driver ID and a MKBRiderTrack Rider.
 */
export async function saveExternalRiderMapping(payload: {
  external_driver_id: string;
  external_display_name?: string | null;
  rider_id: string;
  source_system?: string;
}): Promise<ExternalRiderMapping> {
  const source_system = payload.source_system || 'spx_fms';

  const { data, error } = await supabase
    .from('external_rider_mappings')
    .upsert(
      {
        source_system,
        external_driver_id: payload.external_driver_id,
        external_display_name: payload.external_display_name || null,
        rider_id: payload.rider_id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source_system,external_driver_id' }
    )
    .select(`
      id,
      source_system,
      external_driver_id,
      external_display_name,
      rider_id,
      created_by,
      created_at,
      updated_at
    `)
    .single();

  if (error) {
    console.error('Error saving external rider mapping:', error);
    throw error;
  }

  return data as ExternalRiderMapping;
}
