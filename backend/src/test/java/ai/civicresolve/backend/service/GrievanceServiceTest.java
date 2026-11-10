package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.DualModelComparisonRequest;
import ai.civicresolve.backend.dto.DualModelComparisonResponse;
import ai.civicresolve.backend.dto.GrievanceRequest;
import ai.civicresolve.backend.dto.GrievanceResponse;
import ai.civicresolve.backend.dto.GrievanceStatsResponse;
import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
import ai.civicresolve.backend.dto.ModelInferenceSummary;
import ai.civicresolve.backend.dto.PrecedentRankResponse;
import ai.civicresolve.backend.dto.ReviewRequest;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.exception.InvalidReviewStateException;
import ai.civicresolve.backend.exception.StaleGrievanceVersionException;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import ai.civicresolve.backend.repository.ProductCategoryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link GrievanceService}.
 * Uses Mockito for all dependencies — no Spring context, no database.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GrievanceService — unit tests")
class GrievanceServiceTest {

    @Mock private GrievanceRepository grievanceRepository;
    @Mock private PredictionRepository predictionRepository;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private ProductCategoryRepository productCategoryRepository;
    @Mock private NlpClientService nlpClientService;
    @Mock private GrievancePersistenceService grievancePersistenceService;
    @Mock private DemoDataSeederService demoDataSeederService;

    @InjectMocks private GrievanceService grievanceService;

    private static final UUID GRIEVANCE_ID = UUID.randomUUID();

    private static final Map<String, Double> VALID_PROBS = Map.of(
            "Credit reporting or other personal consumer reports", 0.82,
            "Debt collection", 0.05,
            "Credit card", 0.03,
            "Checking or savings account", 0.03,
            "Money transfer, virtual currency, or money service", 0.02,
            "Mortgage", 0.02,
            "Student loan", 0.02,
            "Vehicle loan or lease", 0.01
    );

