package ai.civicresolve.backend.service;

import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("DemoDataSeederService Tests — Idempotence, Clock SLA distribution & Guards")
class DemoDataSeederServiceTest {

    @Mock
    private GrievanceRepository grievanceRepository;

    @Mock
    private PredictionRepository predictionRepository;

    @Mock
    private AuditLogRepository auditLogRepository;

    @Mock
    private GrievanceTrackingCredentialRepository trackingCredentialRepository;

    @Mock
    private TrackingCryptoService trackingCryptoService;

    private Clock fixedClock;
    private Instant fixedInstant;
    private DemoDataSeederService seederService;

    @BeforeEach
    void setUp() {
        fixedInstant = Instant.parse("2026-11-10T12:00:00Z");
        fixedClock = Clock.fixed(fixedInstant, ZoneOffset.UTC);
        seederService = new DemoDataSeederService(
                grievanceRepository,
                predictionRepository,
                auditLogRepository,
                trackingCredentialRepository,
                trackingCryptoService,
                fixedClock
        );
    }

    @Test
    @DisplayName("Seeds 32 realistic complaints with deterministic UUIDs and exact SLA distribution on first run")
    void seedRealisticDemoTelemetry_firstRun_success() {
        when(grievanceRepository.existsById(DemoDataSeederService.DEMO_BATCH_SENTINEL_ID)).thenReturn(false);
        when(grievanceRepository.save(any(Grievance.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(trackingCryptoService.generateCredential()).thenReturn(
                new TrackingCryptoService.GeneratedCredential("testSecret", "testHash", "testSalt")
        );

        DemoDataSeederService.SeedResult result = seederService.seedRealisticDemoTelemetry(true);

        assertThat(result.recordsCreated()).isEqualTo(32);
        assertThat(result.alreadySeeded()).isFalse();

        ArgumentCaptor<Grievance> grievanceCaptor = ArgumentCaptor.forClass(Grievance.class);
        verify(grievanceRepository, times(32)).save(grievanceCaptor.capture());

        List<Grievance> savedGrievances = grievanceCaptor.getAllValues();

        // 1. Check sentinel ID on first record
        UUID expectedFirstId = UUID.nameUUIDFromBytes("civicresolve-synthetic-demo-0".getBytes(StandardCharsets.UTF_8));
        assertThat(savedGrievances.get(0).getId()).isEqualTo(expectedFirstId);

        // 2. All records must be tagged with [SYNTHETIC DEMO]
        assertThat(savedGrievances).allMatch(g -> g.getNarrative().startsWith("[SYNTHETIC DEMO]"));

        // 3. Inspect deterministic SLA distribution for 8 PENDING_REVIEW cases
        List<Grievance> pendingCases = savedGrievances.stream()
                .filter(g -> g.getStatus() == GrievanceStatus.PENDING_REVIEW)
                .toList();
        assertThat(pendingCases).hasSize(8);

        Instant twentyFourHoursAgo = fixedInstant.minus(Duration.ofHours(24));
        Instant seventyTwoHoursAgo = fixedInstant.minus(Duration.ofHours(72));

        long onTrackCount = pendingCases.stream()
                .filter(g -> !g.getSubmittedAt().isBefore(twentyFourHoursAgo))
                .count();
        long atRiskCount = pendingCases.stream()
                .filter(g -> g.getSubmittedAt().isBefore(twentyFourHoursAgo) && !g.getSubmittedAt().isBefore(seventyTwoHoursAgo))
                .count();
        long breachedCount = pendingCases.stream()
                .filter(g -> g.getSubmittedAt().isBefore(seventyTwoHoursAgo))
                .count();

        assertThat(onTrackCount).as("Exactly 6 pending cases must be On-Track (<24h)").isEqualTo(6);
        assertThat(atRiskCount).as("Exactly 1 pending case must be At-Risk (24-72h)").isEqualTo(1);
        assertThat(breachedCount).as("Exactly 1 pending case must be Breached (>72h)").isEqualTo(1);
    }

    @Test
    @DisplayName("Returns idempotent no-op when demo batch already seeded")
    void seedRealisticDemoTelemetry_alreadySeeded_returnsZeroRecords() {
        when(grievanceRepository.existsById(DemoDataSeederService.DEMO_BATCH_SENTINEL_ID)).thenReturn(true);

        DemoDataSeederService.SeedResult result = seederService.seedRealisticDemoTelemetry(true);

        assertThat(result.recordsCreated()).isEqualTo(0);
        assertThat(result.alreadySeeded()).isTrue();
        assertThat(result.message()).contains("already initialized");

        verify(grievanceRepository, never()).save(any(Grievance.class));
    }

    @Test
    @DisplayName("Throws 400 Bad Request when confirmation flag is false")
    void seedRealisticDemoTelemetry_unconfirmed_throwsBadRequest() {
        assertThatThrownBy(() -> seederService.seedRealisticDemoTelemetry(false))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(rse.getReason()).contains("confirmation required");
                });

        verify(grievanceRepository, never()).save(any(Grievance.class));
    }

    @Test
    @DisplayName("Throws 403 Forbidden when seeding is disabled via configuration")
    void seedRealisticDemoTelemetry_disabled_throwsForbidden() {
        ReflectionTestUtils.setField(seederService, "seedingEnabled", false);

        assertThatThrownBy(() -> seederService.seedRealisticDemoTelemetry(true))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(rse.getReason()).contains("disabled");
                });

        verify(grievanceRepository, never()).save(any(Grievance.class));
    }
}
