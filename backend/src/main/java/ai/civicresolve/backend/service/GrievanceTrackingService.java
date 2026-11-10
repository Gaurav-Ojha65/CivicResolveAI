package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.ConsumerTimelineEvent;
import ai.civicresolve.backend.dto.GrievanceTrackRequest;
import ai.civicresolve.backend.dto.GrievanceTrackingResponse;
import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.GrievanceTrackingCredential;
import ai.civicresolve.backend.exception.InvalidTrackingSecretFormatException;
import ai.civicresolve.backend.exception.RateLimitExceededException;
import ai.civicresolve.backend.exception.TrackingNotFoundException;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Service managing anonymous public complaint tracking, credential verification,
 * rate-limit enforcement, and sanitized consumer timeline projection.
 *
 * <p>Strict Privacy &amp; Security Properties:
 * <ul>
 *   <li>Uniform 404 ProblemDetail on invalid UUID, missing credential, or incorrect secret (zero UUID enumeration).</li>
 *   <li>Best-effort timing equalization via {@link TrackingCryptoService#executeDummyHashWorkload()} on missing records.</li>
 *   <li>Constant-time secret comparison via {@link TrackingCryptoService#verifySecret(String, String, String)}.</li>
 *   <li>Zero leakage of complaint narrative, reviewer notes, staff usernames, or internal model prediction scores.</li>
 *   <li>Dual-tier rate limiting via {@link TrackingRateLimiter} (IP velocity and per-reference lockout).</li>
 *   <li>Reference failure counters are only allocated when a credential row actually exists for the given
 *       reference ID. Requests for nonexistent UUIDs do NOT allocate reference buckets, preventing the
 *       bucket-exhaustion attack vector where an attacker floods arbitrary UUIDs to exhaust rate-limiter
 *       capacity and evict active failure counters.</li>
 * </ul>
 */
@Service
public class GrievanceTrackingService {

    private static final Logger log = LoggerFactory.getLogger(GrievanceTrackingService.class);

    private final GrievanceRepository grievanceRepository;
    private final GrievanceTrackingCredentialRepository trackingCredentialRepository;
    private final AuditLogRepository auditLogRepository;
    private final TrackingCryptoService trackingCryptoService;
    private final TrackingRateLimiter trackingRateLimiter;

    public GrievanceTrackingService(GrievanceRepository grievanceRepository,
                                  GrievanceTrackingCredentialRepository trackingCredentialRepository,
                                  AuditLogRepository auditLogRepository,
                                  TrackingCryptoService trackingCryptoService,
                                  TrackingRateLimiter trackingRateLimiter) {
        this.grievanceRepository = grievanceRepository;
        this.trackingCredentialRepository = trackingCredentialRepository;
        this.auditLogRepository = auditLogRepository;
        this.trackingCryptoService = trackingCryptoService;
        this.trackingRateLimiter = trackingRateLimiter;
    }

    /**
     * Authenticates and tracks a complaint given a reference ID and raw tracking secret.
     *
     * @param request tracking request payload
     * @param clientIp remote client IP address from HttpServletRequest.getRemoteAddr()
     * @return sanitized {@link GrievanceTrackingResponse} containing complaint status and consumer timeline
     */
    @Transactional
    public GrievanceTrackingResponse track(GrievanceTrackRequest request, String clientIp) {
        // Step 1: Enforce Tier 1 IP-level velocity rate limiting (if clientIp provided; may be pre-enforced at perimeter filter)
        if (clientIp != null) {
            TrackingRateLimiter.RateLimitResult ipResult = trackingRateLimiter.checkIpRateLimit(clientIp);
            if (!ipResult.allowed()) {
                throw new RateLimitExceededException(ipResult.reason(), ipResult.capacitySaturated());
            }
        }

        // Step 2: Validate token format before database lookup
        if (request.referenceId() == null) {
            throw new IllegalArgumentException("referenceId is required");
        }
        if (request.trackingSecret() == null || !trackingCryptoService.isValidTokenFormat(request.trackingSecret())) {
            throw new InvalidTrackingSecretFormatException(
                    "Malformed tracking secret format. Expected format: trk_ followed by 43 URL-safe characters.");
        }

        // Step 3: Enforce Tier 2 per-reference credential failure lockout
        TrackingRateLimiter.RateLimitResult refCheck = trackingRateLimiter.checkReferenceRateLimit(request.referenceId());
        if (!refCheck.allowed()) {
            throw new RateLimitExceededException(refCheck.reason(), false);
        }

        // Step 4: Retrieve grievance and credential records
        Optional<Grievance> grievanceOpt = grievanceRepository.findById(request.referenceId());
        Optional<GrievanceTrackingCredential> credOpt = trackingCredentialRepository.findByGrievanceId(request.referenceId());

        if (grievanceOpt.isEmpty() || credOpt.isEmpty()) {
            // Mitigate timing difference between non-existent cases and bad secrets.
            // IMPORTANT: Do NOT call recordReferenceFailure here. The reference ID does not correspond to
            // a known complaint, so allocating a rate-limiter bucket for it would allow an attacker to
            // exhaust capacity with arbitrary UUIDs and evict active failure counters for real complaints.
            trackingCryptoService.executeDummyHashWorkload();
            throw new TrackingNotFoundException("Complaint not found or invalid tracking secret.");
        }

        Grievance grievance = grievanceOpt.get();
        GrievanceTrackingCredential cred = credOpt.get();

        // Step 5: Atomically reserve an attempt slot for the known grievance reference
        TrackingRateLimiter.ReferenceAttemptReservation reservation =
                trackingRateLimiter.reserveReferenceAttempt(request.referenceId());
        if (reservation == null) {
            throw new IllegalStateException("Tracking rate limiter returned null reservation for reference: " + request.referenceId());
        }
        if (!reservation.allowed()) {
            throw new RateLimitExceededException(reservation.reason(), reservation.capacitySaturated());
        }

        try {
            // Constant-time secret verification against salted SHA-256 hash (executed outside rate-limiter locks)
            boolean verified = trackingCryptoService.verifySecret(
                    request.trackingSecret(), cred.getSecretHash(), cred.getSalt());

            if (!verified) {
                // Credential exists and is known — record failure atomically through the reservation
                reservation.recordFailure();
                throw new TrackingNotFoundException("Complaint not found or invalid tracking secret.");
            }

            // Step 6: On successful verification, clear active reference failure counters exactly once through reservation
            reservation.recordSuccess();
        } finally {
            reservation.release();
        }

        trackingCredentialRepository.incrementLookupCount(grievance.getId(), Instant.now());

        // Step 7: Deterministically project sanitized consumer timeline from audit log
        List<AuditLog> auditLogs = auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(grievance.getId());
        List<ConsumerTimelineEvent> timeline = projectConsumerTimeline(auditLogs);

        return new GrievanceTrackingResponse(
                grievance.getId(),
                grievance.getStatus(),
                grievance.getAssignedCategory(),
                grievance.getPriority(),
                grievance.getSubmittedAt(),
                grievance.getUpdatedAt(),
                timeline
        );
    }

    /**
     * Sanitizes and transforms append-only audit records into customer-safe timeline events.
     *
     * <p>Enforces strict allowlisting: unknown or internal actions are mapped to safe descriptions
     * without exposing internal action names, reviewer usernames, notes, or category diffs.
     *
     * <p>Historical event status is derived exclusively from the immutable {@code new_status} column
     * recorded at the time of the audit event. The mutable current grievance state is never used
     * to describe historical events, preventing incorrect historical status attribution.
     *
     * <p>When {@code new_status} is null for any audit event (including SUBMIT), the event is omitted
     * from the consumer timeline entirely rather than fabricating a default status or using the current mutable state.
     */
    private List<ConsumerTimelineEvent> projectConsumerTimeline(List<AuditLog> auditLogs) {
        List<ConsumerTimelineEvent> timeline = new ArrayList<>();

        for (AuditLog log : auditLogs) {
            String action = log.getAction();
            GrievanceStatus eventStatus = log.getNewStatus();
            Instant timestamp = log.getCreatedAt();

            switch (action) {
                case "SUBMIT" -> {
                    // For SUBMIT, if newStatus is null, omit the event (never fabricate historical status)
                    if (eventStatus == null) {
                        break;
                    }
                    if (eventStatus == GrievanceStatus.AUTO_ROUTED) {
                        timeline.add(new ConsumerTimelineEvent(
                                "AUTOMATED_TRIAGE",
                                eventStatus,
                                "Automated Triage Complete",
                                "Your complaint has been received and automatically classified by our intake system. " +
                                "It has been placed in the routing queue and will be available for specialist review if applicable.",
                                timestamp
                        ));
                    } else {
                        timeline.add(new ConsumerTimelineEvent(
                                "SUBMITTED",
                                eventStatus,
                                "Complaint Received",
                                "Your complaint has been successfully received by CivicResolve AI and queued for specialist review.",
                                timestamp
                        ));
                    }
                }
                case "APPROVE" -> {
                    if (eventStatus == null) {
                        // No recorded status transition — omit from consumer timeline
                        break;
                    }
                    timeline.add(new ConsumerTimelineEvent(
                            "REVIEW_APPROVED",
                            eventStatus,
                            "Review Approved",
                            "A specialist reviewed and approved the intake classification.",
                            timestamp
                    ));
                }
                case "OVERRIDE" -> {
                    if (eventStatus == null) {
                        break;
                    }
                    timeline.add(new ConsumerTimelineEvent(
                            "REVIEW_OVERRIDDEN",
                            eventStatus,
                            "Classification Adjusted",
                            "A specialist reviewed the complaint and adjusted the classification details.",
                            timestamp
                    ));
                }
                case "REJECT" -> {
                    if (eventStatus == null) {
                        break;
                    }
                    timeline.add(new ConsumerTimelineEvent(
                            "REVIEW_REJECTED",
                            eventStatus,
                            "Complaint Rejected",
                            "A specialist reviewed the complaint and determined it could not be processed under current intake criteria.",
                            timestamp
                    ));
                }
                default -> {
                    if (eventStatus == null) {
                        // Unknown or internal action with no status change — omit from consumer timeline
                        break;
                    }
                    // Unknown or internal action with a recorded status: map to generic safe description
                    // without leaking internal action name or actor
                    timeline.add(new ConsumerTimelineEvent(
                            "STATUS_UPDATE",
                            eventStatus,
                            "Status Updated",
                            "The complaint record was updated.",
                            timestamp
                    ));
                }
            }
        }

        return List.copyOf(timeline);
    }
}
