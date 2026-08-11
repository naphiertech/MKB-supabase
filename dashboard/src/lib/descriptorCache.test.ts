// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCachedDescriptor, getCachedDescriptor, setCachedDescriptor } from './descriptorCache';

const descriptor = Array.from({ length: 128 }, (_, index) => index / 128);

describe('facial descriptor cache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not rewrite an identical cached descriptor', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    setCachedDescriptor('rider-1', descriptor, null);
    setCachedDescriptor('rider-1', [...descriptor], null);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(getCachedDescriptor('rider-1')).toEqual(descriptor);
  });

  it('writes when the descriptor is missing or has changed', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const changedDescriptor = [...descriptor];
    changedDescriptor[0] = 0.75;

    setCachedDescriptor('rider-1', descriptor, null);
    setCachedDescriptor('rider-1', changedDescriptor, null);

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(getCachedDescriptor('rider-1')).toEqual(changedDescriptor);
  });

  it('adds a missing avatar alias without rewriting an unchanged rider entry', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    setCachedDescriptor('rider-1', descriptor, null);
    setItem.mockClear();
    setCachedDescriptor('rider-1', descriptor, 'avatar.jpg');

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(getCachedDescriptor('', 'avatar.jpg')).toEqual(descriptor);
  });

  it('clears the rider-owned descriptor without clearing unrelated riders', () => {
    setCachedDescriptor('rider-1', descriptor, null);
    setCachedDescriptor('rider-2', descriptor, null);
    clearCachedDescriptor('rider-1');
    expect(getCachedDescriptor('rider-1')).toBeNull();
    expect(getCachedDescriptor('rider-2')).toEqual(descriptor);
  });
});
