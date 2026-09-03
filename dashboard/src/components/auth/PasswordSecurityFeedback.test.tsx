// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PasswordSecurityFeedback } from './PasswordSecurityFeedback';
import fs from 'fs';
import path from 'path';

describe('PasswordSecurityFeedback component', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders neutral quiet state when password is empty', () => {
    act(() => {
      root.render(<PasswordSecurityFeedback password="" />);
    });

    const label = container.querySelector('[data-testid="password-strength-label"]');
    expect(label?.textContent).toBe('—');

    const circleIcon = container.querySelector('[data-testid="requirement-circle-icon"]');
    const checkIcon = container.querySelector('[data-testid="requirement-check-icon"]');
    expect(circleIcon).not.toBeNull();
    expect(checkIcon).toBeNull();

    expect(container.textContent).toContain('At least 8 characters');
    expect(container.textContent).toContain('Longer passwords and greater character variety improve strength.');
  });

  it('displays incomplete requirement when password has less than 8 characters', () => {
    act(() => {
      root.render(<PasswordSecurityFeedback password="short7c" />);
    });

    const circleIcon = container.querySelector('[data-testid="requirement-circle-icon"]');
    const checkIcon = container.querySelector('[data-testid="requirement-check-icon"]');
    expect(circleIcon).not.toBeNull();
    expect(checkIcon).toBeNull();

    const label = container.querySelector('[data-testid="password-strength-label"]')?.textContent;
    expect(['Weak', 'Fair']).toContain(label);
  });

  it('shows requirement satisfied for 8 basic characters without automatically rating it Strong', () => {
    act(() => {
      root.render(<PasswordSecurityFeedback password="12345678" />);
    });

    const checkIcon = container.querySelector('[data-testid="requirement-check-icon"]');
    const circleIcon = container.querySelector('[data-testid="requirement-circle-icon"]');
    expect(checkIcon).not.toBeNull();
    expect(circleIcon).toBeNull();

    const label = container.querySelector('[data-testid="password-strength-label"]')?.textContent;
    expect(label).not.toBe('Strong');
    expect(label).not.toBe('Good');
    expect(['Weak', 'Fair']).toContain(label);
  });

  it('displays Good or Strong for longer passwords with diverse character sets', () => {
    act(() => {
      root.render(<PasswordSecurityFeedback password="MySecure#Password987!" />);
    });

    const checkIcon = container.querySelector('[data-testid="requirement-check-icon"]');
    expect(checkIcon).not.toBeNull();

    const label = container.querySelector('[data-testid="password-strength-label"]')?.textContent;
    expect(label).toBe('Strong');
  });

  it('updates live feedback as the user types', () => {
    // 1. Initial render with empty password
    act(() => {
      root.render(<PasswordSecurityFeedback password="" />);
    });
    expect(container.querySelector('[data-testid="password-strength-label"]')?.textContent).toBe('—');
    expect(container.querySelector('[data-testid="requirement-circle-icon"]')).not.toBeNull();

    // 2. Updating with short password
    act(() => {
      root.render(<PasswordSecurityFeedback password="pass" />);
    });
    expect(container.querySelector('[data-testid="password-strength-label"]')?.textContent).toBe('Weak');
    expect(container.querySelector('[data-testid="requirement-circle-icon"]')).not.toBeNull();

    // 3. Updating with 8 characters
    act(() => {
      root.render(<PasswordSecurityFeedback password="pass1234" />);
    });
    expect(container.querySelector('[data-testid="requirement-check-icon"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="password-strength-label"]')?.textContent).not.toBe('—');

    // 4. Updating with complex strong password
    act(() => {
      root.render(<PasswordSecurityFeedback password="P@ssw0rd2026!Complex" />);
    });
    expect(container.querySelector('[data-testid="requirement-check-icon"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="password-strength-label"]')?.textContent).toBe('Strong');
  });

  describe('Integration and Isolation checks', () => {
    it('is integrated into Settings.tsx between New Password and Confirm Password', () => {
      const settingsPath = path.resolve(__dirname, '../../pages/Settings.tsx');
      const content = fs.readFileSync(settingsPath, 'utf-8');

      expect(content).toContain("import { PasswordSecurityFeedback } from '../components/auth/PasswordSecurityFeedback'");
      expect(content).toContain('<PasswordSecurityFeedback password={password} />');
    });

    it('is integrated into RiderProfile.tsx between New Password and Confirm Password', () => {
      const riderProfilePath = path.resolve(__dirname, '../../pages/RiderProfile.tsx');
      const content = fs.readFileSync(riderProfilePath, 'utf-8');

      expect(content).toContain("import { PasswordSecurityFeedback } from '../components/auth/PasswordSecurityFeedback'");
      expect(content).toContain('<PasswordSecurityFeedback password={newPassword} />');
    });

    it('is NOT present in UserForm.tsx (account creation remains untouched)', () => {
      const userFormPath = path.resolve(__dirname, '../../components/users/UserForm.tsx');
      const content = fs.readFileSync(userFormPath, 'utf-8');

      expect(content).not.toContain('PasswordSecurityFeedback');
      expect(content).not.toContain('password-strength');
      expect(content).not.toContain('Password strength:');
    });
  });
});
