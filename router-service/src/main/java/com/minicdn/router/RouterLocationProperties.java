package com.minicdn.router;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where this router instance is physically running. Previously this had
 * no representation anywhere in the system — the router's "location" was
 * just whatever machine happened to run the JVM, invisible to both the
 * routing logic and the dashboard. Making it an explicit, configured value
 * lets the map actually show it, and lets us reason honestly about when
 * router-measured latency is/isn't a good proxy for client-to-edge distance.
 */
@ConfigurationProperties(prefix = "minicdn.router")
public class RouterLocationProperties {

    private String region = "unknown";
    private double lat;
    private double lon;

    public String getRegion() { return region; }
    public void setRegion(String region) { this.region = region; }

    public double getLat() { return lat; }
    public void setLat(double lat) { this.lat = lat; }

    public double getLon() { return lon; }
    public void setLon(double lon) { this.lon = lon; }
}
