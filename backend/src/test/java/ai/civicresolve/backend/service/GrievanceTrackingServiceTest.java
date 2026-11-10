package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.ConsumerTimelineEvent;
import ai.civicresolve.backend.dto.GrievanceTrackRequest;
import ai.civicresolve.backend.dto.GrievanceTrackingResponse;
import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.GrievanceTrackingCredential;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.exception.InvalidTrackingSecretFormatException;
import ai.civicresolve.backend.exception.RateLimitExceededException;
import ai.civicresolve.backend.exception.TrackingNotFoundException;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Unit tests for {@link GrievanceTrackingService}.
 *
 * <p>Verifies:
 * <ul>
 *   <li>Successful complaint tracking and sanitized timeline projection</li>
 *   <li>AUTO_ROUTED vs PENDING_REVIEW initial intake representation</li>
 *   <li>Appropriate redaction of reviewer notes, actor usernames, and internal scores</li>
 *   <li>Allowlist mapping of review actions and fallback for unknown actions</li>
 *   <li>Uniform 404 behavior and best-effort dummy hash workload execution</li>
 *   <li>Dual-tier rate limiting enforcement (IP velocity and reference lockout)</li>
 *   <li>Format validation and fail-closed saturation handling</li>
 *   <li>Metadata update semantics (lookup count incremented only on success)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GrievanceTrackingService — unit tests")
class GrievanceTrackingServiceTest {

    @Mock
    private GrievanceRepository grievanceRepository;

    @Mock
    private GrievanceTrackingCredentialRepository trackingCredentialRepository;

    @Mock
    private AuditLogRepository auditLogRepository;

    @Mock
    private TrackingCryptoService trackingCryptoService;

    @Mock
    private TrackingRateLimiter trackingRateLimiter;

    @InjectMocks
    private GrievanceTrackingService grievanceTrackingService;

    private static final UUID GRIEVANCE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String VALID_SECRET = "trk_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final String STORED_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    private static final String STORED_SALT = "0123456789abcdef0123456789abcdef";
    private static final String CLIENT_IP = "192.168.1.50";

    private Grievance sampleGrievance;
    private GrievanceTrackingCredential sampleCredential;

    @BeforeEach
    void setUp() {
        sampleGrievance = new Grievance(
                "My complaint narrative with sensitive consumer information.",
                "Credit card",
                TriagePriority.LOW,
                GrievanceStatus.AUTO_ROUTED,
                false
        );
        setId(sampleGrievance, GRIEVANCE_ID);

        sampleCredential = new GrievanceTrackingCredential(GRIEVANCE_ID, STORED_HASH, STORED_SALT);

        lenient().when(trackingRateLimiter.reserveReferenceAttempt(any()))
                .thenReturn(TrackingRateLimiter.ReferenceAttemptReservation.allowedNoOp());
    }

    private void setId(Grievance grievance, UUID id) {
        try {
            Field idField = Grievance.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(grievance, id);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // ─── Happy Path & Timeline Projection Tests ─────────────────────────────

    @Test
    @DisplayName("track — valid credentials returns sanitized tracking response and projects timeline")
    void trackValidCredentialsReturnsSanitizedResponse() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        AuditLog auditSubmit = AuditLog.builder(sampleGrievance, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.AUTO_ROUTED)
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(auditSubmit));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        assertThat(response).isNotNull();
        assertThat(response.referenceId()).isEqualTo(GRIEVANCE_ID);
        assertThat(response.status()).isEqualTo(GrievanceStatus.AUTO_ROUTED);
        assertThat(response.assignedCategory()).isEqualTo("Credit card");
        assertThat(response.priority()).isEqualTo(TriagePriority.LOW);
        assertThat(response.timeline()).hasSize(1);

        ConsumerTimelineEvent event = response.timeline().get(0);
        assertThat(event.stage()).isEqualTo("AUTOMATED_TRIAGE");
        assertThat(event.status()).isEqualTo(GrievanceStatus.AUTO_ROUTED);
        assertThat(event.title()).isEqualTo("Automated Triage Complete");
        assertThat(event.description()).contains("automatically classified by our intake system");
        // Verify no bank or resolution claim — AUTO_ROUTED does not mean the complaint is resolved
        assertThat(event.description()).doesNotContain("bank");
        assertThat(event.description()).doesNotContain("resolved");
        assertThat(event.description()).doesNotContain("Specialist intervention was not required");

        // Verify successful lookup reserves attempt and does NOT invoke duplicate resetReferenceFailure
        verify(trackingRateLimiter).reserveReferenceAttempt(GRIEVANCE_ID);
        verify(trackingRateLimiter, never()).resetReferenceFailure(any());
        verify(trackingCredentialRepository).incrementLookupCount(eq(GRIEVANCE_ID), any(Instant.class));
    }

