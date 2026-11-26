package ai.civicresolve.backend.assistant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

/** Optional public-knowledge rephrasing. Failures return null and never affect the main workflows. */
@Component
public class GeminiAssistantProvider implements AssistantProvider {
    private final boolean enabled;
    private final String provider;
    private final String key;
    private final String model;
    private final int dailyLimit;
    private final HttpClient http;
    private final ObjectMapper mapper;
    private final URI endpoint;
    private final Semaphore inFlight = new Semaphore(3);
    private final AtomicInteger calls = new AtomicInteger();
    private volatile LocalDate day = LocalDate.now(ZoneOffset.UTC);

    @Autowired
    public GeminiAssistantProvider(@Value("${civicassist.enabled:false}") boolean enabled,
                                   @Value("${civicassist.provider:gemini}") String provider,
                                   @Value("${GEMINI_API_KEY:}") String key,
                                   @Value("${GEMINI_MODEL:}") String model,
                                   @Value("${civicassist.daily-request-limit:100}") int dailyLimit,
                                   @Value("${civicassist.timeout-ms:4000}") int timeoutMs,
                                   ObjectMapper mapper) {
        this(enabled, provider, key, model, dailyLimit, timeoutMs, mapper,
                URI.create("https://generativelanguage.googleapis.com/v1beta/models/"
                        + (model.matches("[a-zA-Z0-9._-]{3,80}") ? model : "disabled") + ":generateContent"));
    }

    GeminiAssistantProvider(boolean enabled, String provider, String key, String model,
                            int dailyLimit, int timeoutMs, ObjectMapper mapper, URI endpoint) {
        this.enabled = enabled;
        this.provider = provider;
        this.key = key;
        this.model = model;
        this.dailyLimit = Math.max(0, dailyLimit);
        this.mapper = mapper;
        this.endpoint = endpoint;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(Math.max(500, timeoutMs))).build();
        this.timeout = Duration.ofMillis(Math.max(500, timeoutMs));
    }

    private final Duration timeout;

    @Override public String model() { return model; }

    @Override
    public String generate(String canonicalId, String title, String approvedAnswer, String source) {
        if (!enabled || !"gemini".equals(provider) || key.isBlank()
                || !model.matches("[a-zA-Z0-9._-]{3,80}") || !inFlight.tryAcquire()) return null;
        try {
            synchronized (calls) {
                LocalDate today = LocalDate.now(ZoneOffset.UTC);
                if (!day.equals(today)) { day = today; calls.set(0); }
                if (calls.get() >= dailyLimit) return null;
                calls.incrementAndGet();
            }
            // No user question, conversation, identifiers, database records or reviewer material enters this payload.
            String prompt = "Rewrite this approved public CivicResolve knowledge in plain English. "
                    + "Do not add facts, links, advice or instructions. Keep the answer under 500 characters. "
                    + "Topic: " + canonicalId + ". Approved answer: " + approvedAnswer;
            String body = mapper.writeValueAsString(Map.of("contents", new Object[]{
                    Map.of("parts", new Object[]{Map.of("text", prompt)})},
                    "generationConfig", Map.of("maxOutputTokens", 160, "temperature", 0.1)));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(endpoint)
                    .header("x-goog-api-key", key).header("Content-Type", "application/json")
                    .timeout(timeout).POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().length() > 16_000) return null;
            JsonNode root = mapper.readTree(response.body());
            JsonNode candidates = root.path("candidates");
            if (!candidates.isArray() || candidates.isEmpty()) return null;
            JsonNode parts = candidates.get(0).path("content").path("parts");
            if (!parts.isArray() || parts.isEmpty()) return null;
            String text = parts.get(0).path("text").asText("").strip();
            if (text.isBlank() || text.length() > 700 || text.contains("http://") || text.contains("https://")) return null;
            return text;
        } catch (Exception ex) {
            return null;
        } finally {
            inFlight.release();
        }
    }
}
