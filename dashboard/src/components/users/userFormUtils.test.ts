import { describe, expect, it } from 'vitest';
import { validate, type FormState } from './userFormUtils';

const validRider: FormState = {
  firstName: 'Juan', middleName: '', lastName: 'Rider', email: 'juan@example.com', contact: '09123456789', tempPassword: 'password1', role: 'rider', status: 'active',
  mkbRiderId: 'MKB-1000', zoneId: 'zone-1', shift: '', faceImage: 'data:image/jpeg;base64,ok', faceDescriptor: null,
  province: 'Zamboanga del Sur', city: 'Zamboanga City', barangay: 'Tetuan', zipCode: '7000', streetAddress: 'Main Street',
  emergencyContactName: 'Maria Rider', emergencyContactPhone: '09987654321', employmentType: 'full-time', dateOfHire: '2026-01-01',
  vehicleType: 'motorcycle', vehiclePlateNumber: 'ABC 1234', notes: '',
};

const validStaff: FormState = {
  ...validRider,
  email: 'new.staff@gmail.com',
  role: 'hr',
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
    const errors = validate({ ...validRider, employmentType: '', zoneId: '', faceImage: null }, 'create');
    expect(errors.employmentType).toContain('required');
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
