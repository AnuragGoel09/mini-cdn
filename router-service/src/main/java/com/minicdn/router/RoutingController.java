package com.minicdn.router;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@RestController
public class RoutingController {

    private final NodeRegistry registry;
    private final RestTemplate restTemplate;
    private final EventBroadcaster broadcaster;
    private static final Logger log = LoggerFactory.getLogger(RoutingController.class);

    public RoutingController(NodeRegistry registry, RestTemplate restTemplate, EventBroadcaster broadcaster) {
        this.registry = registry;
        this.restTemplate = restTemplate;
        this.broadcaster = broadcaster;
    }

    @GetMapping("/route/{file}")
    public ResponseEntity<byte[]> route(@PathVariable String file,
                                         @RequestParam(required = false) String overrideRegion,
                                         @RequestParam(required = false) Double lat,
                                         @RequestParam(required = false) Double lon) {

        Double clientLat = lat;
        Double clientLon = lon;
        String clientRegionGuess = overrideRegion != null ? overrideRegion : "unknown";

        if ((clientLat == null || clientLon == null) && overrideRegion != null) {
            SimulatedRegions.LatLon simulated = SimulatedRegions.lookup(overrideRegion);
            if (simulated != null) {
                clientLat = simulated.lat();
                clientLon = simulated.lon();
            }
        }

        List<NodeState> eligible = registry.all().stream()
                .filter(NodeState::isEligible)
                .toList();

        if (eligible.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "no healthy edge nodes available");
        }

        NodeState chosen = pickNode(eligible, clientLat, clientLon);

        long start = System.currentTimeMillis();
        ResponseEntity<byte[]> edgeResponse = proxyToEdge(chosen, file);
        long measuredLatencyMs = System.currentTimeMillis() - start;

        String cacheStatus = Optional.ofNullable(edgeResponse.getHeaders().getFirst("X-Cache")).orElse("UNKNOWN");

        broadcaster.broadcastRouteEvent(file, clientRegionGuess, chosen.name, cacheStatus, measuredLatencyMs);

        HttpHeaders headers = new HttpHeaders();
        headers.putAll(edgeResponse.getHeaders());
        headers.set("X-Router-Latency-Ms", String.valueOf(measuredLatencyMs));
        headers.set("X-Client-Region-Guess", clientRegionGuess);

        return ResponseEntity.status(edgeResponse.getStatusCode())
                .headers(headers)
                .body(edgeResponse.getBody());
    }

    /**
     * Geography first, latency as a fallback — this mirrors how real CDNs
     * route: GeoDNS/anycast deliver a client to its nearest PoP based on
     * the client's own location, not on a ping measured from one central
     * vantage point. Router-to-edge latency is only a reasonable proxy for
     * "distance" when the client's location is unknown; when we know where
     * the client claims to be, that geography should win outright rather
     * than being overridden by latency noise measured from the router's
     * own location (which is a different point on the map entirely).
     */
    private NodeState pickNode(List<NodeState> eligible, Double clientLat, Double clientLon) {
        if (clientLat != null && clientLon != null) {
            return eligible.stream()
                    .min(Comparator.comparingDouble(n -> GeoUtil.haversineKm(clientLat, clientLon, n.lat, n.lon)))
                    .orElseThrow();
        }

        Optional<NodeState> byLatency = eligible.stream()
                .filter(n -> n.latencyMs != null)
                .min(Comparator.comparingLong(n -> n.latencyMs));

        return byLatency.orElseGet(() -> eligible.get(0));
    }

    private ResponseEntity<byte[]> proxyToEdge(NodeState node, String file) {
        try {
            return restTemplate.getForEntity(node.url + "/cdn/{file}", byte[].class, file);
        } catch (RestClientException e) {
            log.error("proxyToEdge failed: node={} url={} file={}",node.name,node.url,file, e);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "failed to reach edge node " + node.name + ": " + e.getMessage());
        }
    }
}