    @Test
    @DisplayName("track — initial SUBMIT with PENDING_REVIEW projects SUBMITTED stage")
    void trackInitialSubmitPendingReviewProjectsSubmitted() {
        Grievance pendingGrievance = new Grievance(
                "Mortgage issue requiring specialist review",
                "Mortgage",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true
        );
        setId(pendingGrievance, GRIEVANCE_ID);

        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(pendingGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        AuditLog auditSubmit = AuditLog.builder(pendingGrievance, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(auditSubmit));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        assertThat(response.timeline()).hasSize(1);
        ConsumerTimelineEvent event = response.timeline().get(0);
        assertThat(event.stage()).isEqualTo("SUBMITTED");
        assertThat(event.status()).isEqualTo(GrievanceStatus.PENDING_REVIEW);
        assertThat(event.title()).isEqualTo("Complaint Received");
        assertThat(event.description()).contains("queued for specialist review");
    }

    @Test
    @DisplayName("track — review actions APPROVE, OVERRIDE, REJECT project appropriately and redact sensitive data")
    void trackReviewActionsProjectAppropriatelyAndRedactSensitiveData() {
        Grievance grievance = new Grievance(
                "Original narrative",
                "Personal loan",
                TriagePriority.MEDIUM,
                GrievanceStatus.APPROVED,
                false
        );
        setId(grievance, GRIEVANCE_ID);

        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(grievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        AuditLog log1 = AuditLog.builder(grievance, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .build();
        AuditLog log2 = AuditLog.builder(grievance, "reviewer_bob", "OVERRIDE")
                .previousStatus(GrievanceStatus.PENDING_REVIEW)
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .previousCategory("Credit card")
                .newCategory("Personal loan")
                .reviewNote("Customer actually has an unsecured personal loan. Overriding AI model output.")
                .build();
        AuditLog log3 = AuditLog.builder(grievance, "reviewer_alice", "APPROVE")
                .previousStatus(GrievanceStatus.PENDING_REVIEW)
                .newStatus(GrievanceStatus.APPROVED)
                .reviewNote("Approved by senior reviewer.")
                .build();
        AuditLog log4 = AuditLog.builder(grievance, "reviewer_charlie", "REJECT")
                .previousStatus(GrievanceStatus.PENDING_REVIEW)
                .newStatus(GrievanceStatus.REJECTED)
                .reviewNote("Ineligible complaint category.")
                .build();

        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(log1, log2, log3, log4));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        assertThat(response.timeline()).hasSize(4);

        // Event 1: SUBMIT
        assertThat(response.timeline().get(0).stage()).isEqualTo("SUBMITTED");

        // Event 2: OVERRIDE
        ConsumerTimelineEvent overrideEvent = response.timeline().get(1);
        assertThat(overrideEvent.stage()).isEqualTo("REVIEW_OVERRIDDEN");
        assertThat(overrideEvent.title()).isEqualTo("Classification Adjusted");
        assertThat(overrideEvent.description()).isEqualTo("A specialist reviewed the complaint and adjusted the classification details.");
        // Crucial: check redaction
        assertThat(overrideEvent.description()).doesNotContain("reviewer_bob");
        assertThat(overrideEvent.description()).doesNotContain("Customer actually has an unsecured personal loan");
        assertThat(overrideEvent.description()).doesNotContain("AI model");

        // Event 3: APPROVE
        ConsumerTimelineEvent approveEvent = response.timeline().get(2);
        assertThat(approveEvent.stage()).isEqualTo("REVIEW_APPROVED");
        assertThat(approveEvent.title()).isEqualTo("Review Approved");
        assertThat(approveEvent.description()).isEqualTo("A specialist reviewed and approved the intake classification.");
        assertThat(approveEvent.description()).doesNotContain("reviewer_alice");
        assertThat(approveEvent.description()).doesNotContain("senior reviewer");

        // Event 4: REJECT
        ConsumerTimelineEvent rejectEvent = response.timeline().get(3);
        assertThat(rejectEvent.stage()).isEqualTo("REVIEW_REJECTED");
        assertThat(rejectEvent.title()).isEqualTo("Complaint Rejected");
        assertThat(rejectEvent.description()).isEqualTo("A specialist reviewed the complaint and determined it could not be processed under current intake criteria.");
        assertThat(rejectEvent.description()).doesNotContain("reviewer_charlie");
        assertThat(rejectEvent.description()).doesNotContain("Ineligible complaint category");
    }

    @Test
    @DisplayName("track — unknown or custom audit action maps to safe generic STATUS_UPDATE stage")
    void trackUnknownAuditActionMapsToGenericStatusUpdate() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        AuditLog customLog = AuditLog.builder(sampleGrievance, "admin_user", "CUSTOM_INTERNAL_FLAG")
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .reviewNote("Internal security flag raised")
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(customLog));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        assertThat(response.timeline()).hasSize(1);
        ConsumerTimelineEvent event = response.timeline().get(0);
        assertThat(event.stage()).isEqualTo("STATUS_UPDATE");
        assertThat(event.title()).isEqualTo("Status Updated");
        assertThat(event.description()).isEqualTo("The complaint record was updated.");
        assertThat(event.description()).doesNotContain("CUSTOM_INTERNAL_FLAG");
        assertThat(event.description()).doesNotContain("admin_user");
        assertThat(event.description()).doesNotContain("security flag");
    }

