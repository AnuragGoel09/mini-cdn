package com.minicdn.router;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class NodeRegistry {

    private final EdgeNodesProperties properties;
    private final ConcurrentHashMap<String, NodeState> nodes = new ConcurrentHashMap<>();

    public NodeRegistry(EdgeNodesProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        for (EdgeNodesProperties.NodeDefinition def : properties.getNodes()) {
            nodes.put(def.getName(), new NodeState(def.getName(), def.getUrl(), def.getRegion(), def.getLat(), def.getLon()));
        }
    }

    public Collection<NodeState> all() {
        return nodes.values();
    }

    public NodeState get(String name) {
        return nodes.get(name);
    }
}
