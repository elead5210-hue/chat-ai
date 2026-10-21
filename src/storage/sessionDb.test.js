import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  DB_NAME,
  DB_VERSION,
  SESSION_KEY,
  STORE_NAME,
  createSessionDb,
  getDefaultFactory,
} from "./sessionDb.js";

const SNAPSHOT = {
  version: 1,
  savedAt: 1000,
  messages: [{ id: "m1", role: "user", content: "Hello" }],
  context: { conversation_id: "conv-1", context_version: 2 },
  uiState: { audience: "Executives" },
  checklist: [{ id: "a", label: "A", satisfied: true }],
};

/** A fresh, isolated in-memory IndexedDB for each test. */
function makeDb(options = {}) {
  return createSessionDb({ factory: new IDBFactory(), ...options });
}

/** A factory whose open() throws straight away. */
function throwingFactory() {
  return {
    open() {
      throw new Error("open is not allowed");
    },
  };
}

/** A factory whose open() request reports an error asynchronously. */
function failingFactory() {
  return {
    open() {
      const request = {};
      setTimeout(() => {
        request.error = new Error("open failed");
        request.onerror?.();
      }, 0);
      return request;
    },
  };
}

/** A factory whose open() request is blocked. */
function blockedFactory() {
  return {
    open() {
      const request = {};
      setTimeout(() => request.onblocked?.(), 0);
      return request;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("constants", () => {
  it("names the database, its version, the store and the key", () => {
    expect(DB_NAME).toBe("nexus");
    expect(DB_VERSION).toBe(1);
    expect(STORE_NAME).toBe("sessions");
    expect(SESSION_KEY).toBe("current");
  });
});

describe("getDefaultFactory", () => {
  it("returns null when there is no global indexedDB", () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(getDefaultFactory()).toBeNull();
  });

  it("returns the global indexedDB when there is one", () => {
    const fake = new IDBFactory();
    vi.stubGlobal("indexedDB", fake);
    expect(getDefaultFactory()).toBe(fake);
  });
});

describe("availability", () => {
  it("is available with a factory", () => {
    expect(makeDb().isAvailable).toBe(true);
  });

  it("is not available when the factory is null", () => {
    expect(createSessionDb({ factory: null }).isAvailable).toBe(false);
  });

  it("falls back to the global factory when none is passed", () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    expect(createSessionDb().isAvailable).toBe(true);
  });

  it("is not available when there is no factory and no global", () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(createSessionDb().isAvailable).toBe(false);
  });
});

describe("load", () => {
  it("resolves to null when nothing has been saved", async () => {
    const db = makeDb();
    expect(await db.load()).toBeNull();
    await db.close();
  });
});

