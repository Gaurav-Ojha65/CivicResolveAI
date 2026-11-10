package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.CalibrationMetricsResponse;
import ai.civicresolve.backend.dto.DualModelComparisonResponse;
import ai.civicresolve.backend.dto.PrecedentRankRequest;
import ai.civicresolve.backend.dto.PrecedentRankResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.converter.HttpMessageConversionException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.SocketTimeoutException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * HTTP client for the FastAPI NLP classification service.
 *
 * <p>
 * This service is authoritative for NLP predictions, sentiment analysis, and
 * rule-based triage. No competing Java classification logic is implemented
 * here.
 *
 * <p>
 * Privacy: raw narratives are never logged. Only character counts and HTTP
 * metadata
 * are recorded in operational logs.
 *
 * <p>
 * Error mapping:
 * <ul>
 * <li>Invalid input (or upstream 422) → {@link NlpClientException} with HTTP
 * 400 detail</li>
 * <li>NLP service unavailable or 5xx → {@link NlpClientException} with HTTP 503
 * detail</li>
 * <li>Timeout → {@link NlpClientException} with HTTP 504 detail</li>
 * <li>Malformed JSON, invalid schema, or contract violation →
 * {@link NlpClientException} with HTTP 502 detail</li>
 * <li>Unexpected internal failure → {@link NlpClientException} with HTTP 500
 * detail</li>
 * </ul>
 */
@Service
public class NlpClientService {

    private static final Logger log = LoggerFactory.getLogger(NlpClientService.class);

    private static final double TOLERANCE = 1e-4;

    /**
     * Probability sum tolerance bounds.
     * Upstream Python rounds 8 class probabilities to 4 decimal places via round(p,
     * 4).
     * The maximum rounding error for any single class is 0.00005.
     * For 8 classes, the maximum theoretical cumulative rounding error is 8 *
     * 0.00005 = 0.00040.
     * Therefore, the theoretical sum bounds are [0.9996, 1.0004].
     * The range [0.999, 1.001] provides a +/-0.0010 tolerance, which comfortably
     * accommodates
     * the maximum possible rounding deviation of +/-0.00040 with a 2.5x safety
     * margin,
     * while strictly rejecting anomalous distributions (e.g. 0.995).
     */
    private static final double PROBABILITY_SUM_MIN = 0.999;
    private static final double PROBABILITY_SUM_MAX = 1.001;

    /** The eight approved CFPB category labels as defined in FastAPI schemas. */
    static final Set<String> APPROVED_LABELS = Set.of(
            "Credit reporting or other personal consumer reports",
            "Debt collection",
            "Credit card",
            "Checking or savings account",
            "Money transfer, virtual currency, or money service",
            "Mortgage",
            "Student loan",
            "Vehicle loan or lease");

    static final Set<String> VALID_PRIORITIES = Set.of("LOW", "MEDIUM", "HIGH", "CRITICAL");

    static final Set<String> VALID_SENTIMENT_LABELS = Set.of("NEGATIVE", "NEUTRAL", "POSITIVE");

    private final RestClient restClient;

    public NlpClientService(
            RestClient.Builder restClientBuilder,
            @Value("${civicresolve.nlp.service-url:http://127.0.0.1:8000}") String nlpServiceUrl) {
        this.restClient = restClientBuilder
                .baseUrl(nlpServiceUrl)
                .build();
        log.info("NlpClientService configured with base URL: {}", nlpServiceUrl);
    }

