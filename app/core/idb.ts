/** A tiny key-value store in IndexedDB, for this device's unlock settings. */

let db: Promise<IDBDatabase> | null = null;
const openDb = (): Promise<IDBDatabase> =>
  (db ??= new Promise((res, rej) => {
    const r = indexedDB.open("akhila-vrutta-device", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("k");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return openDb().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction("k", mode);
        const rq = fn(t.objectStore("k"));
        t.oncomplete = () => res((rq ? rq.result : undefined) as T);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

export const IDB = {
  get: <T>(k: string) => run<T | undefined>("readonly", (s) => s.get(k)),
  set: (k: string, v: unknown) => run<void>("readwrite", (s) => { s.put(v, k); }),
  del: (k: string) => run<void>("readwrite", (s) => { s.delete(k); }),
  clear: () => run<void>("readwrite", (s) => { s.clear(); }),
};
