package ai.civicresolve.backend.assistant;

import ai.civicresolve.backend.assistant.AssistantController.Answer;
import ai.civicresolve.backend.assistant.AssistantController.Navigation;
import ai.civicresolve.backend.assistant.AssistantController.Question;
import ai.civicresolve.backend.assistant.AssistantController.Source;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.concurrent.Semaphore;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** Curated, local retrieval. No question, history or case data crosses the provider boundary. */
@Service
public class AssistantService {
    private static final Logger log = LoggerFactory.getLogger(AssistantService.class);
    private static final Set<String> PAGES = Set.of("/", "/submit", "/track", "/reviewer",
            "/reviewer/grievances", "/reviewer/analytics", "/reviewer/audit");
    private static final Pattern WORDS = Pattern.compile("[^\\p{L}\\p{M}\\p{N}]+");
    private static final Set<String> STOP = Set.of("the", "a", "an", "is", "what", "how", "do", "i", "can", "you", "me", "my", "to", "of", "in", "for", "this", "it", "and", "does", "with", "please", "explain", "about", "tell", "क्या", "है", "कैसे");
    private static final Map<String, String> SYNONYMS = Map.ofEntries(
            Map.entry("grievance", "complaint"), Map.entry("case", "complaint"),
            Map.entry("shikayat", "शिकायत"), Map.entry("bharosa", "confidence"),
            Map.entry("login", "reviewer"), Map.entry("logreg", "regression"));

    private final List<Entry> entries;
    private final AssistantProvider provider;
    private final Semaphore concurrent = new Semaphore(12);
    private final AssistantRateLimiter limiter;

    @Autowired
    public AssistantService(AssistantProvider provider, AssistantRateLimiter limiter) {
        this(provider, limiter, "assistant/knowledge.tsv");
    }

    AssistantService(AssistantProvider provider, AssistantRateLimiter limiter, String knowledgePath) {
        this.provider = provider;
        this.limiter = limiter;
        this.entries = loadEntries(knowledgePath);
    }

    public Answer answer(Question request, boolean reviewer, String remoteAddress) {
        if (!limiter.allow(remoteAddress)) {
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
        String page = request.page() != null && PAGES.contains(request.page()) ? request.page() : "/";
        if (page.startsWith("/reviewer") && !reviewer) page = "/";
        String language = "hi".equalsIgnoreCase(request.language()) ? "hi" : "en";
        String question = request.question().strip();
        String lowerQuestion = question.toLowerCase(Locale.ROOT);
        if (lowerQuestion.matches(".*(in hindi|हिंदी में|हिन्दी में).*")) language = "hi";
        else if (lowerQuestion.matches(".*(in english|अंग्रेजी में).*")) language = "en";
        if (question.toLowerCase(Locale.ROOT).matches("(?s).*(ignore (all )?(previous )?instructions|system prompt|developer message|approve complaint|override complaint|reject complaint).*")) {
            return new Answer("CivicAssist can explain workflows, but it cannot change complaints or follow instructions to bypass review.",
                    List.of(), List.of("How does human review work?"), List.of(), "local", null,
                    "This assistant is read-only.", null);
        }
        boolean followUp = lowerQuestion.matches(".*(again|simpler|example|hindi|english|technical|more detail|फिर|सरल|उदाहरण|हिंदी में|हिन्दी में|अंग्रेजी में).*");
        // A client may provide only a knowledge identifier, never raw prior chat history.
        Entry previous = entries.stream().filter(e -> e.id.equals(request.previousKnowledgeId()))
                .filter(e -> reviewer || e.audience.equals("PUBLIC")).findFirst().orElse(null);
        Set<String> tokens = tokens(question);
        List<Ranked> ranked = new ArrayList<>();
        for (Entry entry : entries) {
            if (!reviewer && !entry.audience.equals("PUBLIC")) continue;
            int score = score(entry, tokens, question, page, language);
            if (followUp && previous != null && baseId(entry.id).equals(baseId(previous.id))) score += 14;
            if (score >= 4) ranked.add(new Ranked(entry, score));
        }
        ranked.sort(Comparator.comparingInt(Ranked::score).reversed());
        if (ranked.isEmpty()) {
            return new Answer(language.equals("hi") ? "मैं केवल CivicResolve के उपयोग और AI वर्गीकरण की जानकारी दे सकता हूँ। कृपया शिकायत दर्ज करने, ट्रैक करने या स्थिति के बारे में पूछें।" :
                    "I can explain CivicResolve workflows and its AI classification. Please ask about submitting, tracking, status, or model behavior.",
                    List.of(), List.of("How do I submit a complaint?", "How do I track it?"),
                    List.of(), "local", null, "No verified knowledge matched this question.", null);
        }
        Entry best = ranked.getFirst().entry;
        boolean multiIntent = lowerQuestion.contains(" and ") || lowerQuestion.contains(" और ");
        Entry second = null;
        if (multiIntent) for (int i = 1; i < ranked.size(); i++) {
            Ranked candidate = ranked.get(i);
            if (candidate.score >= 6 && !baseId(candidate.entry.id).equals(baseId(best.id))) {
                second = candidate.entry;
                break;
            }
        }
        if (!best.language.equals(language)) {
            for (Entry entry : entries) {
                if (entry.language.equals(language) && baseId(entry.id).equals(baseId(best.id))
                        && (reviewer || entry.audience.equals("PUBLIC"))) { best = entry; break; }
            }
        }
        String local = best.answer;
        if (second != null) local += "\n\n" + second.answer;
        if (followUp && lowerQuestion.contains("example")) local += example(best.id);
        if ("technical".equalsIgnoreCase(request.mode())) local += technical(baseId(best.id), best.category);
        String generated = null;
        if (second == null && best.audience.equals("PUBLIC") && language.equals("en") && !followUp) {
            generated = provider.generate(best.id, best.title, best.answer, best.source);
        }
        String answer = generated == null ? local : generated;
        List<Source> sources = new ArrayList<>();
        sources.add(new Source(best.id, best.title, best.source));
        if (second != null) sources.add(new Source(second.id, second.title, second.source));
        String route = best.route.equals("/reviewer/grievances") ? "/reviewer" : best.route;
        String label = switch (route) { case "/submit" -> "Go to complaint form"; case "/track" -> "Go to tracking";
            case "/reviewer" -> "Open reviewer queue"; case "/reviewer/audit" -> "Open model audit";
            case "/reviewer/analytics" -> "Open analytics"; default -> "Go to overview"; };
        String warning = best.language.equals(language) ? null : "This topic is currently available in English only.";
        return new Answer(answer, sources, followUps(best.route, language),
                List.of(new Navigation(label, route)),
                generated == null ? "local" : "generated", best.id, warning,
                generated == null ? null : provider.model());
    }

    private int score(Entry e, Set<String> tokens, String raw, String page, String language) {
        int score = 0;
        String lower = raw.toLowerCase(Locale.ROOT);
        boolean aliasHit = false;
        for (String alias : e.aliases.split(";")) if (lower.contains(alias.trim().toLowerCase(Locale.ROOT))) { score += 10; aliasHit = true; }
        int topicWords = 0;
        Set<String> titleWords = tokens(e.title + " " + e.aliases);
        Set<String> bodyWords = tokens(e.answer);
        for (String token : tokens) {
            if (titleWords.contains(token)) { score += 3; topicWords++; }
            else if (bodyWords.contains(token)) score++;
        }
        if (!aliasHit && topicWords < 2) return 0;
        if (score > 0 && e.route.equals(page)) score += 2;
        if (score > 0 && e.language.equals(language)) score += 2;
        return score;
    }

    private Set<String> tokens(String value) {
        return Arrays.stream(WORDS.split(Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)))
                .filter(s -> s.length() > 1 && !STOP.contains(s))
                .map(s -> SYNONYMS.getOrDefault(s, s)).collect(Collectors.toSet());
    }

