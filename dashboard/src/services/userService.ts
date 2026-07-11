import { supabase } from '../lib/supabaseClient';

export interface UserProfileUpdateInput {
  name: string;
  status: string;
  role: string;
  contact?: string | null;
  employmentType?: string | null;
  dateOfHire?: string | null;
  notes?: string | null;
}

export interface RiderProfileInput {
  name: string;
  contact?: string | null;
  zoneId?: string | null;
  faceImage?: string | null;
  faceDescriptor?: number[] | null;
  province?: string | null;
  city?: string | null;
  barangay?: string | null;
  zipCode?: string | null;
  streetAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  employmentType?: string | null;
  dateOfHire?: string | null;
  vehicleType?: string | null;
  vehiclePlateNumber?: string | null;
  notes?: string | null;
  email?: string;
  mkbRiderId?: string;
}

// Fetch all user profiles with linked rider data
export const getUsersAndRiders = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*, riders(*)')
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data;
};

// Update user table profile details
export const updateUserProfile = async (userId: string, input: UserProfileUpdateInput) => {
  const { error } = await supabase
    .from('users')
    .update({
      full_name: input.name,
      status: input.status,
      role: input.role,
      contact: input.contact || null,
      employment_type: input.employmentType || null,
      date_of_hire: input.dateOfHire || null,
      notes: input.notes || null
    })
    .eq('id', userId);

  if (error) throw error;
};

// Fetch linked rider_id for a user ID
export const getUserRiderId = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('rider_id')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data?.rider_id || null;
};

// Update rider profile details
export const updateRiderProfile = async (riderId: string, input: RiderProfileInput) => {
  const { error } = await supabase
    .from('riders')
    .update({
      name: input.name,
      contact: input.contact || null,
      zone_id: input.zoneId || null,
      shift: null,
      face_registered: !!input.faceImage,
      face_image_url: input.faceImage || null,
      face_descriptor: input.faceDescriptor || null,
      face_registered_at: input.faceDescriptor ? new Date().toISOString() : null,
      province: input.province || null,
      city: input.city || null,
      barangay: input.barangay || null,
      zip_code: input.zipCode || null,
      street_address: input.streetAddress || null,
      emergency_contact_name: input.emergencyContactName || null,
      emergency_contact_phone: input.emergencyContactPhone || null,
      employment_type: input.employmentType || null,
      date_of_hire: input.dateOfHire || null,
      vehicle_type: input.vehicleType || null,
      vehicle_plate_number: input.vehiclePlateNumber || null,
      notes: input.notes || null
    })
    .eq('id', riderId);

  if (error) throw error;
};

// Create a new rider record in public.riders
export const createRiderProfile = async (input: RiderProfileInput): Promise<string> => {
  const { data, error } = await supabase
    .from('riders')
    .insert({
      name: input.name,
      mkb_id: input.mkbRiderId || `MKB-${Math.floor(1000 + Math.random() * 9000)}`,
      email: input.email,
      contact: input.contact || null,
      zone_id: input.zoneId || null,
      shift: null,
      status: 'offline',
      face_registered: !!input.faceImage,
      face_image_url: input.faceImage || null,
      face_descriptor: input.faceDescriptor || null,
      face_registered_at: input.faceDescriptor ? new Date().toISOString() : null,
      province: input.province || null,
      city: input.city || null,
      barangay: input.barangay || null,
      zip_code: input.zipCode || null,
      street_address: input.streetAddress || null,
      emergency_contact_name: input.emergencyContactName || null,
      emergency_contact_phone: input.emergencyContactPhone || null,
      employment_type: input.employmentType || null,
      date_of_hire: input.dateOfHire || null,
      vehicle_type: input.vehicleType || null,
      vehicle_plate_number: input.vehiclePlateNumber || null,
      notes: input.notes || null
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
};

// Rollback/delete a rider profile if creation fails
export const deleteRiderProfile = async (riderId: string) => {
  const { error } = await supabase
    .from('riders')
    .delete()
    .eq('id', riderId);

  if (error) throw error;
};

// Insert profile record referencing Auth UUID
export const createUserProfile = async (userId: string, riderId: string | null, input: UserProfileUpdateInput & { email: string }) => {
  const { error } = await supabase
    .from('users')
    .insert({
      id: userId,
      full_name: input.name,
      email: input.email,
      role: input.role,
      contact: input.contact || null,
      rider_id: riderId,
      status: input.status || 'active',
      employment_type: input.employmentType || null,
      date_of_hire: input.dateOfHire || null,
      notes: input.notes || null
    });

  if (error) throw error;
};

// Fetch search index zones and users in parallel
export const getSearchIndexData = async () => {
  const [zonesRes, usersRes] = await Promise.all([
    supabase.from('zones').select('id, name'),
    supabase.from('users').select('id, full_name, role, contact, riders(zone_id, mkb_id)')
  ]);

  if (zonesRes.error) throw zonesRes.error;
  if (usersRes.error) throw usersRes.error;

  return {
    zones: zonesRes.data || [],
    users: usersRes.data || []
  };
};

// Fetch phone number (contact) from users table
export const getUserContactInfo = async (userId: string): Promise<string> => {
  const { data, error } = await supabase
    .from('users')
    .select('contact')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data?.contact || '';
};

// Update user settings profile in users table
export const updateUserSettingsProfile = async (
  userId: string,
  input: { fullName: string; email: string; phone: string }
): Promise<void> => {
  const { error } = await supabase
    .from('users')
    .update({
      full_name: input.fullName,
      email: input.email.trim(),
      contact: input.phone.trim()
    })
    .eq('id', userId);

  if (error) throw error;
};

// Update Supabase Auth profile details and credentials
export const updateUserAuthCredentials = async (input: {
  email?: string;
  password?: string;
  fullName: string;
}): Promise<void> => {
  const authUpdates: { email?: string; password?: string; data: { full_name: string } } = {
    email: input.email,
    data: { full_name: input.fullName }
  };

  if (input.password) {
    authUpdates.password = input.password;
  }

  const { error } = await supabase.auth.updateUser(authUpdates);
  if (error) throw error;
};

// Fetch user profile record by ID
export const getUserProfileById = async (userId: string) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
};


