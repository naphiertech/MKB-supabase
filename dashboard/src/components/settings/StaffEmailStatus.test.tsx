// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StaffEmailStatus } from './StaffEmailStatus';

describe('staff pending email confirmation status', () => {
  let root: Root;
  let container: HTMLDivElement;

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

  it('keeps the confirmed address visible while an Auth email change is pending', () => {
    act(() => root.render(
      <StaffEmailStatus
        currentEmail="admin@mkb.ph"
        pendingEmail="naphiera@gmail.com"
        emailVerified
      />,
    ));

    expect(container.textContent).toContain('Current email');
    expect(container.textContent).toContain('admin@mkb.ph');
    expect(container.textContent).toContain('Pending email · Awaiting confirmation');
    expect(container.textContent).toContain('Confirmation required. We sent a confirmation link to naphiera@gmail.com. Your current login email will remain admin@mkb.ph until the new address is confirmed.');
  });

  it('does not render a pending state after the confirmed Auth email refreshes', () => {
    act(() => root.render(
      <StaffEmailStatus
        currentEmail="naphiera@gmail.com"
        pendingEmail={null}
        emailVerified
      />,
    ));

    expect(container.textContent).toContain('naphiera@gmail.com');
    expect(container.textContent).not.toContain('Awaiting confirmation');
  });
});
