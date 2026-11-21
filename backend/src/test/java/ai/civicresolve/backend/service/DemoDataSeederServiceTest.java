package ai.civicresolve.backend.service;

import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
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

    @Mock
    private EntityManager entityManager;

    @Mock
    private Query insertQuery;

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
        ReflectionTestUtils.setField(seederService, "entityManager", entityManager);
        ReflectionTestUtils.setField(seederService, "seedingEnabled", true);
    }

    @Test
    @DisplayName("Seeds 32 realistic complaints with deterministic UUIDs on first run")
    void seedRealisticDemoTelemetry_firstRun_success() {
        when(grievanceRepository.existsById(DemoDataSeederService.DEMO_BATCH_SENTINEL_ID)).thenReturn(false);
        when(entityManager.createNativeQuery(any(String.class))).thenReturn(insertQuery);
        when(insertQuery.setParameter(any(String.class), any())).thenReturn(insertQuery);
        when(entityManager.find(any(Class.class), any(UUID.class))).thenAnswer(invocation -> {
            Grievance grievance = new Grievance("[SYNTHETIC DEMO] Test", "Credit card",
                    TriagePriority.HIGH, GrievanceStatus.PENDING_REVIEW, true);
            grievance.setId(invocation.getArgument(1));
            return grievance;
        });
        when(trackingCryptoService.generateCredential()).thenReturn(
                new TrackingCryptoService.GeneratedCredential("testSecret", "testHash", "testSalt")
        );

        DemoDataSeederService.SeedResult result = seederService.seedRealisticDemoTelemetry(true);

        assertThat(result.recordsCreated()).isEqualTo(32);
        assertThat(result.alreadySeeded()).isFalse();

        ArgumentCaptor<UUID> idCaptor = ArgumentCaptor.forClass(UUID.class);
        verify(entityManager, times(32)).find(any(Class.class), idCaptor.capture());
        verify(insertQuery, times(32)).executeUpdate();
        UUID expectedFirstId = UUID.nameUUIDFromBytes("civicresolve-synthetic-demo-0".getBytes(StandardCharsets.UTF_8));
        assertThat(idCaptor.getAllValues()).hasSize(32).startsWith(expectedFirstId).doesNotHaveDuplicates();
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
