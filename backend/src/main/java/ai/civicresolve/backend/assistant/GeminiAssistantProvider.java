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
import java.util.Set;
import java.util.Locale;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

/** Optional public-knowledge rephrasing. Failures return null and never affect the main workflows. */
@Component
public class GeminiAssistantProvider implements AssistantProvider {
    private static final Pattern WORD = Pattern.compile("[\\p{L}\\p{M}\\p{N}]+");
    private static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "object",
            "properties", Map.of(
                    "answer", Map.of("type", "string"),
                    "sourceIds", Map.of("type", "array", "items", Map.of("type", "string"),
                            "minItems", 1, "maxItems", 1)),
            "required", List.of("answer", "sourceIds"),
            "additionalProperties", false);
    private static final Set<String> MEANING_MARKERS = Set.of("no", "not", "never", "only", "must", "may",
            "can", "cannot", "should", "without", "except", "before", "after", "all", "every", "always",
            "नहीं", "केवल", "सिर्फ", "बिना", "ज़रूरी", "अनिवार्य");
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
    private final AtomicInteger failures = new AtomicInteger();
    private final Map<String, String> cache = new ConcurrentHashMap<>();
    private volatile long openUntilMs;
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
        return generate(canonicalId, title, approvedAnswer, source, "en");
    }

    @Override
    public String generate(String canonicalId, String title, String approvedAnswer, String source, String language) {
        if (!enabled || !"gemini".equals(provider) || key.isBlank()
                || !("en".equals(language) || "hi".equals(language))
                || !model.matches("[a-zA-Z0-9._-]{3,80}") || System.currentTimeMillis() < openUntilMs) return null;
        String cacheKey = model + ":" + language + ":" + canonicalId + ":" + approvedAnswer;
        String cached = cache.get(cacheKey);
        if (cached != null) return cached;
        if (!inFlight.tryAcquire()) return null;
        try {
            synchronized (calls) {
                LocalDate today = LocalDate.now(ZoneOffset.UTC);
                if (!day.equals(today)) { day = today; calls.set(0); }
                if (calls.get() >= dailyLimit) return null;
                calls.incrementAndGet();
            }
            // No user question, conversation, identifiers, database records or reviewer material enters this payload.
            String prompt = "Rewrite only this approved public CivicResolve knowledge in plain "
                    + ("hi".equals(language) ? "Hindi" : "English") + ". "
                    + "Do not add facts, links, advice or instructions. Return JSON with answer and sourceIds. "
                    + "The only allowed source ID is " + canonicalId + ". Canonical question: " + title
                    + ". Approved answer: " + approvedAnswer;
            String body = mapper.writeValueAsString(Map.of("contents", new Object[]{
                    Map.of("parts", new Object[]{Map.of("text", prompt)})},
                    "generationConfig", Map.of("maxOutputTokens", 220, "temperature", 0.1,
                            "responseMimeType", "application/json", "responseJsonSchema", RESPONSE_SCHEMA)));
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(endpoint)
                    .header("x-goog-api-key", key).header("Content-Type", "application/json")
                    .timeout(timeout).POST(HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body().length() > 16_000) {
                if (response.statusCode() == 429) openUntilMs = System.currentTimeMillis() + 60_000;
                failed(); return null;
            }
            JsonNode root = mapper.readTree(response.body());
            if (root == null || !root.isObject()) { failed(); return null; }
            JsonNode candidates = root.path("candidates");
            if (!candidates.isArray() || candidates.isEmpty()) { failed(); return null; }
            JsonNode candidate = candidates.get(0);
            if (!candidate.isObject() || !"STOP".equals(candidate.path("finishReason").asText())) {
                failed(); return null;
            }
            JsonNode content = candidate.path("content");
            if (!content.isObject()) { failed(); return null; }
            JsonNode parts = content.path("parts");
            if (!parts.isArray() || parts.isEmpty()) { failed(); return null; }
            JsonNode part = parts.get(0);
            if (!part.isObject() || !part.path("text").isTextual()) { failed(); return null; }
            JsonNode result = mapper.readTree(part.path("text").asText());
            if (result == null || !result.isObject()) { failed(); return null; }
            JsonNode sourceIds = result.path("sourceIds");
            JsonNode answerNode = result.path("answer");
            if (!answerNode.isTextual() || !sourceIds.isArray() || sourceIds.size() != 1
                    || !sourceIds.get(0).isTextual()) { failed(); return null; }
            String answer = answerNode.asText().strip();
            if (!canonicalId.equals(sourceIds.get(0).asText())
                    || answer.isBlank() || answer.length() > 700 || answer.contains("http://") || answer.contains("https://")
                    || !grounded(answer, approvedAnswer)) { failed(); return null; }
            failures.set(0);
            if (cache.size() < 256) cache.put(cacheKey, answer);
            return answer;
        } catch (Exception ex) {
            failed();
            return null;
        } finally {
            inFlight.release();
        }
    }

    private void failed() {
        if (failures.incrementAndGet() >= 3) openUntilMs = System.currentTimeMillis() + 60_000;
    }

    private boolean grounded(String answer, String approved) {
        List<String> source = words(approved);
        List<String> output = words(answer);
        if (output.isEmpty()) return false;
        // A bag-of-words match can turn "does not approve" into "does approve", or swap actor and object.
        // Accept only ordered, extractive wording; any unverified paraphrase uses the local answer.
        int sourceIndex = 0;
        for (String word : output) {
            while (sourceIndex < source.size() && !source.get(sourceIndex).equals(word)) sourceIndex++;
            if (sourceIndex == source.size()) return false;
            sourceIndex++;
        }
        for (String marker : MEANING_MARKERS) {
            if (Collections.frequency(source, marker) != Collections.frequency(output, marker)) return false;
        }
        for (String word : source) {
            if (word.chars().allMatch(Character::isDigit)
                    && Collections.frequency(source, word) != Collections.frequency(output, word)) return false;
        }
        return true;
    }

    private List<String> words(String value) {
        Matcher matcher = WORD.matcher(java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT));
        List<String> result = new ArrayList<>();
        while (matcher.find()) result.add(matcher.group());
        return result;
    }
}
