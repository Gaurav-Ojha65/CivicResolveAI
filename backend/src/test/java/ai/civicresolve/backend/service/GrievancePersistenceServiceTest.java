package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.GrievanceTrackingCredential;
import ai.civicresolve.backend.entity.Prediction;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Unit tests for {@link GrievancePersistenceService}.
 *
 * <p>Verifies transactional boundary design, atomic entity persistence across
 * grievance, prediction snapshot, initial audit log, and tracking credential,
 * and unhandled exception propagation necessary for Spring transaction rollback.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("GrievancePersistenceService — unit tests")
class GrievancePersistenceServiceTest {

    @Mock private GrievanceRepository grievanceRepository;
    @Mock private PredictionRepository predictionRepository;
    @Mock private AuditLogRepository auditLogRepository;
    @Mock private GrievanceTrackingCredentialRepository trackingCredentialRepository;
    @Mock private TrackingCryptoService trackingCryptoService;

    @InjectMocks private GrievancePersistenceService grievancePersistenceService;

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

    @Test
    @DisplayName("persistSubmission creates and persists grievance, prediction, audit log, and credential for AUTO_ROUTED")
    void persistSubmissionAutoRouted() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of("No critical keywords."),
                0.12, "POSITIVE", "disclaimer"
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class))).willAnswer(inv -> inv.getArgument(0));
        given(auditLogRepository.save(any(AuditLog.class))).willAnswer(inv -> inv.getArgument(0));
        given(trackingCredentialRepository.save(any(GrievanceTrackingCredential.class))).willAnswer(inv -> inv.getArgument(0));

        TrackingCryptoService.GeneratedCredential generatedCred = new TrackingCryptoService.GeneratedCredential(
                "trk_test_secret_123456789012345678901234567890",
                "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
                "0123456789abcdef0123456789abcdef"
        );
        given(trackingCryptoService.generateCredential()).willReturn(generatedCred);

        String narrative = "I received a bill for an annual fee that I was not informed about.";
        GrievanceSubmissionResponse response = grievancePersistenceService.persistSubmission(narrative, pred);

        assertThat(response).isNotNull();
        assertThat(response.assignedCategory()).isEqualTo("Credit card");
        assertThat(response.priority()).isEqualTo(TriagePriority.LOW);
        assertThat(response.status()).isEqualTo(GrievanceStatus.AUTO_ROUTED);
        assertThat(response.reviewRequired()).isFalse();
        assertThat(response.trackingSecret()).isEqualTo("trk_test_secret_123456789012345678901234567890");

        ArgumentCaptor<Grievance> grievanceCaptor = ArgumentCaptor.forClass(Grievance.class);
        verify(grievanceRepository).save(grievanceCaptor.capture());
        Grievance savedGrievance = grievanceCaptor.getValue();
        assertThat(savedGrievance.getNarrative()).isEqualTo(narrative);
        assertThat(savedGrievance.getAssignedCategory()).isEqualTo("Credit card");

        ArgumentCaptor<Prediction> predCaptor = ArgumentCaptor.forClass(Prediction.class);
        verify(predictionRepository).save(predCaptor.capture());
        Prediction savedPrediction = predCaptor.getValue();
        assertThat(savedPrediction.getPredictedCategory()).isEqualTo("Credit card");
        assertThat(savedPrediction.getModelUsed()).isEqualTo("baseline_tfidf_logreg");
        assertThat(savedPrediction.getConfidence()).isEqualTo(0.82);

        ArgumentCaptor<AuditLog> auditCaptor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        AuditLog savedAudit = auditCaptor.getValue();
        assertThat(savedAudit.getAction()).isEqualTo("SUBMIT");
        assertThat(savedAudit.getActor()).isEqualTo("SYSTEM");
        assertThat(savedAudit.getNewStatus()).isEqualTo(GrievanceStatus.AUTO_ROUTED);

        ArgumentCaptor<GrievanceTrackingCredential> credCaptor = ArgumentCaptor.forClass(GrievanceTrackingCredential.class);
        verify(trackingCredentialRepository).save(credCaptor.capture());
        GrievanceTrackingCredential savedCred = credCaptor.getValue();
        assertThat(savedCred.getGrievanceId()).isEqualTo(savedGrievance.getId());
        assertThat(savedCred.getSecretHash()).isEqualTo(generatedCred.secretHash());
        assertThat(savedCred.getSalt()).isEqualTo(generatedCred.salt());
        assertThat(savedCred.getSecretHash()).doesNotContain("trk_"); // Zero plaintext at rest
    }

    @Test
    @DisplayName("persistSubmission creates and persists grievance with PENDING_REVIEW when flagForReview is true")
    void persistSubmissionPendingReview() {
        NlpPrediction pred = new NlpPrediction(
                "Vehicle loan or lease", 0.78, 0.55, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", true,
                List.of("HIGH priority requires review."), "HIGH",
                List.of("Vehicle repossession keyword detected."),
                -0.75, "NEGATIVE", "disclaimer"
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class))).willAnswer(inv -> inv.getArgument(0));
        given(auditLogRepository.save(any(AuditLog.class))).willAnswer(inv -> inv.getArgument(0));
        given(trackingCredentialRepository.save(any(GrievanceTrackingCredential.class))).willAnswer(inv -> inv.getArgument(0));

        TrackingCryptoService.GeneratedCredential generatedCred = new TrackingCryptoService.GeneratedCredential(
                "trk_pending_secret_1234567890123456789012345678",
                "1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff",
                "1234567890abcdef1234567890abcdef"
        );
        given(trackingCryptoService.generateCredential()).willReturn(generatedCred);

        String narrative = "My vehicle was repossessed without any advance notice.";
        GrievanceSubmissionResponse response = grievancePersistenceService.persistSubmission(narrative, pred);

        assertThat(response.status()).isEqualTo(GrievanceStatus.PENDING_REVIEW);
        assertThat(response.reviewRequired()).isTrue();
        assertThat(response.priority()).isEqualTo(TriagePriority.HIGH);
        assertThat(response.trackingSecret()).isEqualTo("trk_pending_secret_1234567890123456789012345678");
    }

    @Test
    @DisplayName("Grievance save failure propagates unhandled to trigger transaction rollback")
    void grievanceSaveFailurePropagates() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of(), 0.0, "NEUTRAL", "disclaimer"
        );
        given(grievanceRepository.save(any(Grievance.class)))
                .willThrow(new DataIntegrityViolationException("Database constraint violation on grievance insert"));

        assertThatThrownBy(() -> grievancePersistenceService.persistSubmission("Narrative text", pred))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("Database constraint violation");

        verify(predictionRepository, never()).save(any());
        verify(auditLogRepository, never()).save(any());
        verify(trackingCredentialRepository, never()).save(any());
    }

    @Test
    @DisplayName("Prediction save failure propagates unhandled to trigger transaction rollback")
    void predictionSaveFailurePropagates() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of(), 0.0, "NEUTRAL", "disclaimer"
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class)))
                .willThrow(new DataIntegrityViolationException("fk_predictions_category constraint violation"));

        assertThatThrownBy(() -> grievancePersistenceService.persistSubmission("Narrative text", pred))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("fk_predictions_category");

        verify(auditLogRepository, never()).save(any());
        verify(trackingCredentialRepository, never()).save(any());
    }

    @Test
    @DisplayName("AuditLog save failure propagates unhandled to trigger transaction rollback")
    void auditLogSaveFailurePropagates() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of(), 0.0, "NEUTRAL", "disclaimer"
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class))).willAnswer(inv -> inv.getArgument(0));
        given(auditLogRepository.save(any(AuditLog.class)))
                .willThrow(new RuntimeException("Audit log storage failure"));

        assertThatThrownBy(() -> grievancePersistenceService.persistSubmission("Narrative text", pred))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Audit log storage failure");

        verify(trackingCredentialRepository, never()).save(any());
    }

    @Test
    @DisplayName("TrackingCredential save failure propagates unhandled to trigger transaction rollback")
    void trackingCredentialSaveFailurePropagates() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of(), 0.0, "NEUTRAL", "disclaimer"
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class))).willAnswer(inv -> inv.getArgument(0));
        given(auditLogRepository.save(any(AuditLog.class))).willAnswer(inv -> inv.getArgument(0));

        TrackingCryptoService.GeneratedCredential generatedCred = new TrackingCryptoService.GeneratedCredential(
                "trk_test_secret_123456789012345678901234567890",
                "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
                "0123456789abcdef0123456789abcdef"
        );
        given(trackingCryptoService.generateCredential()).willReturn(generatedCred);
        given(trackingCredentialRepository.save(any(GrievanceTrackingCredential.class)))
                .willThrow(new DataIntegrityViolationException("Credential insert failure"));

        assertThatThrownBy(() -> grievancePersistenceService.persistSubmission("Narrative text", pred))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("Credential insert failure");
    }

    @Test
    @DisplayName("persistSubmission persists prediction with explanation snapshot when present")
    void persistSubmissionWithExplanation() {
        NlpExplanation expl = new NlpExplanation(
                "linear_feature_attribution", "1.0.0", "Credit card", "Debt collection",
                3.5, 1.2, 2.3, 0.5, 3.0, 0.4, 0.8, 0.1, 2.2, 25,
                List.of(new NlpExplanation.FeatureContributionItem("card", 0.8)),
                List.of(new NlpExplanation.FeatureContributionItem("late", -0.2)),
                List.of(new NlpExplanation.RunnerUpDifferenceItem("card", 1.1)),
                List.of(new NlpExplanation.RunnerUpDifferenceItem("fee", -0.4)),
                "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0",
                "Explanation disclaimer"
        );
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of("No critical triggers."),
                0.12, "POSITIVE", "disclaimer", expl
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class))).willAnswer(inv -> inv.getArgument(0));
        given(auditLogRepository.save(any(AuditLog.class))).willAnswer(inv -> inv.getArgument(0));
        given(trackingCredentialRepository.save(any(GrievanceTrackingCredential.class))).willAnswer(inv -> inv.getArgument(0));
        given(trackingCryptoService.generateCredential()).willReturn(new TrackingCryptoService.GeneratedCredential("trk_123", "hash", "salt"));

        grievancePersistenceService.persistSubmission("Narrative text with valid length satisfied.", pred);

        ArgumentCaptor<Prediction> predCaptor = ArgumentCaptor.forClass(Prediction.class);
        verify(predictionRepository).save(predCaptor.capture());
        Prediction saved = predCaptor.getValue();
        assertThat(saved.getExplanation()).isNotNull();
        assertThat(saved.getExplanation().predictedClass()).isEqualTo("Credit card");
        assertThat(saved.getExplanation().modelArtifactSha256()).isEqualTo("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
    }

    @Test
    @DisplayName("persistSubmission persists null explanation snapshot when absent")
    void persistSubmissionWithoutExplanation() {
        NlpPrediction pred = new NlpPrediction(
                "Credit card", 0.82, 0.65, VALID_PROBS,
                "baseline_tfidf_logreg", "7a9964e0", false,
                List.of(), "LOW", List.of("No critical triggers."),
                0.12, "POSITIVE", "disclaimer", null
        );
        given(grievanceRepository.save(any(Grievance.class))).willAnswer(inv -> inv.getArgument(0));
        given(predictionRepository.save(any(Prediction.class))).willAnswer(inv -> inv.getArgument(0));
        given(auditLogRepository.save(any(AuditLog.class))).willAnswer(inv -> inv.getArgument(0));
        given(trackingCredentialRepository.save(any(GrievanceTrackingCredential.class))).willAnswer(inv -> inv.getArgument(0));
        given(trackingCryptoService.generateCredential()).willReturn(new TrackingCryptoService.GeneratedCredential("trk_123", "hash", "salt"));

        grievancePersistenceService.persistSubmission("Narrative text with valid length satisfied.", pred);

        ArgumentCaptor<Prediction> predCaptor = ArgumentCaptor.forClass(Prediction.class);
        verify(predictionRepository).save(predCaptor.capture());
        Prediction saved = predCaptor.getValue();
        assertThat(saved.getExplanation()).isNull();
    }

    @Test
    @DisplayName("GrievancePersistenceService method is annotated with @Transactional for Spring proxy interception")
    void transactionalAnnotationPresent() throws NoSuchMethodException {
        Method method = GrievancePersistenceService.class.getMethod("persistSubmission", String.class, NlpPrediction.class);
        boolean hasMethodTx = method.isAnnotationPresent(Transactional.class);
        boolean hasClassTx = GrievancePersistenceService.class.isAnnotationPresent(Transactional.class);

        assertThat(hasMethodTx || hasClassTx)
                .as("GrievancePersistenceService must have @Transactional at class or method level for proxy interception")
                .isTrue();
    }
}
