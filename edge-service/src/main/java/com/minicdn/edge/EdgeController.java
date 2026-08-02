package com.minicdn.edge;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@RestController
public class EdgeController {

    private final RestTemplate restTemplate;
    private final LruCache cache;
    private final String region;
    private final String originUrl;
    private final long ttlSeconds;

    private final AtomicLong hits = new AtomicLong();
    private final AtomicLong misses = new AtomicLong();

    public EdgeController(RestTemplate restTemplate,
                           @Value("${REGION:local}") String region,
                           @Value("${ORIGIN_URL:http://localhost:8080}") String originUrl,
                           @Value("${CACHE_MAX_ENTRIES:100}") int cacheMaxEntries,
                           @Value("${CACHE_TTL_SECONDS:60}") long ttlSeconds) {
        this.restTemplate = restTemplate;
        this.region = region;
        this.originUrl = originUrl;
        this.ttlSeconds = ttlSeconds;
        this.cache = new LruCache(cacheMaxEntries);
    }

    @GetMapping("/cdn/{name}")
    public ResponseEntity<byte[]> getCached(@PathVariable String name) {
        CacheEntry cached = cache.get(name);
        if (cached != null) {
            hits.incrementAndGet();
            return ResponseEntity.ok()
                    .header("X-Cache", "HIT")
                    .header("X-Cache-Node", region)
                    .header(HttpHeaders.ETAG, cached.etag)
                    .contentType(MediaType.parseMediaType(cached.contentType))
                    .body(cached.content);
        }

        misses.incrementAndGet();
        ResponseEntity<byte[]> originResponse = fetchFromOrigin(name);

        String etag = originResponse.getHeaders().getETag();
        MediaType contentType = originResponse.getHeaders().getContentType();
        byte[] body = originResponse.getBody();

        CacheEntry entry = new CacheEntry(
                body,
                etag != null ? etag : "",
                contentType != null ? contentType.toString() : MediaType.TEXT_PLAIN_VALUE,
                ttlSeconds
        );
        cache.put(name, entry);

        return ResponseEntity.ok()
                .header("X-Cache", "MISS")
                .header("X-Cache-Node", region)
                .header(HttpHeaders.ETAG, entry.etag)
                .contentType(contentType != null ? contentType : MediaType.TEXT_PLAIN)
                .body(body);
    }

    private ResponseEntity<byte[]> fetchFromOrigin(String name) {
        try {
            return restTemplate.getForEntity(originUrl + "/files/{name}", byte[].class, name);
        } catch (RestClientException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "origin fetch failed for " + name + ": " + e.getMessage());
        }
    }

    @PostMapping("/invalidate/{name}")
    public Map<String, Object> invalidate(@PathVariable String name) {
        cache.evict(name);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("region", region);
        resp.put("evicted", name);
        return resp;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", "UP");
        resp.put("region", region);
        return resp;
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        long h = hits.get();
        long m = misses.get();
        long total = h + m;
        double hitRate = total == 0 ? 0.0 : (double) h / total;

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("region", region);
        resp.put("hits", h);
        resp.put("misses", m);
        resp.put("cacheSize", cache.size());
        resp.put("hitRate", hitRate);
        return resp;
    }
}
