import type { Reading } from "./api";
import { asCachedReadings, filterReadingsByRange, mergeCachedReadings, type CachedReading, type ReadingSource } from "./historySeries.ts";

interface LoadInput {
  deviceId: string;
  from: string;
  to: string;
}

export interface ReadingCache {
  save(source: ReadingSource, readings: Reading[]): Promise<void>;
  load(input: LoadInput): Promise<CachedReading[]>;
}

interface CacheOptions {
  forceMemory?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ws63-history-cache", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.createObjectStore("readings", { keyPath: "id" });
      store.createIndex("device_recorded", ["deviceId", "recordedAt"], { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function createMemoryCache(): ReadingCache {
  let readings: CachedReading[] = [];
  return {
    async save(source, nextReadings) {
      readings = mergeCachedReadings(readings, asCachedReadings(nextReadings, source));
    },
    async load(input) {
      return filterReadingsByRange(
        readings.filter((reading) => reading.deviceId === input.deviceId),
        input.from,
        input.to
      );
    }
  };
}

function createIndexedDbCache(): ReadingCache {
  return {
    async save(source, nextReadings) {
      if (nextReadings.length === 0) return;
      const db = await openDb();
      try {
        const tx = db.transaction("readings", "readwrite");
        const store = tx.objectStore("readings");
        for (const reading of asCachedReadings(nextReadings, source)) {
          store.put(reading);
        }
        await txDone(tx);
      } finally {
        db.close();
      }
    },
    async load(input) {
      const db = await openDb();
      try {
        return await new Promise<CachedReading[]>((resolve, reject) => {
          const tx = db.transaction("readings", "readonly");
          const store = tx.objectStore("readings");
          const request = store.getAll();
          request.onsuccess = () => {
            const all = request.result as CachedReading[];
            resolve(filterReadingsByRange(
              all.filter((reading) => reading.deviceId === input.deviceId),
              input.from,
              input.to
            ));
          };
          request.onerror = () => reject(request.error);
        });
      } finally {
        db.close();
      }
    }
  };
}

export function createReadingCache(options: CacheOptions = {}): ReadingCache {
  if (options.forceMemory || typeof indexedDB === "undefined") {
    return createMemoryCache();
  }
  return createIndexedDbCache();
}

export const historyCache = createReadingCache();
