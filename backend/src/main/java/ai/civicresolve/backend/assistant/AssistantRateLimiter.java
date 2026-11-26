package ai.civicresolve.backend.assistant;

import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.time.Clock;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;

/** Process-local, fail-closed fixed-window limiter with atomic capacity and expiry. */
@Component
public class AssistantRateLimiter {
    private final Map<String, Window> clients = new HashMap<>();
    private final Clock clock;
    private final int capacity;
    private final int limit;
    private final long windowMs;

    public AssistantRateLimiter() { this(Clock.systemUTC(), 4096, 20, 60_000); }

    AssistantRateLimiter(Clock clock, int capacity, int limit, long windowMs) {
        this.clock = clock;
        this.capacity = capacity;
        this.limit = limit;
        this.windowMs = windowMs;
    }

    public synchronized boolean allow(String client) {
        long now = clock.millis();
        String key = client == null || client.isBlank() ? "unknown" : client;
        Window window = clients.get(key);
        if (window != null && now - window.start >= windowMs) {
            clients.remove(key);
            window = null;
        }
        if (window == null) {
            if (clients.size() >= capacity) {
                Iterator<Map.Entry<String, Window>> it = clients.entrySet().iterator();
                while (it.hasNext()) if (now - it.next().getValue().start >= windowMs) it.remove();
            }
            if (clients.size() >= capacity) return false;
            window = new Window(now);
            clients.put(key, window);
        }
        return ++window.count <= limit;
    }

    synchronized int trackedClients() { return clients.size(); }

    /** Only call after the direct peer has matched an explicitly configured trusted proxy IP. */
    static String forwardedClient(String remote, String header, Set<String> trustedProxies) {
        if (header == null || header.length() > 512) return remote;
        String[] hops = header.split(",", -1);
        for (int i = hops.length - 1; i >= 0; i--) {
            String hop = hops[i].trim();
            if (!hop.matches("[0-9a-fA-F:.]{3,45}")) return remote;
            try {
                String address = InetAddress.getByName(hop).getHostAddress();
                if (!trustedProxies.contains(address)) return address;
            } catch (Exception ignored) { return remote; }
        }
        return remote;
    }

    private static final class Window {
        final long start;
        int count;
        Window(long start) { this.start = start; }
    }
}
