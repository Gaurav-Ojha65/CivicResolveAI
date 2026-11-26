package ai.civicresolve.backend.assistant;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class GeminiAssistantProviderTest {
    @Test void outboundPayloadContainsOnlyCuratedKnowledge() throws Exception {
        AtomicReference<String> payload = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            payload.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Use the Track page.\"}]}}]}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 2,
                    1000, new ObjectMapper(), java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate"));
            assertThat(provider.generate("tracking", "Track", "Use the Track page.", "docs/SECURITY.md")).isEqualTo("Use the Track page.");
            assertThat(payload.get()).contains("Use the Track page.", "tracking")
                    .doesNotContain("test-key", "trk_", "reviewer", "raw question", "private note");
        } finally { server.stop(0); }
    }

    @Test void missingKeyAndInvalidModelRemainLocal() {
        GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "", "invalid model", 2,
                1000, new ObjectMapper(), java.net.URI.create("http://127.0.0.1:1/generate"));
        assertThat(provider.generate("tracking", "Track", "Approved text", "docs/SECURITY.md")).isNull();
    }

    @Test void quotaAndHttpFailuresReturnLocalFallbackSignal() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        server.createContext("/generate", exchange -> {
            calls.incrementAndGet();
            exchange.sendResponseHeaders(429, -1);
            exchange.close();
        });
        server.start();
        try {
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 1,
                    1000, new ObjectMapper(), uri);
            assertThat(provider.generate("tracking", "Track", "Approved text", "docs/SECURITY.md")).isNull();
            assertThat(provider.generate("tracking", "Track", "Approved text", "docs/SECURITY.md")).isNull();
            assertThat(calls.get()).isEqualTo(1);
        } finally { server.stop(0); }
    }

    @Test void invalidProviderResponseReturnsLocalFallbackSignal() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            byte[] body = "{\"unexpected\":true}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 1,
                    1000, new ObjectMapper(), uri);
            assertThat(provider.generate("tracking", "Track", "Approved text", "docs/SECURITY.md")).isNull();
        } finally { server.stop(0); }
    }

    @Test void timeoutReturnsLocalFallbackSignal() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            try { Thread.sleep(900); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            try { exchange.sendResponseHeaders(200, -1); } catch (java.io.IOException ignored) { }
            exchange.close();
        });
        server.start();
        try {
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 1,
                    500, new ObjectMapper(), uri);
            assertThat(provider.generate("tracking", "Track", "Approved text", "docs/SECURITY.md")).isNull();
        } finally { server.stop(0); }
    }
}
