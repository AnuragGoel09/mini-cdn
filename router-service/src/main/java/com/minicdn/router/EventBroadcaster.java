package com.minicdn.router;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class EventBroadcaster extends TextWebSocketHandler {

    private final Set<WebSocketSession> sessions = new CopyOnWriteArraySet<>();
    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
    }

    public void broadcastRouteEvent(String file, String clientRegionGuess, String chosenNode,
                                     String cacheStatus, long latencyMs) {
        broadcast(Map.of(
                "type", "route",
                "timestamp", Instant.now().toString(),
                "file", file,
                "clientRegionGuess", clientRegionGuess,
                "chosenNode", chosenNode,
                "cacheStatus", cacheStatus,
                "latencyMs", latencyMs
        ));
    }

    public void broadcastInvalidation(String file) {
        broadcast(Map.of(
                "type", "invalidation",
                "timestamp", Instant.now().toString(),
                "file", file
        ));
    }

    public void broadcastNodeStatus(String node, boolean up) {
        broadcast(Map.of(
                "type", "node-status",
                "timestamp", Instant.now().toString(),
                "node", node,
                "status", up ? "up" : "down"
        ));
    }

    private void broadcast(Map<String, Object> event) {
        try {
            String json = mapper.writeValueAsString(event);
            TextMessage message = new TextMessage(json);
            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    try {
                        session.sendMessage(message);
                    } catch (IOException ignored) {
                        // a single dead session shouldn't block broadcasting to the rest
                    }
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("failed to serialize websocket event", e);
        }
    }
}
