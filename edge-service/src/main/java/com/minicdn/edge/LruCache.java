package com.minicdn.edge;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * O(1) get/put/evict LRU cache backed by a LinkedHashMap in access order.
 * removeEldestEntry() is what turns the plain LinkedHashMap into a bounded
 * LRU: once size exceeds maxEntries, the least-recently-used entry (head of
 * the iteration order) is evicted automatically on every put/get.
 *
 * Synchronized at the method level for thread safety — Spring MVC's default
 * thread-per-request model means concurrent requests can hit the same node,
 * and correctness matters more than raw throughput for a cache this size.
 */
public class LruCache {

    private final int maxEntries;
    private final LinkedHashMap<String, CacheEntry> store;

    public LruCache(int maxEntries) {
        this.maxEntries = maxEntries;
        // accessOrder=true reorders entries on get(), not just put()
        this.store = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, CacheEntry> eldest) {
                return size() > LruCache.this.maxEntries;
            }
        };
    }

    public synchronized CacheEntry get(String key) {
        CacheEntry entry = store.get(key);
        if (entry == null) {
            return null;
        }
        if (entry.isExpired()) {
            store.remove(key);
            return null;
        }
        return entry;
    }

    public synchronized void put(String key, CacheEntry entry) {
        store.put(key, entry);
    }

    public synchronized void evict(String key) {
        store.remove(key);
    }

    public synchronized int size() {
        return store.size();
    }
}
