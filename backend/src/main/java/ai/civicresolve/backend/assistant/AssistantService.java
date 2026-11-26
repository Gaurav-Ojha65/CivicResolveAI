package ai.civicresolve.backend.assistant;

import ai.civicresolve.backend.assistant.AssistantController.Answer;
import ai.civicresolve.backend.assistant.AssistantController.Navigation;
import ai.civicresolve.backend.assistant.AssistantController.Question;
import ai.civicresolve.backend.assistant.AssistantController.Source;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Curated, local retrieval. No question, history or case data crosses the provider boundary. */
@Service
public class AssistantService {
    private static final Set<String> PAGES = Set.of("/", "/submit", "/track", "/reviewer",
            "/reviewer/grievances", "/reviewer/analytics", "/reviewer/audit");
    private static final Pattern WORDS = Pattern.compile("[^\\p{L}\\p{N}]+");
    private static final Set<String> STOP = Set.of("the", "a", "an", "is", "what", "how", "do", "i", "can", "you", "me", "my", "to", "of", "in", "for", "this", "it", "and", "does", "with", "please", "explain", "about", "tell", "क्या", "है", "कैसे");
    private static final Map<String, String> SYNONYMS = Map.ofEntries(
            Map.entry("grievance", "complaint"), Map.entry("case", "complaint"),
            Map.entry("shikayat", "शिकायत"), Map.entry("bharosa", "confidence"),
            Map.entry("login", "reviewer"), Map.entry("logreg", "regression"));

    private final List<Entry> entries;
    private final AssistantProvider provider;
    private final Semaphore concurrent = new Semaphore(12);
    private final Map<String, Window> clients = new ConcurrentHashMap<>();
    private final Clock clock = Clock.systemUTC();

    public AssistantService(AssistantProvider provider) {
        this.provider = provider;
        this.entries = loadEntries();
    }

    public Answer answer(Question request, boolean reviewer, String remoteAddress) {
        if (!allow(remoteAddress == null ? "unknown" : remoteAddress)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Assistant rate limit exceeded");
        }
        if (!concurrent.tryAcquire()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Assistant is busy");
        }
        try {
            return retrieveAndAnswer(request, reviewer);
        } finally {
            concurrent.release();
        }
    }

    private Answer retrieveAndAnswer(Question request, boolean reviewer) {
        String page = PAGES.contains(request.page()) ? request.page() : "/";
        if (page.startsWith("/reviewer") && !reviewer) page = "/";
        String language = "hi".equalsIgnoreCase(request.language()) ? "hi" : "en";
        String question = request.question().strip();
        if (question.toLowerCase(Locale.ROOT).matches("(?s).*(ignore (all )?(previous )?instructions|system prompt|developer message|approve complaint|override complaint|reject complaint).*")) {
            return new Answer("CivicAssist can explain workflows, but it cannot change complaints or follow instructions to bypass review.",
                    List.of(), List.of("How does human review work?"), List.of(), "local", null,
                    "This assistant is read-only.", null);
        }
        boolean followUp = question.toLowerCase(Locale.ROOT).matches(".*(again|simpler|example|hindi|technical|more detail|फिर|सरल|उदाहरण).*");
        // A client may provide only a knowledge identifier, never raw prior chat history.
        Entry previous = entries.stream().filter(e -> e.id.equals(request.previousKnowledgeId()))
                .filter(e -> reviewer || e.audience.equals("PUBLIC")).findFirst().orElse(null);
        Entry best = null;
        int bestScore = 0;
        Set<String> tokens = tokens(question);
        for (Entry entry : entries) {
            if (!reviewer && !entry.audience.equals("PUBLIC")) continue;
            int score = score(entry, tokens, question, page, language);
            if (followUp && previous != null && (entry.id.equals(previous.id) || entry.id.equals(previous.id + "_hi"))) score += 12;
            if (score > bestScore) { best = entry; bestScore = score; }
        }
        if (best == null || bestScore < 2) {
            return new Answer(language.equals("hi") ? "मैं केवल CivicResolve के उपयोग और AI वर्गीकरण की जानकारी दे सकता हूँ। कृपया शिकायत दर्ज करने, ट्रैक करने या स्थिति के बारे में पूछें।" :
                    "I can explain CivicResolve workflows and its AI classification. Please ask about submitting, tracking, status, or model behavior.",
                    List.of(), List.of("How do I submit a complaint?", "How do I track it?"),
                    List.of(), "local", null, "No verified knowledge matched this question.", null);
        }
        String local = best.answer;
        if (followUp && question.toLowerCase(Locale.ROOT).contains("example")) {
            local += " For example, a fictional credit-card charge complaint can be submitted, then tracked with its one-time receipt.";
        }
        if ("technical".equalsIgnoreCase(request.mode()) && best.id.startsWith("confidence")) {
            local += " The displayed score comes from model category estimates and should not be interpreted as calibrated approval probability.";
        }
        String generated = null;
        if (best.audience.equals("PUBLIC") && language.equals("en") && !followUp) {
            generated = provider.generate(best.id, best.title, best.answer, best.source);
        }
        String answer = generated == null ? local : generated;
        return new Answer(answer, List.of(new Source(best.id, best.title, best.source)),
                List.of("Can a reviewer change it?", "Explain that more simply"),
                List.of(new Navigation("Open " + best.route, best.route)),
                generated == null ? "local" : "generated", best.id, null,
                generated == null ? null : provider.model());
    }

    private int score(Entry e, Set<String> tokens, String raw, String page, String language) {
        int score = 0;
        String lower = raw.toLowerCase(Locale.ROOT);
        for (String alias : e.aliases.split(";")) if (lower.contains(alias.trim().toLowerCase(Locale.ROOT))) score += 8;
        for (String token : tokens) {
            if (tokens(e.title + " " + e.aliases).contains(token)) score += 2;
            else if (tokens(e.answer).contains(token)) score++;
        }
        if (score > 0 && e.route.equals(page)) score += 2;
        if (score > 0 && e.language.equals(language)) score += 2;
        return score;
    }

    private Set<String> tokens(String value) {
        return Arrays.stream(WORDS.split(value.toLowerCase(Locale.ROOT)))
                .filter(s -> s.length() > 1 && !STOP.contains(s))
                .map(s -> SYNONYMS.getOrDefault(s, s)).collect(Collectors.toSet());
    }

    private boolean allow(String ip) {
        if (clients.size() > 4096 && !clients.containsKey(ip)) return false;
        Window window = clients.computeIfAbsent(ip, ignored -> new Window());
        synchronized (window) {
            long now = clock.millis();
            if (now - window.start > 60_000) { window.start = now; window.count = 0; }
            return ++window.count <= 20;
        }
    }

    private List<Entry> loadEntries() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource("assistant/knowledge.tsv").getInputStream(), StandardCharsets.UTF_8))) {
            List<Entry> result = new ArrayList<>();
            for (String line; (line = reader.readLine()) != null; ) {
                if (line.isBlank() || line.startsWith("#")) continue;
                String[] fields = line.split("\\|", -1);
                if (fields.length != 10 || !PAGES.contains(fields[5])) throw new IllegalStateException("Invalid assistant knowledge entry");
                result.add(new Entry(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5],
                        fields[6], fields[7], fields[8], fields[9]));
            }
            return List.copyOf(result);
        } catch (Exception ex) {
            throw new IllegalStateException("Cannot load assistant knowledge", ex);
        }
    }

    private static final class Window { long start = System.currentTimeMillis(); int count; }
    private record Entry(String id, String category, String version, String title, String audience,
                         String route, String language, String aliases, String answer, String source) { }
}
