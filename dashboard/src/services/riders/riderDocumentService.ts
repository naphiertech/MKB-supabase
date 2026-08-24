import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/supabase';

const BUCKET = 'rider-documents';
export const MAX_RIDER_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_RIDER_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const REQUIRED_DOCUMENT_TYPES = [
  'drivers_license',
  'government_id',
  'vehicle_registration',
  'employment_contract',
] as const;

export const OPTIONAL_DOCUMENT_TYPES = [
  'insurance',
  'nbi_or_police_clearance',
  'medical_certificate',
  'other',
] as const;

export type RiderDocumentType =
  | (typeof REQUIRED_DOCUMENT_TYPES)[number]
  | (typeof OPTIONAL_DOCUMENT_TYPES)[number];
export type RiderDocument = Database['public']['Tables']['rider_documents']['Row'];

export interface RiderDocumentWithPeople extends RiderDocument {
  uploadedByName: string;
  verifiedByName: string | null;
}

export interface RiderDocumentInput {
  documentType: RiderDocumentType;
  documentLabel?: string;
  documentNumber?: string;
  issueDate?: string;
  expirationDate?: string;
  notes?: string;
}

export type RiderDocumentDisplayStatus =
  | 'missing'
  | 'pending'
  | 'verified'
  | 'expiring_soon'
  | 'expired';

export const RIDER_DOCUMENT_LABELS: Record<RiderDocumentType, string> = {
  drivers_license: "Driver's License",
  government_id: 'Government ID',
  vehicle_registration: 'Vehicle Registration',
  employment_contract: 'Employment Contract',
  insurance: 'Insurance',
  nbi_or_police_clearance: 'NBI or Police Clearance',
  medical_certificate: 'Medical Certificate',
  other: 'Other',
};

function cleanOptional(value?: string): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function validateRiderDocumentFile(file: File): string | null {
  if (!ALLOWED_RIDER_DOCUMENT_MIME_TYPES.includes(file.type as (typeof ALLOWED_RIDER_DOCUMENT_MIME_TYPES)[number])) {
    return 'Use a PDF, JPG, JPEG, PNG, or WebP file.';
  }
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > MAX_RIDER_DOCUMENT_BYTES) return 'File size must not exceed 5 MB.';
  return null;
}

export function getRiderDocumentDisplayStatus(
  document: Pick<RiderDocument, 'verification_status' | 'expiration_date'> | null,
  now = new Date(),
): RiderDocumentDisplayStatus {
  if (!document) return 'missing';
  if (document.expiration_date) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const expiration = new Date(`${document.expiration_date}T00:00:00`);
    if (expiration.getTime() < today.getTime()) return 'expired';
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 30);
    if (expiration.getTime() <= soon.getTime()) return 'expiring_soon';
  }
  return document.verification_status === 'verified' ? 'verified' : 'pending';
}

export async function listRiderDocuments(riderId: string): Promise<RiderDocumentWithPeople[]> {
  const { data, error } = await supabase
    .from('rider_documents')
    .select('*')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.flatMap((row) => [row.uploaded_by, row.verified_by].filter(Boolean) as string[])));
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds);
    if (!userError) users?.forEach((person) => names.set(person.id, person.full_name));
  }

  return rows.map((row) => ({
    ...row,
    uploadedByName: names.get(row.uploaded_by) ?? 'Authorized staff',
    verifiedByName: row.verified_by ? names.get(row.verified_by) ?? 'Authorized staff' : null,
  }));
}

export async function saveRiderDocument(
  riderId: string,
  file: File,
  input: RiderDocumentInput,
  existing?: RiderDocument,
): Promise<void> {
  const fileError = validateRiderDocumentFile(file);
  if (fileError) throw new Error(fileError);
  if (input.documentType === 'other' && !input.documentLabel?.trim()) {
    throw new Error('A document name is required for Other documents.');
  }
  if (input.issueDate && input.expirationDate && input.expirationDate < input.issueDate) {
    throw new Error('Expiration date cannot be before the issue date.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error('You must be signed in.');

  const id = existing?.id ?? crypto.randomUUID();
  const storagePath = existing?.storage_path ?? (
    input.documentType === 'other'
      ? `riders/${riderId}/other/${id}`
      : `riders/${riderId}/${input.documentType}`
  );
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '0',
    contentType: file.type,
    upsert: Boolean(existing),
  });
  if (uploadError) throw uploadError;

  const metadata = {
    document_type: input.documentType,
    document_label: input.documentType === 'other' ? cleanOptional(input.documentLabel) : null,
    document_number: cleanOptional(input.documentNumber),
    issue_date: input.issueDate || null,
    expiration_date: input.expirationDate || null,
    notes: cleanOptional(input.notes),
    original_filename: file.name,
    mime_type: file.type,
    file_size_bytes: file.size,
    uploaded_by: authData.user.id,
    verification_status: 'pending',
    verified_by: null,
    verified_at: null,
  };

  const result = existing
    ? await supabase.from('rider_documents').update(metadata).eq('id', existing.id)
    : await supabase.from('rider_documents').insert({
        id,
        rider_id: riderId,
        storage_path: storagePath,
        ...metadata,
      });

  if (result.error) {
    if (!existing) await supabase.storage.from(BUCKET).remove([storagePath]);
    throw result.error;
  }
}

export async function createRiderDocumentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function verifyRiderDocument(documentId: string): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error('You must be signed in.');
  const { error } = await supabase
    .from('rider_documents')
    .update({
      verification_status: 'verified',
      verified_by: authData.user.id,
      verified_at: new Date().toISOString(),
    })
    .eq('id', documentId);
  if (error) throw error;
}

export async function deleteRiderDocument(document: RiderDocument): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([document.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('rider_documents').delete().eq('id', document.id);
  if (error) throw error;
}
