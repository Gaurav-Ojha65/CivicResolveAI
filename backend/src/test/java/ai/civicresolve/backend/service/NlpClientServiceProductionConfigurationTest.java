package ai.civicresolve.backend.service;

import ai.civicresolve.backend.config.RestClientConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

/**
 * Proves full deserialization, field preservation, and safety contract enforcement of {@link NlpClientService}
 * when operating through the production Spring-managed {@link RestClientConfig} bean.
 *
 * <p>Validates that:
 * <ul>
 *   <li>The production {@link RestClient.Builder} configured with production timeouts is injected and utilized.</li>
 *   <li>Additive {@code explanation} payloads from the FastAPI explanation engine are seamlessly accepted.</li>
 *   <li>All 13 baseline classification fields are preserved with exact types and values.</li>
 *   <li>Malformed baseline fields (out-of-range confidence, invalid probabilities) trigger HTTP 502.</li>
 *   <li>Triage dual-trigger safety contract violations trigger HTTP 502 even when explanations are present.</li>
 * </ul>
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = {RestClientConfig.class})
@TestPropertySource(properties = {
        "civicresolve.nlp.service-url=http://127.0.0.1:8000",
        "civicresolve.nlp.connect-timeout-ms=3000",
        "civicresolve.nlp.read-timeout-ms=10000"
})
@DisplayName("NlpClientService — Production RestClient Configuration Compatibility Tests")
class NlpClientServiceProductionConfigurationTest {

    private static final String CLASSIFY_ENDPOINT = "http://127.0.0.1:8000/classify";
    private static final String TEST_NARRATIVE =
            "I noticed inaccurate inquiry records on my Equifax credit report from a collection agency. "
            + "I submitted a formal dispute letter requesting verification.";

    @Autowired
    private RestClient.Builder productionRestClientBuilder;

    @Value("${civicresolve.nlp.service-url:http://127.0.0.1:8000}")
    private String nlpServiceUrl;

    private MockRestServiceServer mockServer;
    private NlpClientService nlpClientService;

    @BeforeEach
    void setUp() {
        mockServer = MockRestServiceServer.bindTo(productionRestClientBuilder).build();
        nlpClientService = new NlpClientService(productionRestClientBuilder, nlpServiceUrl);
    }

    @Test
    @DisplayName("1. Production RestClient successfully deserializes response with additive explanation payload")
    void productionRestClientSuccessfullyDeserializesResponseWithExplanation() {
        String realisticResponseWithExplanation = """
                {
                  "product_category": "Credit reporting or other personal consumer reports",
                  "confidence": 0.8938,
                  "margin": 0.8259,
                  "probabilities": {
                    "Credit reporting or other personal consumer reports": 0.8938,
                    "Debt collection": 0.0679,
                    "Credit card": 0.0125,
                    "Checking or savings account": 0.0098,
                    "Money transfer, virtual currency, or money service": 0.0054,
                    "Mortgage": 0.0046,
                    "Student loan": 0.0032,
                    "Vehicle loan or lease": 0.0028
                  },
                  "model_used": "baseline_tfidf_logreg",
                  "model_version": "7a9964e0ef15514d",
                  "flag_for_review": false,
                  "review_reasons": [],
                  "triage_priority": "MEDIUM",
                  "priority_reasons": [
                    "Substantive credit reporting inaccuracy or disputed derogatory mark"
                  ],
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
                      {"feature": "report", "contribution": 0.89241512},
                      {"feature": "credit", "contribution": 0.75549018}
                    ],
                    "top_negative_features": [
                      {"feature": "balance", "contribution": -0.15420194}
                    ],
                    "top_positive_runner_up_differences": [
                      {"feature": "report", "difference_contribution": 1.20584192}
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
                .andExpect(header("Content-Type", "application/json"))
                .andRespond(withSuccess(realisticResponseWithExplanation, MediaType.APPLICATION_JSON));

        NlpPrediction result = nlpClientService.classify(TEST_NARRATIVE);

        mockServer.verify();
        assertThat(result).isNotNull();
        // 13 baseline fields verified exactly
        assertThat(result.productCategory()).isEqualTo("Credit reporting or other personal consumer reports");
        assertThat(result.confidence()).isEqualTo(0.8938);
        assertThat(result.margin()).isEqualTo(0.8259);
        assertThat(result.modelUsed()).isEqualTo("baseline_tfidf_logreg");
        assertThat(result.modelVersion()).isEqualTo("7a9964e0ef15514d");
        assertThat(result.flagForReview()).isFalse();
        assertThat(result.reviewReasons()).isEmpty();
        assertThat(result.triagePriority()).isEqualTo("MEDIUM");
        assertThat(result.priorityReasons()).containsExactly(
                "Substantive credit reporting inaccuracy or disputed derogatory mark"
        );
        assertThat(result.sentimentScore()).isEqualTo(-0.6705);
        assertThat(result.sentimentLabel()).isEqualTo("NEGATIVE");
        assertThat(result.disclaimer()).isEqualTo(
                "Predictions are uncalibrated model recommendations requiring human oversight."
        );

        Map<String, Double> probs = result.probabilities();
        assertThat(probs).hasSize(8);
        assertThat(probs.get("Credit reporting or other personal consumer reports")).isEqualTo(0.8938);
        assertThat(probs.get("Debt collection")).isEqualTo(0.0679);
        assertThat(probs.get("Vehicle loan or lease")).isEqualTo(0.0028);

        // Explanation field verified
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
        assertThat(expl.topPositiveFeatures().get(0).feature()).isEqualTo("report");
        assertThat(expl.topPositiveFeatures().get(0).contribution()).isEqualTo(0.89241512);
        assertThat(expl.topNegativeFeatures()).hasSize(1);
        assertThat(expl.topNegativeFeatures().get(0).feature()).isEqualTo("balance");
        assertThat(expl.topNegativeFeatures().get(0).contribution()).isEqualTo(-0.15420194);
        assertThat(expl.topPositiveRunnerUpDifferences()).hasSize(1);
        assertThat(expl.topPositiveRunnerUpDifferences().get(0).feature()).isEqualTo("report");
        assertThat(expl.topPositiveRunnerUpDifferences().get(0).differenceContribution()).isEqualTo(1.20584192);
        assertThat(expl.topNegativeRunnerUpDifferences()).hasSize(1);
        assertThat(expl.topNegativeRunnerUpDifferences().get(0).feature()).isEqualTo("collection");
        assertThat(expl.topNegativeRunnerUpDifferences().get(0).differenceContribution()).isEqualTo(-0.62293188);
        assertThat(expl.modelArtifactSha256()).isEqualTo("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
        assertThat(expl.disclaimer()).isEqualTo("Feature contributions are mathematical weights from historical data.");
    }

    @Test
    @DisplayName("2. Production RestClient rejects out-of-range confidence even when explanation is present")
    void productionRestClientRejectsOutOfRangeConfidence() {
        String invalidConfidenceJson = """
                {
                  "product_category": "Credit reporting or other personal consumer reports",
                  "confidence": 1.4500,
                  "margin": 0.5000,
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
                  "model_version": "7a9964e0ef15514d",
                  "flag_for_review": false,
                  "review_reasons": [],
                  "triage_priority": "LOW",
                  "priority_reasons": [],
                  "sentiment_score": 0.0,
                  "sentiment_label": "NEUTRAL",
                  "disclaimer": "Notice",
                  "explanation": {
                    "method": "linear_feature_attribution",
                    "predicted_class": "Credit reporting or other personal consumer reports"
                  }
                }
                """;

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(invalidConfidenceJson, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> {
                    NlpClientService.NlpClientException clientEx = (NlpClientService.NlpClientException) ex;
                    assertThat(clientEx.getHttpStatus()).isEqualTo(502);
                    assertThat(clientEx.getMessage()).contains("out-of-range confidence");
                });
        mockServer.verify();
    }

    @Test
    @DisplayName("3. Production RestClient rejects triage safety violation (HIGH priority with flag_for_review=false)")
    void productionRestClientRejectsTriageSafetyViolationWithExplanation() {
        String triageViolationJson = """
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
                  "model_version": "7a9964e0ef15514d",
                  "flag_for_review": false,
                  "review_reasons": [],
                  "triage_priority": "HIGH",
                  "priority_reasons": ["Urgent legal threat detected."],
                  "sentiment_score": -0.85,
                  "sentiment_label": "NEGATIVE",
                  "disclaimer": "Notice",
                  "explanation": {
                    "method": "linear_feature_attribution",
                    "predicted_class": "Credit reporting or other personal consumer reports"
                  }
                }
                """;

        mockServer.expect(requestTo(CLASSIFY_ENDPOINT))
                .andRespond(withSuccess(triageViolationJson, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> {
                    NlpClientService.NlpClientException clientEx = (NlpClientService.NlpClientException) ex;
                    assertThat(clientEx.getHttpStatus()).isEqualTo(502);
                    assertThat(clientEx.getMessage()).contains("safety contract");
                });
        mockServer.verify();
    }

    @Test
    @DisplayName("4. Production RestClient rejects incomplete probability distribution with explanation present")
    void productionRestClientRejectsIncompleteProbabilitiesWithExplanation() {
        String incompleteProbabilitiesJson = """
                {
                  "product_category": "Credit reporting or other personal consumer reports",
                  "confidence": 0.8200,
                  "margin": 0.7600,
                  "probabilities": {
                    "Credit reporting or other personal consumer reports": 0.8200,
                    "Debt collection": 0.1800
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
                .andRespond(withSuccess(incompleteProbabilitiesJson, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> nlpClientService.classify(TEST_NARRATIVE))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> {
                    NlpClientService.NlpClientException clientEx = (NlpClientService.NlpClientException) ex;
                    assertThat(clientEx.getHttpStatus()).isEqualTo(502);
                    assertThat(clientEx.getMessage()).contains("does not match the 8 approved categories");
                });
        mockServer.verify();
    }
}
