// Node.js experimental Web Storage (--localstorage-file) overrides the DOM
// environment's implementation. Provide a complete polyfill so tests have
// a fully functional localStorage / sessionStorage.

class MemStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: new MemStorage(), writable: true });

// crypto.randomUUID polyfill
if (!globalThis.crypto?.randomUUID) {
  const c = globalThis.crypto ?? {};
  (c as any).randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  Object.defineProperty(globalThis, 'crypto', { value: c });
}
