const DB_NAME = 'archix-interior-poc';
const DB_VERSION = 1;
const STORE_NAME = 'floorplan';
const IMAGE_KEY = 'floorplan-image';

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is unavailable in this browser.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
});

const withStore = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = run(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('The floorplan store could not be read.'));
      transaction.onabort = () => reject(transaction.error || new Error('The floorplan store transaction was aborted.'));
    });
  } finally {
    database.close();
  }
};

export const readStoredFloorplan = () => withStore<unknown>('readonly', (store) => store.get(IMAGE_KEY))
  .then((value) => (typeof value === 'string' && value.startsWith('data:image/') ? value : undefined))
  .catch(() => undefined);

export const writeStoredFloorplan = (image: string) => withStore('readwrite', (store) => store.put(image, IMAGE_KEY))
  .then(() => true)
  .catch(() => false);

export const clearStoredFloorplan = () => withStore('readwrite', (store) => store.delete(IMAGE_KEY))
  .then(() => undefined)
  .catch(() => undefined);
