/**
 * Flipper Dashboard — Daily Scan Database Layer
 * IndexedDB wrapper for scan results, discards, and local caching.
 */
(function () {
    'use strict';

    const DB_NAME = 'flipper-dashboard';
    const DB_VERSION = 1;
    const STORES = {
        scans: 'scans',
        listings: 'listings',
        discards: 'discards',
        meta: 'meta'
    };

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error('IndexedDB not supported'));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORES.scans)) {
                    db.createObjectStore(STORES.scans, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORES.listings)) {
                    const store = db.createObjectStore(STORES.listINGS, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('scanId', 'scanId', { unique: false });
                    store.createIndex('discarded', 'discarded', { unique: false });
                    store.createIndex('url', 'url', { unique: false });
                    store.createIndex('category', 'category', { unique: false });
                    store.createIndex('verdict', 'verdict', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORES.discards)) {
                    db.createObjectStore(STORES.discards, { keyPath: 'url' });
                }
                if (!db.objectStoreNames.contains(STORES.meta)) {
                    db.createObjectStore(STORES.meta, { keyPath: 'key' });
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
        return dbPromise;
    }

    async function tx(storeNames, mode, fn) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeNames, mode);
            const stores = Array.isArray(storeNames)
                ? storeNames.map((name) => transaction.objectStore(name))
                : transaction.objectStore(storeNames);
            let result;
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
            Promise.resolve(fn(stores)).then((value) => { result = value; }).catch(reject);
        });
    }

    function reqToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    const ScanDB = {
        async saveScan(scan) {
            const record = {
                id: scan.id || `scan-${Date.now()}`,
                timestamp: scan.timestamp || new Date().toISOString(),
                source: scan.source || 'manual',
                listingCount: scan.listings ? scan.listings.length : 0,
                notes: scan.notes || ''
            };
            await tx(STORES.scans, 'readwrite', (store) => {
                store.put(record);
            });
            if (scan.listings && scan.listings.length) {
                await tx(STORES.listings, 'readwrite', (store) => {
                    scan.listings.forEach((listing) => {
                        store.add({
                            ...listing,
                            scanId: record.id,
                            discarded: 0,
                            addedAt: new Date().toISOString()
                        });
                    });
                });
            }
            return record;
        },

        async getScans() {
            return tx(STORES.scans, 'readonly', (store) => reqToPromise(store.getAll()));
        },

        async getListings({ includeDiscarded = false, category = null, verdict = null } = {}) {
            return tx(STORES.listings, 'readonly', (store) => {
                return reqToPromise(store.getAll()).then((all) => {
                    let filtered = all;
                    if (!includeDiscarded) {
                        filtered = filtered.filter((l) => !l.discarded);
                    }
                    if (category) {
                        filtered = filtered.filter((l) => l.category === category);
                    }
                    if (verdict) {
                        filtered = filtered.filter((l) => l.verdict === verdict);
                    }
                    return filtered.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
                });
            });
        },

        async getListing(id) {
            return tx(STORES.listings, 'readonly', (store) => reqToPromise(store.get(id)));
        },

        async discardListing(id, reason = '') {
            const listing = await this.getListing(id);
            if (!listing) return false;
            await tx([STORES.listings, STORES.discards], 'readwrite', (stores) => {
                const listingStore = stores[0];
                const discardStore = stores[1];
                listingStore.put({ ...listing, discarded: 1, discardedAt: new Date().toISOString(), discardReason: reason });
                discardStore.put({
                    url: listing.url || '',
                    title: listing.title || '',
                    category: listing.category || '',
                    askingPrice: listing.askingPrice || 0,
                    newPrice: listing.newPrice || 0,
                    date: new Date().toISOString(),
                    reason: reason,
                    listingId: id
                });
            });
            return true;
        },

        async undiscardListing(id) {
            const listing = await this.getListing(id);
            if (!listing) return false;
            await tx([STORES.listings, STORES.discards], 'readwrite', (stores) => {
                const listingStore = stores[0];
                const discardStore = stores[1];
                listingStore.put({ ...listing, discarded: 0, discardedAt: null, discardReason: '' });
                if (listing.url) {
                    discardStore.delete(listing.url);
                }
            });
            return true;
        },

        async getDiscards() {
            return tx(STORES.discards, 'readonly', (store) => reqToPromise(store.getAll()));
        },

        async isDiscarded(url) {
            if (!url) return false;
            return tx(STORES.discards, 'readonly', (store) => reqToPromise(store.get(url))).then((d) => !!d);
        },

        async getDiscardUrls() {
            const discards = await this.getDiscards();
            return new Set(discards.map((d) => d.url).filter(Boolean));
        },

        async clearDiscard(url) {
            return tx(STORES.discards, 'readwrite', (store) => reqToPromise(store.delete(url)));
        },

        async clearAllDiscards() {
            return tx(STORES.discards, 'readwrite', (store) => reqToPromise(store.clear()));
        },

        async getMeta(key) {
            return tx(STORES.meta, 'readonly', (store) => reqToPromise(store.get(key)));
        },

        async setMeta(key, value) {
            return tx(STORES.meta, 'readwrite', (store) => reqToPromise(store.put({ key, value, updatedAt: new Date().toISOString() })));
        },

        async getLastScanTime() {
            return this.getMeta('lastScanTime');
        },

        async setLastScanTime(time) {
            return this.setMeta('lastScanTime', time);
        },

        async getStats() {
            const listings = await this.getListings({ includeDiscarded: true });
            const discards = await this.getDiscards();
            const categories = {};
            let totalAsking = 0;
            let totalNew = 0;
            let totalRoi = 0;
            let roiCount = 0;
            const verdicts = { 'GO': 0, 'POSSIBLE': 0, 'NO-GO': 0, 'STRONG GO': 0 };
            listings.forEach((l) => {
                if (!categories[l.category]) categories[l.category] = 0;
                categories[l.category]++;
                if (l.askingPrice) totalAsking += l.askingPrice;
                if (l.newPrice) totalNew += l.newPrice;
                if (l.roi) { totalRoi += l.roi; roiCount++; }
                if (verdicts[l.verdict] !== undefined) verdicts[l.verdict]++;
            });
            return {
                total: listings.length,
                active: listings.filter((l) => !l.discarded).length,
                discarded: discards.length,
                categories,
                avgAsking: listings.length ? Math.round(totalAsking / listings.length) : 0,
                avgNew: listings.length ? Math.round(totalNew / listings.length) : 0,
                avgRoi: roiCount ? Math.round(totalRoi / roiCount) : 0,
                verdicts
            };
        },

        async clearAll() {
            await tx(STORES.scans, 'readwrite', (store) => reqToPromise(store.clear()));
            await tx(STORES.listings, 'readwrite', (store) => reqToPromise(store.clear()));
            await tx(STORES.discards, 'readwrite', (store) => reqToPromise(store.clear()));
            await tx(STORES.meta, 'readwrite', (store) => reqToPromise(store.clear()));
        }
    };

    window.ScanDB = ScanDB;
})();
