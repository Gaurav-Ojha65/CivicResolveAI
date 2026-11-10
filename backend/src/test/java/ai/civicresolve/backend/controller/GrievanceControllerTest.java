package ai.civicresolve.backend.controller;

import ai.civicresolve.backend.dto.ConsumerTimelineEvent;
import ai.civicresolve.backend.dto.ExecutiveAnalyticsResponse;
import ai.civicresolve.backend.dto.GrievanceDetailResponse;
import ai.civicresolve.backend.dto.GrievanceRequest;
import ai.civicresolve.backend.dto.GrievanceResponse;
import ai.civicresolve.backend.dto.GrievanceStatsResponse;
import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
import ai.civicresolve.backend.dto.GrievanceTrackRequest;
import ai.civicresolve.backend.dto.GrievanceTrackingResponse;
import ai.civicresolve.backend.dto.ModelAuditResponse;
import ai.civicresolve.backend.dto.ReviewRequest;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.exception.GlobalExceptionHandler;
import ai.civicresolve.backend.exception.InvalidTrackingSecretFormatException;
import ai.civicresolve.backend.exception.RateLimitExceededException;
import ai.civicresolve.backend.exception.StaleGrievanceVersionException;
import ai.civicresolve.backend.exception.TrackingNotFoundException;
import ai.civicresolve.backend.service.GrievanceService;
import ai.civicresolve.backend.service.GrievanceTrackingService;
import ai.civicresolve.backend.service.NlpClientService;
import ai.civicresolve.backend.service.TrackingRateLimiter;
import ai.civicresolve.backend.config.SecurityConfig;
import jakarta.persistence.OptimisticLockException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Controller-slice tests for {@link GrievanceController}.
 *
 * <p>Uses {@code @WebMvcTest} to test only the MVC layer.
 * {@code @MockitoBean} replaces {@code @MockBean} in Spring Boot 4.x.
 * {@code @WithMockUser} simulates authenticated reviewer for protected endpoints.
 */
