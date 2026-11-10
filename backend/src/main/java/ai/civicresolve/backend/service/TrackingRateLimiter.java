package ai.civicresolve.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Bounded, fail-closed in-memory rate limiter for consumer complaint tracking.
 *
 * <p>Security &amp; Operational Design:
 * <ul>
 *   <li>Dual-tier throttling: IP velocity (default 10 req/min) and Reference Failure Lockout (default 5 fails/15 min).</li>
 *   <li>Strictly bounded capacity: hard ceiling (default 10,000 buckets) protects JVM from heap exhaustion.</li>
 *   <li>Fail-Closed on Saturation: active buckets with in-flight reservations or unexpired windows are NEVER evicted.</li>
 *   <li>Configurable {@link Clock} injection enables deterministic, millisecond-accurate expiry testing without thread sleeps.</li>
 *   <li>Zero trust for client headers: caller must supply client IP derived from {@code request.getRemoteAddr()}.</li>
 *   <li><strong>Serialized-Window Policy:</strong>
 *     <ol>
 *       <li>Never reset a bucket's window while {@code inFlight > 0}.</li>
 *       <li>If the window has expired but reservations are still active, do not admit a new reservation into a new window.
 *           Return a controlled denial until outstanding reservations drain.</li>
 *       <li>Once all reservations have completed ({@code inFlight == 0}), the next attempt may reset the expired window
 *           and begin a fresh window.</li>
 *       <li>Expiry cleanup and capacity eviction must never remove or evict a bucket with active reservations.</li>
 *       <li>Every reservation carries its originating window identifier ({@code windowStartMillis}) and completes at most once.</li>
 *     </ol>
 *   </li>
 * </ul>
 */
@Component
public class TrackingRateLimiter {

    private static final Logger log = LoggerFactory.getLogger(TrackingRateLimiter.class);

    public static final int DEFAULT_MAX_CAPACITY = 10_000;
    public static final int DEFAULT_IP_LIMIT = 10;
    public static final int DEFAULT_REF_FAILURE_LIMIT = 5;
    public static final Duration DEFAULT_IP_WINDOW = Duration.ofMinutes(1);
    public static final Duration DEFAULT_REF_WINDOW = Duration.ofMinutes(15);

    private final int maxCapacity;
    private final int ipLimit;
    private final int refFailureLimit;
    private final long ipWindowMillis;
    private final long refWindowMillis;
    private final Clock clock;

    private final ConcurrentHashMap<String, RateBucket> buckets = new ConcurrentHashMap<>();
    private final ReentrantLock capacityLock = new ReentrantLock();

    public record RateLimitResult(boolean allowed, boolean capacitySaturated, String reason) {
        public static RateLimitResult allow() {
            return new RateLimitResult(true, false, null);
        }

        public static RateLimitResult rateLimited(String reason) {
            return new RateLimitResult(false, false, reason);
        }

        public static RateLimitResult capacitySaturated(String reason) {
            return new RateLimitResult(false, true, reason);
        }
    }

    private static final class RateBucket {
        long windowStartMillis;
        long lastAccessMillis;
        int count;
        int inFlight;

        RateBucket(long nowMillis, int initialCount) {
            this.windowStartMillis = nowMillis;
            this.lastAccessMillis = nowMillis;
            this.count = initialCount;
            this.inFlight = 0;
        }
    }

    /**
     * Bounded attempt-reservation token guarding the lifecycle of a complaint verification.
     *
     * <p>Ensures that concurrent verification requests for the same grievance reference ID
     * cannot admit more attempts than the allowed failure limit, even when database queries
     * and cryptographic hashing operations execute concurrently outside global locks.
     *
     * <p>Every reservation is bound to the specific window in which it was reserved
     * ({@code windowStartMillis}) and completes at most once, whether via {@link #recordSuccess()},
     * {@link #recordFailure()}, or {@link #release()}.
     */
    public static class ReferenceAttemptReservation implements AutoCloseable {
        private final boolean allowed;
        private final boolean capacitySaturated;
        private final String reason;
        private final TrackingRateLimiter limiter;
        private final UUID referenceId;
        private final long windowStartMillis;
        private final AtomicBoolean completed = new AtomicBoolean(false);