    @Test
    @DisplayName("track — non-SUBMIT audit log with null newStatus is omitted from timeline without fabricating state")
    void trackAuditLogWithNullNewStatusOmittedFromTimeline() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        AuditLog submitLog = AuditLog.builder(sampleGrievance, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .build();
        // Administrative event with null newStatus (e.g. internal action that didn't change grievance status)
        AuditLog nullStatusLog = AuditLog.builder(sampleGrievance, "admin", "INTERNAL_NOTE_ATTACHED")
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(submitLog, nullStatusLog));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        // Only the valid SUBMIT event appears; the null-status internal event is safely excluded
        assertThat(response.timeline()).hasSize(1);
        assertThat(response.timeline().get(0).stage()).isEqualTo("SUBMITTED");
    }

    // ─── Security, Uniform 404 & Timing Equalization Tests ──────────────────

    @Test
    @DisplayName("track — missing grievance throws 404, executes dummy hash workload, and does NOT allocate reference bucket")
    void trackMissingGrievanceThrows404AndExecutesDummyWorkload() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.empty());
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        // Verify dummy hash execution to balance execution timing
        verify(trackingCryptoService).executeDummyHashWorkload();
        // SECURITY: recordReferenceFailure must NOT be called for nonexistent grievances.
        // Calling it would allocate rate-limiter buckets for arbitrary UUIDs, enabling an attacker
        // to exhaust the bounded bucket capacity (10,000 entries) and evict active failure counters
        // that protect real complaints from brute-force secret-guessing attacks.
        verify(trackingRateLimiter, never()).recordReferenceFailure(any());
        verify(trackingCredentialRepository, never()).incrementLookupCount(any(), any());
    }

    @Test
    @DisplayName("track — missing credentials throws 404, executes dummy hash workload, and does NOT allocate reference bucket")
    void trackMissingCredentialThrows404AndExecutesDummyWorkload() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.empty());

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        verify(trackingCryptoService).executeDummyHashWorkload();
        // SECURITY: missing credential also means the reference is not known in our system.
        // Do not allocate a rate-limiter bucket for it.
        verify(trackingRateLimiter, never()).recordReferenceFailure(any());
        verify(trackingCredentialRepository, never()).incrementLookupCount(any(), any());
    }

    @Test
    @DisplayName("track — incorrect secret throws 404, records failure, and does not update metadata")
    void trackIncorrectSecretThrows404AndRecordsFailure() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(false);

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        verify(trackingRateLimiter).reserveReferenceAttempt(GRIEVANCE_ID);
        verify(trackingRateLimiter, never()).resetReferenceFailure(any());
        verify(trackingCredentialRepository, never()).incrementLookupCount(any(), any());
    }

    // ─── Rate Limiting & Validation Tests ────────────────────────────────────

    @Test
    @DisplayName("track — IP velocity exceeded throws RateLimitExceededException with no DB interactions")
    void trackIpVelocityExceededThrowsRateLimitExceeded() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.rateLimited(
                        "IP request velocity exceeded. Maximum 10 requests per minute allowed."));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(RateLimitExceededException.class)
                .hasMessageContaining("IP request velocity exceeded");

        verifyNoInteractions(grievanceRepository);
        verifyNoInteractions(trackingCredentialRepository);
        verifyNoInteractions(auditLogRepository);
        verifyNoInteractions(trackingCryptoService);
    }

    @Test
    @DisplayName("track — reference failure lockout throws RateLimitExceededException with no DB lookups")
    void trackReferenceLockoutThrowsRateLimitExceeded() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.rateLimited(
                        "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying."));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(RateLimitExceededException.class)
                .hasMessageContaining("Too many failed verification attempts");

        verifyNoInteractions(grievanceRepository);
        verifyNoInteractions(trackingCredentialRepository);
        verifyNoInteractions(auditLogRepository);
    }

    @Test
    @DisplayName("track — rate limiter capacity saturated fails closed and throws RateLimitExceededException")
    void trackRateLimiterCapacitySaturatedFailsClosed() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.capacitySaturated(
                        "Tracking rate limiting capacity reached. Please wait before retrying."));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(RateLimitExceededException.class)
                .satisfies(ex -> assertThat(((RateLimitExceededException) ex).isCapacitySaturated()).isTrue());

        verifyNoInteractions(grievanceRepository);
        verifyNoInteractions(trackingCredentialRepository);
    }

    @Test
    @DisplayName("track — malformed secret format throws InvalidTrackingSecretFormatException before DB lookups")
    void trackMalformedSecretFormatThrowsInvalidFormat() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat("bad-token"))
                .willReturn(false);

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, "bad-token");

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(InvalidTrackingSecretFormatException.class)
                .hasMessageContaining("Malformed tracking secret format");

        verifyNoInteractions(grievanceRepository);
        verifyNoInteractions(trackingCredentialRepository);
        verify(trackingRateLimiter, never()).checkReferenceRateLimit(any());
        verify(trackingRateLimiter, never()).recordReferenceFailure(any());
    }

    @Test
    @DisplayName("track — null reference ID throws IllegalArgumentException")
    void trackNullReferenceIdThrowsIllegalArgumentException() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());

        GrievanceTrackRequest request = new GrievanceTrackRequest(null, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("referenceId is required");

        verifyNoInteractions(grievanceRepository);
        verifyNoInteractions(trackingCredentialRepository);
    }

    // ─── Bucket Exhaustion Security Regression Tests ──────────────────────

    @Test
    @DisplayName("track — nonexistent grievance does not allocate reference rate-limiter bucket (bucket exhaustion prevention)")
    void trackNonexistentGrievanceDoesNotAllocateReferenceBucket() {
        // This is the P0 security regression test for the bucket exhaustion attack vector.
        // An attacker could previously exhaust the bounded rate-limiter capacity (10,000 entries)
        // by sending tracking requests with arbitrary random UUIDs. Because recordReferenceFailure()
        // was called even for nonexistent UUIDs, each request allocated a new bucket. When capacity
        // was full, legitimate complaints could not get reference buckets allocated, and the
        // fail-closed policy would block even correct secrets from being verified.
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.empty());
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.empty());

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class);

        // MUST NOT allocate a reference bucket for a nonexistent grievance
        verify(trackingRateLimiter, never()).recordReferenceFailure(any());
        // Dummy hash MUST still execute for timing equalization
        verify(trackingCryptoService).executeDummyHashWorkload();
    }

    @Test
    @DisplayName("track — capacity saturated on IP check propagates saturated flag without DB interactions")
    void trackCapacitySaturatedOnIpCheckDoesNotInteractWithDb() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.capacitySaturated(
                        "Tracking rate limiting capacity reached. Please wait before retrying."));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(RateLimitExceededException.class)
                .satisfies(ex -> assertThat(((RateLimitExceededException) ex).isCapacitySaturated()).isTrue());

        // No DB interaction should occur when IP limit is rejected at perimeter
        verifyNoInteractions(grievanceRepository);
        verifyNoInteractions(trackingCredentialRepository);
        verifyNoInteractions(auditLogRepository);
    }

    @Test
    @DisplayName("track — wrong secret on KNOWN credential: reserveReferenceAttempt called; returns 404")
    void trackWrongSecretOnKnownReferenceRecordsFailureAndLogsResult() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(false);

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        verify(trackingRateLimiter).reserveReferenceAttempt(GRIEVANCE_ID);
        verify(trackingCredentialRepository, never()).incrementLookupCount(any(), any());
    }

    // ─── Service-Level Concurrency & Reservation Tests ───────────────────────

    @Test
    @DisplayName("Service concurrency: concurrent incorrect secrets through GrievanceTrackingService admits at most 5 failure slots")
    void concurrentServiceLevelIncorrectSecretsEnforcesAtomicFiveSlotLimit() throws Exception {
        // Construct real TrackingRateLimiter with refFailureLimit = 5, and real TrackingCryptoService
        TrackingRateLimiter realLimiter = new TrackingRateLimiter(
                TrackingRateLimiter.DEFAULT_MAX_CAPACITY,
                100, // High IP limit so IP velocity does not throttle
                5,   // Strict limit of 5 failed attempts per reference
                Duration.ofMinutes(1),
                Duration.ofMinutes(15),
                Clock.systemUTC()
        );
        TrackingCryptoService realCrypto = new TrackingCryptoService();

        GrievanceTrackingService service = new GrievanceTrackingService(
                grievanceRepository,
                trackingCredentialRepository,
                auditLogRepository,
                realCrypto,
                realLimiter
        );

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID)).willReturn(Optional.of(sampleCredential));

        int totalThreads = 12;
        ExecutorService executor = Executors.newFixedThreadPool(totalThreads);
        CyclicBarrier barrier = new CyclicBarrier(totalThreads);

        AtomicInteger notFoundCount = new AtomicInteger();
        AtomicInteger rateLimitedCount = new AtomicInteger();
        AtomicInteger otherErrorCount = new AtomicInteger();

        // 12 concurrent requests with incorrect tracking secret
        String invalidSecret = "trk_0000000000000000000000000000000000000000000";
        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, invalidSecret);

        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (int i = 0; i < totalThreads; i++) {
            final String threadIp = "10.10.1." + (i + 1);
            futures.add(CompletableFuture.runAsync(() -> {
                try {
                    barrier.await(5, TimeUnit.SECONDS);
                    service.track(request, threadIp);
                    otherErrorCount.incrementAndGet(); // Should never succeed
                } catch (TrackingNotFoundException e) {
                    // Admitted failure slot (credential verified against hash and failed)
                    notFoundCount.incrementAndGet();
                } catch (RateLimitExceededException e) {
                    // Rejected by attempt reservation / reference failure limit
                    rateLimitedCount.incrementAndGet();
                } catch (Exception e) {
                    otherErrorCount.incrementAndGet();
                }
            }, executor));
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(10, TimeUnit.SECONDS);
        executor.shutdown();

        // Exactly 5 threads could be admitted to verify the secret before lockout
        assertThat(notFoundCount.get()).isEqualTo(5);
        // All remaining 7 threads were rejected by attempt reservation / rate limiter
        assertThat(rateLimitedCount.get()).isEqualTo(7);
        assertThat(otherErrorCount.get()).isEqualTo(0);

        // Verification after concurrency: complaint reference is locked out
        assertThatThrownBy(() -> service.track(request, "10.10.1.99"))
                .isInstanceOf(RateLimitExceededException.class)
                .hasMessageContaining("Too many failed verification attempts");
    }

    @Test
    @DisplayName("Service concurrency: mixed valid and invalid requests reset failure counters and unblock future attempts")
    void concurrentServiceLevelMixedValidAndInvalidRequestsWithReset() throws Exception {
        TrackingRateLimiter realLimiter = new TrackingRateLimiter(
                TrackingRateLimiter.DEFAULT_MAX_CAPACITY,
                100,
                5,
                Duration.ofMinutes(1),
                Duration.ofMinutes(15),
                Clock.systemUTC()
        );
        TrackingCryptoService realCrypto = new TrackingCryptoService();

        // Generate matching real tracking secret and credential
        TrackingCryptoService.GeneratedCredential generated = realCrypto.generateCredential();
        String validSecret = generated.rawSecret();
        GrievanceTrackingCredential realCred = new GrievanceTrackingCredential(
                GRIEVANCE_ID, generated.secretHash(), generated.salt());

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID)).willReturn(Optional.of(realCred));

        AuditLog auditSubmit = AuditLog.builder(sampleGrievance, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.AUTO_ROUTED)
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(auditSubmit));

        GrievanceTrackingService service = new GrievanceTrackingService(
                grievanceRepository,
                trackingCredentialRepository,
                auditLogRepository,
                realCrypto,
                realLimiter
        );

        String invalidSecret = "trk_9999999999999999999999999999999999999999999";

        // Phase 1: 4 invalid attempts consume 4 of the 5 failure slots
        for (int i = 0; i < 4; i++) {
            final String ip = "10.20.1." + (i + 1);
            assertThatThrownBy(() -> service.track(new GrievanceTrackRequest(GRIEVANCE_ID, invalidSecret), ip))
                    .isInstanceOf(TrackingNotFoundException.class);
        }
        assertThat(realLimiter.checkReferenceRateLimit(GRIEVANCE_ID).allowed()).isTrue();
        assertThat(realLimiter.getReferenceFailureCount(GRIEVANCE_ID)).isEqualTo(4);

        // Phase 2: A valid request arrives! It must succeed and reset failure counter to 0
        GrievanceTrackingResponse response = service.track(
                new GrievanceTrackRequest(GRIEVANCE_ID, validSecret), "10.20.1.50");
        assertThat(response).isNotNull();
        assertThat(response.referenceId()).isEqualTo(GRIEVANCE_ID);
        assertThat(realLimiter.getReferenceFailureCount(GRIEVANCE_ID)).isEqualTo(0);
        assertThat(realLimiter.checkReferenceRateLimit(GRIEVANCE_ID).allowed()).isTrue();

        // Phase 3: Now 5 more invalid attempts can be made before locking out again
        for (int i = 0; i < 5; i++) {
            final String ip = "10.20.2." + (i + 1);
            assertThatThrownBy(() -> service.track(new GrievanceTrackRequest(GRIEVANCE_ID, invalidSecret), ip))
                    .isInstanceOf(TrackingNotFoundException.class);
        }

        // 6th invalid attempt is now locked out
        assertThatThrownBy(() -> service.track(new GrievanceTrackRequest(GRIEVANCE_ID, invalidSecret), "10.20.2.99"))
                .isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    @DisplayName("track — null reservation returned from rate limiter throws IllegalStateException")
    void trackNullReservationThrowsIllegalStateException() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingRateLimiter.reserveReferenceAttempt(GRIEVANCE_ID))
                .willReturn(null);

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Tracking rate limiter returned null reservation for reference: " + GRIEVANCE_ID);
    }

    @Test
    @DisplayName("Test I — Unknown grievance UUID does not allocate reference bucket")
    void testI_unknownUuidDoesNotAllocateReferenceBucket() {
        UUID unknownId = UUID.randomUUID();
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(unknownId))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(unknownId))
                .willReturn(Optional.empty());

        GrievanceTrackRequest request = new GrievanceTrackRequest(unknownId, VALID_SECRET);

        assertThatThrownBy(() -> grievanceTrackingService.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        // SECURITY: reserveReferenceAttempt and recordReferenceFailure must NEVER be invoked for unknown UUIDs
        verify(trackingRateLimiter, never()).reserveReferenceAttempt(unknownId);
        verify(trackingRateLimiter, never()).recordReferenceFailure(unknownId);
        verify(trackingCryptoService).executeDummyHashWorkload();
    }

    @Test
    @DisplayName("Test J — Known reference with incorrect secret increments failure count exactly once")
    void testJ_knownReferenceWithIncorrectSecretIncrementsFailureCountExactlyOnce() {
        TrackingRateLimiter realLimiter = new TrackingRateLimiter();
        TrackingCryptoService realCrypto = new TrackingCryptoService();
        GrievanceTrackingService service = new GrievanceTrackingService(
                grievanceRepository,
                trackingCredentialRepository,
                auditLogRepository,
                realCrypto,
                realLimiter
        );

        given(grievanceRepository.findById(GRIEVANCE_ID)).willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID)).willReturn(Optional.of(sampleCredential));

        String incorrectSecret = "trk_fffffffffffffffffffffffffffffffffffffffffff";
        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, incorrectSecret);

        assertThatThrownBy(() -> service.track(request, CLIENT_IP))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        assertThat(realLimiter.getReferenceFailureCount(GRIEVANCE_ID)).isEqualTo(1);
        assertThat(realLimiter.getReferenceInFlightCount(GRIEVANCE_ID)).isEqualTo(0);
    }

    @Test
    @DisplayName("Test M — SUBMIT audit record with null newStatus produces no timeline event")
    void testM_submitWithNullNewStatusProducesNoTimelineEvent() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        // Historical SUBMIT record with newStatus == null
        AuditLog nullStatusSubmit = AuditLog.builder(sampleGrievance, "SYSTEM", "SUBMIT")
                .newStatus(null)
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(nullStatusSubmit));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        // SUBMIT with null newStatus must be omitted; no fabricated PENDING_REVIEW or current status
        assertThat(response.timeline()).isEmpty();
    }

    @Test
    @DisplayName("Test N — Valid SUBMIT audit record retains status and sanitized description")
    void testN_validSubmitRetainsStatusAndSanitizedDescription() {
        given(trackingRateLimiter.checkIpRateLimit(CLIENT_IP))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(trackingCryptoService.isValidTokenFormat(VALID_SECRET))
                .willReturn(true);
        given(trackingRateLimiter.checkReferenceRateLimit(GRIEVANCE_ID))
                .willReturn(TrackingRateLimiter.RateLimitResult.allow());
        given(grievanceRepository.findById(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleGrievance));
        given(trackingCredentialRepository.findByGrievanceId(GRIEVANCE_ID))
                .willReturn(Optional.of(sampleCredential));
        given(trackingCryptoService.verifySecret(VALID_SECRET, STORED_HASH, STORED_SALT))
                .willReturn(true);

        AuditLog validSubmit = AuditLog.builder(sampleGrievance, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .build();
        given(auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(GRIEVANCE_ID))
                .willReturn(List.of(validSubmit));

        GrievanceTrackRequest request = new GrievanceTrackRequest(GRIEVANCE_ID, VALID_SECRET);
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, CLIENT_IP);

        assertThat(response.timeline()).hasSize(1);
        ConsumerTimelineEvent event = response.timeline().get(0);
        assertThat(event.status()).isEqualTo(GrievanceStatus.PENDING_REVIEW);
        assertThat(event.stage()).isEqualTo("SUBMITTED");
        assertThat(event.title()).isEqualTo("Complaint Received");
        assertThat(event.description()).contains("queued for specialist review.");
    }
}