    @BeforeEach
    void setupSecurityContext() {
        // Simulate authenticated reviewer in Spring Security context
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test-reviewer", "password")
        );
    }

    // ─── Auto-routing ─────────────────────────────────────────────────────

    @Test
    @DisplayName("LOW priority + flag=false → delegates to GrievancePersistenceService")
    void submitAutoRouted() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of("No critical keywords."),
                0.12, "POSITIVE", "disclaimer"
        );
        given(nlpClientService.classify(anyString())).willReturn(pred);
        given(productCategoryRepository.existsByLabel("Credit card")).willReturn(true);
        GrievanceSubmissionResponse expectedResponse = new GrievanceSubmissionResponse(
                GRIEVANCE_ID, "trk_1234567890abcdef1234567890abcdef", "Credit card", TriagePriority.LOW,
                GrievanceStatus.AUTO_ROUTED, false, Instant.now(), Instant.now(), 0L
        );
        given(grievancePersistenceService.persistSubmission(anyString(), any(NlpPrediction.class)))
                .willReturn(expectedResponse);

        GrievanceRequest request = new GrievanceRequest(
                "I received a bill for an annual fee that I was not informed about when I opened this credit card account three years ago."
        );

        GrievanceSubmissionResponse response = grievanceService.submit(request);
        assertThat(response).isEqualTo(expectedResponse);
        assertThat(response.trackingSecret()).isEqualTo("trk_1234567890abcdef1234567890abcdef");
        verify(nlpClientService).classify(request.description());
        verify(productCategoryRepository).existsByLabel("Credit card");
        verify(grievancePersistenceService).persistSubmission(request.description(), pred);
    }

    @Test
    @DisplayName("HIGH priority + flag=true → delegates to GrievancePersistenceService")
    void submitPendingReview() {
        NlpPrediction pred = new NlpPrediction(
                "Vehicle loan or lease", 0.78, 0.55, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", true,
                List.of("HIGH priority requires review."), "HIGH",
                List.of("Vehicle repossession keyword detected."),
                -0.75, "NEGATIVE", "disclaimer"
        );
        given(nlpClientService.classify(anyString())).willReturn(pred);
        given(productCategoryRepository.existsByLabel("Vehicle loan or lease")).willReturn(true);
        GrievanceSubmissionResponse expectedResponse = new GrievanceSubmissionResponse(
                GRIEVANCE_ID, "trk_1234567890abcdef1234567890abcdef", "Vehicle loan or lease", TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW, true, Instant.now(), Instant.now(), 0L
        );
        given(grievancePersistenceService.persistSubmission(anyString(), any(NlpPrediction.class)))
                .willReturn(expectedResponse);

        GrievanceRequest request = new GrievanceRequest(
                "My vehicle was repossessed without any advance notice after I missed one payment while hospitalized."
        );
        GrievanceSubmissionResponse response = grievanceService.submit(request);
        assertThat(response).isEqualTo(expectedResponse);
        assertThat(response.trackingSecret()).isEqualTo("trk_1234567890abcdef1234567890abcdef");
        verify(nlpClientService).classify(request.description());
        verify(productCategoryRepository).existsByLabel("Vehicle loan or lease");
        verify(grievancePersistenceService).persistSubmission(request.description(), pred);
    }

    // ─── NLP failure isolation ─────────────────────────────────────────────

    @Test
    @DisplayName("NLP failure → no DB records created")
    void nlpFailureNoDbPersistence() {
        given(nlpClientService.classify(anyString()))
                .willThrow(new NlpClientService.NlpClientException(503, "service unavailable"));

        GrievanceRequest request = new GrievanceRequest(
                "A debt collector placed an entry on my credit report for a debt that was discharged in bankruptcy three years ago."
        );

        assertThatThrownBy(() -> grievanceService.submit(request))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .hasMessage("service unavailable");

        // Verify no DB persistence was invoked
        verify(grievancePersistenceService, never()).persistSubmission(any(), any());
        verify(grievanceRepository, never()).save(any());
        verify(predictionRepository, never()).save(any());
        verify(auditLogRepository, never()).save(any());
    }

    @Test
    @DisplayName("NLP returns unregistered category → NlpClientException 502")
    void nlpUnregisteredCategoryFails() {
        NlpPrediction pred = new NlpPrediction(
                "Unknown Product Category", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of(), 0.0, "NEUTRAL", "disclaimer"
        );
        given(nlpClientService.classify(anyString())).willReturn(pred);
        given(productCategoryRepository.existsByLabel("Unknown Product Category")).willReturn(false);

        GrievanceRequest request = new GrievanceRequest(
                "My mortgage servicer applied my payments incorrectly for six consecutive months despite written notices."
        );

        assertThatThrownBy(() -> grievanceService.submit(request))
                .isInstanceOf(NlpClientService.NlpClientException.class)
                .satisfies(ex -> assertThat(((NlpClientService.NlpClientException) ex).getHttpStatus())
                        .isEqualTo(502));

        verify(grievancePersistenceService, never()).persistSubmission(any(), any());
        verify(grievanceRepository, never()).save(any());
    }

    // ─── Review state machine ─────────────────────────────────────────────

    @Test
    @DisplayName("APPROVE on PENDING_REVIEW grievance → APPROVED status")
    void approvePendingReview() {
        Grievance grievance = new Grievance(
                "narrative",
                "Credit card",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 0L);

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));
        given(grievanceRepository.saveAndFlush(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));

        ReviewRequest request = new ReviewRequest("APPROVE", null, null, null, 0L);
        GrievanceResponse response = grievanceService.review(GRIEVANCE_ID, request);

        assertThat(response.status()).isEqualTo(GrievanceStatus.APPROVED);
        verify(auditLogRepository).save(any());
    }

    @Test
    @DisplayName("Stale expectedVersion → StaleGrievanceVersionException before state mutation")
    void staleExpectedVersionThrowsStaleGrievanceVersionException() {
        Grievance grievance = new Grievance(
                "narrative", "Credit card", TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW, true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 1L);

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));

        ReviewRequest request = new ReviewRequest("APPROVE", null, null, null, 0L);

        assertThatThrownBy(() -> grievanceService.review(GRIEVANCE_ID, request))
                .isInstanceOf(StaleGrievanceVersionException.class)
                .hasMessageContaining("Expected version 0 but current version is 1");

        verify(grievanceRepository, never()).saveAndFlush(any());
        verify(auditLogRepository, never()).save(any());
    }

    @Test
    @DisplayName("OVERRIDE without reviewNote → InvalidReviewStateException")
    void overrideWithoutNoteFails() {
        Grievance grievance = new Grievance(
                "narrative", "Credit card", TriagePriority.LOW,
                GrievanceStatus.PENDING_REVIEW, true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 0L);
        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));

        ReviewRequest request = new ReviewRequest("OVERRIDE", "Debt collection", null, null, 0L);

        assertThatThrownBy(() -> grievanceService.review(GRIEVANCE_ID, request))
                .isInstanceOf(InvalidReviewStateException.class)
                .hasMessageContaining("review note is required");
    }

    @Test
    @DisplayName("REJECT without reviewNote → InvalidReviewStateException")
    void rejectWithoutNoteFails() {
        Grievance grievance = new Grievance(
                "narrative", "Credit card", TriagePriority.LOW,
                GrievanceStatus.PENDING_REVIEW, true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 0L);
        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));

        ReviewRequest request = new ReviewRequest("REJECT", null, null, null, 0L);

        assertThatThrownBy(() -> grievanceService.review(GRIEVANCE_ID, request))
                .isInstanceOf(InvalidReviewStateException.class)
                .hasMessageContaining("review note is required");
    }

    @Test
    @DisplayName("OVERRIDE on APPROVED grievance → InvalidReviewStateException (terminal state)")
    void overrideTerminalStateFails() {
        Grievance grievance = new Grievance(
                "narrative", "Credit card", TriagePriority.LOW,
                GrievanceStatus.APPROVED, false
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 0L);
        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));

        ReviewRequest request = new ReviewRequest("OVERRIDE", "Debt collection", null, "some note", 0L);

        assertThatThrownBy(() -> grievanceService.review(GRIEVANCE_ID, request))
                .isInstanceOf(InvalidReviewStateException.class)
                .hasMessageContaining("terminal state");
    }

    @Test
    @DisplayName("OVERRIDE requires at least one change (newCategory or newPriority)")
    void overrideWithNoChangeFails() {
        Grievance grievance = new Grievance(
                "narrative", "Credit card", TriagePriority.LOW,
                GrievanceStatus.PENDING_REVIEW, true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 0L);
        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));

        ReviewRequest request = new ReviewRequest("OVERRIDE", null, null, "Some note", 0L);

        assertThatThrownBy(() -> grievanceService.review(GRIEVANCE_ID, request))
                .isInstanceOf(InvalidReviewStateException.class)
                .hasMessageContaining("at least one of");
    }

    @Test
    @DisplayName("Audit record is created for every review action and flushed version is returned")
    void auditRecordCreatedOnReview() {
        Grievance grievance = new Grievance(
                "narrative", "Credit card", TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW, true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 0L);

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));
        given(grievanceRepository.saveAndFlush(any(Grievance.class))).willAnswer(inv -> {
            Grievance saved = inv.getArgument(0);
            setVersion(saved, 1L); // Simulate Hibernate flush updating the version
            return saved;
        });

        ReviewRequest request = new ReviewRequest("APPROVE", null, null, null, 0L);
        GrievanceResponse response = grievanceService.review(GRIEVANCE_ID, request);

        assertThat(response.version()).isEqualTo(1L);
        verify(auditLogRepository).save(any());
        verify(grievanceRepository).saveAndFlush(any());
    }

    // ─── Stats Unit Tests ───────────────────────────────────────────────────

    @Test
    @DisplayName("getStats returns aggregated counts across all statuses and priorities")
    void getStatsReturnsAggregatedCountsAcrossAllStatusesAndPriorities() {
        given(grievanceRepository.count()).willReturn(10L);
        given(grievanceRepository.countByStatus(GrievanceStatus.PENDING_REVIEW)).willReturn(3L);
        given(grievanceRepository.countByStatus(GrievanceStatus.AUTO_ROUTED)).willReturn(4L);
        given(grievanceRepository.countByStatus(GrievanceStatus.APPROVED)).willReturn(1L);
        given(grievanceRepository.countByStatus(GrievanceStatus.OVERRIDDEN)).willReturn(1L);
        given(grievanceRepository.countByStatus(GrievanceStatus.REJECTED)).willReturn(1L);

        given(grievanceRepository.countByPriority(TriagePriority.LOW)).willReturn(4L);
        given(grievanceRepository.countByPriority(TriagePriority.MEDIUM)).willReturn(3L);
        given(grievanceRepository.countByPriority(TriagePriority.HIGH)).willReturn(2L);
        given(grievanceRepository.countByPriority(TriagePriority.CRITICAL)).willReturn(1L);

        GrievanceStatsResponse stats = grievanceService.getStats();

        assertThat(stats.total()).isEqualTo(10L);
        assertThat(stats.pendingReview()).isEqualTo(3L);
        assertThat(stats.byStatus()).containsEntry("PENDING_REVIEW", 3L)
                .containsEntry("AUTO_ROUTED", 4L)
                .containsEntry("APPROVED", 1L)
                .containsEntry("OVERRIDDEN", 1L)
                .containsEntry("REJECTED", 1L);
        assertThat(stats.byPriority()).containsEntry("LOW", 4L)
                .containsEntry("MEDIUM", 3L)
                .containsEntry("HIGH", 2L)
                .containsEntry("CRITICAL", 1L);
    }

    @Test
    @DisplayName("getModelAuditAnalytics computes metrics from database group-by aggregations")
    void getModelAuditAnalyticsComputesAggregationsFromDatabaseProjections() {
        PredictionRepository.TriggerCounts triggerCounts = new PredictionRepository.TriggerCounts() {
            @Override public Long getLowConfidenceCount() { return 5L; }
            @Override public Long getSmallMarginCount() { return 3L; }
            @Override public Long getCriticalPriorityCount() { return 2L; }
            @Override public Long getAutoRoutedCount() { return 4L; }
        };
        given(predictionRepository.countTriggers()).willReturn(triggerCounts);

        PredictionRepository.AdjudicationGroupCount group1 = new PredictionRepository.AdjudicationGroupCount() {
            @Override public String getPredictedCategory() { return "Mortgage"; }
            @Override public String getAssignedCategory() { return "Mortgage"; }
            @Override public GrievanceStatus getStatus() { return GrievanceStatus.APPROVED; }
            @Override public long getCount() { return 8L; }
        };

        PredictionRepository.AdjudicationGroupCount group2 = new PredictionRepository.AdjudicationGroupCount() {
            @Override public String getPredictedCategory() { return "Mortgage"; }
            @Override public String getAssignedCategory() { return "Debt collection"; }
            @Override public GrievanceStatus getStatus() { return GrievanceStatus.OVERRIDDEN; }
            @Override public long getCount() { return 2L; }
        };

        given(predictionRepository.countAdjudicationsGrouped()).willReturn(List.of(group1, group2));

        var response = grievanceService.getModelAuditAnalytics();

        assertThat(response.totalAdjudicated()).isEqualTo(10L);
        assertThat(response.reviewerAgreementRate()).isEqualTo(0.8);
        assertThat(response.categoryOverrideDistribution()).containsEntry("Debt collection", 2L);
        assertThat(response.confusionMatrix().get("Mortgage")).containsEntry("Mortgage", 8L).containsEntry("Debt collection", 2L);
        assertThat(response.triggerBreakdown()).containsEntry("LOW_CONFIDENCE", 5L)
                .containsEntry("SMALL_MARGIN", 3L)
                .containsEntry("CRITICAL_PRIORITY_POLICY", 2L)
                .containsEntry("AUTO_ROUTED", 4L);
    }

    @Test
    @DisplayName("Simulation and Replay endpoints enforce persistence invariance (zero mutations across calls)")
    void simulationAndReplayEndpointsEnforcePersistenceInvariance() {
        Grievance grievance = new Grievance(
                "My credit report contains an unauthorized inquiry from an unknown entity.",
                "Credit reporting or other personal consumer reports",
                TriagePriority.LOW,
                GrievanceStatus.PENDING_REVIEW,
                true
        );
        setId(grievance, GRIEVANCE_ID);
        setVersion(grievance, 1L);

        // Setup candidate precedents
        UUID candidateId = UUID.randomUUID();
        Grievance candidate = new Grievance(
                "Historical credit reporting dispute resolved.",
                "Credit reporting or other personal consumer reports",
                TriagePriority.LOW,
                GrievanceStatus.APPROVED,
                false
        );
        setId(candidate, candidateId);

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(grievance));
        given(grievanceRepository.findAdjudicatedCandidatesExcluding(any(), any()))
                .willReturn(List.of(candidate));
        given(predictionRepository.findByGrievanceId(candidateId)).willReturn(Optional.empty());

        given(nlpClientService.compareModels(anyString())).willReturn(new DualModelComparisonResponse(
                new ModelInferenceSummary("baseline", "linear_tfidf", "hash1", "Credit card", 0.9, 0.4, Map.of(), 10.0, 50, false),
                new ModelInferenceSummary("bilstm", "bilstm_neural", "hash2", "Credit card", 0.85, 0.35, Map.of(), 15.0, 40, false),
                true,
                0.05,
                "Stateless simulation"
        ));

        NlpPrediction nlpPred = new NlpPrediction(
                "Credit reporting or other personal consumer reports",
                0.92,
                0.40,
                VALID_PROBS,
                "TF-IDF",
                "v1",
                false,
                List.of(),
                "LOW",
                List.of(),
                -0.1,
                "NEGATIVE",
                "Disclaimer",
                null
        );
        given(nlpClientService.classify(anyString())).willReturn(nlpPred);

        given(nlpClientService.rankPrecedents(any(ai.civicresolve.backend.dto.PrecedentRankRequest.class))).willReturn(
                new PrecedentRankResponse(
                        1,
                        3,
                        List.of(new PrecedentRankResponse.RankedPrecedentDto(
                                candidateId.toString(),
                                0.75,
                                "Lexical TF-IDF Cosine Similarity",
                                "Credit reporting or other personal consumer reports",
                                "Credit reporting or other personal consumer reports",
                                "APPROVED",
                                "Historical credit reporting dispute...",
                                Instant.now().toString()
                        )),
                        "Lexical TF-IDF Cosine Similarity"
                )
        );

        // Execute multiple simulations and replay calls
        for (int i = 0; i < 5; i++) {
            grievanceService.compareModels(new DualModelComparisonRequest("Simulated narrative variant " + i + " with at least ten characters."));
            grievanceService.previewClassify("Counterfactual what-if narrative testing sensitivity " + i);
            grievanceService.getPrecedents(GRIEVANCE_ID);
        }

        // Verify zero persistence mutations occurred
        verify(grievanceRepository, never()).save(any());
        verify(grievanceRepository, never()).saveAndFlush(any());
        verify(grievanceRepository, never()).delete(any());
        verify(grievanceRepository, never()).deleteAll(any());
        verify(predictionRepository, never()).save(any());
        verify(predictionRepository, never()).delete(any());
        verify(auditLogRepository, never()).save(any());
        verify(auditLogRepository, never()).delete(any());
        verify(grievancePersistenceService, never()).persistSubmission(any(), any());

        // Verify original grievance state was not mutated
        assertThat(grievance.getId()).isEqualTo(GRIEVANCE_ID);
        assertThat(grievance.getVersion()).isEqualTo(1L);
        assertThat(grievance.getStatus()).isEqualTo(GrievanceStatus.PENDING_REVIEW);
        assertThat(grievance.getAssignedCategory()).isEqualTo("Credit reporting or other personal consumer reports");
        assertThat(grievance.getPriority()).isEqualTo(TriagePriority.LOW);
        assertThat(grievance.getNarrative()).isEqualTo("My credit report contains an unauthorized inquiry from an unknown entity.");
    }

    // ─── Helpers: reflectively set id and version on Grievance ────────────

    private static void setId(Grievance grievance, UUID id) {
        try {
            var field = Grievance.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(grievance, id);
        } catch (Exception e) {
            throw new RuntimeException("Could not set grievance id for test", e);
        }
    }

    private static void setVersion(Grievance grievance, Long version) {
        try {
            var field = Grievance.class.getDeclaredField("version");
            field.setAccessible(true);
            field.set(grievance, version);
        } catch (Exception e) {
            throw new RuntimeException("Could not set grievance version for test", e);
        }
    }
}