describe("save and load", () => {
  it("returns the snapshot that was saved", async () => {
    const db = makeDb();

    expect(await db.save(SNAPSHOT)).toBe(true);
    expect(await db.load()).toEqual(SNAPSHOT);

    await db.close();
  });

  it("returns a copy, not the object that was saved", async () => {
    const db = makeDb();
    const snapshot = { ...SNAPSHOT, uiState: { audience: "Executives" } };

    await db.save(snapshot);
    snapshot.uiState.audience = "Changed";

    const loaded = await db.load();
    expect(loaded.uiState.audience).toBe("Executives");
    expect(loaded).not.toBe(snapshot);

    await db.close();
  });

  it("overwrites an earlier save rather than keeping both", async () => {
    const db = makeDb();

    await db.save(SNAPSHOT);
    await db.save({ ...SNAPSHOT, savedAt: 2000, uiState: { audience: "Board" } });

    const loaded = await db.load();
    expect(loaded.savedAt).toBe(2000);
    expect(loaded.uiState).toEqual({ audience: "Board" });

    await db.close();
  });

  it("keeps the saved session after the connection is closed and reopened", async () => {
    const factory = new IDBFactory();
    const first = createSessionDb({ factory });
    await first.save(SNAPSHOT);
    await first.close();

    const second = createSessionDb({ factory });
    expect(await second.load()).toEqual(SNAPSHOT);
    await second.close();
  });

  it("keeps sessions in separate factories apart", async () => {
    const one = makeDb();
    const two = makeDb();

    await one.save(SNAPSHOT);

    expect(await two.load()).toBeNull();

    await one.close();
    await two.close();
  });

  it("handles several saves in a row", async () => {
    const db = makeDb();

    await Promise.all([
      db.save({ ...SNAPSHOT, savedAt: 1 }),
      db.save({ ...SNAPSHOT, savedAt: 2 }),
      db.save({ ...SNAPSHOT, savedAt: 3 }),
    ]);

    const loaded = await db.load();
    expect([1, 2, 3]).toContain(loaded.savedAt);

    await db.close();
  });

  it("creates the object store on first open", async () => {
    const factory = new IDBFactory();
    const db = createSessionDb({ factory });
    await db.save(SNAPSHOT);
    await db.close();

    const opened = await new Promise((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    expect(opened.objectStoreNames.contains(STORE_NAME)).toBe(true);
    opened.close();
  });
});

describe("clear", () => {
  it("removes the saved session", async () => {
    const db = makeDb();
    await db.save(SNAPSHOT);

    expect(await db.clear()).toBe(true);
    expect(await db.load()).toBeNull();

    await db.close();
  });

  it("succeeds when nothing was saved", async () => {
    const db = makeDb();
    expect(await db.clear()).toBe(true);
    expect(await db.load()).toBeNull();
    await db.close();
  });

  it("lets a new session be saved after clearing", async () => {
    const db = makeDb();
    await db.save(SNAPSHOT);
    await db.clear();

    await db.save({ ...SNAPSHOT, savedAt: 5000 });

    expect((await db.load()).savedAt).toBe(5000);
    await db.close();
  });
});

describe("close", () => {
  it("is safe to call when the database was never opened", async () => {
    const db = makeDb();
    await expect(db.close()).resolves.toBeUndefined();
  });

  it("is safe to call twice", async () => {
    const db = makeDb();
    await db.save(SNAPSHOT);
    await db.close();
    await expect(db.close()).resolves.toBeUndefined();
  });

  it("reopens the database on the next call", async () => {
    const db = makeDb();
    await db.save(SNAPSHOT);
    await db.close();

    expect(await db.load()).toEqual(SNAPSHOT);
    await db.close();
  });
});

describe("without IndexedDB", () => {
  it("load resolves to null", async () => {
    const db = createSessionDb({ factory: null });
    expect(await db.load()).toBeNull();
  });

  it("save resolves to false", async () => {
    const db = createSessionDb({ factory: null });
    expect(await db.save(SNAPSHOT)).toBe(false);
  });

  it("clear resolves to false", async () => {
    const db = createSessionDb({ factory: null });
    expect(await db.clear()).toBe(false);
  });

  it("close does nothing", async () => {
    const db = createSessionDb({ factory: null });
    await expect(db.close()).resolves.toBeUndefined();
  });
});

describe.each([
  ["a factory whose open throws", throwingFactory],
  ["a factory whose open request errors", failingFactory],
  ["a factory whose open request is blocked", blockedFactory],
])("with %s", (_label, makeFactory) => {
  it("load resolves to null instead of throwing", async () => {
    const db = createSessionDb({ factory: makeFactory() });
    await expect(db.load()).resolves.toBeNull();
  });

  it("save resolves to false instead of throwing", async () => {
    const db = createSessionDb({ factory: makeFactory() });
    await expect(db.save(SNAPSHOT)).resolves.toBe(false);
  });

  it("clear resolves to false instead of throwing", async () => {
    const db = createSessionDb({ factory: makeFactory() });
    await expect(db.clear()).resolves.toBe(false);
  });

  it("close does not throw", async () => {
    const db = createSessionDb({ factory: makeFactory() });
    await db.load();
    await expect(db.close()).resolves.toBeUndefined();
  });

  it("is still reported as available, since a factory exists", () => {
    expect(createSessionDb({ factory: makeFactory() }).isAvailable).toBe(true);
  });
});

describe("recovering from a failed open", () => {
  it("tries to open again on the next call", async () => {
    const real = new IDBFactory();
    let attempts = 0;
    const flaky = {
      open(...args) {
        attempts += 1;
        if (attempts === 1) throw new Error("first attempt fails");
        return real.open(...args);
      },
    };
    const db = createSessionDb({ factory: flaky });

    expect(await db.save(SNAPSHOT)).toBe(false);
    expect(await db.save(SNAPSHOT)).toBe(true);
    expect(await db.load()).toEqual(SNAPSHOT);
    expect(attempts).toBe(2);

    await db.close();
  });
});

describe("failing operations", () => {
  it("save resolves to false when the snapshot cannot be stored", async () => {
    const db = makeDb();

    // Functions cannot be cloned into IndexedDB.
    const result = await db.save({ ...SNAPSHOT, bad: () => {} });

    expect(result).toBe(false);
    expect(await db.load()).toBeNull();

    await db.close();
  });

  it("keeps the earlier save when a later one fails", async () => {
    const db = makeDb();
    await db.save(SNAPSHOT);

    await db.save({ ...SNAPSHOT, bad: () => {} });

    expect(await db.load()).toEqual(SNAPSHOT);
    await db.close();
  });
});