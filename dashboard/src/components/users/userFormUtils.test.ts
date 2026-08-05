import { describe, expect, it } from 'vitest';
import { validate, type FormState } from './userFormUtils';

const validRider: FormState = {
  firstName: 'Juan', middleName: '', lastName: 'Rider', email: 'juan@example.com', contact: '09123456789', tempPassword: 'password1', role: 'rider', status: 'active',
  mkbRiderId: 'MKB-1000', zoneId: 'zone-1', shift: '', faceImage: 'data:image/jpeg;base64,ok', faceDescriptor: null,
  province: 'Zamboanga del Sur', city: 'Zamboanga City', barangay: 'Tetuan', zipCode: '7000', streetAddress: 'Main Street',
  emergencyContactName: 'Maria Rider', emergencyContactPhone: '09987654321', employmentType: 'full-time', dateOfHire: '2026-01-01',
  vehicleType: 'motorcycle', vehiclePlateNumber: 'ABC 1234', notes: '',
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
});