    private String baseId(String id) { return id.endsWith("_hi") ? id.substring(0, id.length() - 3) : id; }

    private String example(String id) {
        if (id.startsWith("tracking") || id.startsWith("secret")) return " For example, a fictional receipt can be used on the Track page with its own reference and secret.";
        if (id.startsWith("confidence")) return " For example, 89% category confidence does not mean 89% chance of complaint approval.";
        if (id.startsWith("models")) return " For example, intake uses the TF-IDF result while reviewers can compare the BiLSTM result.";
        return "";
    }

    private String technical(String id, String category) {
        return switch (id) {
            case "confidence" -> " Technical detail: the serving classifier's category estimate is uncalibrated and is not an approval probability.";
            case "margin" -> " Technical detail: the margin is the difference between the highest and second-highest category estimates.";
            case "attribution" -> " Technical detail: each highlighted TF-IDF term contributes its value multiplied by its Logistic Regression class weight.";
            case "models" -> " Technical detail: the serving TF-IDF Logistic Regression result is persisted at intake; the BiLSTM is a reviewer-only challenger.";
            case "calibration" -> " Technical detail: reliability bins compare mean predicted confidence with observed classification accuracy.";
            case "secret", "tracking" -> " Technical detail: only a salted hash of the one-time secret is stored, and lookup compares hashes in constant time.";
            case "audit", "review" -> " Technical detail: reviewer actions append audit records and stale updates are rejected through optimistic locking.";
            default -> switch (category) {
                case "model" -> " Technical detail: model metrics describe classification performance on an evaluation set, not an individual complaint outcome.";
                case "reviewer" -> " Technical detail: reviewer search, filters, sorting and counts are provided by backend queries.";
                default -> " Technical detail: the backend validates intake before persisting a complaint and issuing a one-time tracking credential.";
            };
        };
    }

    private List<String> followUps(String route, String language) {
        if (language.equals("hi")) return switch (route) {
            case "/track" -> List.of("गोपनीय कोड क्या है?", "स्थिति का मतलब क्या है?");
            case "/submit" -> List.of("आठ श्रेणियाँ कौन सी हैं?", "AI confidence का क्या मतलब है?");
            default -> List.of("इसे सरल भाषा में समझाएँ", "मॉडल तुलना क्या है?");
        };
        return switch (route) {
            case "/track" -> List.of("What does pending review mean?", "Why keep the tracking secret private?");
            case "/submit" -> List.of("What should I include in a complaint?", "Which categories are supported?");
            case "/reviewer", "/reviewer/grievances" -> List.of("What triggers human review?", "Where is review audit history?");
            case "/reviewer/audit" -> List.of("How do the two models differ?", "What does calibration mean?");
            default -> List.of("How do I submit a complaint?", "How do I track a complaint?");
        };
    }

    private record Ranked(Entry entry, int score) { }

    private List<Entry> loadEntries(String path) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource(path).getInputStream(), StandardCharsets.UTF_8))) {
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
            log.error("Assistant knowledge unavailable; other application workflows remain operational");
            return List.of();
        }
    }

    private record Entry(String id, String category, String version, String title, String audience,
                         String route, String language, String aliases, String answer, String source) { }
}
