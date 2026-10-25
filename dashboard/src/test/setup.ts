import 'fake-indexeddb/auto';

// Tell React that the test environment supports act(...)
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = new Map<string, string>();
if (typeof Storage !== 'undefined') {
  Storage.prototype.getItem = function (key: string) { return store.get(key) ?? null; };
  Storage.prototype.setItem = function (key: string, value: string) { store.set(key, String(value)); };
  Storage.prototype.removeItem = function (key: string) { store.delete(key); };
  Storage.prototype.clear = function () { store.clear(); };
  Storage.prototype.key = function (index: number) { return Array.from(store.keys())[index] ?? null; };
}

const mockStorage = typeof Storage !== 'undefined' ? Object.create(Storage.prototype) : {};
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
