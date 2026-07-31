import { supabase } from '../lib/supabaseClient';
import { verifyFaceIdentity } from '../lib/faceAi';

export interface EmployeeDuplicateCheckParams {
  mkbRiderId?: string;
  email?: string;
  vehiclePlateNumber?: string;
  contact?: string;
  faceDescriptor?: number[] | null;
  excludeRiderId?: string;
  excludeUserId?: string;
}

export interface EmployeeDuplicateCheckResult {
  hasDuplicate: boolean;
  duplicateField?: 'mkb_id' | 'email' | 'vehicle_plate_number' | 'contact' | 'face_descriptor';
  message?: string;
  existingEmployeeName?: string;
}

/**
 * Validates whether employee parameters (Rider ID, email, plate number, contact, face descriptor)
 * conflict with existing employee records in database.
 */
export const checkEmployeeDuplicates = async (
  params: EmployeeDuplicateCheckParams
): Promise<EmployeeDuplicateCheckResult> => {
  // 1. Check Rider ID (mkb_id)
  if (params.mkbRiderId?.trim()) {
    const mkbTrim = params.mkbRiderId.trim();
    let q = supabase
      .from('riders')
      .select('id, name, mkb_id')
      .ilike('mkb_id', mkbTrim);
    if (params.excludeRiderId) q = q.neq('id', params.excludeRiderId);
    const { data } = await q;
    if (data && data.length > 0) {
      return {
        hasDuplicate: true,
        duplicateField: 'mkb_id',
        message: `Rider / Employee ID "${mkbTrim}" is already registered to ${data[0].name}.`,
        existingEmployeeName: data[0].name
      };
    }
  }

  // 2. Check Email
  if (params.email?.trim()) {
    const emailTrim = params.email.trim();
    let qRiders = supabase
      .from('riders')
      .select('id, name, email')
      .ilike('email', emailTrim);
    if (params.excludeRiderId) qRiders = qRiders.neq('id', params.excludeRiderId);
    const { data: riderData } = await qRiders;
    if (riderData && riderData.length > 0) {
      return {
        hasDuplicate: true,
        duplicateField: 'email',
        message: `Email "${emailTrim}" is already registered to employee ${riderData[0].name}.`,
        existingEmployeeName: riderData[0].name
      };
    }

    let qUsers = supabase
      .from('users')
      .select('id, full_name, email')
      .ilike('email', emailTrim);
    if (params.excludeUserId) qUsers = qUsers.neq('id', params.excludeUserId);
    const { data: userData } = await qUsers;
    if (userData && userData.length > 0) {
      return {
        hasDuplicate: true,
        duplicateField: 'email',
        message: `Email "${emailTrim}" is already registered to system user ${userData[0].full_name}.`,
        existingEmployeeName: userData[0].full_name
      };
    }
  }

  // 3. Check Vehicle Plate Number
  if (params.vehiclePlateNumber?.trim()) {
    const plateTrim = params.vehiclePlateNumber.trim();
    let q = supabase
      .from('riders')
      .select('id, name, vehicle_plate_number')
      .ilike('vehicle_plate_number', plateTrim);
    if (params.excludeRiderId) q = q.neq('id', params.excludeRiderId);
    const { data } = await q;
    if (data && data.length > 0) {
      return {
        hasDuplicate: true,
        duplicateField: 'vehicle_plate_number',
        message: `Vehicle plate number "${plateTrim}" is already registered to employee ${data[0].name}.`,
        existingEmployeeName: data[0].name
      };
    }
  }

  // 4. Check Phone / Contact
  if (params.contact?.trim()) {
    const contactTrim = params.contact.trim();
    const digitsOnly = contactTrim.replace(/\D/g, '');
    if (digitsOnly.length > 0) {
      let q = supabase.from('riders').select('id, name, contact');
      if (params.excludeRiderId) q = q.neq('id', params.excludeRiderId);
      const { data } = await q;
      if (data) {
        const match = data.find(r => r.contact && r.contact.replace(/\D/g, '') === digitsOnly);
        if (match) {
          return {
            hasDuplicate: true,
            duplicateField: 'contact',
            message: `Phone number "${contactTrim}" is already registered to employee ${match.name}.`,
            existingEmployeeName: match.name
          };
        }
      }
    }
  }

  // 5. Check Duplicate Face Descriptor against all stored employee facial descriptors
  if (params.faceDescriptor && Array.isArray(params.faceDescriptor) && params.faceDescriptor.length === 128) {
    const newDesc = new Float32Array(params.faceDescriptor);
    let q = supabase
      .from('riders')
      .select('id, name, mkb_id, face_descriptor')
      .not('face_descriptor', 'is', null);
    if (params.excludeRiderId) q = q.neq('id', params.excludeRiderId);
    const { data } = await q;

    if (data) {
      for (const rider of data) {
        if (rider.face_descriptor && Array.isArray(rider.face_descriptor) && rider.face_descriptor.length === 128) {
          const storedDesc = new Float32Array(rider.face_descriptor as number[]);
          const { matched, distance } = verifyFaceIdentity(newDesc, storedDesc, 0.45);
          if (matched || distance <= 0.45) {
            console.warn(`[Biometric Duplicate Blocked] Matched existing rider ${rider.name} (${rider.mkb_id}) with distance ${distance.toFixed(4)}`);
            return {
              hasDuplicate: true,
              duplicateField: 'face_descriptor',
              message: 'This face is already registered to another employee.',
              existingEmployeeName: rider.name
            };
          }
        }
      }
    }
  }

  return { hasDuplicate: false };
};

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

function formatPostgresError(error: { code?: string; message?: string; details?: string }): Error {
  if (error.code === '23505') {
    const details = error.details || error.message || '';
    if (details.includes('mkb_id')) {
      return new Error('A rider with this Employee / MKB ID already exists.');
    }
    if (details.includes('email')) {
      return new Error('An account with this email address already exists.');
    }
    if (details.includes('vehicle_plate_number')) {
      return new Error('A vehicle with this plate number is already registered.');
    }
    if (details.includes('contact')) {
      return new Error('A user with this phone / contact number already exists.');
    }
    return new Error(`Duplicate entry constraint violation: ${details}`);
  }
  return new Error(error.message || 'Database error occurred');
}

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

  if (error) throw formatPostgresError(error);
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

  if (error) throw formatPostgresError(error);
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

  if (error) throw formatPostgresError(error);
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


