
/**
 * Session storage on top of IndexedDB.
 *
 * Holds exactly one saved session under a fixed key. The wrapper is small and
 * deliberately forgiving: persistence is a convenience, so when IndexedDB is
 * missing (private browsing in some browsers, old browsers, tests) or any
 * operation fails, loading resolves to null and saving or clearing resolve to
 * false instead of throwing. The app then simply behaves as if nothing had
 * been saved.
 *
 * The IndexedDB factory is injectable so the storage can be tested with a fake
 * implementation and used without relying on a global.
 */

export const DB_NAME = "nexus";
export const DB_VERSION = 1;
export const STORE_NAME = "sessions";
export const SESSION_KEY = "current";

/** The IndexedDB factory of the current environment, or null when there is none. */
export function getDefaultFactory() {
  if (typeof indexedDB !== "undefined" && indexedDB) return indexedDB;
  return null;
}

/** Turn an IDBRequest into a promise for its result. */
function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

/** Resolve when a transaction has committed; reject if it fails or is aborted. */
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

/** Open the database, creating the object store on first use. */
function openDatabase(factory) {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = factory.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the database."));
    request.onblocked = () => reject(new Error("Opening the database was blocked."));
  });
}

/**
 * Create a session store.
 *
 * @param {object} [options]
 * @param {IDBFactory|null} [options.factory]  IndexedDB factory. Defaults to the
 *        global one. Pass null to get a store that does nothing.
 * @returns {{
 *   isAvailable: boolean,
 *   load: () => Promise<any|null>,
 *   save: (snapshot: any) => Promise<boolean>,
 *   clear: () => Promise<boolean>,
 *   close: () => Promise<void>,
 * }}
 */
export function createSessionDb({ factory } = {}) {
  const idb = factory === undefined ? getDefaultFactory() : factory;
  let dbPromise = null;

  function getDatabase() {
    if (!dbPromise) {
      dbPromise = openDatabase(idb).catch((error) => {
        // Allow a later call to try again.
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  /** Run one operation against the sessions store inside a transaction. */
  async function withStore(mode, run) {
    const db = await getDatabase();
    const transaction = db.transaction(STORE_NAME, mode);
    const done = transactionDone(transaction);
    // Keep an early rejection from being reported as unhandled while the
    // request below is still being awaited.
    done.catch(() => {});
    const result = await run(transaction.objectStore(STORE_NAME));
    await done;
    return result;
  }

  return {
    isAvailable: Boolean(idb),

    /** Read the saved session. Resolves to null when there is none or on any failure. */
    async load() {
      if (!idb) return null;
      try {
        const value = await withStore("readonly", (store) =>
          requestToPromise(store.get(SESSION_KEY))
        );
        return value === undefined ? null : value;
      } catch {
        return null;
      }
    },

    /** Replace the saved session. Resolves to true when it was stored. */
    async save(snapshot) {
      if (!idb) return false;
      try {
        await withStore("readwrite", (store) =>
          requestToPromise(store.put(snapshot, SESSION_KEY))
        );
        return true;
      } catch {
        return false;
      }
    },

    /** Delete the saved session. Resolves to true when it was removed. */
    async clear() {
      if (!idb) return false;
      try {
        await withStore("readwrite", (store) => requestToPromise(store.delete(SESSION_KEY)));
        return true;
      } catch {
        return false;
      }
    },

    /** Close the database connection. Safe to call when it was never opened. */
    async close() {
      if (!dbPromise) return;
      try {
        const db = await dbPromise;
        db.close();
      } catch {
        // Nothing to close.
      }
      dbPromise = null;
    },
  };
}