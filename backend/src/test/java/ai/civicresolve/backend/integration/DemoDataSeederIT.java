package ai.civicresolve.backend.integration;

import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import ai.civicresolve.backend.service.DemoDataSeederService;
import ai.civicresolve.backend.service.TrackingCryptoService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;

@SpringBootTest
@ActiveProfiles("it")
@EnabledIfEnvironmentVariable(named = "SPRING_DATASOURCE_PASSWORD", matches = ".+")
class DemoDataSeederIT {

    @Autowired private DemoDataSeederService seeder;
    @Autowired private GrievanceRepository grievances;
    @Autowired private PredictionRepository predictions;
    @Autowired private AuditLogRepository auditLogs;
    @Autowired private GrievanceTrackingCredentialRepository credentials;
    @MockitoSpyBean private TrackingCryptoService trackingCryptoService;

    @PersistenceContext private EntityManager entityManager;

    @Test
    @Transactional
    void seedsCompleteBatchWithAssignedIdsAndVersionsThenDoesNothingOnRetry() {
        long grievanceCount = grievances.count();
        long predictionCount = predictions.count();
        long auditCount = auditLogs.count();
        long credentialCount = credentials.count();

        DemoDataSeederService.SeedResult first = seeder.seedRealisticDemoTelemetry(true);
        entityManager.flush();
        entityManager.clear();

        assertThat(first.recordsCreated()).isEqualTo(32);
        assertThat(first.alreadySeeded()).isFalse();
        Grievance sentinel = grievances.findById(DemoDataSeederService.DEMO_BATCH_SENTINEL_ID).orElseThrow();
        assertThat(sentinel.getVersion()).isZero();
        assertThat(sentinel.getNarrative()).startsWith("[SYNTHETIC DEMO]");
        assertThat(grievances.count()).isEqualTo(grievanceCount + 32);
        assertThat(predictions.count()).isEqualTo(predictionCount + 32);
        assertThat(auditLogs.count()).isGreaterThan(auditCount + 32);
        assertThat(credentials.count()).isEqualTo(credentialCount + 32);

        DemoDataSeederService.SeedResult second = seeder.seedRealisticDemoTelemetry(true);
        assertThat(second.recordsCreated()).isZero();
        assertThat(second.alreadySeeded()).isTrue();
        assertThat(grievances.count()).isEqualTo(grievanceCount + 32);
    }

    @Test
    void downstreamFailureRollsBackEntireDemoBatch() {
        long grievanceCount = grievances.count();
        doThrow(new IllegalStateException("simulated credential failure"))
                .when(trackingCryptoService).generateCredential();
        try {
            assertThatThrownBy(() -> seeder.seedRealisticDemoTelemetry(true))
                    .isInstanceOf(IllegalStateException.class);
            assertThat(grievances.existsById(DemoDataSeederService.DEMO_BATCH_SENTINEL_ID)).isFalse();
            assertThat(grievances.count()).isEqualTo(grievanceCount);
        } finally {
            reset(trackingCryptoService);
        }
    }
}
