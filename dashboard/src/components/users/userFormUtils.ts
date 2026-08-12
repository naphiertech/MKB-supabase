import { isSameEmail, isStaffRole, validateStaffEmail } from '../../services/staffProfilePolicy';
import type { Zone } from '../../services/types';

export type EditableRole = 'admin' | 'hr' | 'rider' | 'payroll';
export type Shift = 'morning' | 'afternoon' | 'evening' | '';

export interface FormState {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  contact: string;
  tempPassword: string;
  role: EditableRole;
  status: 'active' | 'suspended';
  mkbRiderId: string;
  hubId: string;
  zoneId: string; // '' means Unassigned
  hubAccessScope: 'global' | 'assigned';
  hubIds: string[];
  shift: Shift;
  faceImage: string | null;
  faceDescriptor: number[] | null;
  province: string;
  city: string;
  barangay: string;
  zipCode: string;
  streetAddress: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  employmentType: string;
  dateOfHire: string;
  vehicleType: string;
  vehiclePlateNumber: string;
  notes: string;
}

export type FormErrors = Partial<Record<keyof FormState, string>>;

export function generateMkbId() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `MKB-${n}`;
}

export function resolveInitialRiderHubId(input: {
  existingHubId?: string | null;
  selectedWorkspaceHubId?: string | null;
  canSelectAll: boolean;
  activeAuthorizedHubIds: string[];
}): string {
  const authorized = new Set(input.activeAuthorizedHubIds);
  if (input.existingHubId && authorized.has(input.existingHubId)) return input.existingHubId;
  if (input.selectedWorkspaceHubId && authorized.has(input.selectedWorkspaceHubId)) {
    return input.selectedWorkspaceHubId;
  }
  if (!input.canSelectAll && input.activeAuthorizedHubIds.length === 1) {
    return input.activeAuthorizedHubIds[0];
  }
  return '';
}

export function filterZonesForRiderHub(
  zones: Zone[],
  hubId: string,
  currentZoneId = '',
): Zone[] {
  if (!hubId) return [];
  return zones.filter(
    (zone) => zone.hubId === hubId && (zone.status === 'active' || zone.id === currentZoneId),
  );
}

export function compressBase64Image(
  base64Str: string,
  maxWidth = 200,
  maxHeight = 200,
  quality = 0.6
): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Keep aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
    img.src = base64Str;
  });
}

export function validate(form: FormState, mode: 'create' | 'edit', original?: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.firstName.trim()) errors.firstName = 'First name is required.';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
  
  if (!form.email.trim()) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Invalid email format.';
  } else if (isStaffRole(form.role) && (mode === 'create' || !original || !isSameEmail(form.email, original.email))) {
    const staffEmailError = validateStaffEmail(form.email);
    if (staffEmailError) errors.email = staffEmailError;
  }

  const digits = form.contact.replace(/\D/g, '');
  const shouldValidateContact = mode === 'create' || !original || form.contact !== original.contact || Boolean(original.contact.trim());
  if (shouldValidateContact && !digits) {
    errors.contact = 'Contact number is required.';
  } else if (shouldValidateContact && digits.length !== 11) {
    errors.contact = 'Contact number must be 11 digits.';
  }

  if (mode === 'create') {
    if (!form.tempPassword)
      errors.tempPassword = 'Temporary password is required.';
    else if (form.tempPassword.length < 8)
      errors.tempPassword = 'Must be at least 8 characters.';
  } else if (form.tempPassword && form.tempPassword.length < 8) {
    errors.tempPassword = 'Must be at least 8 characters.';
  }

  if (!form.role) errors.role = 'Role is required.';
  if (isStaffRole(form.role) && form.hubAccessScope === 'assigned' && form.hubIds.length === 0) {
    errors.hubIds = 'Select at least one authorized hub.';
  }

  // General payroll / employment fields (Required for all)
  const shouldValidateEmploymentType = mode === 'create' || !original || form.employmentType !== original.employmentType || Boolean(original.employmentType);
  const shouldValidateDateOfHire = mode === 'create' || !original || form.dateOfHire !== original.dateOfHire || Boolean(original.dateOfHire);
  if (shouldValidateEmploymentType && !form.employmentType) errors.employmentType = 'Employment type is required.';
  if (shouldValidateDateOfHire && !form.dateOfHire) errors.dateOfHire = 'Start date of hire is required.';

  if (form.role === 'rider') {
    if (!form.mkbRiderId.trim()) errors.mkbRiderId = 'MKB Rider ID is required.';
    if (!form.hubId) errors.hubId = 'Assigned hub is required.';
    if (!form.zoneId) errors.zoneId = 'Assigned zone is required.';
    if (!form.faceImage) errors.faceImage = 'Face registration is required.';
    if (!form.province) errors.province = 'Province is required.';
    if (!form.city) errors.city = 'City/Municipality is required.';
    if (!form.barangay.trim()) errors.barangay = 'Barangay is required.';
    if (!form.zipCode.trim()) errors.zipCode = 'Zip Code is required.';
    if (!form.streetAddress.trim()) errors.streetAddress = 'Street Address is required.';

    // Emergency Contact Validation
    if (!form.emergencyContactName.trim()) {
      errors.emergencyContactName = 'Emergency contact name is required.';
    }
    const eDigits = form.emergencyContactPhone.replace(/\D/g, '');
    if (!eDigits) {
      errors.emergencyContactPhone = 'Emergency contact number is required.';
    } else if (eDigits.length !== 11) {
      errors.emergencyContactPhone = 'Must be 11 digits.';
    }

    // Vehicle Info Validation
    if (!form.vehicleType) {
      errors.vehicleType = 'Vehicle type is required.';
    } else if (form.vehicleType !== 'bicycle' && form.vehicleType !== 'none' && form.vehicleType !== '') {
      // Plate number is required for motorcycle and e-bike
      if (!form.vehiclePlateNumber.trim()) {
        errors.vehiclePlateNumber = 'Plate number is required.';
      }
    }
  }

  return errors;
}