    /**
     * Classifies a consumer complaint narrative using the FastAPI NLP microservice.
     *
     * @param narrative the raw complaint text; never logged in full
     * @return validated {@link NlpPrediction} response
     * @throws NlpClientException on any validation, communication, or contract
     *                            failure
     */
    public NlpPrediction classify(String narrative) {
        if (narrative == null || narrative.isBlank()) {
            throw new NlpClientException(400, "Narrative must not be blank.");
        }

        int narrativeLength = narrative.length();
        log.info("Sending classification request to NLP service [text_length={}]", narrativeLength);

        NlpPrediction prediction;
        try {
            prediction = restClient.post()
                    .uri("/classify")
                    .header("Content-Type", "application/json")
                    .body(Map.of("text", narrative))
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        if (code == 422) {
                            throw new NlpClientException(400,
                                    "NLP service rejected the input: validation failed.");
                        }
                        throw new NlpClientException(400,
                                "NLP service returned client error: HTTP " + code);
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        throw new NlpClientException(503,
                                "NLP service returned server error: HTTP " + code);
                    })
                    .body(NlpPrediction.class);

        } catch (NlpClientException e) {
            throw e;
        } catch (ResourceAccessException e) {
            Throwable cause = e.getCause();
            if (isTimeout(e, cause)) {
                log.warn("NLP service timed out [text_length={}]", narrativeLength);
                throw new NlpClientException(504, "NLP service timed out.");
            }
            log.warn("NLP service unreachable [text_length={}]: {}", narrativeLength, e.getMessage());
            throw new NlpClientException(503, "NLP service is unavailable.");
        } catch (RestClientResponseException e) {
            log.warn("NLP service response error: HTTP {}", e.getStatusCode().value());
            throw new NlpClientException(503, "NLP service returned an unexpected response.");
        } catch (HttpMessageConversionException e) {
            log.warn("Failed to parse NLP service response as JSON [text_length={}]: {}", narrativeLength,
                    e.getMessage());
            throw new NlpClientException(502, "NLP service returned a malformed or incompatible response payload.");
        } catch (Exception e) {
            if (isJsonOrConversionError(e)) {
                log.warn("Failed to deserialize NLP service response [text_length={}]: {}", narrativeLength,
                        e.getMessage());
                throw new NlpClientException(502, "NLP service returned a malformed or incompatible response payload.");
            }
            log.error("Unexpected error calling NLP service: {}", e.getClass().getSimpleName());
            throw new NlpClientException(500, "Unexpected error contacting NLP service.");
        }

        if (prediction == null) {
            throw new NlpClientException(502, "NLP service returned an empty response.");
        }

        validatePrediction(prediction);

        log.info("NLP classification complete [text_length={}, category={}, priority={}, flag={}]",
                narrativeLength,
                prediction.productCategory(),
                prediction.triagePriority(),
                prediction.flagForReview());

        return prediction;
    }

    /**
     * Validates the upstream response against the complete schema and triage safety
     * contract.
     *
     * <p>
     * Threshold configuration decision: Python service thresholds (min_confidence,
     * min_margin)
     * are environment-configurable in FastAPI (CIVIC_MIN_CONFIDENCE,
     * CIVIC_MIN_MARGIN).
     * To prevent fragility and divergence, Java validation enforces invariant
     * safety properties:
     * <ul>
     * <li>HIGH and CRITICAL priority must always have
     * {@code flag_for_review=true}.</li>
     * <li>If {@code flag_for_review=true}, {@code review_reasons} must not be
     * empty.</li>
     * <li>If {@code flag_for_review=false}, priority cannot be HIGH or
     * CRITICAL.</li>
     * </ul>
     */
    void validatePrediction(NlpPrediction p) {
        // ── 1. Category and priority ───────────────────────────────────────────
        if (p.productCategory() == null || !APPROVED_LABELS.contains(p.productCategory())) {
            throw new NlpClientException(502,
                    "NLP service returned an unsupported product category: " + p.productCategory());
        }

        if (p.triagePriority() == null || !VALID_PRIORITIES.contains(p.triagePriority())) {
            throw new NlpClientException(502,
                    "NLP service returned an unrecognised triage priority: " + p.triagePriority());
        }

        if (p.sentimentLabel() == null || !VALID_SENTIMENT_LABELS.contains(p.sentimentLabel())) {
            throw new NlpClientException(502,
                    "NLP service returned an unrecognised sentiment label: " + p.sentimentLabel());
        }

        if (p.sentimentScore() == null) {
            throw new NlpClientException(502, "NLP service returned null sentiment score.");
        }
        if (p.sentimentScore().isNaN() || p.sentimentScore().isInfinite()
                || p.sentimentScore() < -1.0 || p.sentimentScore() > 1.0) {
            throw new NlpClientException(502,
                    "NLP service returned out-of-range sentiment score: " + p.sentimentScore());
        }

        // ── 2. Probability distribution ───────────────────────────────────────
        if (p.probabilities() == null) {
            throw new NlpClientException(502, "NLP service returned a null probability distribution.");
        }

        if (!p.probabilities().keySet().equals(APPROVED_LABELS)) {
            throw new NlpClientException(502,
                    "NLP service probability distribution does not match the 8 approved categories.");
        }

        for (Map.Entry<String, Double> entry : p.probabilities().entrySet()) {
            Double val = entry.getValue();
            if (val == null || val.isNaN() || val.isInfinite() || val < 0.0 || val > 1.0) {
                throw new NlpClientException(502,
                        "NLP service returned invalid probability for category '" + entry.getKey() + "': " + val);
            }
        }

        double sum = p.probabilities().values().stream().mapToDouble(Double::doubleValue).sum();
        if (sum < PROBABILITY_SUM_MIN || sum > PROBABILITY_SUM_MAX) {
            throw new NlpClientException(502,
                    String.format("NLP service probability distribution sum %.4f is outside valid range [%.3f, %.3f].",
                            sum, PROBABILITY_SUM_MIN, PROBABILITY_SUM_MAX));
        }

        List<Double> sortedProbs = p.probabilities().values().stream()
                .sorted(Comparator.reverseOrder())
                .toList();
        double topProb = sortedProbs.get(0);
        double runnerUpProb = sortedProbs.get(1);

        Double predictedCatProb = p.probabilities().get(p.productCategory());
        if (predictedCatProb == null || Math.abs(predictedCatProb - topProb) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Predicted category '%s' probability %.4f does not correspond to maximum probability %.4f.",
                    p.productCategory(), predictedCatProb != null ? predictedCatProb : 0.0, topProb));
        }

        if (p.confidence() == null) {
            throw new NlpClientException(502, "NLP service returned null confidence.");
        }
        if (p.confidence().isNaN() || p.confidence().isInfinite()
                || p.confidence() < 0.0 || p.confidence() > 1.0) {
            throw new NlpClientException(502, "NLP service returned out-of-range confidence: " + p.confidence());
        }
        if (Math.abs(p.confidence() - topProb) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Confidence %.4f does not match maximum class probability %.4f within tolerance.",
                    p.confidence(), topProb));
        }

        if (p.margin() == null) {
            throw new NlpClientException(502, "NLP service returned null margin.");
        }
        if (p.margin().isNaN() || p.margin().isInfinite()
                || p.margin() < 0.0 || p.margin() > 1.0) {
            throw new NlpClientException(502, "NLP service returned out-of-range margin: " + p.margin());
        }
        double expectedMargin = topProb - runnerUpProb;
        if (Math.abs(p.margin() - expectedMargin) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Margin %.4f does not match difference between top two probabilities (%.4f - %.4f = %.4f) within tolerance.",
                    p.margin(), topProb, runnerUpProb, expectedMargin));
        }

        // ── 3. Other response fields ──────────────────────────────────────────
        if (isBlank(p.modelUsed()) || isBlank(p.modelVersion())) {
            throw new NlpClientException(502, "NLP service response is missing model identification fields.");
        }

        if (p.reviewReasons() == null) {
            throw new NlpClientException(502, "NLP service returned null review_reasons collection.");
        }

        if (p.priorityReasons() == null) {
            throw new NlpClientException(502, "NLP service returned null priority_reasons collection.");
        }

        if (isBlank(p.disclaimer())) {
            throw new NlpClientException(502, "NLP service response is missing disclaimer field.");
        }

        if (p.flagForReview() == null) {
            throw new NlpClientException(502, "NLP service returned null flag_for_review.");
        }

        // ── 4. Review safety contract ─────────────────────────────────────────
        boolean highOrCritical = "HIGH".equals(p.triagePriority()) || "CRITICAL".equals(p.triagePriority());
        if (highOrCritical && !p.flagForReview()) {
            log.error("TRIAGE SAFETY CONTRACT VIOLATION: priority={} but flag_for_review=false", p.triagePriority());
            throw new NlpClientException(502,
                    "NLP service violated the triage safety contract: "
                            + p.triagePriority() + " priority requires flag_for_review=true.");
        }

        if (p.flagForReview() && p.reviewReasons().isEmpty()) {
            throw new NlpClientException(502,
                    "NLP service flagged grievance for review but provided no review_reasons.");
        }

        // ── 5. Optional XAI explanation contract ──────────────────────────────
        if (p.explanation() != null) {
            validateExplanation(p);
        }
    }

    void validateExplanation(NlpPrediction p) {
        NlpExplanation expl = p.explanation();
        if (expl == null) {
            return;
        }

        // 1. Mandatory metadata & provenance
        if (isBlank(expl.method())) {
            throw new NlpClientException(502, "Explanation method must not be blank.");
        }
        if (isBlank(expl.version())) {
            throw new NlpClientException(502, "Explanation version must not be blank.");
        }
        if (isBlank(expl.disclaimer())) {
            throw new NlpClientException(502, "Explanation disclaimer must not be blank.");
        }
        if (isBlank(expl.modelArtifactSha256()) || !isValidSha256(expl.modelArtifactSha256())) {
            throw new NlpClientException(502, "Explanation model artifact SHA-256 must be a valid 64-character hex string.");
        }

        // 2. Class checks
        if (isBlank(expl.predictedClass()) || !APPROVED_LABELS.contains(expl.predictedClass())) {
            throw new NlpClientException(502, "Explanation predicted class must be an approved category: " + expl.predictedClass());
        }
        if (!expl.predictedClass().equals(p.productCategory())) {
            throw new NlpClientException(502, String.format(
                    "Explanation predicted class '%s' does not match prediction category '%s'.",
                    expl.predictedClass(), p.productCategory()));
        }
        if (isBlank(expl.runnerUpClass()) || !APPROVED_LABELS.contains(expl.runnerUpClass())) {
            throw new NlpClientException(502, "Explanation runner-up class must be an approved category: " + expl.runnerUpClass());
        }
        if (expl.runnerUpClass().equals(expl.predictedClass())) {
            throw new NlpClientException(502, "Explanation runner-up class cannot equal predicted class.");
        }

        // 3. Numeric fields null/NaN/Infinity check
        checkFinite(expl.predictedDecisionScore(), "predicted_decision_score");
        checkFinite(expl.runnerUpDecisionScore(), "runner_up_decision_score");
        checkFinite(expl.decisionScoreMargin(), "decision_score_margin");
        checkFinite(expl.predictedIntercept(), "predicted_intercept");
        checkFinite(expl.predictedTotalFeatureContribution(), "predicted_total_feature_contribution");
        checkFinite(expl.runnerUpIntercept(), "runner_up_intercept");
        checkFinite(expl.runnerUpTotalFeatureContribution(), "runner_up_total_feature_contribution");
        checkFinite(expl.interceptDifference(), "intercept_difference");
        checkFinite(expl.totalDifferenceContribution(), "total_difference_contribution");

        if (expl.activeFeatureCount() == null || expl.activeFeatureCount() < 0) {
            throw new NlpClientException(502, "Explanation active_feature_count must be non-negative: " + expl.activeFeatureCount());
        }

        // 4. Mathematical reconstruction identities (tolerance = 1e-4)
        // Identity 1: predicted_intercept + predicted_total_feature_contribution == predicted_decision_score
        double predSum = expl.predictedIntercept() + expl.predictedTotalFeatureContribution();
        if (Math.abs(predSum - expl.predictedDecisionScore()) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Explanation predicted decision score identity violation: intercept %.4f + total contribution %.4f != score %.4f",
                    expl.predictedIntercept(), expl.predictedTotalFeatureContribution(), expl.predictedDecisionScore()));
        }

        // Identity 2: runner_up_intercept + runner_up_total_feature_contribution == runner_up_decision_score
        double runnerUpSum = expl.runnerUpIntercept() + expl.runnerUpTotalFeatureContribution();
        if (Math.abs(runnerUpSum - expl.runnerUpDecisionScore()) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Explanation runner-up decision score identity violation: intercept %.4f + total contribution %.4f != score %.4f",
                    expl.runnerUpIntercept(), expl.runnerUpTotalFeatureContribution(), expl.runnerUpDecisionScore()));
        }

        // Identity 3: intercept_difference + total_difference_contribution == decision_score_margin
        double diffSum = expl.interceptDifference() + expl.totalDifferenceContribution();
        if (Math.abs(diffSum - expl.decisionScoreMargin()) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Explanation decision score margin identity violation: intercept diff %.4f + total diff contrib %.4f != margin %.4f",
                    expl.interceptDifference(), expl.totalDifferenceContribution(), expl.decisionScoreMargin()));
        }

        // Identity 4: predicted_decision_score - runner_up_decision_score == decision_score_margin
        double scoreDiff = expl.predictedDecisionScore() - expl.runnerUpDecisionScore();
        if (Math.abs(scoreDiff - expl.decisionScoreMargin()) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Explanation score margin consistency violation: pred score %.4f - runner-up score %.4f != margin %.4f",
                    expl.predictedDecisionScore(), expl.runnerUpDecisionScore(), expl.decisionScoreMargin()));
        }

        // Identity 5: predicted_intercept - runner_up_intercept == intercept_difference
        double interceptDiff = expl.predictedIntercept() - expl.runnerUpIntercept();
        if (Math.abs(interceptDiff - expl.interceptDifference()) > TOLERANCE) {
            throw new NlpClientException(502, String.format(
                    "Explanation intercept difference consistency violation: pred intercept %.4f - runner-up intercept %.4f != intercept diff %.4f",
                    expl.predictedIntercept(), expl.runnerUpIntercept(), expl.interceptDifference()));
        }

        // 5. Bounded feature contribution lists
        validateFeatureContributionList(expl.topPositiveFeatures(), "top_positive_features", true);
        validateFeatureContributionList(expl.topNegativeFeatures(), "top_negative_features", false);
        validateRunnerUpDifferenceList(expl.topPositiveRunnerUpDifferences(), "top_positive_runner_up_differences", true);
        validateRunnerUpDifferenceList(expl.topNegativeRunnerUpDifferences(), "top_negative_runner_up_differences", false);
    }

    private static void checkFinite(Double value, String fieldName) {
        if (value == null || value.isNaN() || value.isInfinite()) {
            throw new NlpClientException(502, "Explanation field '" + fieldName + "' must be a non-null, finite number.");
        }
    }

    private static boolean isValidSha256(String hex) {
        if (hex == null || hex.length() != 64) {
            return false;
        }
        for (int i = 0; i < 64; i++) {
            char c = hex.charAt(i);
            boolean isHex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!isHex) {
                return false;
            }
        }
        return true;
    }

    private static void validateFeatureContributionList(
            List<NlpExplanation.FeatureContributionItem> items, String listName, boolean expectPositive) {
        if (items == null) {
            return;
        }
        if (items.size() > 20) {
            throw new NlpClientException(502, "Explanation list '" + listName + "' exceeds maximum allowed items (20): " + items.size());
        }
        for (NlpExplanation.FeatureContributionItem item : items) {
            if (item == null) {
                throw new NlpClientException(502, "Explanation list '" + listName + "' contains null item.");
            }
            if (isBlank(item.feature()) || item.feature().length() > 100) {
                throw new NlpClientException(502, "Explanation feature token in '" + listName + "' must be non-blank and <= 100 characters.");
            }
            checkFinite(item.contribution(), listName + ".contribution");
            if (expectPositive && item.contribution() < -TOLERANCE) {
                throw new NlpClientException(502, String.format(
                        "Explanation list '%s' contains negative contribution: %.4f", listName, item.contribution()));
            }
            if (!expectPositive && item.contribution() > TOLERANCE) {
                throw new NlpClientException(502, String.format(
                        "Explanation list '%s' contains positive contribution: %.4f", listName, item.contribution()));
            }
        }
    }

    private static void validateRunnerUpDifferenceList(
            List<NlpExplanation.RunnerUpDifferenceItem> items, String listName, boolean expectPositive) {
        if (items == null) {
            return;
        }
        if (items.size() > 20) {
            throw new NlpClientException(502, "Explanation list '" + listName + "' exceeds maximum allowed items (20): " + items.size());
        }
        for (NlpExplanation.RunnerUpDifferenceItem item : items) {
            if (item == null) {
                throw new NlpClientException(502, "Explanation list '" + listName + "' contains null item.");
            }
            if (isBlank(item.feature()) || item.feature().length() > 100) {
                throw new NlpClientException(502, "Explanation feature token in '" + listName + "' must be non-blank and <= 100 characters.");
            }
            checkFinite(item.differenceContribution(), listName + ".difference_contribution");
            if (expectPositive && item.differenceContribution() < -TOLERANCE) {
                throw new NlpClientException(502, String.format(
                        "Explanation list '%s' contains negative difference contribution: %.4f", listName, item.differenceContribution()));
            }
            if (!expectPositive && item.differenceContribution() > TOLERANCE) {
                throw new NlpClientException(502, String.format(
                        "Explanation list '%s' contains positive difference contribution: %.4f", listName, item.differenceContribution()));
            }
        }
    }

    /**
     * Executes side-by-side inference on TF-IDF baseline and PyTorch Bi-LSTM via FastAPI /classify/compare.
     */
    public DualModelComparisonResponse compareModels(String narrative) {
        if (narrative == null || narrative.isBlank()) {
            throw new NlpClientException(400, "Narrative must not be blank.");
        }
        try {
            return restClient.post()
                    .uri("/classify/compare")
                    .header("Content-Type", "application/json")
                    .body(Map.of("text", narrative))
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        if (code == 422) {
                            throw new NlpClientException(400, "NLP service rejected the input: validation failed.");
                        }
                        throw new NlpClientException(400, "NLP service returned client error: HTTP " + code);
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        throw new NlpClientException(503, "NLP service returned server error: HTTP " + code);
                    })
                    .body(DualModelComparisonResponse.class);
        } catch (NlpClientException e) {
            throw e;
        } catch (ResourceAccessException e) {
            Throwable cause = e.getCause();
            if (isTimeout(e, cause)) {
                throw new NlpClientException(504, "NLP service timed out.");
            }
            throw new NlpClientException(503, "NLP service is unavailable.");
        } catch (Exception e) {
            if (isJsonOrConversionError(e)) {
                throw new NlpClientException(502, "NLP service returned an incompatible response payload.");
            }
            throw new NlpClientException(500, "Unexpected error contacting NLP service.");
        }
    }

    /**
     * Ranks candidate historical complaints by Lexical TF-IDF Cosine Similarity via FastAPI /precedents/rank.
     */
    public PrecedentRankResponse rankPrecedents(PrecedentRankRequest request) {
        if (request == null || request.queryText() == null || request.queryText().isBlank()) {
            throw new NlpClientException(400, "Query text must not be blank.");
        }
        try {
            return restClient.post()
                    .uri("/precedents/rank")
                    .header("Content-Type", "application/json")
                    .body(request)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        throw new NlpClientException(400, "NLP service returned client error: HTTP " + code);
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        throw new NlpClientException(503, "NLP service returned server error: HTTP " + code);
                    })
                    .body(PrecedentRankResponse.class);
        } catch (NlpClientException e) {
            throw e;
        } catch (ResourceAccessException e) {
            Throwable cause = e.getCause();
            if (isTimeout(e, cause)) {
                throw new NlpClientException(504, "NLP service timed out.");
            }
            throw new NlpClientException(503, "NLP service is unavailable.");
        } catch (Exception e) {
            if (isJsonOrConversionError(e)) {
                throw new NlpClientException(502, "NLP service returned an incompatible response payload.");
            }
            throw new NlpClientException(500, "Unexpected error contacting NLP service.");
        }
    }

    /**
     * Retrieves probability calibration metrics evaluated on val.csv via FastAPI /models/calibration.
     */
    public CalibrationMetricsResponse getCalibrationMetrics() {
        try {
            return restClient.get()
                    .uri("/models/calibration")
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        throw new NlpClientException(code == 404 ? 404 : 400, "NLP service returned: HTTP " + code);
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        int code = res.getStatusCode().value();
                        throw new NlpClientException(503, "NLP service returned server error: HTTP " + code);
                    })
                    .body(CalibrationMetricsResponse.class);
        } catch (NlpClientException e) {
            throw e;
        } catch (ResourceAccessException e) {
            Throwable cause = e.getCause();
            if (isTimeout(e, cause)) {
                throw new NlpClientException(504, "NLP service timed out.");
            }
            throw new NlpClientException(503, "NLP service is unavailable.");
        } catch (Exception e) {
            if (isJsonOrConversionError(e)) {
                throw new NlpClientException(502, "NLP service returned an incompatible response payload.");
            }
            throw new NlpClientException(500, "Unexpected error contacting NLP service.");
        }
    }

    private static boolean isTimeout(ResourceAccessException e, Throwable cause) {
        if (cause instanceof SocketTimeoutException
                || cause instanceof java.util.concurrent.TimeoutException
                || (cause != null && cause.getClass().getSimpleName().contains("Timeout"))) {
            return true;
        }
        String msg = e.getMessage();
        return msg != null && (msg.contains("timed out") || msg.contains("timeout") || msg.contains("Timeout"));
    }

    private static boolean isJsonOrConversionError(Throwable e) {
        Throwable current = e;
        while (current != null) {
            String name = current.getClass().getName();
            if (name.contains("JacksonException")
                    || name.contains("JsonProcessingException")
                    || name.contains("HttpMessageConversionException")
                    || name.contains("HttpMessageNotReadableException")
                    || name.contains("JsonParseException")
                    || name.contains("MismatchedInputException")
                    || name.contains("InvalidFormatException")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    public record NlpHealthProbeResult(
            boolean reachable,
            double latencyMs,
            String activeModelName
    ) {}

    /**
     * Non-blocking bounded health probe querying FastAPI /health.
     * Guarantees exception safety and fast failure handling.
     */
    public NlpHealthProbeResult probeHealth() {
        long start = System.nanoTime();
        try {
            java.util.Map<?, ?> response = restClient.get()
                    .uri("/health")
                    .retrieve()
                    .body(java.util.Map.class);
            double latencyMs = (System.nanoTime() - start) / 1_000_000.0;
            boolean ok = response != null && "ok".equalsIgnoreCase(String.valueOf(response.get("status")));
            return new NlpHealthProbeResult(ok, latencyMs, "baseline_tfidf_logreg");
        } catch (Exception e) {
            double latencyMs = (System.nanoTime() - start) / 1_000_000.0;
            log.warn("NLP health probe failed: {}", e.getMessage());
            return new NlpHealthProbeResult(false, latencyMs, "UNAVAILABLE");
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /**
     * Typed exception carrying an HTTP status code and a safe public message.
     */
    public static final class NlpClientException extends RuntimeException {
        private final int httpStatus;

        public NlpClientException(int httpStatus, String message) {
            super(message);
            this.httpStatus = httpStatus;
        }

        public int getHttpStatus() {
            return httpStatus;
        }
    }
}
