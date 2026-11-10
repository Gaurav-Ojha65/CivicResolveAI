package ai.civicresolve.backend.service;

import ai.civicresolve.backend.config.RestClientConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.net.ConnectException;
import java.net.SocketTimeoutException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * End-to-end unit tests for {@link NlpClientService} response deserialization,
 * production validation, and error status mapping.
 *
 * <p>All tests exercise the real production {@link NlpClientService#classify(String)} code path
 * using Spring's {@link MockRestServiceServer} bound to {@link RestClient.Builder}.
 */
@DisplayName("NlpClientService — Production Validation & Contract Tests")
class NlpClientServiceValidationTest {

    private static final String NLP_URL = "http://127.0.0.1:8000";
    private static final String CLASSIFY_ENDPOINT = "http://127.0.0.1:8000/classify";
    private static final String TEST_NARRATIVE = "I noticed inaccurate inquiry records on my Equifax credit report from a collection agency. I submitted a formal dispute letter requesting verification.";

    /**
     * Exact literal snake_case JSON response matching FastAPI's ClassifyResponse contract.
     */
    private static final String LITERAL_SNAKE_CASE_JSON = """
            {
              "product_category": "Credit reporting or other personal consumer reports",
              "confidence": 0.8200,
              "margin": 0.7600,
              "probabilities": {
                "Credit reporting or other personal consumer reports": 0.8200,
                "Debt collection": 0.0600,
                "Credit card": 0.0300,
                "Checking or savings account": 0.0300,
                "Money transfer, virtual currency, or money service": 0.0200,
                "Mortgage": 0.0200,
                "Student loan": 0.0100,
                "Vehicle loan or lease": 0.0100
              },
              "model_used": "baseline_tfidf_logreg",
              "model_version": "1.0.0-sha256-abcdef1234567890",
              "flag_for_review": false,
              "review_reasons": [],
              "triage_priority": "LOW",
              "priority_reasons": ["No high-priority keywords identified."],
              "sentiment_score": -0.2500,
              "sentiment_label": "NEGATIVE",
              "disclaimer": "Predictions are uncalibrated model recommendations requiring human oversight."
            }
            """;

    private MockRestServiceServer mockServer;
    private NlpClientService nlpClientService;

    @BeforeEach
    void setUp() {
        RestClientConfig config = new RestClientConfig();
        RestClient.Builder builder = config.restClientBuilder();
        mockServer = MockRestServiceServer.bindTo(builder).build();
        nlpClientService = new NlpClientService(builder, NLP_URL);
    }

    /**
     * Produces a valid baseline JSON map matching FastAPI's ClassifyResponse schema.
     */
    private Map<String, Object> createValidBaselineMap() {
        Map<String, Double> probs = new LinkedHashMap<>();
        probs.put("Credit reporting or other personal consumer reports", 0.8200);
        probs.put("Debt collection", 0.0600);
        probs.put("Credit card", 0.0300);
        probs.put("Checking or savings account", 0.0300);
        probs.put("Money transfer, virtual currency, or money service", 0.0200);
        probs.put("Mortgage", 0.0200);
        probs.put("Student loan", 0.0100);
        probs.put("Vehicle loan or lease", 0.0100);

        Map<String, Object> map = new HashMap<>();
        map.put("product_category", "Credit reporting or other personal consumer reports");
        map.put("confidence", 0.8200);
        map.put("margin", 0.7600);
        map.put("probabilities", probs);
        map.put("model_used", "baseline_tfidf_logreg");
        map.put("model_version", "1.0.0-sha256-abcdef1234567890");
        map.put("flag_for_review", false);
        map.put("review_reasons", List.of());
        map.put("triage_priority", "LOW");
        map.put("priority_reasons", List.of("No critical triggers."));
        map.put("sentiment_score", -0.2500);
        map.put("sentiment_label", "NEGATIVE");
        map.put("disclaimer", "Uncalibrated model estimates.");
        return map;
    }

    private String toJson(Object obj) {
        if (obj == null) {
            return "null";
        }
        if (obj instanceof String s) {
            return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\"";
        }
        if (obj instanceof Number || obj instanceof Boolean) {
            return obj.toString();
        }
        if (obj instanceof List<?> list) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(list.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (obj instanceof Map<?, ?> map) {
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\"").append(entry.getKey()).append("\":").append(toJson(entry.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        return "\"" + obj.toString() + "\"";
    }

    // =========================================================================
    // POSITIVE TESTS
    // =========================================================================

    @Test
    @DisplayName("1. Literal snake_case JSON deserializes and populates all 13 NlpPrediction components")
    void literalSnakeCaseResponseDeserializesAndValidatesAllComponents() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Content-Type", "application/json"))
                .andExpect(content().json("{\"text\":\"" + TEST_NARRATIVE + "\"}"))
                .andRespond(withSuccess(LITERAL_SNAKE_CASE_JSON, MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);

        mockServer.verify();

        assertThat(pred).isNotNull();
        assertThat(pred.productCategory()).isEqualTo("Credit reporting or other personal consumer reports");
        assertThat(pred.confidence()).isEqualTo(0.8200);
        assertThat(pred.margin()).isEqualTo(0.7600);
        assertThat(pred.probabilities()).hasSize(8);
        assertThat(pred.probabilities().get("Credit reporting or other personal consumer reports")).isEqualTo(0.8200);
        assertThat(pred.probabilities().get("Debt collection")).isEqualTo(0.0600);
        assertThat(pred.modelUsed()).isEqualTo("baseline_tfidf_logreg");
        assertThat(pred.modelVersion()).isEqualTo("1.0.0-sha256-abcdef1234567890");
        assertThat(pred.flagForReview()).isFalse();
        assertThat(pred.reviewReasons()).isEmpty();
        assertThat(pred.triagePriority()).isEqualTo("LOW");
        assertThat(pred.priorityReasons()).containsExactly("No high-priority keywords identified.");
        assertThat(pred.sentimentScore()).isEqualTo(-0.2500);
        assertThat(pred.sentimentLabel()).isEqualTo("NEGATIVE");
        assertThat(pred.disclaimer()).contains("uncalibrated model recommendations");
    }

    @Test
    @DisplayName("2. Outgoing request serializes narrative under the 'text' property")
    void requestSendsExpectedTextJsonProperty() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"text\":\"" + TEST_NARRATIVE + "\"}"))
                .andRespond(withSuccess(LITERAL_SNAKE_CASE_JSON, MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);
        mockServer.verify();
        assertThat(pred).isNotNull();
    }

    @Test
    @DisplayName("3. Valid HIGH priority with review enabled is accepted")
    void validHighPriorityWithReviewEnabledAccepted() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("triage_priority", "HIGH");
        map.put("flag_for_review", true);
        map.put("review_reasons", List.of("Triage priority is HIGH"));
        map.put("priority_reasons", List.of("Vehicle repossession threat"));

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);
        mockServer.verify();

        assertThat(pred.triagePriority()).isEqualTo("HIGH");
        assertThat(pred.flagForReview()).isTrue();
        assertThat(pred.reviewReasons()).contains("Triage priority is HIGH");
    }

    @Test
    @DisplayName("4. Valid CRITICAL priority with review enabled is accepted")
    void validCriticalPriorityWithReviewEnabledAccepted() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("triage_priority", "CRITICAL");
        map.put("flag_for_review", true);
        map.put("review_reasons", List.of("Triage priority is CRITICAL", "Imminent eviction"));
        map.put("priority_reasons", List.of("Loss of shelter"));

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);
        mockServer.verify();

        assertThat(pred.triagePriority()).isEqualTo("CRITICAL");
        assertThat(pred.flagForReview()).isTrue();
    }

    // =========================================================================
    // NEGATIVE TESTS — SCHEMA & VALIDATION
    // =========================================================================

    @Test
    @DisplayName("5. Incompatible camelCase-only payload rejected with HTTP 502")
    void incompatibleCamelCasePayloadRejectedWith502() {
        String camelCaseJson = """
                {
                  "productCategory": "Credit reporting or other personal consumer reports",
                  "confidence": 0.8200,
                  "margin": 0.7600,
                  "probabilities": {
                    "Credit reporting or other personal consumer reports": 0.8200,
                    "Debt collection": 0.0600,
                    "Credit card": 0.0300,
                    "Checking or savings account": 0.0300,
                    "Money transfer, virtual currency, or money service": 0.0200,
                    "Mortgage": 0.0200,
                    "Student loan": 0.0100,
                    "Vehicle loan or lease": 0.0100
                  },
                  "modelUsed": "baseline_tfidf_logreg",
                  "modelVersion": "1.0.0",
                  "flagForReview": false,
                  "reviewReasons": [],
                  "triagePriority": "LOW",
                  "priorityReasons": [],
                  "sentimentScore": -0.25,
                  "sentimentLabel": "NEGATIVE",
                  "disclaimer": "test"
                }
                """;

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(camelCaseJson, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("6. Missing required product_category field rejected with HTTP 502")
    void missingRequiredCategoryRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.remove("product_category");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("7. Unsupported predicted category rejected with HTTP 502")
    void unsupportedCategoryRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("product_category", "Unsupported Commercial Loan");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("unsupported product category");
    }

    @Test
    @DisplayName("8. Predicted category inconsistent with maximum probability rejected with HTTP 502")
    void predictedCategoryInconsistentWithMaxProbabilityRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        // Credit reporting has 0.82, but predicted category is set to Debt collection (0.06)
        map.put("product_category", "Debt collection");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("does not correspond to maximum probability");
    }

    @Test
    @DisplayName("9. HIGH priority with flag_for_review=false violates safety contract → HTTP 502")
    void highPriorityWithoutReviewFlagRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("triage_priority", "HIGH");
        map.put("flag_for_review", false);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("triage safety contract");
    }

    @Test
    @DisplayName("10. CRITICAL priority with flag_for_review=false violates safety contract → HTTP 502")
    void criticalPriorityWithoutReviewFlagRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("triage_priority", "CRITICAL");
        map.put("flag_for_review", false);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("triage safety contract");
    }

    @Test
    @DisplayName("11. Missing category key in probabilities distribution rejected with HTTP 502")
    void missingCategoryInProbabilitiesRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        probs.remove("Vehicle loan or lease");
        map.put("probabilities", probs);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("probability distribution");
    }

    @Test
    @DisplayName("12. Unexpected category key in probabilities distribution rejected with HTTP 502")
    void unexpectedCategoryInProbabilitiesRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        probs.put("Payday loan", 0.01);
        map.put("probabilities", probs);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("probability distribution");
    }

    @Test
    @DisplayName("13. Probability below zero rejected with HTTP 502")
    void probabilityBelowZeroRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        probs.put("Debt collection", -0.05);
        map.put("probabilities", probs);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("invalid probability");
    }

    @Test
    @DisplayName("14. Probability above one rejected with HTTP 502")
    void probabilityAboveOneRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        probs.put("Credit reporting or other personal consumer reports", 1.05);
        map.put("probabilities", probs);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("invalid probability");
    }

    @Test
    @DisplayName("15. Probability distribution sum outside [0.999, 1.001] rejected with HTTP 502")
    void probabilitySumOutsideRangeRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Sum becomes 0.50 + 0.06 + 0.03 + 0.03 + 0.02 + 0.02 + 0.01 + 0.01 = 0.68
        probs.put("Credit reporting or other personal consumer reports", 0.5000);
        map.put("probabilities", probs);
        map.put("confidence", 0.5000);
        map.put("margin", 0.4400);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sum");
    }

    @Test
    @DisplayName("16. Confidence inconsistent with maximum class probability rejected with HTTP 502")
    void confidenceInconsistentWithMaxProbabilityRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        // Max prob is 0.8200, but confidence is set to 0.6500
        map.put("confidence", 0.6500);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("Confidence");
    }

    @Test
    @DisplayName("17. Margin inconsistent with difference between top two probabilities rejected with HTTP 502")
    void marginInconsistentWithTopTwoDifferenceRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        // Top two are 0.8200 and 0.0600 (diff = 0.7600), but margin is reported as 0.3500
        map.put("margin", 0.3500);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("Margin");
    }

    @Test
    @DisplayName("18. Invalid sentiment label rejected with HTTP 502")
    void invalidSentimentLabelRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("sentiment_label", "VERY_NEGATIVE");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sentiment label");
    }

    @Test
    @DisplayName("19. Sentiment score below -1.0 rejected with HTTP 502")
    void sentimentScoreBelowRangeRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("sentiment_score", -1.5000);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sentiment score");
    }

    @Test
    @DisplayName("20. Sentiment score above +1.0 rejected with HTTP 502")
    void sentimentScoreAboveRangeRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("sentiment_score", 1.2500);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sentiment score");
    }

    @Test
    @DisplayName("21. Missing model_used identifier rejected with HTTP 502")
    void missingModelUsedRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("model_used", "   ");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("model identification");
    }

    @Test
    @DisplayName("22. Missing model_version identifier rejected with HTTP 502")
    void missingModelVersionRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.remove("model_version");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("23. Null review_reasons collection rejected with HTTP 502")
    void nullReviewReasonsRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("review_reasons", null);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("review_reasons");
    }

    @Test
    @DisplayName("24. Null priority_reasons collection rejected with HTTP 502")
    void nullPriorityReasonsRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("priority_reasons", null);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("priority_reasons");
    }

    // =========================================================================
    // NEGATIVE TESTS — UPSTREAM STATUS & NETWORK ERRORS
    // =========================================================================

    @Test
    @DisplayName("25. Upstream HTTP 422 Unprocessable Entity maps to HTTP 400 client validation error")
    void upstreamHttp422MapsTo400() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"detail\":[{\"loc\":[\"body\",\"text\"],\"msg\":\"Input should have at least 20 characters\",\"type\":\"string_too_short\"}]}"));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(400))
                .hasMessageContaining("validation failed");
    }

    @Test
    @DisplayName("26. Upstream HTTP 500 Server Error maps to HTTP 503 service unavailable")
    void upstreamHttp500MapsTo503() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withServerError());

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(503))
                .hasMessageContaining("server error");
    }

    @Test
    @DisplayName("27. Malformed JSON response maps to HTTP 502 Bad Gateway (not HTTP 500)")
    void malformedJsonMapsTo502() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess("{\"product_category\": \"Credit card\", malformed json content", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("malformed");
    }

    @Test
    @DisplayName("28. Connection failure maps to HTTP 503 service unavailable")
    void connectionFailureMapsTo503() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(request -> {
                    throw new ConnectException("Connection refused: connect");
                });

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(503))
                .hasMessageContaining("unavailable");
    }

    @Test
    @DisplayName("29. Socket timeout maps to HTTP 504 Gateway Timeout")
    void socketTimeoutMapsTo504() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(request -> {
                    throw new SocketTimeoutException("Read timed out");
                });

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(504))
                .hasMessageContaining("timed out");
    }

    @Test
    @DisplayName("30. Blank narrative input rejected client-side with HTTP 400 without calling remote service")
    void blankNarrativeRejectedClientSideWith400() {
        assertThatThrownBy(() -> nlpClientService.classify("   "))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(400))
                .hasMessageContaining("blank");

        // mockServer verify confirms no request was sent
        mockServer.verify();
    }

    // =========================================================================
    // ADDITIONAL COVERAGE — PHASE 7B.1 FINAL COVERAGE CORRECTION
    // =========================================================================

    @Test
    @DisplayName("31. Excessively high probability sum with all other fields valid rejected with HTTP 502")
    void excessivelyHighProbabilitySumRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Top: 0.8200, Runner-up: 0.0600, Confidence: 0.8200, Margin: 0.7600
        // Increase remaining categories so total sum reaches 1.0600 (> 1.001)
        probs.put("Credit card", 0.0400);
        probs.put("Checking or savings account", 0.0400);
        probs.put("Money transfer, virtual currency, or money service", 0.0300);
        probs.put("Mortgage", 0.0300);
        probs.put("Student loan", 0.0200);
        probs.put("Vehicle loan or lease", 0.0200);
        map.put("probabilities", probs);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sum");
    }

    @Test
    @DisplayName("32. Empty response body rejected with HTTP 502")
    void emptyResponseBodyRejectedWith502() {
        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess("", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("33. Flagged response with empty review_reasons list rejected with HTTP 502")
    void flaggedForReviewWithEmptyReviewReasonsRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.put("flag_for_review", true);
        map.put("review_reasons", List.of());
        map.put("triage_priority", "LOW"); // LOW priority isolates the empty review_reasons rule

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("review_reasons");
    }

    @Test
    @DisplayName("34. Missing confidence field rejected with HTTP 502")
    void missingConfidenceRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.remove("confidence");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("confidence");
    }

    @Test
    @DisplayName("35. Missing margin field rejected with HTTP 502")
    void missingMarginRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.remove("margin");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("margin");
    }

    @Test
    @DisplayName("36. Missing probabilities distribution field rejected with HTTP 502")
    void missingProbabilitiesRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.remove("probabilities");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("probability distribution");
    }

    @Test
    @DisplayName("37. Missing flag_for_review field rejected with HTTP 502")
    void missingFlagForReviewRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        map.remove("flag_for_review");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("flag_for_review");
    }

    @Test
    @DisplayName("38. Non-finite probability value in payload rejected with HTTP 502")
    void nonFiniteProbabilityRejectedWith502() {
        String rawJson = LITERAL_SNAKE_CASE_JSON.replace("\"Debt collection\": 0.0600,", "\"Debt collection\": \"NaN\",");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(rawJson, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("39. Non-finite sentiment score in payload rejected with HTTP 502")
    void nonFiniteSentimentScoreRejectedWith502() {
        String rawJson = LITERAL_SNAKE_CASE_JSON.replace("\"sentiment_score\": -0.2500,", "\"sentiment_score\": \"NaN\",");

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(rawJson, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("40. Probability distribution summing to 0.9950 rejected with HTTP 502 when other fields are consistent")
    void probabilitySum0995RejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Top: 0.8150, Runner-up: 0.0600, Others: 0.1200 -> Total sum = 0.9950 (< 0.999)
        // All other contract fields remain perfectly consistent
        probs.put("Credit reporting or other personal consumer reports", 0.8150);
        map.put("probabilities", probs);
        map.put("confidence", 0.8150);
        map.put("margin", 0.7550);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sum");
    }

    @Test
    @DisplayName("41. Probability distribution summing to exactly 0.9990 (lower bound) is accepted")
    void probabilitySumExactLowerBound0999Accepted() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Top: 0.8190, Runner-up: 0.0600, Others: 0.1200 -> Total sum = 0.9990
        probs.put("Credit reporting or other personal consumer reports", 0.8190);
        map.put("probabilities", probs);
        map.put("confidence", 0.8190);
        map.put("margin", 0.7590);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);
        mockServer.verify();

        assertThat(pred).isNotNull();
        assertThat(pred.confidence()).isEqualTo(0.8190);
        assertThat(pred.margin()).isEqualTo(0.7590);
    }

    @Test
    @DisplayName("42. Probability distribution summing to exactly 1.0010 (upper bound) is accepted")
    void probabilitySumExactUpperBound1001Accepted() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Top: 0.8210, Runner-up: 0.0600, Others: 0.1200 -> Total sum = 1.0010
        probs.put("Credit reporting or other personal consumer reports", 0.8210);
        map.put("probabilities", probs);
        map.put("confidence", 0.8210);
        map.put("margin", 0.7610);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);
        mockServer.verify();

        assertThat(pred).isNotNull();
        assertThat(pred.confidence()).isEqualTo(0.8210);
        assertThat(pred.margin()).isEqualTo(0.7610);
    }

    @Test
    @DisplayName("43. Probability distribution summing to 0.9989 (just below lower bound) rejected with HTTP 502")
    void probabilitySumJustBelowLowerBoundRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Top: 0.8189, Runner-up: 0.0600, Others: 0.1200 -> Total sum = 0.9989 (< 0.999)
        probs.put("Credit reporting or other personal consumer reports", 0.8189);
        map.put("probabilities", probs);
        map.put("confidence", 0.8189);
        map.put("margin", 0.7589);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sum");
    }

    @Test
    @DisplayName("44. Probability distribution summing to 1.0011 (just above upper bound) rejected with HTTP 502")
    void probabilitySumJustAboveUpperBoundRejectedWith502() {
        Map<String, Object> map = createValidBaselineMap();
        @SuppressWarnings("unchecked")
        Map<String, Double> probs = new LinkedHashMap<>((Map<String, Double>) map.get("probabilities"));
        // Top: 0.8211, Runner-up: 0.0600, Others: 0.1200 -> Total sum = 1.0011 (> 1.001)
        probs.put("Credit reporting or other personal consumer reports", 0.8211);
        map.put("probabilities", probs);
        map.put("confidence", 0.8211);
        map.put("margin", 0.7611);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(map), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("sum");
    }

    @Test
    @DisplayName("45. Successfully deserializes response containing additive explanation payload")
    void shouldSuccessfullyDeserializeResponseWithAdditiveExplanationPayload() {
        String jsonWithExplanation = """
                {
                  "product_category": "Credit reporting or other personal consumer reports",
                  "confidence": 0.8938,
                  "margin": 0.8259,
                  "probabilities": {
                    "Credit reporting or other personal consumer reports": 0.8938,
                    "Debt collection": 0.0679,
                    "Credit card": 0.0095,
                    "Student loan": 0.0093,
                    "Vehicle loan or lease": 0.0080,
                    "Checking or savings account": 0.0055,
                    "Money transfer, virtual currency, or money service": 0.0034,
                    "Mortgage": 0.0027
                  },
                  "model_used": "baseline_tfidf_logreg",
                  "model_version": "7a9964e0ef15514d",
                  "flag_for_review": false,
                  "review_reasons": [],
                  "triage_priority": "MEDIUM",
                  "priority_reasons": ["Substantive credit reporting inaccuracy or disputed derogatory mark"],
                  "sentiment_score": -0.6705,
                  "sentiment_label": "NEGATIVE",
                  "disclaimer": "Predictions are uncalibrated model recommendations requiring human oversight.",
                  "explanation": {
                    "method": "linear_feature_attribution",
                    "version": "1.0.0",
                    "predicted_class": "Credit reporting or other personal consumer reports",
                    "runner_up_class": "Debt collection",
                    "predicted_decision_score": 4.10972277,
                    "runner_up_decision_score": 1.53201571,
                    "decision_score_margin": 2.57770706,
                    "predicted_intercept": 0.85811237,
                    "predicted_total_feature_contribution": 3.25161040,
                    "runner_up_intercept": 0.78420251,
                    "runner_up_total_feature_contribution": 0.74781320,
                    "intercept_difference": 0.07390986,
                    "total_difference_contribution": 2.50379720,
                    "active_feature_count": 50,
                    "top_positive_features": [
                      {"feature": "equifax", "contribution": 0.69970797},
                      {"feature": "inquiry", "contribution": 0.51917139}
                    ],
                    "top_negative_features": [
                      {"feature": "they", "contribution": -0.10808421}
                    ],
                    "top_positive_runner_up_differences": [
                      {"feature": "equifax", "difference_contribution": 0.81752737}
                    ],
                    "top_negative_runner_up_differences": [
                      {"feature": "collection", "difference_contribution": -0.62293188}
                    ],
                    "model_artifact_sha256": "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0",
                    "disclaimer": "Feature contributions are mathematical weights from historical data."
                  }
                }
                """;

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(jsonWithExplanation, MediaType.APPLICATION_JSON));

        NlpPrediction result = nlpClientService.classify(TEST_NARRATIVE);

        assertThat(result).isNotNull();
        assertThat(result.productCategory()).isEqualTo("Credit reporting or other personal consumer reports");
        assertThat(result.confidence()).isEqualTo(0.8938);
        assertThat(result.margin()).isEqualTo(0.8259);
        assertThat(result.triagePriority()).isEqualTo("MEDIUM");
        assertThat(result.sentimentLabel()).isEqualTo("NEGATIVE");
        assertThat(result.sentimentScore()).isEqualTo(-0.6705);
        assertThat(result.modelUsed()).isEqualTo("baseline_tfidf_logreg");
        assertThat(result.modelVersion()).isEqualTo("7a9964e0ef15514d");
        assertThat(result.flagForReview()).isFalse();
        assertThat(result.probabilities()).hasSize(8);
        assertThat(result.reviewReasons()).isEmpty();
        assertThat(result.priorityReasons()).containsExactly("Substantive credit reporting inaccuracy or disputed derogatory mark");

        NlpExplanation expl = result.explanation();
        assertThat(expl).isNotNull();
        assertThat(expl.method()).isEqualTo("linear_feature_attribution");
        assertThat(expl.version()).isEqualTo("1.0.0");
        assertThat(expl.predictedClass()).isEqualTo("Credit reporting or other personal consumer reports");
        assertThat(expl.runnerUpClass()).isEqualTo("Debt collection");
        assertThat(expl.predictedDecisionScore()).isEqualTo(4.10972277);
        assertThat(expl.runnerUpDecisionScore()).isEqualTo(1.53201571);
        assertThat(expl.decisionScoreMargin()).isEqualTo(2.57770706);
        assertThat(expl.predictedIntercept()).isEqualTo(0.85811237);
        assertThat(expl.predictedTotalFeatureContribution()).isEqualTo(3.25161040);
        assertThat(expl.runnerUpIntercept()).isEqualTo(0.78420251);
        assertThat(expl.runnerUpTotalFeatureContribution()).isEqualTo(0.74781320);
        assertThat(expl.interceptDifference()).isEqualTo(0.07390986);
        assertThat(expl.totalDifferenceContribution()).isEqualTo(2.50379720);
        assertThat(expl.activeFeatureCount()).isEqualTo(50);
        assertThat(expl.topPositiveFeatures()).hasSize(2);
        assertThat(expl.topPositiveFeatures().get(0).feature()).isEqualTo("equifax");
        assertThat(expl.topPositiveFeatures().get(0).contribution()).isEqualTo(0.69970797);
        assertThat(expl.topNegativeFeatures()).hasSize(1);
        assertThat(expl.topNegativeFeatures().get(0).feature()).isEqualTo("they");
        assertThat(expl.topNegativeFeatures().get(0).contribution()).isEqualTo(-0.10808421);
        assertThat(expl.topPositiveRunnerUpDifferences()).hasSize(1);
        assertThat(expl.topPositiveRunnerUpDifferences().get(0).feature()).isEqualTo("equifax");
        assertThat(expl.topPositiveRunnerUpDifferences().get(0).differenceContribution()).isEqualTo(0.81752737);
        assertThat(expl.topNegativeRunnerUpDifferences()).hasSize(1);
        assertThat(expl.topNegativeRunnerUpDifferences().get(0).feature()).isEqualTo("collection");
        assertThat(expl.topNegativeRunnerUpDifferences().get(0).differenceContribution()).isEqualTo(-0.62293188);
        assertThat(expl.modelArtifactSha256()).isEqualTo("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
        assertThat(expl.disclaimer()).isEqualTo("Feature contributions are mathematical weights from historical data.");
    }

    @Test
    @DisplayName("46. Malformed baseline fields rejected even when explanation payload is present")
    void malformedBaselineFieldsRejectedEvenWithExplanationPresent() {
        String invalidJsonWithExplanation = """
                {
                  "product_category": "Credit reporting or other personal consumer reports",
                  "confidence": 1.5000,
                  "margin": 0.5000,
                  "probabilities": {
                    "Credit reporting or other personal consumer reports": 0.8000,
                    "Debt collection": 0.2000
                  },
                  "model_used": "baseline_tfidf_logreg",
                  "model_version": "7a9964e0ef15514d",
                  "flag_for_review": false,
                  "review_reasons": [],
                  "triage_priority": "LOW",
                  "priority_reasons": [],
                  "sentiment_score": 0.0,
                  "sentiment_label": "NEUTRAL",
                  "disclaimer": "Notice",
                  "explanation": { "method": "linear_feature_attribution" }
                }
                """;

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(invalidJsonWithExplanation, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502));
    }

    @Test
    @DisplayName("47. Valid prediction with explanation=null passes without error")
    void validPredictionWithNullExplanationPasses() {
        Map<String, Object> baseline = createValidBaselineMap();
        baseline.put("explanation", null);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        NlpPrediction result = nlpClientService.classify(TEST_NARRATIVE);
        assertThat(result).isNotNull();
        assertThat(result.explanation()).isNull();
    }

    @Test
    @DisplayName("48. Explanation with predicted_class mismatch throws 502")
    void explanationPredictedClassMismatchThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("predicted_class", "Debt collection"); // mismatch with baseline "Credit reporting..."
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("does not match prediction category");
    }

    @Test
    @DisplayName("49. Explanation with runner_up_class equal to predicted_class throws 502")
    void explanationRunnerUpClassEqualsPredictedClassThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("runner_up_class", "Credit reporting or other personal consumer reports");
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("cannot equal predicted class");
    }

    @Test
    @DisplayName("50. Explanation with runner_up_class not in APPROVED_LABELS throws 502")
    void explanationRunnerUpClassUnapprovedThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("runner_up_class", "Unapproved category");
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("approved category");
    }

    @Test
    @DisplayName("51. Explanation with null or NaN numeric score throws 502")
    void explanationNonFiniteScoreThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("predicted_decision_score", null);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("predicted_decision_score");
    }

    @Test
    @DisplayName("52. Explanation with Identity 1 violation throws 502")
    void explanationIdentity1ViolationThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        // Identity 1: predicted_intercept + predicted_total_feature_contribution == predicted_decision_score
        expl.put("predicted_intercept", 1.5000); // changes sum to 1.5 + 3.2516 = 4.7516 != 4.1097
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("predicted decision score identity violation");
    }

    @Test
    @DisplayName("53. Explanation with Identity 2 violation throws 502")
    void explanationIdentity2ViolationThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        // Identity 2: runner_up_intercept + runner_up_total_feature_contribution == runner_up_decision_score
        expl.put("runner_up_intercept", 1.2000); // 1.2 + 0.7478 != 1.5320
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("runner-up decision score identity violation");
    }

    @Test
    @DisplayName("54. Explanation with Identity 3 violation throws 502")
    void explanationIdentity3ViolationThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        // Identity 3: intercept_difference + total_difference_contribution == decision_score_margin
        expl.put("total_difference_contribution", 9.9999);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("decision score margin identity violation");
    }

    @Test
    @DisplayName("55. Explanation with Identity 4 violation throws 502")
    void explanationIdentity4ViolationThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        // Identity 4: predicted_decision_score - runner_up_decision_score == decision_score_margin
        expl.put("decision_score_margin", 0.0500); // 4.1097 - 1.5320 = 2.5777 != 0.0500
        // Adjust identity 3 inputs so identity 3 passes and identity 4 catches it
        expl.put("intercept_difference", 0.0200);
        expl.put("total_difference_contribution", 0.0300);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("score margin consistency violation");
    }

    @Test
    @DisplayName("56. Explanation with Identity 5 violation throws 502")
    void explanationIdentity5ViolationThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        // Identity 5: predicted_intercept - runner_up_intercept == intercept_difference
        expl.put("intercept_difference", 0.5000); // 0.8581 - 0.7842 = 0.0739 != 0.5000
        // Adjust total_difference_contribution so identity 3 doesn't trip first: 0.5000 + 2.0777 = 2.5777
        expl.put("total_difference_contribution", 2.0777);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("intercept difference consistency violation");
    }

    @Test
    @DisplayName("57. Explanation with invalid model_artifact_sha256 throws 502")
    void explanationInvalidSha256Throws502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("model_artifact_sha256", "tooshort");
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("SHA-256");
    }

    @Test
    @DisplayName("58. Explanation with blank disclaimer throws 502")
    void explanationBlankDisclaimerThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("disclaimer", "   ");
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("disclaimer must not be blank");
    }

    @Test
    @DisplayName("59. Explanation with feature name exceeding 100 characters throws 502")
    void explanationFeatureNameTooLongThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        String longFeature = "a".repeat(101);
        expl.put("top_positive_features", List.of(Map.of("feature", longFeature, "contribution", 0.5)));
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("feature token");
    }

    @Test
    @DisplayName("60. Explanation with feature list exceeding 20 items throws 502")
    void explanationFeatureListExceeds20Throws502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        List<Map<String, Object>> manyFeatures = new java.util.ArrayList<>();
        for (int i = 0; i < 21; i++) {
            manyFeatures.add(Map.of("feature", "feat" + i, "contribution", 0.05));
        }
        expl.put("top_positive_features", manyFeatures);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("exceeds maximum allowed items");
    }

    @Test
    @DisplayName("61. Explanation with positive feature having negative contribution throws 502")
    void explanationPositiveFeatureWithNegativeContributionThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("top_positive_features", List.of(Map.of("feature", "bad", "contribution", -0.5)));
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("negative contribution");
    }

    @Test
    @DisplayName("62. Explanation with negative feature having positive contribution throws 502")
    void explanationNegativeFeatureWithPositiveContributionThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("top_negative_features", List.of(Map.of("feature", "bad", "contribution", 0.5)));
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("positive contribution");
    }

    @Test
    @DisplayName("63. Explanation with negative active_feature_count throws 502")
    void explanationNegativeActiveFeatureCountThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("active_feature_count", -1);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("active_feature_count must be non-negative");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Credit reporting or other personal consumer reports",
            "Debt collection",
            "Credit card",
            "Checking or savings account",
            "Money transfer, virtual currency, or money service",
            "Mortgage",
            "Student loan",
            "Vehicle loan or lease"
    })
    @DisplayName("64. Explanation accepts all eight approved CFPB product categories as predicted_class")
    void explanationAcceptsAllEightApprovedCategories(String category) {
        Map<String, Object> baseline = createValidBaselineMap();
        baseline.put("product_category", category);

        // Build valid probability distribution with the target category as top probability
        Map<String, Double> probs = new LinkedHashMap<>();
        for (String cat : NlpClientService.APPROVED_LABELS) {
            probs.put(cat, cat.equals(category) ? 0.7900 : 0.0300);
        }
        baseline.put("probabilities", probs);
        baseline.put("confidence", 0.7900);
        baseline.put("margin", 0.7600);

        Map<String, Object> expl = createValidExplanationMap();
        expl.put("predicted_class", category);
        String runnerUp = category.equals("Debt collection") ? "Credit card" : "Debt collection";
        expl.put("runner_up_class", runnerUp);
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        NlpPrediction pred = nlpClientService.classify(TEST_NARRATIVE);
        mockServer.verify();

        assertThat(pred.productCategory()).isEqualTo(category);
        assertThat(pred.explanation()).isNotNull();
        assertThat(pred.explanation().predictedClass()).isEqualTo(category);
        assertThat(pred.explanation().runnerUpClass()).isEqualTo(runnerUp);
    }

    @Test
    @DisplayName("65. Explanation with unapproved predicted_class throws 502")
    void explanationUnapprovedPredictedClassThrows502() {
        Map<String, Object> baseline = createValidBaselineMap();
        Map<String, Object> expl = createValidExplanationMap();
        expl.put("predicted_class", "Personal Loan");
        baseline.put("explanation", expl);

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(toJson(baseline), MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus()).isEqualTo(502))
                .hasMessageContaining("approved category");
    }

    private Map<String, Object> createValidExplanationMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("method", "linear_feature_attribution");
        map.put("version", "1.0.0");
        map.put("predicted_class", "Credit reporting or other personal consumer reports");
        map.put("runner_up_class", "Debt collection");
        map.put("predicted_decision_score", 4.1097);
        map.put("runner_up_decision_score", 1.5320);
        map.put("decision_score_margin", 2.5777);
        map.put("predicted_intercept", 0.8581);
        map.put("predicted_total_feature_contribution", 3.2516);
        map.put("runner_up_intercept", 0.7842);
        map.put("runner_up_total_feature_contribution", 0.7478);
        map.put("intercept_difference", 0.0739);
        map.put("total_difference_contribution", 2.5038);
        map.put("active_feature_count", 50);
        map.put("top_positive_features", List.of(
                Map.of("feature", "equifax", "contribution", 0.6997),
                Map.of("feature", "inquiry", "contribution", 0.5192)
        ));
        map.put("top_negative_features", List.of(
                Map.of("feature", "they", "contribution", -0.1081)
        ));
        map.put("top_positive_runner_up_differences", List.of(
                Map.of("feature", "equifax", "difference_contribution", 0.8175)
        ));
        map.put("top_negative_runner_up_differences", List.of(
                Map.of("feature", "collection", "difference_contribution", -0.6229)
        ));
        map.put("model_artifact_sha256", "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
        map.put("disclaimer", "Feature contributions are mathematical weights from historical data.");
        return map;
    }
}