        private ReferenceAttemptReservation(boolean allowed, boolean capacitySaturated, String reason,
                                           TrackingRateLimiter limiter, UUID referenceId, long windowStartMillis) {
            this.allowed = allowed;
            this.capacitySaturated = capacitySaturated;
            this.reason = reason;
            this.limiter = limiter;
            this.referenceId = referenceId;
            this.windowStartMillis = windowStartMillis;
        }

        public static ReferenceAttemptReservation allowed(TrackingRateLimiter limiter, UUID referenceId, long windowStartMillis) {
            return new ReferenceAttemptReservation(true, false, null, limiter, referenceId, windowStartMillis);
        }

        public static ReferenceAttemptReservation allowedNoOp() {
            return new ReferenceAttemptReservation(true, false, null, null, null, 0L);
        }

        public static ReferenceAttemptReservation denied(String reason, boolean capacitySaturated) {
            return new ReferenceAttemptReservation(false, capacitySaturated, reason, null, null, 0L);
        }

        public boolean allowed() {
            return allowed;
        }

        public boolean capacitySaturated() {
            return capacitySaturated;
        }

        public String reason() {
            return reason;
        }

        public long windowStartMillis() {
            return windowStartMillis;
        }

        /**
         * Records a successful verification. Clears failure counters and releases reservation.
         * Only the first completion call (success, failure, or release) has an effect.
         */
        public void recordSuccess() {
            if (limiter != null && completed.compareAndSet(false, true)) {
                limiter.onReservationSuccess(referenceId, windowStartMillis);
            }
        }

        /**
         * Records a failed verification. Increments failure count and releases reservation.
         * Only the first completion call (success, failure, or release) has an effect.
         *
         * @return {@link RateLimitResult} indicating whether subsequent attempts are locked out
         */
        public RateLimitResult recordFailure() {
            if (limiter != null && completed.compareAndSet(false, true)) {
                return limiter.onReservationFailure(referenceId, windowStartMillis);
            }
            return RateLimitResult.allow();
        }

        /**
         * Releases the reserved attempt slot if not completed (e.g. on unexpected exception or cancellation).
         * Only the first completion call (success, failure, or release) has an effect.
         */
        public void release() {
            if (limiter != null && completed.compareAndSet(false, true)) {
                limiter.onReservationRelease(referenceId, windowStartMillis);
            }
        }

        @Override
        public void close() {
            release();
        }
    }

    public TrackingRateLimiter() {
        this(DEFAULT_MAX_CAPACITY, DEFAULT_IP_LIMIT, DEFAULT_REF_FAILURE_LIMIT,
                DEFAULT_IP_WINDOW, DEFAULT_REF_WINDOW, Clock.systemUTC());
    }

    public TrackingRateLimiter(int maxCapacity,
                               int ipLimit,
                               int refFailureLimit,
                               Duration ipWindow,
                               Duration refWindow,
                               Clock clock) {
        if (maxCapacity <= 0) throw new IllegalArgumentException("maxCapacity must be > 0");
        if (ipLimit <= 0) throw new IllegalArgumentException("ipLimit must be > 0");
        if (refFailureLimit <= 0) throw new IllegalArgumentException("refFailureLimit must be > 0");
        this.maxCapacity = maxCapacity;
        this.ipLimit = ipLimit;
        this.refFailureLimit = refFailureLimit;
        this.ipWindowMillis = ipWindow.toMillis();
        this.refWindowMillis = refWindow.toMillis();
        this.clock = Objects.requireNonNull(clock, "clock must not be null");
    }

    // ─── Public API ─────────────────────────────────────────────────────────

