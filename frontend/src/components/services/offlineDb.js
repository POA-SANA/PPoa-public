const DB_NAME = 'POARegistryOfflineDB';
const STORE_NAME = 'telemetry_cache';
const DB_VERSION = 1;

/**
 * Initializes or opens the IndexedDB instance.
 */
export const initIndexedDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

/**
 * Scans local storage, deletes records older than 12 hours (TTL),
 * and returns the current count of pending unsaved audits.
 */
export const runTtlCleanupAndCount = async () => {
    const db = await initIndexedDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (e) => {
            const records = e.target.result || [];
            const now = Date.now();
            const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
            let pendingCount = 0;

            records.forEach((record) => {
                // Expiration check
                if (now - record.timestamp > TWELVE_HOURS_MS) {
                    const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                    deleteTx.objectStore(STORE_NAME).delete(record.id);
                } else if (record.status === 'pending') {
                    pendingCount++;
                }
            });

            resolve(pendingCount);
        };

        request.onerror = () => resolve(0);
    });
};

/**
 * Stages an audit capture locally in the browser storage (Write-Ahead Staging).
 */
export const stageRecordLocally = async (record) => {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(record);

        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
};

/**
 * Removes a record from IndexedDB after it has successfully synced with the backend.
 */
export const removeRecordLocally = async (id) => {
    const db = await initIndexedDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = (e) => reject(e.target.error);
    });
};

/**
 * Retrieves all pending staged records to send during background sync.
 */
export const getPendingRecords = async () => {
    const db = await initIndexedDB();
    return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (e) => {
            const records = e.target.result || [];
            const pending = records.filter((r) => r.status === 'pending');
            resolve(pending);
        };

        request.onerror = () => resolve([]);
    });
};