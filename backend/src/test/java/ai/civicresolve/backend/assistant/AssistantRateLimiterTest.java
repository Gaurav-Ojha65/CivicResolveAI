package ai.civicresolve.backend.assistant;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class AssistantRateLimiterTest {
    @Test void capacityIsAtomicAndRecoversAfterExpiry() throws Exception {
        MutableClock clock = new MutableClock();
        AssistantRateLimiter limiter = new AssistantRateLimiter(clock, 5, 1, 1000);
        var pool = Executors.newFixedThreadPool(16);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger accepted = new AtomicInteger();
        try {
            var tasks = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (int i = 0; i < 100; i++) {
                final String client = "client-" + i;
                tasks.add(pool.submit(() -> { start.await(); if (limiter.allow(client)) accepted.incrementAndGet(); return null; }));
            }
            start.countDown();
            for (var task : tasks) task.get();
            assertThat(accepted.get()).isEqualTo(5);
            assertThat(limiter.trackedClients()).isEqualTo(5);
            clock.advance(1000);
            assertThat(limiter.allow("new-client")).isTrue();
            assertThat(limiter.trackedClients()).isEqualTo(1);
        } finally { pool.shutdownNow(); }
    }

    @Test void limitResetsAtWindowBoundary() {
        MutableClock clock = new MutableClock();
        AssistantRateLimiter limiter = new AssistantRateLimiter(clock, 2, 2, 1000);
        assertThat(limiter.allow("a")).isTrue();
        assertThat(limiter.allow("a")).isTrue();
        assertThat(limiter.allow("a")).isFalse();
        clock.advance(1000);
        assertThat(limiter.allow("a")).isTrue();
    }

    @Test void forwardedHeaderIsUsedOnlyByTrustedControllerAndMustBeNumericAddress() {
        assertThat(AssistantRateLimiter.forwardedClient("10.0.0.1", "203.0.113.9, 198.51.100.42, 10.0.0.1", java.util.Set.of("10.0.0.1")))
                .isEqualTo("198.51.100.42");
        assertThat(AssistantRateLimiter.forwardedClient("10.0.0.1", "attacker.example", java.util.Set.of("10.0.0.1")))
                .isEqualTo("10.0.0.1");
    }

    private static final class MutableClock extends Clock {
        private long millis;
        void advance(long delta) { millis += delta; }
        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis); }
        @Override public long millis() { return millis; }
    }
}
