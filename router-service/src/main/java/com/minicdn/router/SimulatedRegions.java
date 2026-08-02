package com.minicdn.router;

import java.util.Map;

/**
 * Named client locations the dashboard's "simulate location" dropdown can
 * pick from. Real geo-IP resolution is out of scope for local demos (see
 * build brief) — this + explicit lat/lon query params is the primary path.
 */
public final class SimulatedRegions {

    public record LatLon(double lat, double lon) {}

    private static final Map<String, LatLon> REGIONS = Map.of(
            "mumbai", new LatLon(19.0760, 72.8777),
            "frankfurt", new LatLon(50.1109, 8.6821),
            "virginia", new LatLon(38.9517, -77.4481),
            "singapore", new LatLon(1.3521, 103.8198),
            "sydney", new LatLon(-33.8688, 151.2093),
            "sao_paulo", new LatLon(-23.5505, -46.6333)
    );

    private SimulatedRegions() {}

    public static LatLon lookup(String name) {
        if (name == null) return null;
        return REGIONS.get(name.toLowerCase().trim());
    }

    public static Map<String, LatLon> all() {
        return REGIONS;
    }
}