    /**
     * Checks and increments the IP-level rate limit.
     *
     * @param clientIp remote client IP (from getRemoteAddr())
     * @return {@link RateLimitResult} indicating whether the request is allowed or rejected
     */
    public RateLimitResult checkIpRateLimit(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            clientIp = "unknown";
        }
        String key = "ip:" + clientIp.trim();
        long now = clock.millis();

        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get(key);
            if (bucket != null) {
                // Check if current window has expired
                if (now - bucket.windowStartMillis >= ipWindowMillis) {
                    bucket.windowStartMillis = now;
                    bucket.lastAccessMillis = now;
                    bucket.count = 1;
                    return RateLimitResult.allow();
                }

                // Window is active
                bucket.lastAccessMillis = now;
                if (bucket.count >= ipLimit) {
                    return RateLimitResult.rateLimited(
                            "IP request velocity exceeded. Maximum " + ipLimit + " requests per minute allowed.");
                }
                bucket.count++;
                return RateLimitResult.allow();
            }

            // Key does not exist — check capacity before allocating a new bucket
            if (!ensureCapacityUnderLock(now)) {
                log.warn("Rate limiter capacity saturated ({} entries). Failing closed for IP {}", maxCapacity, clientIp);
                return RateLimitResult.capacitySaturated(
                        "Tracking rate limiting capacity reached. Please wait before retrying.");
            }

