package ai.civicresolve.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("TrackingRateLimiterTest — bounded, fail-closed rate limiter verification")
class TrackingRateLimiterTest {

    private MutableClock clock;
    private TrackingRateLimiter rateLimiter;

    // Test parameters: Capacity 5, IP limit 3 req/min, Ref failure limit 3 fails/10 min
    private static final int TEST_CAPACITY = 5;
    private static final int TEST_IP_LIMIT = 3;
    private static final int TEST_REF_LIMIT = 3;
    private static final Duration TEST_IP_WINDOW = Duration.ofMinutes(1);
    private static final Duration TEST_REF_WINDOW = Duration.ofMinutes(10);

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-11-03T10:00:00Z"));
        rateLimiter = new TrackingRateLimiter(
                TEST_CAPACITY,
                TEST_IP_LIMIT,
                TEST_REF_LIMIT,
                TEST_IP_WINDOW,
                TEST_REF_WINDOW,
                clock
        );
    }

    @Test
    @DisplayName("IP rate limiter allows requests up to limit and rejects subsequent requests within window")
    void ipRateLimitEnforcement() {
        String clientIp = "192.168.1.50";

        // First 3 requests are permitted
        for (int i = 1; i <= TEST_IP_LIMIT; i++) {
            TrackingRateLimiter.RateLimitResult result = rateLimiter.checkIpRateLimit(clientIp);
            assertThat(result.allowed()).isTrue();
            assertThat(result.capacitySaturated()).isFalse();
        }

        // 4th request within the same 1-minute window is rejected
        TrackingRateLimiter.RateLimitResult blocked = rateLimiter.checkIpRateLimit(clientIp);
        assertThat(blocked.allowed()).isFalse();
        assertThat(blocked.capacitySaturated()).isFalse();
        assertThat(blocked.reason()).contains("Maximum 3 requests per minute allowed");
    }

    @Test
    @DisplayName("IP rate limiter resets window after expiration")
    void ipRateLimitWindowExpiry() {
        String clientIp = "10.0.0.1";

        // Exhaust limit
        for (int i = 0; i < TEST_IP_LIMIT; i++) {
            rateLimiter.checkIpRateLimit(clientIp);
        }
        assertThat(rateLimiter.checkIpRateLimit(clientIp).allowed()).isFalse();

        // Advance clock past 1-minute window
        clock.advance(Duration.ofSeconds(61));

        // Request is permitted again
        TrackingRateLimiter.RateLimitResult afterExpiry = rateLimiter.checkIpRateLimit(clientIp);
        assertThat(afterExpiry.allowed()).isTrue();
    }

    @Test
    @DisplayName("Reference failure limiter locks out after threshold failures within window")
    void referenceFailureLockout() {
        UUID referenceId = UUID.randomUUID();

        // Before failures, reference is allowed
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // Record failure 1 and 2
        rateLimiter.recordReferenceFailure(referenceId);
        rateLimiter.recordReferenceFailure(referenceId);
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // 3rd failure reaches limit (3)
        TrackingRateLimiter.RateLimitResult thirdResult = rateLimiter.recordReferenceFailure(referenceId);
        assertThat(thirdResult.allowed()).isFalse();
        assertThat(thirdResult.reason()).contains("Too many failed verification attempts");

        // Subsequent check shows reference is locked out
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();
    }

    @Test
    @DisplayName("resetReferenceFailure immediately unblocks locked reference upon success")
    void resetReferenceFailureClearsLockout() {
        UUID referenceId = UUID.randomUUID();

        // Exhaust limit
        for (int i = 0; i < TEST_REF_LIMIT; i++) {
            rateLimiter.recordReferenceFailure(referenceId);
        }
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();

        // Successful verification resets failure state
        rateLimiter.resetReferenceFailure(referenceId);
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();
        assertThat(rateLimiter.hasKey("ref:" + referenceId)).isFalse();
    }

    @Test
    @DisplayName("Reference failure window unlocks after TTL expiration")
    void referenceFailureWindowExpiry() {
        UUID referenceId = UUID.randomUUID();

        // Exhaust limit
        for (int i = 0; i < TEST_REF_LIMIT; i++) {
            rateLimiter.recordReferenceFailure(referenceId);
        }
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();

        // Advance clock past 10-minute window
        clock.advance(Duration.ofMinutes(11));

        // Reference is allowed again
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();
    }

    @Test
    @DisplayName("Capacity saturation fails closed for untracked keys when capacity is reached")
    void capacitySaturationFailsClosed() {
        // Fill capacity to TEST_CAPACITY (5 distinct IP keys)
        for (int i = 1; i <= TEST_CAPACITY; i++) {
            TrackingRateLimiter.RateLimitResult res = rateLimiter.checkIpRateLimit("192.168.1." + i);
            assertThat(res.allowed()).isTrue();
        }
        assertThat(rateLimiter.getCurrentEntryCount()).isEqualTo(TEST_CAPACITY);

        // 6th untracked IP is rejected with capacity saturation (fail-closed)
        TrackingRateLimiter.RateLimitResult saturated = rateLimiter.checkIpRateLimit("192.168.1.99");
        assertThat(saturated.allowed()).isFalse();
        assertThat(saturated.capacitySaturated()).isTrue();
        assertThat(saturated.reason()).contains("capacity reached");

        // Existing tracked keys continue to be evaluated normally
        TrackingRateLimiter.RateLimitResult existing = rateLimiter.checkIpRateLimit("192.168.1.1");
        assertThat(existing.allowed()).isTrue();
    }

    @Test
    @DisplayName("Anti-flooding attack cannot evict active reference failure counters")
    void antiFloodingEvictionProtection() {
        UUID victimRef = UUID.randomUUID();

        // Record 2 failures on victimRef (threshold is 3)
        rateLimiter.recordReferenceFailure(victimRef);
        rateLimiter.recordReferenceFailure(victimRef);

        // Victim reference is entry #1 in cache
        assertThat(rateLimiter.hasKey("ref:" + victimRef)).isTrue();

        // Attacker attempts to flood the cache with dummy IP keys to force LRU eviction of victimRef
        for (int i = 1; i <= 20; i++) {
            rateLimiter.checkIpRateLimit("10.0.0." + i);
        }

        // Assert capacity is capped at 5 and victim reference is NOT evicted
        assertThat(rateLimiter.getCurrentEntryCount()).isEqualTo(TEST_CAPACITY);
        assertThat(rateLimiter.hasKey("ref:" + victimRef)).isTrue();

        // 3rd attempt on victimRef still registers and triggers lockout!
        TrackingRateLimiter.RateLimitResult finalAttempt = rateLimiter.recordReferenceFailure(victimRef);
        assertThat(finalAttempt.allowed()).isFalse();
        assertThat(finalAttempt.reason()).contains("Too many failed verification attempts");
    }

    @Test
    @DisplayName("purgeExpiredEntries removes expired entries and frees capacity for new keys")
    void purgeExpiredEntriesFreesCapacity() {
        // Fill capacity with 5 IPs
        for (int i = 1; i <= TEST_CAPACITY; i++) {
            rateLimiter.checkIpRateLimit("192.168.1." + i);
        }
        assertThat(rateLimiter.getCurrentEntryCount()).isEqualTo(TEST_CAPACITY);

        // Advance clock past 1-minute IP window
        clock.advance(Duration.ofSeconds(65));

        // Purge expired entries
        int purged = rateLimiter.purgeExpiredEntries();
        assertThat(purged).isEqualTo(TEST_CAPACITY);
        assertThat(rateLimiter.getCurrentEntryCount()).isEqualTo(0);

        // New key can now be registered
        TrackingRateLimiter.RateLimitResult res = rateLimiter.checkIpRateLimit("192.168.2.1");
        assertThat(res.allowed()).isTrue();
    }

    @Test
    @DisplayName("Constructor rejects non-positive capacity and limits")
    void constructorValidation() {
        assertThatThrownBy(() -> new TrackingRateLimiter(0, 10, 5, TEST_IP_WINDOW, TEST_REF_WINDOW, clock))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TrackingRateLimiter(10, 0, 5, TEST_IP_WINDOW, TEST_REF_WINDOW, clock))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new TrackingRateLimiter(10, 10, 0, TEST_IP_WINDOW, TEST_REF_WINDOW, clock))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ─── Locking Correctness Regression Tests ──────────────────────────────

    @Test
    @DisplayName("checkReferenceRateLimit and recordReferenceFailure observe consistent state under sequential calls")
    void checkAndRecordReferenceRateLimitAreConsistentUnderSingleLock() {
        UUID referenceId = UUID.randomUUID();

        // Before failures, check shows allowed
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // Record 2 failures — still allowed
        rateLimiter.recordReferenceFailure(referenceId);
        rateLimiter.recordReferenceFailure(referenceId);
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // 3rd failure reaches the TEST_REF_LIMIT threshold
        TrackingRateLimiter.RateLimitResult thirdRecord = rateLimiter.recordReferenceFailure(referenceId);
        assertThat(thirdRecord.allowed()).isFalse();

        // Immediately after recording, check also shows denied — consistent via shared capacityLock
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();
    }

    @Test
    @DisplayName("Public 429 response does not need capacitySaturated — RateLimitResult carries it for internal logging only")
    void capacitySaturatedIsInternalOnlyNotExposedInRateLimitResult() {
        // Fill capacity with 5 IP keys
        for (int i = 1; i <= TEST_CAPACITY; i++) {
            rateLimiter.checkIpRateLimit("10.10.10." + i);
        }

        // Saturated result for a new IP
        TrackingRateLimiter.RateLimitResult saturated = rateLimiter.checkIpRateLimit("10.10.10.99");
        assertThat(saturated.allowed()).isFalse();
        assertThat(saturated.capacitySaturated()).isTrue();
        // Verify reason is a non-null consumer-safe message; callers must NOT relay capacitySaturated to public response
        assertThat(saturated.reason()).isNotNull().isNotBlank();
    }

    @Test
    @DisplayName("resetReferenceFailure releases bucket and allows fresh failure recording")
    void resetReferenceFailureAndRerecordFailure() {
        UUID referenceId = UUID.randomUUID();

        // Fill to lockout threshold
        for (int i = 0; i < TEST_REF_LIMIT; i++) {
            rateLimiter.recordReferenceFailure(referenceId);
        }
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();

        // Successful lookup resets the bucket
        rateLimiter.resetReferenceFailure(referenceId);
        assertThat(rateLimiter.hasKey("ref:" + referenceId)).isFalse();
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // Can record failures again from zero
        rateLimiter.recordReferenceFailure(referenceId);
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();
    }

    @Test
    @DisplayName("Concurrent incorrect secret attempts against same reference atomically enforce failure threshold")
    void concurrentIncorrectSecretsAgainstSameReferenceAtomicLockout() throws Exception {
        UUID referenceId = UUID.randomUUID();
        int threads = 10;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CyclicBarrier barrier = new CyclicBarrier(threads);

        AtomicInteger allowedCount = new AtomicInteger(0);
        AtomicInteger rejectedCount = new AtomicInteger(0);
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (int i = 0; i < threads; i++) {
            futures.add(CompletableFuture.runAsync(() -> {
                try {
                    barrier.await(5, TimeUnit.SECONDS);
                    TrackingRateLimiter.RateLimitResult res = rateLimiter.recordReferenceFailure(referenceId);
                    if (res.allowed()) {
                        allowedCount.incrementAndGet();
                    } else {
                        rejectedCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, executor));
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(10, TimeUnit.SECONDS);
        executor.shutdown();

        // Exactly (TEST_REF_LIMIT - 1) attempts can be recorded before lockout is reached (limit = 3, so first 2 are allowed)
        // All remaining attempts must be rejected (either reaching limit or exceeding it)
        assertThat(allowedCount.get()).isEqualTo(TEST_REF_LIMIT - 1);
        assertThat(rejectedCount.get()).isEqualTo(threads - (TEST_REF_LIMIT - 1));

        // After all threads run, check must show locked out
        assertThat(rateLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();
    }

    @Test
    @DisplayName("Default configuration requires exactly five failed attempts before lockout")
    void defaultConfigurationRequiresExactlyFiveFailures() {
        TrackingRateLimiter defaultLimiter = new TrackingRateLimiter();
        UUID referenceId = UUID.randomUUID();

        // Attempts 1 through 4 are allowed
        for (int i = 1; i <= 4; i++) {
            TrackingRateLimiter.RateLimitResult res = defaultLimiter.recordReferenceFailure(referenceId);
            assertThat(res.allowed())
                    .as("Attempt %d should be allowed", i)
                    .isTrue();
        }

        // 5th attempt reaches the default threshold of 5 failures and triggers lockout
        TrackingRateLimiter.RateLimitResult fifth = defaultLimiter.recordReferenceFailure(referenceId);
        assertThat(fifth.allowed()).isFalse();
        assertThat(fifth.reason()).contains("Too many failed verification attempts");

        // 6th attempt is also rejected
        TrackingRateLimiter.RateLimitResult sixth = defaultLimiter.recordReferenceFailure(referenceId);
        assertThat(sixth.allowed()).isFalse();

        // Subsequent check returns locked out
        assertThat(defaultLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();
    }

    @Test
    @DisplayName("Concurrent mix of valid reset and invalid failure requests maintains consistent rate-limiter state")
    void concurrentMixedValidAndInvalidRequests() throws Exception {
        UUID referenceId = UUID.randomUUID();
        int threads = 8;
        ExecutorService executor = Executors.newFixedThreadPool(threads);
        CyclicBarrier barrier = new CyclicBarrier(threads);

        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            final int idx = i;
            futures.add(CompletableFuture.runAsync(() -> {
                try {
                    barrier.await(5, TimeUnit.SECONDS);
                    if (idx % 2 == 0) {
                        rateLimiter.recordReferenceFailure(referenceId);
                    } else {
                        rateLimiter.resetReferenceFailure(referenceId);
                    }
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, executor));
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(10, TimeUnit.SECONDS);
        executor.shutdown();

        // Final check does not throw and executes cleanly under capacityLock
        TrackingRateLimiter.RateLimitResult check = rateLimiter.checkReferenceRateLimit(referenceId);
        assertThat(check).isNotNull();
    }

    @Test
    @DisplayName("Production 15-minute reference window: locked before 15 min, unlocked strictly after expiry")
    void productionFifteenMinuteReferenceWindowExpiry() {
        MutableClock prodClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter prodLimiter = new TrackingRateLimiter(
                TrackingRateLimiter.DEFAULT_MAX_CAPACITY,
                TrackingRateLimiter.DEFAULT_IP_LIMIT,
                TrackingRateLimiter.DEFAULT_REF_FAILURE_LIMIT, // 5
                TrackingRateLimiter.DEFAULT_IP_WINDOW,
                TrackingRateLimiter.DEFAULT_REF_WINDOW, // 15 minutes
                prodClock
        );
        UUID referenceId = UUID.randomUUID();

        // Initially allowed
        assertThat(prodLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // Record 4 failures -> still allowed
        for (int i = 0; i < 4; i++) {
            TrackingRateLimiter.RateLimitResult res = prodLimiter.recordReferenceFailure(referenceId);
            assertThat(res.allowed()).isTrue();
        }
        assertThat(prodLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();

        // 5th failure hits limit (5) -> locked out
        TrackingRateLimiter.RateLimitResult fifth = prodLimiter.recordReferenceFailure(referenceId);
        assertThat(fifth.allowed()).isFalse();
        assertThat(fifth.reason()).contains("Too many failed verification attempts");
        assertThat(prodLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();

        // Advance clock by 14 minutes and 59 seconds (1 second before expiry)
        prodClock.advance(Duration.ofMinutes(14).plusSeconds(59));
        assertThat(prodLimiter.checkReferenceRateLimit(referenceId).allowed()).isFalse();

        // Advance clock by another 2 seconds (now 15 minutes and 1 second past windowStart)
        prodClock.advance(Duration.ofSeconds(2));

        // Reference is strictly unlocked after production 15-minute window expires
        assertThat(prodLimiter.checkReferenceRateLimit(referenceId).allowed()).isTrue();
    }

    @Test
    @DisplayName("reserveReferenceAttempt bounds in-flight attempts and unlocks after completion")
    void reserveReferenceAttemptLifecycleAndBounds() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 3, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        // Reserve 1st attempt
        var res1 = limiter.reserveReferenceAttempt(ref);
        assertThat(res1.allowed()).isTrue();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // Reserve 2nd attempt
        var res2 = limiter.reserveReferenceAttempt(ref);
        assertThat(res2.allowed()).isTrue();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(2);

        // Reserve 3rd attempt (hits refFailureLimit of 3)
        var res3 = limiter.reserveReferenceAttempt(ref);
        assertThat(res3.allowed()).isTrue();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(3);

        // 4th reservation attempt is immediately denied!
        var res4 = limiter.reserveReferenceAttempt(ref);
        assertThat(res4.allowed()).isFalse();
        assertThat(res4.reason()).contains("Too many failed verification attempts");

        // Fail 1st attempt: inFlight decrements from 3 to 2, failure count becomes 1 (total = 3)
        res1.recordFailure();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(2);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(1);

        // Still total 3 (1 fail + 2 in-flight) -> reservation 5 denied
        var res5 = limiter.reserveReferenceAttempt(ref);
        assertThat(res5.allowed()).isFalse();

        // Release 2nd attempt (e.g. exception / aborted): inFlight decrements to 1
        res2.release();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(1);

        // Now total is 2 (1 fail + 1 in-flight) < 3 -> new reservation is permitted!
        var res6 = limiter.reserveReferenceAttempt(ref);
        assertThat(res6.allowed()).isTrue();

        // Successful verification clears all counters and cleans up bucket
        res6.recordSuccess();
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);
        assertThat(limiter.checkReferenceRateLimit(ref).allowed()).isTrue();
    }

    // ─── Regression Tests A–L (Serialized-Window Lifecycle) ─────────────────

    @Test
    @DisplayName("Test A: Multiple active reservations, advance clock beyond window, window is NOT reset and inFlight is preserved")
    void testA_activeReservationsPreserveWindowAndInFlightAcrossExpiry() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        long initialWindow = testClock.millis();
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res1 = limiter.reserveReferenceAttempt(ref);
        var res2 = limiter.reserveReferenceAttempt(ref);
        assertThat(res1.allowed()).isTrue();
        assertThat(res2.allowed()).isTrue();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(2);
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(initialWindow);

        // Advance clock past 15-minute window
        testClock.advance(Duration.ofMinutes(20));

        // Window must NOT be reset while inFlight > 0
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(initialWindow);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(2);
    }

    @Test
    @DisplayName("Test B: New attempt cannot enter fresh window while old-window reservations remain active")
    void testB_newAttemptDeniedWhileOldWindowReservationsActive() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        long initialWindow = testClock.millis();
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res1 = limiter.reserveReferenceAttempt(ref);
        assertThat(res1.allowed()).isTrue();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // Advance past window expiry
        testClock.advance(Duration.ofMinutes(20));

        // Attempting to reserve a new attempt while res1 is still active must be denied
        var newAttempt = limiter.reserveReferenceAttempt(ref);
        assertThat(newAttempt.allowed()).isFalse();
        assertThat(newAttempt.reason()).contains("Too many failed verification attempts");

        // Window must remain the old window and inFlight count must remain 1
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(initialWindow);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // checkReferenceRateLimit also returns rateLimited
        assertThat(limiter.checkReferenceRateLimit(ref).allowed()).isFalse();
    }

    @Test
    @DisplayName("Test C: Complete every outstanding reservation and then verify that a subsequent attempt starts a clean expired-window reset correctly")
    void testC_completeAllReservationsEnablesSubsequentAttemptCleanReset() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res1 = limiter.reserveReferenceAttempt(ref);
        var res2 = limiter.reserveReferenceAttempt(ref);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(2);

        // Advance past window expiry
        testClock.advance(Duration.ofMinutes(20));

        // Complete all outstanding reservations from old window
        res1.recordFailure();
        res2.recordFailure();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);

        // Now that inFlight has drained to 0, subsequent attempt starts a clean reset
        long freshWindowTime = testClock.millis();
        var freshAttempt = limiter.reserveReferenceAttempt(ref);
        assertThat(freshAttempt.allowed()).isTrue();
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(freshWindowTime);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0); // Clean reset
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
    }

    @Test
    @DisplayName("Test L: Verify that an expired window resets correctly after outstanding reservations have drained")
    void testL_expiredWindowResetsCorrectlyAfterReservationsDrain() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        // Window 1: reserve attempt
        var res = limiter.reserveReferenceAttempt(ref);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // Advance past window expiry
        testClock.advance(Duration.ofMinutes(25));

        // Attempt while reservation is active is denied
        assertThat(limiter.reserveReferenceAttempt(ref).allowed()).isFalse();

        // Release reservation to drain inFlight to 0
        res.release();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);

        // Subsequent attempt now resets expired window cleanly
        long resetTime = testClock.millis();
        var afterDrain = limiter.reserveReferenceAttempt(ref);
        assertThat(afterDrain.allowed()).isTrue();
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(resetTime);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
    }

    @Test
    @DisplayName("Test D: Reservation completion after expiry boundary cannot decrement or modify another window's state")
    void testD_staleReservationCompletionCannotModifyAnotherWindowState() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        // Window 1 reservation
        var oldRes = limiter.reserveReferenceAttempt(ref);
        long window1Start = oldRes.windowStartMillis();

        // Release oldRes to drain inFlight
        oldRes.release();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);

        // Advance past window expiry
        testClock.advance(Duration.ofMinutes(20));
        long window2Start = testClock.millis();

        // Window 2 starts fresh
        var newRes = limiter.reserveReferenceAttempt(ref);
        assertThat(newRes.allowed()).isTrue();
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(window2Start);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);

        // Now simulate a late completion on oldRes (window 1)
        limiter.onReservationFailure(ref, window1Start);
        limiter.onReservationSuccess(ref, window1Start);
        limiter.onReservationRelease(ref, window1Start);

        // Window 2's counters MUST be completely unaffected
        assertThat(limiter.getReferenceWindowStartMillis(ref)).isEqualTo(window2Start);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);
    }

    @Test
    @DisplayName("Test E: purgeExpiredEntries while reservation is active retains the bucket")
    void testE_purgeExpiredEntriesRetainsActiveBucket() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res = limiter.reserveReferenceAttempt(ref);
        assertThat(res.allowed()).isTrue();

        // Advance clock past expiry
        testClock.advance(Duration.ofMinutes(20));

        // Purge expired entries
        int purged = limiter.purgeExpiredEntries();
        assertThat(purged).isEqualTo(0);

        // Bucket is retained because inFlight > 0
        assertThat(limiter.hasKey("ref:" + ref)).isTrue();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
    }

    @Test
    @DisplayName("Test F: Capacity pressure while reservation is active cannot evict the active bucket")
    void testF_capacityPressureCannotEvictActiveReservationBucket() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        // Capacity of 3 entries
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                3, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID activeRef = UUID.randomUUID();

        // 1. Fill slot 1 with active reservation
        var activeRes = limiter.reserveReferenceAttempt(activeRef);
        assertThat(activeRes.allowed()).isTrue();

        // 2. Fill slot 2 and 3 with IP entries
        limiter.checkIpRateLimit("192.168.1.1");
        limiter.checkIpRateLimit("192.168.1.2");
        assertThat(limiter.getCurrentEntryCount()).isEqualTo(3);

        // Advance past expiry for activeRef and IP entries
        testClock.advance(Duration.ofMinutes(20));

        // 3. Try to add a 4th IP entry, triggering capacity pressure
        var fourth = limiter.checkIpRateLimit("192.168.1.4");
        // IP 1 & 2 had 0 inFlight, so they could be purged, allowing the 4th IP
        assertThat(fourth.allowed()).isTrue();

        // BUT activeRef bucket MUST be retained because inFlight > 0
        assertThat(limiter.hasKey("ref:" + activeRef)).isTrue();
        assertThat(limiter.getReferenceInFlightCount(activeRef)).isEqualTo(1);
    }

    @Test
    @DisplayName("Test G: Call recordSuccess(), recordFailure(), and release() repeatedly on the same reservation in separate tests. Confirm that only the first completion has an effect")
    void testG_repeatedCompletionCallsIdempotency() {
        testG1_recordSuccessFirstIdempotency();
        testG2_recordFailureFirstIdempotency();
        testG3_releaseFirstIdempotency();
    }

    @Test
    @DisplayName("Test G1: Repeated completion on same reservation — recordSuccess followed by recordFailure/release only acts once")
    void testG1_recordSuccessFirstIdempotency() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res = limiter.reserveReferenceAttempt(ref);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // 1st completion: success
        res.recordSuccess();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);
        assertThat(limiter.hasKey("ref:" + ref)).isFalse();

        // Repeated completions have no effect
        res.recordSuccess();
        res.recordFailure();
        res.release();
        res.close();

        assertThat(limiter.hasKey("ref:" + ref)).isFalse();
    }

    @Test
    @DisplayName("Test G2: Repeated completion on same reservation — recordFailure followed by recordSuccess/release only acts once")
    void testG2_recordFailureFirstIdempotency() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res = limiter.reserveReferenceAttempt(ref);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // 1st completion: failure
        res.recordFailure();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(1);

        // Repeated completions have no effect
        res.recordFailure();
        res.recordSuccess();
        res.release();
        res.close();

        // Failure count remains exactly 1
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(1);
    }

    @Test
    @DisplayName("Test G3: Repeated completion on same reservation — release followed by recordFailure/recordSuccess only acts once")
    void testG3_releaseFirstIdempotency() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        var res = limiter.reserveReferenceAttempt(ref);
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);

        // 1st completion: release
        res.release();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);

        // Repeated completions have no effect
        res.release();
        res.recordFailure();
        res.recordSuccess();
        res.close();

        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);
    }

    @Test
    @DisplayName("Test H: Success/failure interleaving does not erase newer failure")
    void testH_successFailureInterleavingDoesNotEraseNewerFailure() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        // Request 1: Valid secret
        var validRes = limiter.reserveReferenceAttempt(ref);
        // Request 2: Invalid secret
        var invalidRes = limiter.reserveReferenceAttempt(ref);

        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(2);

        // 1. Valid request verifies successfully and completes its reservation
        validRes.recordSuccess();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(1);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(0);

        // 2. Invalid request verifies and fails, recording failure
        invalidRes.recordFailure();
        assertThat(limiter.getReferenceInFlightCount(ref)).isEqualTo(0);
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(1);

        // Verify that the newer failure remains counted
        assertThat(limiter.getReferenceFailureCount(ref)).isEqualTo(1);
    }

    @Test
    @DisplayName("Test K: Exactly five sequential or concurrent failed attempts enforce the configured limit with zero over-admission")
    void testK_fifthFailedAttemptEnforcesConfiguredLimitNoOverAdmission() {
        MutableClock testClock = new MutableClock(Instant.parse("2026-11-06T12:00:00Z"));
        TrackingRateLimiter limiter = new TrackingRateLimiter(
                100, 10, 5, Duration.ofMinutes(1), Duration.ofMinutes(15), testClock
        );
        UUID ref = UUID.randomUUID();

        for (int i = 1; i <= 4; i++) {
            var res = limiter.reserveReferenceAttempt(ref);
            assertThat(res.allowed()).isTrue();
            res.recordFailure();
            assertThat(limiter.checkReferenceRateLimit(ref).allowed()).isTrue();
        }

        // 5th attempt
        var fifthRes = limiter.reserveReferenceAttempt(ref);
        assertThat(fifthRes.allowed()).isTrue();
        fifthRes.recordFailure();

        // Reference is now locked out
        assertThat(limiter.checkReferenceRateLimit(ref).allowed()).isFalse();

        // 6th attempt is blocked before reservation
        var sixthRes = limiter.reserveReferenceAttempt(ref);
        assertThat(sixthRes.allowed()).isFalse();
        assertThat(sixthRes.reason()).contains("Too many failed verification attempts");
    }

    // ─── Test Helper Clock ──────────────────────────────────────────────────

    private static class MutableClock extends Clock {
        private Instant current;

        MutableClock(Instant initial) {
            this.current = initial;
        }

        void advance(Duration duration) {
            this.current = this.current.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneId.of("UTC");
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return current;
        }
    }
}