@WebMvcTest({GrievanceController.class, HealthController.class, GlobalExceptionHandler.class})
@Import(SecurityConfig.class)
@DisplayName("GrievanceController — MVC slice tests")
class GrievanceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private GrievanceService grievanceService;

    @MockitoBean
    private GrievanceTrackingService grievanceTrackingService;

    @MockitoBean
    private TrackingRateLimiter trackingRateLimiter;

    @BeforeEach
    void setupRateLimiter() {
        given(trackingRateLimiter.checkIpRateLimit(any()))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
    }

    private static final UUID GRIEVANCE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String TRACKING_SECRET = "trk_testsecret1234567890abcdef1234567890abcdef";

    private static GrievanceResponse sampleResponse(GrievanceStatus status, TriagePriority priority) {
        return new GrievanceResponse(
                GRIEVANCE_ID,
                "Credit card",
                priority,
                status,
                status == GrievanceStatus.PENDING_REVIEW,
                Instant.now(),
                Instant.now()
        );
    }

    private static GrievanceSubmissionResponse sampleSubmissionResponse(GrievanceStatus status, TriagePriority priority) {
        return new GrievanceSubmissionResponse(
                GRIEVANCE_ID,
                TRACKING_SECRET,
                "Credit card",
                priority,
                status,
                status == GrievanceStatus.PENDING_REVIEW,
                Instant.now(),
                Instant.now(),
                0L
        );
    }

    // ─── POST /api/grievances (public) ────────────────────────────────────

    @Test
    @DisplayName("POST /api/grievances with valid narrative → 201 Created with Location header")
    void submitValidGrievance() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute but got no response."
                            }
                            """)
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"))
                .andExpect(jsonPath("$.priority").value("LOW"))
                .andExpect(jsonPath("$.trackingSecret").value(TRACKING_SECRET));
    }

    @Test
    @DisplayName("POST /api/grievances with blank description → 400 Bad Request with errors")
    void submitBlankDescription() throws Exception {
        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "description": "" }
                                """)
                        .with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Validation Failed"));
    }

    @Test
    @DisplayName("POST /api/grievances with description < 20 chars → 400 Bad Request")
    void submitTooShortDescription() throws Exception {
        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "description": "Too short" }
                                """)
                        .with(csrf()))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/grievances — NLP service unavailable → 503 Service Unavailable")
    void submitNlpUnavailable() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willThrow(new NlpClientService.NlpClientException(503, "NLP service is unavailable."));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "My mortgage servicer applied my payments incorrectly for six consecutive months despite written notices and documented proof of payment."
                            }
                            """)
                        .with(csrf()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.title").value("NLP Service Error"));
    }

    @Test
    @DisplayName("POST /api/grievances — NLP timeout → 504 Gateway Timeout")
    void submitNlpTimeout() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willThrow(new NlpClientService.NlpClientException(504, "NLP service timed out."));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "A debt collector called me at work repeatedly and threatened legal action for a debt I do not recognize from several years ago."
                            }
                            """)
                        .with(csrf()))
                .andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.detail").value("NLP service timed out."));
    }

    @Test
    @DisplayName("POST /api/grievances — NLP triage contract violation → 502 Bad Gateway")
    void submitTriageSafetyContractViolation() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willThrow(new NlpClientService.NlpClientException(502,
                        "NLP service violated the triage safety contract: HIGH priority requires flag_for_review=true."));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "My home is scheduled for foreclosure next week and the bank refuses to process my loss mitigation application despite federal regulations requiring them to do so."
                            }
                            """)
                        .with(csrf()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.title").value("NLP Service Error"));
    }

    // ─── POST auto-route vs pending-review behavior ───────────────────────

    @Test
    @DisplayName("POST — LOW priority without flag → AUTO_ROUTED status")
    void submitAutoRouted() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I received a bill for an annual fee that I was not informed about when I opened this credit card account three years ago."
                            }
                            """)
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"))
                .andExpect(jsonPath("$.reviewRequired").value(false));
    }

    @Test
    @DisplayName("POST — HIGH priority with flag → PENDING_REVIEW status")
    void submitPendingReview() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.PENDING_REVIEW, TriagePriority.HIGH));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "My car has been repossessed without any prior notice. I was current on my payments as of last month and this has left my family without transportation to get to work."
                            }
                            """)
                        .with(csrf()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"))
                .andExpect(jsonPath("$.reviewRequired").value(true))
                .andExpect(jsonPath("$.priority").value("HIGH"));
    }

    // ─── GET /api/grievances (authenticated) ──────────────────────────────

    @Test
    @DisplayName("GET /api/grievances without auth → 401 Unauthorized")
    void listGrievancesUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/{id} without auth → 401 Unauthorized")
    void getByIdUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances/{id}", GRIEVANCE_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/{id} authenticated as REVIEWER returns detail with narrative")
    void getByIdAuthenticatedReturnsDetailWithNarrative() throws Exception {
        GrievanceDetailResponse detail = new GrievanceDetailResponse(
                GRIEVANCE_ID,
                "Detailed citizen grievance complaint narrative text.",
                "Credit card",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true,
                Instant.now(),
                Instant.now(),
                0L,
                null
        );
        given(grievanceService.getById(GRIEVANCE_ID)).willReturn(detail);

        mockMvc.perform(get("/api/grievances/{id}", GRIEVANCE_ID)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.narrative").value("Detailed citizen grievance complaint narrative text."))
                .andExpect(jsonPath("$.assignedCategory").value("Credit card"))
                .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    @DisplayName("GET /api/grievances/{id} as REVIEWER returns originalPrediction with full explanation payload")
    void getByIdWithExplanationReturnsFullExplanationContract() throws Exception {
        List<GrievanceDetailResponse.FeatureContribution> posFeatures = List.of(new GrievanceDetailResponse.FeatureContribution("late fee", 0.7500));
        List<GrievanceDetailResponse.FeatureContribution> negFeatures = List.of(new GrievanceDetailResponse.FeatureContribution("loan", -0.3500));
        List<GrievanceDetailResponse.FeatureContribution> diffFeatures = List.of(new GrievanceDetailResponse.FeatureContribution("annual", 0.5500));
        GrievanceDetailResponse.ExplanationSummary expl = new GrievanceDetailResponse.ExplanationSummary(
                "Credit card",
                3.1415,
                0.8500,
                "Debt collection",
                1.2345,
                0.4500,
                1.9070,
                posFeatures,
                negFeatures,
                diffFeatures,
                "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0",
                "2026-11-07T12:00:00Z"
        );
        GrievanceDetailResponse.PredictionSummary pred = new GrievanceDetailResponse.PredictionSummary(
                "Credit card",
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                0.88,
                0.60,
                Map.of("Credit card", 0.88, "Debt collection", 0.12),
                true,
                List.of("Review needed"),
                "HIGH",
                List.of("Fee dispute"),
                -0.45,
                "NEGATIVE",
                Instant.now(),
                expl
        );
        GrievanceDetailResponse detail = new GrievanceDetailResponse(
                GRIEVANCE_ID,
                "Detailed citizen grievance complaint narrative text.",
                "Credit card",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true,
                Instant.now(),
                Instant.now(),
                0L,
                pred
        );
        given(grievanceService.getById(GRIEVANCE_ID)).willReturn(detail);

        mockMvc.perform(get("/api/grievances/{id}", GRIEVANCE_ID)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.originalPrediction.predictedCategory").value("Credit card"))
                .andExpect(jsonPath("$.originalPrediction.explanation.predictedClass").value("Credit card"))
                .andExpect(jsonPath("$.originalPrediction.explanation.predictedDecisionScore").value(3.1415))
                .andExpect(jsonPath("$.originalPrediction.explanation.predictedIntercept").value(0.8500))
                .andExpect(jsonPath("$.originalPrediction.explanation.runnerUpClass").value("Debt collection"))
                .andExpect(jsonPath("$.originalPrediction.explanation.runnerUpDecisionScore").value(1.2345))
                .andExpect(jsonPath("$.originalPrediction.explanation.runnerUpIntercept").value(0.4500))
                .andExpect(jsonPath("$.originalPrediction.explanation.decisionScoreMargin").value(1.9070))
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].feature").value("late fee"))
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].contribution").value(0.7500))
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].tfidfValue").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].coefficient").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction.explanation.topNegativeFeatures[0].feature").value("loan"))
                .andExpect(jsonPath("$.originalPrediction.explanation.topNegativeFeatures[0].contribution").value(-0.3500))
                .andExpect(jsonPath("$.originalPrediction.explanation.topDifferenceFeatures[0].feature").value("annual"))
                .andExpect(jsonPath("$.originalPrediction.explanation.topDifferenceFeatures[0].contribution").value(0.5500))
                .andExpect(jsonPath("$.originalPrediction.explanation.modelProvenanceSha256")
                        .value("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0"))
                .andExpect(jsonPath("$.originalPrediction.explanation.explanationGeneratedAt").value("2026-11-07T12:00:00Z"));
    }

    @Test
    @DisplayName("GET /api/grievances/{id} as CITIZEN role → 403 Forbidden")
    void getByIdCitizenRoleForbidden403() throws Exception {
        mockMvc.perform(get("/api/grievances/{id}", GRIEVANCE_ID)
                        .with(user("citizen").roles("CITIZEN")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Forbidden"));
    }

    @Test
    @DisplayName("POST /api/grievances public submission never exposes explanation or prediction")
    void submitPublicGrievanceNeverExposesExplanation() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "This is a legitimate complaint narrative that meets the character count requirements."
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.explanation").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction").doesNotExist());
    }

    @Test
    @DisplayName("POST /api/grievances/track public tracking never exposes explanation or prediction")
    void trackPublicGrievanceNeverExposesExplanation() throws Exception {
        GrievanceTrackingResponse trackResponse = new GrievanceTrackingResponse(
                GRIEVANCE_ID,
                GrievanceStatus.AUTO_ROUTED,
                "Credit card",
                TriagePriority.LOW,
                Instant.now(),
                Instant.now(),
                List.of(new ConsumerTimelineEvent("AUTOMATED_TRIAGE", GrievanceStatus.AUTO_ROUTED, "Triaged", "Desc", Instant.now()))
        );
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willReturn(trackResponse);

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.referenceId").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.explanation").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction").doesNotExist());
    }

    @Test
    @DisplayName("GET /api/grievances authenticated as REVIEWER does not expose narrative in summary list")
    void listGrievancesDoesNotExposeNarrativeInQueue() throws Exception {
        given(grievanceService.list(any(), any(), any(), any(Integer.class), any(Integer.class)))
                .willReturn(new PageImpl<>(List.of(sampleResponse(GrievanceStatus.PENDING_REVIEW, TriagePriority.HIGH))));

        mockMvc.perform(get("/api/grievances")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.content[0].assignedCategory").value("Credit card"))
                .andExpect(jsonPath("$.content[0].narrative").doesNotExist());
    }

    @Test
    @DisplayName("POST /api/grievances public submission response does not expose narrative")
    void submitGrievanceDoesNotExposeNarrativeInResponse() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "This is a legitimate complaint narrative that meets the character count requirements."
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.narrative").doesNotExist());
    }

    // ─── GET /api/health (public) ─────────────────────────────────────────

    @Test
    @DisplayName("GET /api/health → 200 OK (public, no auth required)")
    void healthPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"));
    }

    // ─── Optimistic Locking Conflict (PATCH /api/grievances/{id}/review) ──

    @Test
    @DisplayName("PATCH /api/grievances/{id}/review — OptimisticLockingFailureException → 409 Conflict without leaking DB details")
    void reviewOptimisticLockingFailure() throws Exception {
        given(grievanceService.review(any(UUID.class), any(ReviewRequest.class)))
                .willThrow(new OptimisticLockingFailureException("Row was updated or deleted by another transaction (or unsaved-value mapping was incorrect)"));

        mockMvc.perform(patch("/api/grievances/{id}/review", GRIEVANCE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE",
                                    "expectedVersion": 0
                                }
                                """)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://civicresolve.ai/errors/conflict"))
                .andExpect(jsonPath("$.title").value("Concurrent Modification Conflict"))
                .andExpect(jsonPath("$.detail").value("The grievance was updated by another transaction. Please refresh and try again."))
                .andExpect(jsonPath("$.detail").value(not(containsString("Row was updated"))))
                .andExpect(jsonPath("$.detail").value(not(containsString("unsaved-value"))));
    }

    @Test
    @DisplayName("PATCH /api/grievances/{id}/review — OptimisticLockException → 409 Conflict without leaking DB details")
    void reviewJakartaOptimisticLockException() throws Exception {
        given(grievanceService.review(any(UUID.class), any(ReviewRequest.class)))
                .willThrow(new OptimisticLockException("Row was updated or deleted by another transaction"));

        mockMvc.perform(patch("/api/grievances/{id}/review", GRIEVANCE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE",
                                    "expectedVersion": 0
                                }
                                """)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://civicresolve.ai/errors/conflict"))
                .andExpect(jsonPath("$.title").value("Concurrent Modification Conflict"))
                .andExpect(jsonPath("$.detail").value("The grievance was updated by another transaction. Please refresh and try again."))
                .andExpect(jsonPath("$.detail").value(not(containsString("Row was updated"))));
    }

    // ─── Browser-level optimistic lock (expectedVersion) ─────────────────

    @Test
    @DisplayName("PATCH /api/grievances/{id}/review — missing expectedVersion → 400 Bad Request")
    void reviewMissingExpectedVersionFailsValidation400() throws Exception {
        mockMvc.perform(patch("/api/grievances/{id}/review", GRIEVANCE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE"
                                }
                                """)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Validation Failed"));
    }

    @Test
    @DisplayName("PATCH /api/grievances/{id}/review — negative expectedVersion → 400 Bad Request")
    void reviewNegativeExpectedVersionFailsValidation400() throws Exception {
        mockMvc.perform(patch("/api/grievances/{id}/review", GRIEVANCE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE",
                                    "expectedVersion": -1
                                }
                                """)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.title").value("Validation Failed"));
    }

    @Test
    @DisplayName("PATCH /api/grievances/{id}/review — valid expectedVersion → 200 OK with updated version in response")
    void reviewValidExpectedVersionReturnsUpdatedVersion() throws Exception {
        GrievanceResponse updated = new GrievanceResponse(
                GRIEVANCE_ID, "Credit card", TriagePriority.HIGH,
                GrievanceStatus.APPROVED, false, Instant.now(), Instant.now(), 1L
        );
        given(grievanceService.review(any(UUID.class), any(ReviewRequest.class)))
                .willReturn(updated);

        mockMvc.perform(patch("/api/grievances/{id}/review", GRIEVANCE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE",
                                    "expectedVersion": 0
                                }
                                """)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    @DisplayName("PATCH /api/grievances/{id}/review — stale expectedVersion → 409 Conflict (browser-level optimistic lock)")
    void reviewStaleExpectedVersionProduces409() throws Exception {
        given(grievanceService.review(any(UUID.class), any(ReviewRequest.class)))
                .willThrow(new StaleGrievanceVersionException(GRIEVANCE_ID, 0L, 1L));

        mockMvc.perform(patch("/api/grievances/{id}/review", GRIEVANCE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE",
                                    "expectedVersion": 0
                                }
                                """)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://civicresolve.ai/errors/conflict"))
                .andExpect(jsonPath("$.title").value("Concurrent Modification Conflict"))
                .andExpect(jsonPath("$.status").value(409));
    }

    // ─── Custom JSON 401 body (no WWW-Authenticate header) ────────────────

    @Test
    @DisplayName("GET /api/grievances — unauthenticated returns 401 JSON ProblemDetail without WWW-Authenticate header")
    void listGrievancesUnauthenticatedReturnsJsonProblemDetail() throws Exception {
        mockMvc.perform(get("/api/grievances"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.title").value("Unauthorized"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().doesNotExist("WWW-Authenticate"));
    }

    // ─── CORS & Origin Validation Tests ──────────────────────────────────────

    @Test
    @DisplayName("POST /api/grievances with Origin http://localhost:3000 succeeds with 201 and Access-Control-Allow-Origin")
    void submitWithPort3000OriginSucceeds() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .header("Origin", "http://localhost:3000")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute but got no response."
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"));
    }

    @Test
    @DisplayName("OPTIONS /api/grievances preflight from http://localhost:3000 is allowed and advertises POST")
    void optionsPreflightFromPort3000Allowed() throws Exception {
        mockMvc.perform(options("/api/grievances")
                        .header("Origin", "http://localhost:3000")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(header().string("Access-Control-Allow-Methods", containsString("POST")));
    }

    @Test
    @DisplayName("POST /api/grievances with Origin http://127.0.0.1:3000 succeeds with 201 and Access-Control-Allow-Origin")
    void submitWithLoopbackPort3000OriginSucceeds() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .header("Origin", "http://127.0.0.1:3000")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute but got no response."
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:3000"))
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"));
    }

    @Test
    @DisplayName("POST /api/grievances with Origin http://localhost:3001 succeeds with 201 and Access-Control-Allow-Origin")
    void submitWithPort3001OriginSucceeds() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .header("Origin", "http://localhost:3001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute but got no response."
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3001"))
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"));
    }

    @Test
    @DisplayName("OPTIONS /api/grievances preflight from http://localhost:3001 is allowed and advertises POST")
    void optionsPreflightFromPort3001Allowed() throws Exception {
        mockMvc.perform(options("/api/grievances")
                        .header("Origin", "http://localhost:3001")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3001"))
                .andExpect(header().string("Access-Control-Allow-Methods", containsString("POST")));
    }

    @Test
    @DisplayName("POST /api/grievances with Origin http://127.0.0.1:3001 succeeds with 201 and Access-Control-Allow-Origin")
    void submitWithLoopbackPort3001OriginSucceeds() throws Exception {
        given(grievanceService.submit(any(GrievanceRequest.class)))
                .willReturn(sampleSubmissionResponse(GrievanceStatus.AUTO_ROUTED, TriagePriority.LOW));

        mockMvc.perform(post("/api/grievances")
                        .header("Origin", "http://127.0.0.1:3001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute but got no response."
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:3001"))
                .andExpect(jsonPath("$.id").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"));
    }

    @Test
    @DisplayName("POST /api/grievances with untrusted Origin is rejected with 403 Forbidden")
    void submitWithUntrustedOriginRejected() throws Exception {
        mockMvc.perform(post("/api/grievances")
                        .header("Origin", "http://malicious-site.example.com")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "description": "I noticed multiple unauthorized inquiry items on my Equifax credit report from a collection agency I have never heard of. I submitted a formal dispute but got no response."
                            }
                            """))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("GET /api/grievances/stats from http://localhost:3000 without credentials returns 401 Unauthorized")
    void reviewerStatsEndpointRemainsProtected() throws Exception {
        mockMvc.perform(get("/api/grievances/stats")
                        .header("Origin", "http://localhost:3000"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    @DisplayName("GET /api/grievances/stats authenticated as REVIEWER returns 200 OK and accurate statistics breakdown")
    void getStatsAuthenticatedAsReviewerReturns200() throws Exception {
        GrievanceStatsResponse stats = new GrievanceStatsResponse(
                12L,
                Map.of("PENDING_REVIEW", 5L, "AUTO_ROUTED", 4L, "APPROVED", 2L, "OVERRIDDEN", 1L, "REJECTED", 0L),
                Map.of("LOW", 4L, "MEDIUM", 4L, "HIGH", 3L, "CRITICAL", 1L),
                5L
        );
        given(grievanceService.getStats()).willReturn(stats);

        mockMvc.perform(get("/api/grievances/stats")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(12))
                .andExpect(jsonPath("$.pendingReview").value(5))
                .andExpect(jsonPath("$.byStatus.PENDING_REVIEW").value(5))
                .andExpect(jsonPath("$.byStatus.AUTO_ROUTED").value(4))
                .andExpect(jsonPath("$.byPriority.HIGH").value(3))
                .andExpect(jsonPath("$.byPriority.CRITICAL").value(1));
    }

    @Test
    @DisplayName("GET /api/grievances/stats with non-reviewer role returns 403 Forbidden")
    void getStatsWithNonReviewerRoleReturns403() throws Exception {
        mockMvc.perform(get("/api/grievances/stats")
                        .with(user("citizen").roles("CITIZEN")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Forbidden"));
    }

    // ─── POST /api/grievances/track (public anonymous) ─────────────────────

    @Test
    @DisplayName("POST /api/grievances/track with valid credentials returns 200 and sanitized timeline")
    void trackValidCredentialsReturns200() throws Exception {
        GrievanceTrackingResponse response = new GrievanceTrackingResponse(
                GRIEVANCE_ID,
                GrievanceStatus.AUTO_ROUTED,
                "Credit card",
                TriagePriority.LOW,
                Instant.parse("2026-11-04T12:00:00Z"),
                Instant.parse("2026-11-04T12:00:00Z"),
                List.of(
                        new ConsumerTimelineEvent("AUTOMATED_TRIAGE", GrievanceStatus.AUTO_ROUTED,
                                "Automated Triage Complete", "Complaint processed by automated routing.",
                                Instant.parse("2026-11-04T12:00:00Z"))
                )
        );
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willReturn(response);

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.referenceId").value(GRIEVANCE_ID.toString()))
                .andExpect(jsonPath("$.assignedCategory").value("Credit card"))
                .andExpect(jsonPath("$.status").value("AUTO_ROUTED"))
                .andExpect(jsonPath("$.timeline[0].stage").value("AUTOMATED_TRIAGE"));
    }

    @Test
    @DisplayName("POST /api/grievances/track with malformed UUID returns 400 ProblemDetail")
    void trackMalformedUuidReturns400() throws Exception {
        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "not-a-valid-uuid",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Malformed Request"));
    }

    @Test
    @DisplayName("POST /api/grievances/track with missing required fields returns 400 ProblemDetail")
    void trackMissingRequiredFieldsReturns400() throws Exception {
        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": null,
                                "trackingSecret": null
                            }
                            """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Validation Failed"));
    }

    @Test
    @DisplayName("POST /api/grievances/track with service throwing InvalidTrackingSecretFormatException returns 400")
    void trackServiceThrowsInvalidFormatReturns400() throws Exception {
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willThrow(new InvalidTrackingSecretFormatException("Invalid tracking secret format"));

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid Tracking Secret Format"));
    }

    @Test
    @DisplayName("POST /api/grievances/track with wrong secret or unknown ID returns 404 ProblemDetail")
    void trackInvalidCredentialsReturns404() throws Exception {
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willThrow(new TrackingNotFoundException());

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Grievance Not Found"))
                .andExpect(jsonPath("$.detail").value("No complaint matches the provided reference ID and tracking secret."));
    }

    @Test
    @DisplayName("POST /api/grievances/track with IP rate limit exceeded returns 429 ProblemDetail")
    void trackIpRateLimitExceededReturns429() throws Exception {
        given(trackingRateLimiter.checkIpRateLimit(any()))
                .willReturn(TrackingRateLimiter.RateLimitResult.rateLimited("Too many tracking requests from this IP address. Please try again later."));

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Too Many Requests"))
                .andExpect(jsonPath("$.detail").value("Too many requests. Please try again later."));
    }

    @Test
    @DisplayName("POST /api/grievances/track with malformed payload is blocked with 429 when IP rate limit is exceeded")
    void trackMalformedPayloadBlockedByRateLimiting() throws Exception {
        given(trackingRateLimiter.checkIpRateLimit(any()))
                .willReturn(TrackingRateLimiter.RateLimitResult.rateLimited(
                        "IP request velocity exceeded. Maximum 10 requests per minute allowed."));

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "not-a-valid-uuid",
                                "trackingSecret": "invalid_secret"
                            }
                            """))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.title").value("Too Many Requests"))
                .andExpect(jsonPath("$.detail").value("Too many requests. Please try again later."));
    }

    @Test
    @DisplayName("POST /api/grievances/track strictly ignores X-Forwarded-For and X-Real-IP header spoofing")
    void trackIgnoresForwardingHeadersForRateLimiting() throws Exception {
        GrievanceTrackingResponse response = new GrievanceTrackingResponse(
                GRIEVANCE_ID,
                GrievanceStatus.AUTO_ROUTED,
                "Credit card",
                TriagePriority.LOW,
                Instant.now(),
                Instant.now(),
                List.of()
        );
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willReturn(response);

        mockMvc.perform(post("/api/grievances/track")
                        .with(request -> {
                            request.setRemoteAddr("198.51.100.22");
                            return request;
                        })
                        .header("X-Forwarded-For", "203.0.113.195")
                        .header("X-Real-IP", "203.0.113.196")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isOk());

        verify(trackingRateLimiter).checkIpRateLimit("198.51.100.22");
        verify(trackingRateLimiter, never()).checkIpRateLimit("203.0.113.195");
        verify(trackingRateLimiter, never()).checkIpRateLimit("203.0.113.196");
    }

    @Test
    @DisplayName("POST /api/grievances/track with reference lockout returns 429 ProblemDetail")
    void trackReferenceLockoutReturns429() throws Exception {
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willThrow(new RateLimitExceededException("Too many failed lookup attempts for this reference ID. Lookup is locked for 15 minutes."));

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Too Many Requests"))
                .andExpect(jsonPath("$.detail").value("Too many requests. Please try again later."));
    }

    @Test
    @DisplayName("POST /api/grievances/track allows anonymous access without auth credentials")
    void trackAllowsAnonymousAccess() throws Exception {
        GrievanceTrackingResponse response = new GrievanceTrackingResponse(
                GRIEVANCE_ID,
                GrievanceStatus.AUTO_ROUTED,
                "Credit card",
                TriagePriority.LOW,
                Instant.now(),
                Instant.now(),
                List.of()
        );
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willReturn(response);

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("Test O — Both 429 response paths return generic problem details (Path 1: Perimeter filter)")
    void testO_perimeterFilterReturnsGenericProblemDetails() throws Exception {
        // Simulate capacity-saturated rate-limit result at the perimeter filter
        given(trackingRateLimiter.checkIpRateLimit(any()))
                .willReturn(TrackingRateLimiter.RateLimitResult.capacitySaturated(
                        "Tracking rate limiting capacity reached. Please wait before retrying."));

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.title").value("Too Many Requests"))
                .andExpect(jsonPath("$.detail").value("Too many requests. Please try again later."))
                // SECURITY: capacitySaturated and internal rejection reasons must NOT appear in the public response body
                .andExpect(content().string(not(containsString("capacitySaturated"))))
                .andExpect(content().string(not(containsString("Tracking rate limiting capacity reached"))));
    }

    @Test
    @DisplayName("Test O — Both 429 response paths return generic problem details (Path 2: Service-layer exception)")
    void testO_serviceLayerExceptionReturnsGenericProblemDetails() throws Exception {
        given(grievanceTrackingService.track(any(GrievanceTrackRequest.class), any()))
                .willThrow(new RateLimitExceededException("Tracking rate limiting capacity reached. Please wait before retrying.", true));

        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {
                                "referenceId": "00000000-0000-0000-0000-000000000001",
                                "trackingSecret": "trk_testsecret1234567890abcdef1234567890abcdef"
                            }
                            """))
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.title").value("Too Many Requests"))
                .andExpect(jsonPath("$.detail").value("Too many requests. Please try again later."))
                .andExpect(content().string(not(containsString("capacitySaturated"))))
                .andExpect(content().string(not(containsString("Tracking rate limiting capacity reached"))));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/model-audit unauthenticated → 401")
    void modelAuditUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances/analytics/model-audit"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/model-audit as REVIEWER → 200 with metrics")
    void modelAuditAsReviewerReturnsMetrics() throws Exception {
        ModelAuditResponse response = new ModelAuditResponse(
                42L,
                0.8810,
                Map.of("Credit card", 5L),
                Map.of("Credit card", Map.of("Credit card", 37L, "Debt collection", 5L)),
                Map.of("LOW_CONFIDENCE", 8L, "SMALL_MARGIN", 4L, "CRITICAL_PRIORITY_POLICY", 2L, "AUTO_ROUTED", 30L)
        );
        given(grievanceService.getModelAuditAnalytics()).willReturn(response);

        mockMvc.perform(get("/api/grievances/analytics/model-audit")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalAdjudicated").value(42))
                .andExpect(jsonPath("$.reviewerAgreementRate").value(0.8810))
                .andExpect(jsonPath("$.categoryOverrideDistribution['Credit card']").value(5))
                .andExpect(jsonPath("$.triggerBreakdown.LOW_CONFIDENCE").value(8));
    }

    @Test
    @DisplayName("POST /api/grievances/preview-classify unauthenticated → 401")
    void previewClassifyUnauthenticated() throws Exception {
        mockMvc.perform(post("/api/grievances/preview-classify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"This is a test complaint narrative with sufficient length for classification.\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/grievances/preview-classify with short text → 400 Bad Request")
    void previewClassifyShortTextReturnsBadRequest() throws Exception {
        mockMvc.perform(post("/api/grievances/preview-classify")
                        .with(user("reviewer").roles("REVIEWER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"Too short\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /api/grievances/preview-classify as REVIEWER → 200 with PredictionSummary")
    void previewClassifyAsReviewerReturnsPredictionSummary() throws Exception {
        GrievanceDetailResponse.PredictionSummary summary = new GrievanceDetailResponse.PredictionSummary(
                "Mortgage",
                "baseline_tfidf_logreg",
                "v1.0",
                0.9123,
                0.4567,
                Map.of("Mortgage", 0.9123, "Debt collection", 0.0877),
                false,
                List.of(),
                "CRITICAL",
                List.of("Foreclosure keywords"),
                -0.65,
                "NEGATIVE",
                Instant.now(),
                null
        );
        given(grievanceService.previewClassify(anyString())).willReturn(summary);

        mockMvc.perform(post("/api/grievances/preview-classify")
                        .with(user("reviewer").roles("REVIEWER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"My mortgage company initiated an unlawful foreclosure proceeding against my home without proper notice.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.predictedCategory").value("Mortgage"))
                .andExpect(jsonPath("$.confidence").value(0.9123))
                .andExpect(jsonPath("$.triagePriority").value("CRITICAL"));
    }

    @Test
    @DisplayName("GET /api/grievances/{id} returns auditHistory array in response")
    void getByIdReturnsAuditHistory() throws Exception {
        GrievanceDetailResponse.AuditHistoryItem item = new GrievanceDetailResponse.AuditHistoryItem(
                1L,
                "system",
                "SUBMIT",
                null,
                GrievanceStatus.PENDING_REVIEW,
                null,
                "Debt collection",
                null,
                "HIGH",
                "Initial automated intake",
                Instant.now()
        );
        GrievanceDetailResponse detail = new GrievanceDetailResponse(
                GRIEVANCE_ID,
                "Detailed citizen grievance complaint narrative text.",
                "Debt collection",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true,
                Instant.now(),
                Instant.now(),
                1L,
                null,
                List.of(item)
        );
        given(grievanceService.getById(GRIEVANCE_ID)).willReturn(detail);

        mockMvc.perform(get("/api/grievances/{id}", GRIEVANCE_ID)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.auditHistory[0].actor").value("system"))
                .andExpect(jsonPath("$.auditHistory[0].action").value("SUBMIT"))
                .andExpect(jsonPath("$.auditHistory[0].newStatus").value("PENDING_REVIEW"));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/overview unauthenticated → 401")
    void executiveAnalyticsUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances/analytics/overview"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/overview as REVIEWER → 200 with ExecutiveAnalyticsResponse")
    void executiveAnalyticsAsReviewerReturnsTelemetry() throws Exception {
        ExecutiveAnalyticsResponse response = new ExecutiveAnalyticsResponse(
                100L, 20L, 50L, 30L, 0.50, 0.95,
                Map.of("HIGH", 25L),
                Map.of("PENDING_REVIEW", 20L),
                List.of(new ExecutiveAnalyticsResponse.CategoryVolumePriority(
                        "Credit card", 25L, 5L, 10L, 5L, 5L, 12L, 5L, 6L, 2L, 0L
                )),
                new ExecutiveAnalyticsResponse.ConfidenceSentimentBuckets(10L, 20L, 40L, 30L, 15L, 85L, 75L, 20L, 5L),
                List.of(new ExecutiveAnalyticsResponse.DailyIntakeTrendPoint("Nov 01", 10L, 5L, 3L)),
                new ExecutiveAnalyticsResponse.SlaAgingBreakdown(18L, 2L, 0L, 20L)
        );
        given(grievanceService.getExecutiveAnalytics()).willReturn(response);

        mockMvc.perform(get("/api/grievances/analytics/overview")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalComplaints").value(100))
                .andExpect(jsonPath("$.pendingReview").value(20))
                .andExpect(jsonPath("$.autoRoutingEfficiencyRate").value(0.50))
                .andExpect(jsonPath("$.categoryVolumeMatrix[0].category").value("Credit card"))
                .andExpect(jsonPath("$.confidenceSentimentBuckets.confidenceUnder55").value(10));
    }

    @Test
    @DisplayName("POST /api/grievances/analytics/seed-demo as REVIEWER → 200 with seeded count")
    void seedDemoDataAsReviewer() throws Exception {
        given(grievanceService.seedRealisticDemoTelemetry(true))
                .willReturn(new ai.civicresolve.backend.service.DemoDataSeederService.SeedResult(32, false, "Success"));

        mockMvc.perform(post("/api/grievances/analytics/seed-demo?confirm=true")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.recordsCreated").value(32));
    }

    @Test
    @DisplayName("POST /api/grievances/compare-models unauthenticated → 401")
    void compareModelsUnauthenticated() throws Exception {
        mockMvc.perform(post("/api/grievances/compare-models")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"This is a test narrative comparing models with sufficient length.\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("POST /api/grievances/compare-models as REVIEWER → 200 with comparison")
    void compareModelsAsReviewer() throws Exception {
        ai.civicresolve.backend.dto.ModelInferenceSummary base = new ai.civicresolve.backend.dto.ModelInferenceSummary(
                "TF-IDF + Logistic Regression", "linear_tfidf", "sha1", "Credit card", 0.95, 0.40, Map.of("Credit card", 0.95), 12.0, 15, false
        );
        ai.civicresolve.backend.dto.ModelInferenceSummary bilstm = new ai.civicresolve.backend.dto.ModelInferenceSummary(
                "BiLSTMClassifier", "neural_bilstm", "sha2", "Credit card", 0.92, 0.35, Map.of("Credit card", 0.92), 35.0, 25, false
        );
        ai.civicresolve.backend.dto.DualModelComparisonResponse response = new ai.civicresolve.backend.dto.DualModelComparisonResponse(
                base, bilstm, true, 0.03, "Disclaimer"
        );
        given(grievanceService.compareModels(any())).willReturn(response);

        mockMvc.perform(post("/api/grievances/compare-models")
                        .with(user("reviewer").roles("REVIEWER"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"This is a test narrative comparing models with sufficient length.\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.models_agree").value(true))
                .andExpect(jsonPath("$.baseline.predicted_category").value("Credit card"))
                .andExpect(jsonPath("$.bilstm.predicted_category").value("Credit card"));
    }

    @Test
    @DisplayName("GET /api/grievances/{id}/precedents unauthenticated → 401")
    void getPrecedentsUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances/" + UUID.randomUUID() + "/precedents"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/{id}/precedents as REVIEWER → 200 with precedents")
    void getPrecedentsAsReviewer() throws Exception {
        UUID id = UUID.randomUUID();
        ai.civicresolve.backend.dto.SemanticPrecedentResponse response = new ai.civicresolve.backend.dto.SemanticPrecedentResponse(
                id,
                10,
                List.of(new ai.civicresolve.backend.dto.SemanticPrecedentResponse.Item(
                        UUID.randomUUID(),
                        0.8523,
                        "Lexical TF-IDF Cosine Similarity",
                        "Credit card",
                        "Credit card",
                        "APPROVED",
                        "Sanitized snippet without PII...",
                        "2026-11-08T10:00:00Z"
                ))
        );
        given(grievanceService.getPrecedents(eq(id))).willReturn(response);

        mockMvc.perform(get("/api/grievances/" + id + "/precedents")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.candidatesEvaluated").value(10))
                .andExpect(jsonPath("$.precedents[0].similarityMetric").value("Lexical TF-IDF Cosine Similarity"))
                .andExpect(jsonPath("$.precedents[0].similarityScore").value(0.8523));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/calibration unauthenticated → 401")
    void getCalibrationUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances/analytics/calibration"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/calibration as REVIEWER → 200 with metrics")
    void getCalibrationAsReviewer() throws Exception {
        ai.civicresolve.backend.dto.CalibrationMetricsResponse response = new ai.civicresolve.backend.dto.CalibrationMetricsResponse(
                "val.csv (50/50 Stratified Split, random_state=42)",
                "2026-11-09T19:00:00Z",
                12726,
                6363,
                6363,
                0.7866,
                0.0609,
                0.0306,
                49.75,
                0.1999,
                0.0814,
                0.2590,
                0.2512,
                3.01,
                List.of(),
                List.of(),
                "Disclaimer"
        );
        given(grievanceService.getCalibrationMetrics()).willReturn(response);

        mockMvc.perform(get("/api/grievances/analytics/calibration")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.optimal_temperature").value(0.7866))
                .andExpect(jsonPath("$.uncalibrated_ece").value(0.0609))
                .andExpect(jsonPath("$.calibrated_ece").value(0.0306));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/active-learning-export unauthenticated → 401")
    void activeLearningExportUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/grievances/analytics/active-learning-export"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/active-learning-export as REVIEWER (manifest format) → 200")
    void activeLearningExportManifest() throws Exception {
        ai.civicresolve.backend.dto.ActiveLearningRecord record = new ai.civicresolve.backend.dto.ActiveLearningRecord(
                UUID.randomUUID(),
                "Masked narrative text with [SSN-REDACTED]",
                "Credit card",
                "Debt collection",
                "OVERRIDDEN",
                "HIGH",
                true,
                Instant.now(),
                Instant.now()
        );
        given(grievanceService.exportActiveLearning(false)).willReturn(List.of(record));

        mockMvc.perform(get("/api/grievances/analytics/active-learning-export?format=manifest")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recordCount").value(1))
                .andExpect(jsonPath("$.overrideCount").value(1))
                .andExpect(jsonPath("$.sha256Digest").isNotEmpty())
                .andExpect(jsonPath("$.sampleRecords[0].isOverride").value(true));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/active-learning-export as REVIEWER (jsonl format) → 200 with SHA header")
    void activeLearningExportJsonl() throws Exception {
        ai.civicresolve.backend.dto.ActiveLearningRecord record = new ai.civicresolve.backend.dto.ActiveLearningRecord(
                UUID.randomUUID(),
                "Masked narrative text",
                "Mortgage",
                "Mortgage",
                "APPROVED",
                "LOW",
                false,
                Instant.now(),
                Instant.now()
        );
        given(grievanceService.exportActiveLearning(false)).willReturn(List.of(record));

        mockMvc.perform(get("/api/grievances/analytics/active-learning-export?format=jsonl")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Export-SHA256"))
                .andExpect(header().string("X-Export-Record-Count", "1"))
                .andExpect(header().string("X-Export-Override-Count", "0"));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/active-learning-export as REVIEWER (csv format) → 200 with CSV content")
    void activeLearningExportCsv() throws Exception {
        ai.civicresolve.backend.dto.ActiveLearningRecord record = new ai.civicresolve.backend.dto.ActiveLearningRecord(
                UUID.randomUUID(),
                "Masked narrative text with, commas and \"quotes\"",
                "Credit card",
                "Credit card",
                "APPROVED",
                "MEDIUM",
                false,
                Instant.now(),
                Instant.now()
        );
        given(grievanceService.exportActiveLearning(false)).willReturn(List.of(record));

        mockMvc.perform(get("/api/grievances/analytics/active-learning-export?format=csv")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Export-SHA256"))
                .andExpect(header().string("Content-Type", "text/csv; charset=UTF-8"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("masked_narrative")));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/system-status as REVIEWER → 200 OK with telemetry payload")
    void getSystemStatus_asReviewer_returns200() throws Exception {
        ai.civicresolve.backend.dto.SystemStatusResponse response =
                new ai.civicresolve.backend.dto.SystemStatusResponse(
                        "UP",
                        "V6",
                        true,
                        12.5,
                        "baseline_tfidf_logreg",
                        Instant.parse("2026-11-10T12:00:00Z"),
                        true
                );
        given(grievanceService.getSystemStatus()).willReturn(response);

        mockMvc.perform(get("/api/grievances/analytics/system-status")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.backendStatus").value("UP"))
                .andExpect(jsonPath("$.databaseSchemaVersion").value("V6"))
                .andExpect(jsonPath("$.nlpServiceReachable").value(true))
                .andExpect(jsonPath("$.activeModelName").value("baseline_tfidf_logreg"))
                .andExpect(jsonPath("$.demoBatchSeeded").value(true));
    }

    @Test
    @DisplayName("GET /api/grievances/analytics/system-status unauthenticated → 401 Unauthorized")
    void getSystemStatus_unauthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/grievances/analytics/system-status"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("GET /api/grievances with search param delegates to search service overload")
    void listGrievances_withSearch_delegatesToService() throws Exception {
        given(grievanceService.list(any(), any(), any(), eq("credit"), eq(0), eq(20)))
                .willReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/api/grievances?search=credit")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("POST /api/grievances/analytics/seed-demo without confirmation → 400 Bad Request")
    void seedDemoData_withoutConfirm_returns400() throws Exception {
        mockMvc.perform(post("/api/grievances/analytics/seed-demo")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value("error"))
                .andExpect(jsonPath("$.message").value(containsString("Seeding confirmation required")));
    }

    @Test
    @DisplayName("POST /api/grievances/analytics/seed-demo with confirm=true → 200 OK")
    void seedDemoData_withConfirm_returns200() throws Exception {
        given(grievanceService.seedRealisticDemoTelemetry(true))
                .willReturn(new ai.civicresolve.backend.service.DemoDataSeederService.SeedResult(32, false, "Success"));

        mockMvc.perform(post("/api/grievances/analytics/seed-demo?confirm=true")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("success"))
                .andExpect(jsonPath("$.recordsCreated").value(32))
                .andExpect(jsonPath("$.alreadySeeded").value(false));
    }
}
