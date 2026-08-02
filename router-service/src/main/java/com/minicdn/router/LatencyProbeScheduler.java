package com.minicdn.router;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

/**
 * Every ~5s, pings each edge node's /health and records round-trip time.
 * This measured latency (not just static geo-distance) is what the router
 * uses to pick the "closest" node — closest in observed network time, not
 * just on a map.
 */
@Component
public class LatencyProbeScheduler {

    private static final Logger log = LoggerFactory.getLogger(LatencyProbeScheduler.class);

    private final NodeRegistry registry;
    private final RestTemplate restTemplate;
    private final EventBroadcaster broadcaster;

    public LatencyProbeScheduler(NodeRegistry registry, RestTemplate restTemplate, EventBroadcaster broadcaster) {
        this.registry = registry;
        this.restTemplate = restTemplate;
        this.broadcaster = broadcaster;
    }

    @Scheduled(fixedDelayString = "${minicdn.probe-interval-ms:5000}", initialDelay = 0)
    public void probeAll() {
        for (NodeState node : registry.all()) {
            probeOne(node);
        }
    }

    private void probeOne(NodeState node) {
        boolean wasHealthy = node.healthy;
        long start = System.currentTimeMillis();
        try {
            ResponseEntity<String> resp = restTemplate.getForEntity(node.url + "/health", String.class);
            long rtt = System.currentTimeMillis() - start;
            boolean up = resp.getStatusCode().is2xxSuccessful();
            node.healthy = up;
            if (up) {
                node.latencyMs = rtt;
            }
        } catch (Exception e) {
            node.healthy = false;
            log.debug("probe failed for node {}: {}", node.name, e.getMessage());
        }

        if (wasHealthy != node.healthy && !node.manuallyDown) {
            // only auto-probe-driven transitions get broadcast here; manual
            // down/up transitions are broadcast by AdminController directly
            broadcaster.broadcastNodeStatus(node.name, node.healthy);
        }
    }
}
