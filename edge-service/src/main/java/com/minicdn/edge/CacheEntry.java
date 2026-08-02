package com.minicdn.edge;

public class CacheEntry {
    final byte[] content;
    final String etag;
    final String contentType;
    final long cachedAtEpochMs;
    final long ttlSeconds;

    public CacheEntry(byte[] content, String etag, String contentType, long ttlSeconds) {
        this.content = content;
        this.etag = etag;
        this.contentType = contentType;
        this.cachedAtEpochMs = System.currentTimeMillis();
        this.ttlSeconds = ttlSeconds;
    }

    public boolean isExpired() {
        long ageMs = System.currentTimeMillis() - cachedAtEpochMs;
        return ageMs > (ttlSeconds * 1000);
    }
}
