package com.minicdn.router;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
public class AdminController {

    private final NodeRegistry registry;
    private final RestTemplate restTemplate;
    private final EventBroadcaster broadcaster;
    private final RouterLocationProperties routerLocation;

    public AdminController(NodeRegistry registry, RestTemplate restTemplate, EventBroadcaster broadcaster,
                            RouterLocationProperties routerLocation) {
        this.registry = registry;
        this.restTemplate = restTemplate;
        this.broadcaster = broadcaster;
        this.routerLocation = routerLocation;
    }

    @GetMapping("/router-info")
    public Map<String, Object> routerInfo() {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("region", routerLocation.getRegion());
        resp.put("lat", routerLocation.getLat());
        resp.put("lon", routerLocation.getLon());
        return resp;
    }

    @GetMapping("/nodes")
    public List<Map<String, Object>> listNodes() {
        return registry.all().stream().map(n -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", n.name);
            m.put("url", n.url);
            m.put("region", n.region);
            m.put("lat", n.lat);
            m.put("lon", n.lon);
            m.put("healthy", n.healthy);
            m.put("manuallyDown", n.manuallyDown);
            m.put("eligible", n.isEligible());
            m.put("latencyMs", n.latencyMs);
            return m;
        }).toList();
    }

    @PostMapping("/admin/invalidate/{file}")
    public Map<String, Object> invalidateEverywhere(@PathVariable String file) {
        Map<String, String> results = new LinkedHashMap<>();
        for (NodeState node : registry.all()) {
            try {
                restTemplate.postForEntity(node.url + "/invalidate/{file}", null, String.class, file);
                results.put(node.name, "ok");
            } catch (Exception e) {
                results.put(node.name, "failed: " + e.getMessage());
            }
        }
        broadcaster.broadcastInvalidation(file);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("file", file);
        resp.put("results", results);
        return resp;
    }

    @PostMapping("/admin/nodes/{name}/down")
    public Map<String, Object> markDown(@PathVariable String name) {
        NodeState node = requireNode(name);
        node.manuallyDown = true;
        broadcaster.broadcastNodeStatus(name, false);
        return status(node);
    }

    @PostMapping("/admin/nodes/{name}/up")
    public Map<String, Object> markUp(@PathVariable String name) {
        NodeState node = requireNode(name);
        node.manuallyDown = false;
        broadcaster.broadcastNodeStatus(name, node.healthy);
        return status(node);
    }

    private NodeState requireNode(String name) {
        NodeState node = registry.get(name);
        if (node == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "no such node: " + name);
        }
        return node;
    }

    private Map<String, Object> status(NodeState node) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("name", node.name);
        resp.put("healthy", node.healthy);
        resp.put("manuallyDown", node.manuallyDown);
        resp.put("eligible", node.isEligible());
        return resp;
    }
}
