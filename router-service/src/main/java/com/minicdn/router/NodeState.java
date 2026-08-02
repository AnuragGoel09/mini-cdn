package com.minicdn.router;

/**
 * Live state for one edge node, refreshed every probe cycle.
 * `manuallyDown` lets the dashboard's failover demo button force a node
 * out of rotation regardless of what the probe measures.
 */
public class NodeState {
    public final String name;
    public final String url;
    public final String region;
    public final double lat;
    public final double lon;

    public volatile boolean healthy = true;
    public volatile boolean manuallyDown = false;
    public volatile Long latencyMs = null; // null until first successful probe

    public NodeState(String name, String url, String region, double lat, double lon) {
        this.name = name;
        this.url = url;
        this.region = region;
        this.lat = lat;
        this.lon = lon;
    }

    public boolean isEligible() {
        return healthy && !manuallyDown;
    }
}
