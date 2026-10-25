import 'fake-indexeddb/auto';

// Tell React that the test environment supports act(...)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof Storage === 'undefined') {
  class StorageMock {
    getItem(_key: string): string | null { return null; }
    setItem(_key: string, _value: string): void { void _key; void _value; }
    removeItem(_key: string): void { void _key; }
    clear(): void { void 0; }
    key(_index: number): string | null { return null; }
    get length(): number { return 0; }
  }
  Object.defineProperty(globalThis, 'Storage', {
    value: StorageMock,
    writable: true,
    configurable: true,
  });
}

const store = new Map<string, string>();
Storage.prototype.getItem = function (key: string) { return store.get(key) ?? null; };
Storage.prototype.setItem = function (key: string, value: string) { store.set(key, String(value)); };
Storage.prototype.removeItem = function (key: string) { store.delete(key); };
Storage.prototype.clear = function () { store.clear(); };
Storage.prototype.key = function (index: number) { return Array.from(store.keys())[index] ?? null; };

const mockStorage = Object.create(Storage.prototype);
Object.defineProperty(mockStorage, 'length', {
  get: function () { return store.size; },
  configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
}