            buckets.put(key, new RateBucket(now, 1));
            return RateLimitResult.allow();
        } finally {
            capacityLock.unlock();
        }
    }

    /**
     * Checks if a grievance reference ID is currently locked out due to excessive failed attempts.
     * Does NOT increment any counters; inspection only.
     *
     * <p>Follows the serialized-window policy: if the window has expired but outstanding reservations
     * remain active ({@code inFlight > 0}), returns rateLimited until the active reservations drain.
     *
     * @param referenceId grievance UUID
     * @return {@link RateLimitResult} indicating whether queries for this reference are allowed
     */
    public RateLimitResult checkReferenceRateLimit(UUID referenceId) {
        if (referenceId == null) {
            return RateLimitResult.allow();
        }
        String key = "ref:" + referenceId;
        long now = clock.millis();

        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get(key);
            if (bucket != null) {
                boolean expired = (now - bucket.windowStartMillis >= refWindowMillis);
                if (expired) {
                    if (bucket.inFlight > 0) {
                        // Window expired but reservations are still active: controlled denial
                        return RateLimitResult.rateLimited(
                                "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying.");
                    }
                    // Window expired and inFlight == 0: will reset cleanly on next attempt
                    return RateLimitResult.allow();
                } else {
                    if (bucket.count + bucket.inFlight >= refFailureLimit) {
                        return RateLimitResult.rateLimited(
                                "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying.");
                    }
                }
            }
            return RateLimitResult.allow();
        } finally {
            capacityLock.unlock();
        }
    }

    /**
     * Atomically reserves a verification attempt slot for a known grievance reference ID.
     *
     * <p>Acquires {@code capacityLock} briefly to check and increment {@code inFlight}.
     * Implements the serialized-window policy:
     * <ul>
     *   <li>If the window has expired and {@code inFlight > 0}, denies admission until outstanding reservations drain.</li>
     *   <li>If the window has expired and {@code inFlight == 0}, resets the window cleanly and admits attempt in the new window.</li>
     *   <li>If the window is active and {@code count + inFlight >= refFailureLimit}, denies admission.</li>
     * </ul>
     *
     * @param referenceId grievance UUID
     * @return {@link ReferenceAttemptReservation} indicating if attempt slot was reserved
     */
    public ReferenceAttemptReservation reserveReferenceAttempt(UUID referenceId) {
        if (referenceId == null) {
            return ReferenceAttemptReservation.allowedNoOp();
        }
        String key = "ref:" + referenceId;
        long now = clock.millis();

        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get(key);
            if (bucket != null) {
                boolean windowExpired = (now - bucket.windowStartMillis >= refWindowMillis);
                if (windowExpired) {
                    if (bucket.inFlight > 0) {
                        // Rule 1 & 2: Never reset window while inFlight > 0.
                        // Do not admit a new reservation into a new window while old reservations remain active.
                        bucket.lastAccessMillis = now;
                        return ReferenceAttemptReservation.denied(
                                "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying.",
                                false);
                    }

                    // Rule 3: All reservations in expired window have completed (inFlight == 0).
                    // Reset expired window and begin fresh window.
                    bucket.windowStartMillis = now;
                    bucket.lastAccessMillis = now;
                    bucket.count = 0;
                    bucket.inFlight = 1;
                    return ReferenceAttemptReservation.allowed(this, referenceId, now);
                }

                // Window is active (< refWindowMillis)
                bucket.lastAccessMillis = now;
                if (bucket.count + bucket.inFlight >= refFailureLimit) {
                    return ReferenceAttemptReservation.denied(
                            "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying.",
                            false);
                }

                bucket.inFlight++;
                return ReferenceAttemptReservation.allowed(this, referenceId, bucket.windowStartMillis);
            }

            // Key does not exist — check capacity before allocating a new bucket
            if (!ensureCapacityUnderLock(now)) {
                log.warn("Rate limiter capacity saturated ({} entries). Failing closed for reference attempt reservation {}",
                        maxCapacity, referenceId);
                return ReferenceAttemptReservation.denied(
                        "Tracking rate limiting capacity reached. Please wait before retrying.",
                        true);
            }

            RateBucket newBucket = new RateBucket(now, 0);
            newBucket.inFlight = 1;
            buckets.put(key, newBucket);
            return ReferenceAttemptReservation.allowed(this, referenceId, now);
        } finally {
            capacityLock.unlock();
        }
    }

    void onReservationSuccess(UUID referenceId, long reservationWindowStart) {
        if (referenceId == null) return;
        String key = "ref:" + referenceId;
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get(key);
            if (bucket != null) {
                // Ignore stale completion belonging to an earlier window
                if (bucket.windowStartMillis != reservationWindowStart) {
                    log.warn("Ignoring stale reservation success completion for {} (resWindow={}, bucketWindow={})",
                            referenceId, reservationWindowStart, bucket.windowStartMillis);
                    return;
                }

                if (bucket.inFlight > 0) {
                    bucket.inFlight--;
                }
                bucket.count = 0;
                // If all in-flight reservations have drained, clean up bucket to reclaim capacity
                if (bucket.inFlight == 0) {
                    buckets.remove(key);
                }
            }
        } finally {
            capacityLock.unlock();
        }
    }

    RateLimitResult onReservationFailure(UUID referenceId, long reservationWindowStart) {
        if (referenceId == null) return RateLimitResult.allow();
        String key = "ref:" + referenceId;
        long now = clock.millis();
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get(key);
            if (bucket != null) {
                // Ignore stale completion belonging to an earlier window
                if (bucket.windowStartMillis != reservationWindowStart) {
                    log.warn("Ignoring stale reservation failure completion for {} (resWindow={}, bucketWindow={})",
                            referenceId, reservationWindowStart, bucket.windowStartMillis);
                    return RateLimitResult.allow();
                }

                if (bucket.inFlight > 0) {
                    bucket.inFlight--;
                }
                bucket.count++;
                bucket.lastAccessMillis = now;
                if (bucket.count >= refFailureLimit) {
                    return RateLimitResult.rateLimited(
                            "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying.");
                }
                return RateLimitResult.allow();
            } else {
                if (ensureCapacityUnderLock(now)) {
                    buckets.put(key, new RateBucket(now, 1));
                }
                if (1 >= refFailureLimit) {
                    return RateLimitResult.rateLimited(
                            "Too many failed verification attempts for this complaint. Please wait 15 minutes before retrying.");
                }
                return RateLimitResult.allow();
            }
        } finally {
            capacityLock.unlock();
        }
    }

    void onReservationRelease(UUID referenceId, long reservationWindowStart) {
        if (referenceId == null) return;
        String key = "ref:" + referenceId;
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get(key);
            if (bucket != null) {
                // Ignore stale completion belonging to an earlier window
                if (bucket.windowStartMillis != reservationWindowStart) {
                    log.warn("Ignoring stale reservation release completion for {} (resWindow={}, bucketWindow={})",
                            referenceId, reservationWindowStart, bucket.windowStartMillis);
                    return;
                }

                if (bucket.inFlight > 0) {
                    bucket.inFlight--;
                }
                if (bucket.count == 0 && bucket.inFlight == 0) {
                    buckets.remove(key);
                }
            }
        } finally {
            capacityLock.unlock();
        }
    }

    /**
     * Legacy helper for recording a reference failure. Delegates to the reservation lifecycle
     * to guarantee atomicity and prevent bypassing in-flight bounds or window semantics.
     *
     * @param referenceId grievance UUID
     * @return {@link RateLimitResult}
     */
    public RateLimitResult recordReferenceFailure(UUID referenceId) {
        ReferenceAttemptReservation res = reserveReferenceAttempt(referenceId);
        if (!res.allowed()) {
            return RateLimitResult.rateLimited(res.reason());
        }
        return res.recordFailure();
    }

    /**
     * Resets any recorded failure counters for a reference ID upon explicit reset.
     *
     * @param referenceId grievance UUID
     */
    public void resetReferenceFailure(UUID referenceId) {
        if (referenceId == null) return;
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get("ref:" + referenceId);
            if (bucket != null) {
                bucket.count = 0;
                if (bucket.inFlight == 0) {
                    buckets.remove("ref:" + referenceId);
                }
            }
        } finally {
            capacityLock.unlock();
        }
    }

    /**
     * Purges all expired entries across the entire bucket cache.
     * Buckets with active reservations ({@code inFlight > 0}) are NEVER purged.
     *
     * @return count of entries evicted
     */
    public int purgeExpiredEntries() {
        long now = clock.millis();
        capacityLock.lock();
        try {
            return purgeExpiredUnderLock(now);
        } finally {
            capacityLock.unlock();
        }
    }

    // ─── Metrics & Inspection ───────────────────────────────────────────────

    public int getCurrentEntryCount() {
        return buckets.size();
    }

    public int getMaxCapacity() {
        return maxCapacity;
    }

    public int getReferenceInFlightCount(UUID referenceId) {
        if (referenceId == null) return 0;
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get("ref:" + referenceId);
            return bucket != null ? bucket.inFlight : 0;
        } finally {
            capacityLock.unlock();
        }
    }

    public int getReferenceFailureCount(UUID referenceId) {
        if (referenceId == null) return 0;
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get("ref:" + referenceId);
            return bucket != null ? bucket.count : 0;
        } finally {
            capacityLock.unlock();
        }
    }

    public long getReferenceWindowStartMillis(UUID referenceId) {
        if (referenceId == null) return -1L;
        capacityLock.lock();
        try {
            RateBucket bucket = buckets.get("ref:" + referenceId);
            return bucket != null ? bucket.windowStartMillis : -1L;
        } finally {
            capacityLock.unlock();
        }
    }

    public boolean hasKey(String key) {
        return buckets.containsKey(key);
    }

    // ─── Internal Helpers ───────────────────────────────────────────────────

    private boolean ensureCapacityUnderLock(long now) {
        if (buckets.size() < maxCapacity) {
            return true;
        }

        // Try purging expired entries with 0 active reservations
        purgeExpiredUnderLock(now);

        // Fail closed if still at or above capacity (NEVER evict active entries or unexpired entries!)
        return buckets.size() < maxCapacity;
    }

    private int purgeExpiredUnderLock(long now) {
        int purged = 0;
        var it = buckets.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<String, RateBucket> entry = it.next();
            String key = entry.getKey();
            RateBucket bucket = entry.getValue();

            // Active reservations must NEVER be purged, even if the window has expired!
            if (bucket.inFlight > 0) {
                continue;
            }

            long windowMillis = key.startsWith("ip:") ? ipWindowMillis : refWindowMillis;
            if (now - bucket.windowStartMillis >= windowMillis) {
                it.remove();
                purged++;
            }
        }
        return purged;
    }
}
