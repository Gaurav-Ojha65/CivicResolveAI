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
        AtomicReference<String> header = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            payload.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            header.set(exchange.getRequestHeaders().getFirst("x-goog-api-key"));
            byte[] body = "{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":\"{\\\"answer\\\":\\\"Use the Track page.\\\",\\\"sourceIds\\\":[\\\"tracking\\\"]}\"}]}}]}".getBytes(StandardCharsets.UTF_8);
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
                    .contains("responseMimeType", "application/json", "responseJsonSchema", "required")
                    .doesNotContain("test-key", "trk_", "reviewer", "raw question", "private note");
            assertThat(header.get()).isEqualTo("test-key");
            assertThat(provider.generate("tracking", "Track", "Use the Track page.", "docs/SECURITY.md")).isEqualTo("Use the Track page.");
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

    @Test void malformedAndWrongTypeResponsesAlwaysFallBack() throws Exception {
        AtomicReference<String> responseBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            byte[] body = responseBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            ObjectMapper mapper = new ObjectMapper();
            String prefix = "{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":";
            String suffix = "}]}}]}";
            var invalid = java.util.List.of(
                    "[]", "null", "{\"candidates\":[]}", "{\"candidates\":[null]}",
                    "{\"candidates\":[{\"finishReason\":\"MAX_TOKENS\"}]}",
                    prefix + "null" + suffix,
                    prefix + mapper.writeValueAsString("{") + suffix,
                    prefix + mapper.writeValueAsString("[]") + suffix,
                    prefix + mapper.writeValueAsString("{\"answer\":null,\"sourceIds\":[\"tracking\"]}") + suffix,
                    prefix + mapper.writeValueAsString("{\"answer\":\"Use the Track page.\",\"sourceIds\":null}") + suffix,
                    prefix + mapper.writeValueAsString("{\"answer\":\"Use the Track page.\",\"sourceIds\":[1]}") + suffix);
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            for (String body : invalid) {
                responseBody.set(body);
                GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model",
                        1, 1000, mapper, uri);
                assertThat(provider.generate("tracking", "Track", "Use the Track page.", "docs/SECURITY.md"))
                        .as("Invalid Gemini response: %s", body).isNull();
            }
        } finally { server.stop(0); }
    }

    @Test void unsupportedCitationOrInventedContentIsRejected() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        java.util.concurrent.atomic.AtomicInteger count = new java.util.concurrent.atomic.AtomicInteger();
        server.createContext("/generate", exchange -> {
            String text = count.incrementAndGet() == 1
                    ? "{\"answer\":\"Use the Track page.\",\"sourceIds\":[\"other\"]}"
                    : "{\"answer\":\"Guaranteed instant refund.\",\"sourceIds\":[\"tracking\"]}";
            String encoded = new ObjectMapper().writeValueAsString(text);
            byte[] body = ("{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":" + encoded + "}]}}]}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 3,
                    1000, new ObjectMapper(), uri);
            assertThat(provider.generate("tracking", "Track", "Use the Track page.", "docs/SECURITY.md")).isNull();
            assertThat(provider.generate("tracking", "Track", "Use the Track page.", "docs/SECURITY.md")).isNull();
        } finally { server.stop(0); }
    }

    @Test void reversalsOfNegationAndActorAreRejected() throws Exception {
        AtomicReference<String> generated = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            String encoded = new ObjectMapper().writeValueAsString(generated.get());
            byte[] body = ("{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":" + encoded + "}]}}]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            generated.set("{\"answer\":\"AI classification does approve complaints.\",\"sourceIds\":[\"approval\"]}");
            assertThat(new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 2, 1000,
                    new ObjectMapper(), uri).generate("approval", "Approval", "AI classification does not approve complaints.", "README.md"))
                    .isNull();
            generated.set("{\"answer\":\"AI can override a reviewer.\",\"sourceIds\":[\"review\"]}");
            assertThat(new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 2, 1000,
                    new ObjectMapper(), uri).generate("review", "Review", "A reviewer can override AI.", "README.md"))
                    .isNull();
            generated.set("{\"answer\":\"AI classification does not approve complaints.\",\"sourceIds\":[\"approval\"]}");
            assertThat(new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 2, 1000,
                    new ObjectMapper(), uri).generate("approval", "Approval", "AI classification does not approve complaints.", "README.md"))
                    .isEqualTo("AI classification does not approve complaints.");
        } finally { server.stop(0); }
    }

    @Test void hindiPublicKnowledgeUsesHindiInstructionAndKeepsNegation() throws Exception {
        AtomicReference<String> payload = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/generate", exchange -> {
            payload.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            String text = "{\"answer\":\"CivicAssist को गोपनीय कोड नहीं बताएं।\",\"sourceIds\":[\"secret_hi\"]}";
            String encoded = new ObjectMapper().writeValueAsString(text);
            byte[] body = ("{\"candidates\":[{\"finishReason\":\"STOP\",\"content\":{\"parts\":[{\"text\":" + encoded + "}]}}]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            var uri = java.net.URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/generate");
            GeminiAssistantProvider provider = new GeminiAssistantProvider(true, "gemini", "test-key", "test-model", 1,
                    1000, new ObjectMapper(), uri);
            assertThat(provider.generate("secret_hi", "गोपनीय कोड", "CivicAssist को गोपनीय कोड नहीं बताएं।",
                    "docs/SECURITY.md", "hi")).isEqualTo("CivicAssist को गोपनीय कोड नहीं बताएं।");
            assertThat(payload.get()).contains("plain Hindi", "secret_hi").doesNotContain("test-key");
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
