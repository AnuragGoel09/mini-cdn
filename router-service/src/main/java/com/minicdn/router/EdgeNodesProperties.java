package com.minicdn.router;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Bound from `minicdn.nodes` in application.yml — the static list of edge
 * nodes the router knows about, along with the coordinates used for the
 * haversine fallback when no latency measurement exists yet.
 */
@ConfigurationProperties(prefix = "minicdn")
public class EdgeNodesProperties {

    private List<NodeDefinition> nodes = List.of();

    public List<NodeDefinition> getNodes() {
        return nodes;
    }

    public void setNodes(List<NodeDefinition> nodes) {
        this.nodes = nodes;
    }

    public static class NodeDefinition {
        private String name;
        private String url;
        private String region;
        private double lat;
        private double lon;

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }

        public String getUrl() { return url; }
        public void setUrl(String url) { this.url = url; }

        public String getRegion() { return region; }
        public void setRegion(String region) { this.region = region; }

        public double getLat() { return lat; }
        public void setLat(double lat) { this.lat = lat; }

        public double getLon() { return lon; }
        public void setLon(double lon) { this.lon = lon; }
    }
}
