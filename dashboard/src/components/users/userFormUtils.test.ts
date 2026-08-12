import { describe, expect, it } from 'vitest';
import * as formUtils from './userFormUtils';
import type { FormState } from './userFormUtils';
import type { Zone } from '../../services/types';

const { validate } = formUtils;

const validRider: FormState = {
  firstName: 'Juan', middleName: '', lastName: 'Rider', email: 'juan@example.com', contact: '09123456789', tempPassword: 'password1', role: 'rider', status: 'active',
  mkbRiderId: 'MKB-1000', hubId: 'hub-1', zoneId: 'zone-1', hubAccessScope: 'assigned', hubIds: [], shift: '', faceImage: 'data:image/jpeg;base64,ok', faceDescriptor: null,
  province: 'Zamboanga del Sur', city: 'Zamboanga City', barangay: 'Tetuan', zipCode: '7000', streetAddress: 'Main Street',
  emergencyContactName: 'Maria Rider', emergencyContactPhone: '09987654321', employmentType: 'full-time', dateOfHire: '2026-01-01',
  vehicleType: 'motorcycle', vehiclePlateNumber: 'ABC 1234', notes: '',
};

const validStaff: FormState = {
  ...validRider,
  email: 'new.staff@gmail.com',
  role: 'hr',
  hubIds: ['hub-1'],
  mkbRiderId: '',
  zoneId: '',
  faceImage: null,
  province: '',
  city: '',
  barangay: '',
  zipCode: '',
  streetAddress: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  vehicleType: '',
  vehiclePlateNumber: '',
};

describe('employee required-field validation', () => {
  it('keeps optional fields optional', () => {
    expect(validate(validRider, 'create')).toEqual({});
  });

  it('returns inline errors for required rider custom controls', () => {
    const errors = validate({ ...validRider, employmentType: '', hubId: '', zoneId: '', faceImage: null }, 'create');
    expect(errors.employmentType).toContain('required');
    expect(errors.hubId).toContain('required');
    expect(errors.zoneId).toContain('required');
    expect(errors.faceImage).toContain('required');
  });

  it('does not require a password when editing an existing employee', () => {
    expect(validate({ ...validRider, tempPassword: '' }, 'edit')).toEqual({});
  });

  it('accepts gmail.com for a newly created staff account', () => {
    expect(validate(validStaff, 'create').email).toBeUndefined();
  });

  it('rejects a new staff address outside the centralized allowed-domain policy', () => {
    expect(validate({ ...validStaff, email: 'new.staff@example.com' }, 'create').email).toContain('gmail.com');
  });

  it('allows an unchanged legacy staff email and missing legacy fields during unrelated edits', () => {
    const legacy = {
      ...validStaff,
      email: 'legacy@mkb.ph',
      contact: '',
      employmentType: '',
      dateOfHire: '',
      notes: '',
      firstName: 'Updated',
      tempPassword: '',
    };
    const original = { ...legacy, firstName: 'Legacy' };

    expect(validate(legacy, 'edit', original)).toEqual({});
  });

  it('validates a legacy field when the user intentionally changes it', () => {
    const original = { ...validStaff, email: 'legacy@mkb.ph', contact: '' };
    const changed = { ...original, contact: '123' };

    expect(validate(changed, 'edit', original).contact).toContain('11 digits');
  });

  it('allows a legacy profile to be completed later with verified valid details', () => {
    const original = {
      ...validStaff,
      email: 'legacy@mkb.ph',
      contact: '',
      employmentType: '',
      dateOfHire: '',
      tempPassword: '',
    };
    const completed = {
      ...original,
      contact: '09123456789',
      employmentType: 'full-time',
      dateOfHire: '2026-08-01',
    };

    expect(validate(completed, 'edit', original)).toEqual({});
  });

  it('rejects invalid staff email and the obsolete mkb-only rule is absent', () => {
    expect(validate({ ...validStaff, email: 'invalid' }, 'create').email).toBe('Invalid email format.');
    expect(validate(validStaff, 'create').email).toBeUndefined();
  });

  it('keeps complete onboarding requirements for newly created staff', () => {
    const errors = validate({ ...validStaff, contact: '', employmentType: '', dateOfHire: '' }, 'create');
    expect(errors.contact).toContain('required');
    expect(errors.employmentType).toContain('required');
    expect(errors.dateOfHire).toContain('required');
  });
});

describe('Rider hub assignment controls', () => {
  it('preselects the current workspace for global users and the assigned hub for local HR', () => {
    const resolveInitialRiderHubId = (formUtils as typeof formUtils & {
      resolveInitialRiderHubId?: (input: {
        existingHubId?: string | null;
        selectedWorkspaceHubId?: string | null;
        canSelectAll: boolean;
        activeAuthorizedHubIds: string[];
      }) => string;
    }).resolveInitialRiderHubId;

    expect(typeof resolveInitialRiderHubId).toBe('function');
    expect(resolveInitialRiderHubId?.({
      selectedWorkspaceHubId: 'hub-2',
      canSelectAll: true,
      activeAuthorizedHubIds: ['hub-1', 'hub-2'],
    })).toBe('hub-2');
    expect(resolveInitialRiderHubId?.({
      selectedWorkspaceHubId: null,
      canSelectAll: false,
      activeAuthorizedHubIds: ['hub-1'],
    })).toBe('hub-1');
    expect(resolveInitialRiderHubId?.({
      selectedWorkspaceHubId: null,
      canSelectAll: true,
      activeAuthorizedHubIds: ['hub-1', 'hub-2'],
    })).toBe('');
  });

  it('shows only active zones under the selected hub while retaining the current edit zone', () => {
    const filterZonesForRiderHub = (formUtils as typeof formUtils & {
      filterZonesForRiderHub?: (zones: Zone[], hubId: string, currentZoneId?: string) => Zone[];
    }).filterZonesForRiderHub;
    const zones = [
      { id: 'zone-a', hubId: 'hub-1', name: 'A', center: [0, 0], radius: 1, color: '#000', status: 'active' },
      { id: 'zone-b', hubId: 'hub-2', name: 'B', center: [0, 0], radius: 1, color: '#000', status: 'active' },
      { id: 'zone-c', hubId: 'hub-1', name: 'C', center: [0, 0], radius: 1, color: '#000', status: 'inactive' },
    ] satisfies Zone[];

    expect(typeof filterZonesForRiderHub).toBe('function');
    expect(filterZonesForRiderHub?.(zones, 'hub-1').map((zone) => zone.id)).toEqual(['zone-a']);
    expect(filterZonesForRiderHub?.(zones, 'hub-1', 'zone-c').map((zone) => zone.id)).toEqual(['zone-a', 'zone-c']);
  });
});
