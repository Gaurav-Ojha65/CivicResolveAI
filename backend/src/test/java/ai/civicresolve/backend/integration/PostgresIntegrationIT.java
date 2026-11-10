package ai.civicresolve.backend.integration;

import ai.civicresolve.backend.dto.ConsumerTimelineEvent;
import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
import ai.civicresolve.backend.dto.GrievanceTrackRequest;
import ai.civicresolve.backend.dto.GrievanceTrackingResponse;
import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.GrievanceTrackingCredential;
import ai.civicresolve.backend.entity.Prediction;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.exception.TrackingNotFoundException;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import ai.civicresolve.backend.repository.ProductCategoryRepository;
import ai.civicresolve.backend.service.GrievancePersistenceService;
import ai.civicresolve.backend.service.GrievanceService;
import ai.civicresolve.backend.service.GrievanceTrackingService;
import ai.civicresolve.backend.service.NlpExplanation;
import ai.civicresolve.backend.service.NlpPrediction;
import ai.civicresolve.backend.dto.GrievanceDetailResponse;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.Session;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BrokenBarrierException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * PostgreSQL-backed integration tests for CivicResolve AI.
 *
 * <p>These tests run strictly against the isolated test database {@code civicresolve_test}.
 * They are only enabled when {@code SPRING_DATASOURCE_PASSWORD} is set in the environment.
 *
 * <p>Run with: {@code backend\mvnw.cmd verify} (or {@code -Dtest=PostgresIntegrationIT} during verify).
 *
 * <p>Tests verify:
 * <ul>
 *   <li>1. Flyway migrations applied correctly and recorded through V5 in {@code flyway_schema_history}</li>
 *   <li>2. Predictions foreign key constraint rejects invalid categories with SQLSTATE 23503</li>
 *   <li>3. Application role {@code civicresolve_app} prohibited from UPDATE/DELETE on immutable tables (SQLSTATE 42501, non-destructive WHERE FALSE)</li>
 *   <li>4. Production GrievancePersistenceService rolls back grievance, prediction, and audit log after post-flush failure</li>
 *   <li>4b. Induced early-failure confidence constraint rollback regression test</li>
 *   <li>5. Optimistic locking version conflict produces stale-update OptimisticLockingFailureException across two independent transactions</li>
 *   <li>5b. Deterministic concurrent HTTP race against real review endpoint produces HTTP 409 ProblemDetail from OptimisticLockingFailureException without SQL leakage</li>
 *   <li>5c. Sequential stale-client review produces HTTP 409 ProblemDetail from browser-level optimistic lock without state mutation or audit insertion</li>
 *   <li>6–14. Baseline grievance, prediction JSONB, and audit log persistence</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("it")
@EnabledIfEnvironmentVariable(named = "SPRING_DATASOURCE_PASSWORD", matches = ".+")
@DisplayName("PostgreSQL Integration Tests — civicresolve_test")
class PostgresIntegrationIT {

    @MockitoSpyBean private GrievanceRepository grievanceRepository;
    @Autowired private PredictionRepository predictionRepository;
    @MockitoSpyBean private AuditLogRepository auditLogRepository;
    @Autowired private ProductCategoryRepository productCategoryRepository;
    @MockitoSpyBean private GrievanceTrackingCredentialRepository trackingCredentialRepository;
    @Autowired private GrievancePersistenceService grievancePersistenceService;
    @Autowired private GrievanceTrackingService grievanceTrackingService;
    @Autowired private GrievanceService grievanceService;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private DataSource dataSource;
    @Autowired(required = false) private Flyway flyway;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @PersistenceContext
    private EntityManager entityManager;

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

    @AfterEach
    void resetSpies() {
        Mockito.reset(auditLogRepository, grievanceRepository, trackingCredentialRepository);
    }

    // ─── 1. Flyway Migration History Verification ─────────────────────────────

    @Test
    @DisplayName("1. Flyway: V1–V6 migrations are recorded successfully in flyway_schema_history")
    void flywayMigrationsV1ThroughV6RecordedInHistory() throws SQLException {
        assertThat(flyway).as("Flyway bean must be present in Spring context").isNotNull();

        // 1. Verify via Flyway MigrationInfo API
        MigrationInfo[] applied = flyway.info().applied();
        assertThat(applied)
                .as("All 6 Flyway migrations (V1–V6) must be applied to civicresolve_test")
                .hasSize(6);

        assertThat(applied)
                .extracting(info -> info.getVersion().getVersion())
                .containsExactly("1", "2", "3", "4", "5", "6");

        // Verify individual migration versions, descriptions, and applied states
        MigrationInfo v1 = applied[0];
        assertThat(v1.getDescription()).isEqualTo("create schema");
        assertThat(v1.getState().isApplied()).isTrue();

        MigrationInfo v2 = applied[1];
        assertThat(v2.getDescription()).isEqualTo("seed categories");
        assertThat(v2.getState().isApplied()).isTrue();

        MigrationInfo v3 = applied[2];
        assertThat(v3.getDescription()).isEqualTo("grant privileges");
        assertThat(v3.getState().isApplied()).isTrue();

        MigrationInfo v4 = applied[3];
        assertThat(v4.getDescription()).isEqualTo("add version and prediction category fk");
        assertThat(v4.getState().isApplied()).isTrue();

        MigrationInfo v5 = applied[4];
        assertThat(v5.getDescription()).isEqualTo("add complaint tracking");
        assertThat(v5.getState().isApplied()).isTrue();

        MigrationInfo v6 = applied[5];
        assertThat(v6.getDescription()).isEqualTo("add prediction explanation");
        assertThat(v6.getState().isApplied()).isTrue();

        // 2. Direct database query to flyway_schema_history using Flyway's migrator connection
        DataSource flywayDs = flyway.getConfiguration().getDataSource();
        try (Connection conn = flywayDs.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(
                     "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank")) {

            List<String> recordedVersions = new ArrayList<>();
            Map<String, String> recordedDescriptions = new java.util.LinkedHashMap<>();
            while (rs.next()) {
                String version = rs.getString("version");
                String description = rs.getString("description");
                boolean success = rs.getBoolean("success");
                recordedVersions.add(version);
                recordedDescriptions.put(version, description);
                assertThat(success).as("Migration version %s must succeed", version).isTrue();
            }
            assertThat(recordedVersions).containsExactly("1", "2", "3", "4", "5", "6");
            assertThat(recordedDescriptions)
                    .containsEntry("1", "create schema")
                    .containsEntry("2", "seed categories")
                    .containsEntry("3", "grant privileges")
                    .containsEntry("4", "add version and prediction category fk")
                    .containsEntry("5", "add complaint tracking")
                    .containsEntry("6", "add prediction explanation");
        }
    }

    // ─── 2. Foreign-Key Enforcement Verification ──────────────────────────────

    @Test
    @Transactional
    @DisplayName("2. Foreign-Key: Invalid prediction category fails with PostgreSQL foreign-key violation SQLSTATE 23503")
    void invalidPredictionCategoryRejectionSqlstate23503() throws SQLException {
        Grievance g = createGrievance();

        // WHY entityManager.flush() ALONE IS INSUFFICIENT:
        // flush() writes the grievance INSERT to PostgreSQL's write-ahead log, but the row remains
        // inside an uncommitted transaction. PostgreSQL's default READ COMMITTED isolation guarantees
        // that any *separate* JDBC connection can only see committed data. Opening a new connection
        // via dataSource.getConnection() would therefore be unable to see the uncommitted grievance,
        // causing the prediction INSERT to fail on fk_predictions_grievance before reaching
        // fk_predictions_category — the wrong constraint, and a test that proves nothing.
        //
        // CORRECT APPROACH — Session.doWork():
        // Hibernate's Session.doWork() passes the *transaction-bound* JDBC connection to the lambda.
        // Both the flushed grievance row and the subsequent prediction INSERT share the same
        // connection and the same transaction; PostgreSQL can see the uncommitted grievance within
        // that transaction, satisfies fk_predictions_grievance, and then correctly rejects the
        // invalid predicted_category on fk_predictions_category (SQLSTATE 23503).
        //
        // After the constraint violation PostgreSQL aborts the transaction. We capture and assert
        // the exception, then allow the test @Transactional boundary to roll back — no further
        // statements are issued on the aborted connection.
        entityManager.flush();

        String invalidCategory = "Unapproved Nonexistent Category 99";
        assertThat(productCategoryRepository.existsByLabel(invalidCategory)).isFalse();

        // Holder for the SQLException thrown inside doWork; re-thrown after doWork returns
        // so it can be asserted outside the lambda (doWork only propagates RuntimeException).
        final SQLException[] capturedSqlException = {null};

        entityManager.unwrap(Session.class).doWork(conn -> {
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO predictions (grievance_id, predicted_category, model_used, model_version, " +
                    "confidence, margin, probabilities, triage_priority) " +
                    "VALUES (?, ?, 'baseline_tfidf_logreg', '7a9964e0ef15514d', " +
                    "0.85, 0.70, '{\"Credit card\": 0.85}'::jsonb, 'LOW')")) {
                ps.setObject(1, g.getId());
                ps.setString(2, invalidCategory);
                ps.executeUpdate();
                // If no exception: fail inside doWork (doWork catches RuntimeException, not AssertionError)
                org.junit.jupiter.api.Assertions.fail(
                        "Expected PostgreSQL foreign-key violation SQLSTATE 23503 on fk_predictions_category");
            } catch (SQLException e) {
                // Capture for assertion outside the doWork lambda; do NOT issue further SQL on
                // this connection — the transaction is now aborted by PostgreSQL.
                capturedSqlException[0] = e;
            }
        });

        // Assert the captured exception outside doWork where AssertJ matchers work normally
        SQLException sqlEx = capturedSqlException[0];
        assertThat((Throwable) sqlEx)
                .as("A PostgreSQL SQLException must have been thrown by the invalid INSERT")
                .isNotNull();
        assertThat(sqlEx.getSQLState())
                .as("PostgreSQL SQLSTATE for foreign-key violation must be 23503")
                .isEqualTo("23503");
        assertThat(sqlEx.getMessage())
                .as("Error message must reference fk_predictions_category, not fk_predictions_grievance")
                .contains("fk_predictions_category");
    }

    // ─── 3. Least Privilege & Immutability Verification (Non-destructive WHERE FALSE) ───

    @Test
    @DisplayName("3. Least Privilege: civicresolve_app prohibited from UPDATE/DELETE on immutable tables (SQLSTATE 42501)")
    void leastPrivilegeAppRoleProhibitedFromUpdateAndDeleteOnImmutableTablesSqlstate42501() throws SQLException {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {

            // 1. Prohibited UPDATE on predictions (model_version is real VARCHAR(64) column from V1; WHERE FALSE prevents mutation)
            try {
                stmt.executeUpdate("UPDATE predictions SET model_version = 'tampered' WHERE FALSE");
                org.junit.jupiter.api.Assertions.fail("Expected permission denied (SQLSTATE 42501) on UPDATE predictions");
            } catch (SQLException e) {
                assertThat(e.getSQLState())
                        .as("SQLSTATE for permission denied must be 42501, not unrelated SQL error")
                        .isEqualTo("42501");
                assertThat(e.getMessage()).containsIgnoringCase("permission denied");
            }

            // 1b. Prohibited UPDATE on predictions explanation JSONB column (V6 addition; WHERE FALSE prevents mutation)
            try {
                stmt.executeUpdate("UPDATE predictions SET explanation = '{\"tampered\": true}'::jsonb WHERE FALSE");
                org.junit.jupiter.api.Assertions.fail("Expected permission denied (SQLSTATE 42501) on UPDATE predictions.explanation");
            } catch (SQLException e) {
                assertThat(e.getSQLState())
                        .as("SQLSTATE for permission denied must be 42501 on explanation column")
                        .isEqualTo("42501");
                assertThat(e.getMessage()).containsIgnoringCase("permission denied");
            }

            // 2. Prohibited DELETE on predictions (WHERE FALSE prevents mutation)
            try {
                stmt.executeUpdate("DELETE FROM predictions WHERE FALSE");
                org.junit.jupiter.api.Assertions.fail("Expected permission denied (SQLSTATE 42501) on DELETE predictions");
            } catch (SQLException e) {
                assertThat(e.getSQLState())
                        .as("SQLSTATE for permission denied must be 42501, not unrelated SQL error")
                        .isEqualTo("42501");
                assertThat(e.getMessage()).containsIgnoringCase("permission denied");
            }

            // 3. Prohibited UPDATE on audit_log (action = 'APPROVE' satisfies CHECK constraint; WHERE FALSE prevents mutation)
            try {
                stmt.executeUpdate("UPDATE audit_log SET action = 'APPROVE' WHERE FALSE");
                org.junit.jupiter.api.Assertions.fail("Expected permission denied (SQLSTATE 42501) on UPDATE audit_log");
            } catch (SQLException e) {
                assertThat(e.getSQLState())
                        .as("SQLSTATE for permission denied must be 42501, not unrelated SQL error")
                        .isEqualTo("42501");
                assertThat(e.getMessage()).containsIgnoringCase("permission denied");
            }

            // 4. Prohibited DELETE on audit_log (WHERE FALSE prevents mutation)
            try {
                stmt.executeUpdate("DELETE FROM audit_log WHERE FALSE");
                org.junit.jupiter.api.Assertions.fail("Expected permission denied (SQLSTATE 42501) on DELETE audit_log");
            } catch (SQLException e) {
                assertThat(e.getSQLState())
                        .as("SQLSTATE for permission denied must be 42501, not unrelated SQL error")
                        .isEqualTo("42501");
                assertThat(e.getMessage()).containsIgnoringCase("permission denied");
            }

            // 5. Prohibited DELETE on grievances (WHERE FALSE prevents mutation)
            try {
                stmt.executeUpdate("DELETE FROM grievances WHERE FALSE");
                org.junit.jupiter.api.Assertions.fail("Expected permission denied (SQLSTATE 42501) on DELETE grievances");
            } catch (SQLException e) {
                assertThat(e.getSQLState())
                        .as("SQLSTATE for permission denied must be 42501, not unrelated SQL error")
                        .isEqualTo("42501");
                assertThat(e.getMessage()).containsIgnoringCase("permission denied");
            }
        }
    }

    // ─── 4. Atomic Rollback Verification in Production Persistence Service ─────

    @Test
    @DisplayName("4. Atomic Rollback: Production GrievancePersistenceService rolls back grievance, prediction, and audit log after post-flush exception")
    void atomicRollbackAcrossAllThreeEntitiesAfterPostFlushException() throws SQLException {
        // Notice: This test method intentionally runs WITHOUT @Transactional on the test method.
        // It asserts that GrievancePersistenceService's production @Transactional boundary
        // atomically rolls back grievance, prediction, and audit entries when a failure occurs
        // after all three entities have been inserted and flushed within the service transaction.

        String uniqueNarrative = "Rollback test unique narrative " + UUID.randomUUID() + ". Meets minimum length requirement.";

        NlpPrediction validPred = new NlpPrediction(
                "Credit card",
                0.92,
                0.75,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                false,
                List.of(),
                "LOW",
                List.of("Keyword: routine inquiry."),
                0.25,
                "POSITIVE",
                "Disclaimer text"
        );

        // Configure test-only spy to persist the audit log via EntityManager, flush all three
        // pending INSERTs (grievance, prediction, audit_log) to PostgreSQL, and then throw a
        // controlled runtime exception while still inside the service @Transactional boundary.
        //
        // WHY NOT invocation.callRealMethod():
        // AuditLogRepository is a Spring Data JPA interface. In Mockito 5, callRealMethod() on
        // a spy wrapping an interface-backed proxy throws MockitoException ("Cannot call abstract
        // real method on java object"). We bypass this by performing the persist+flush directly
        // through the injected EntityManager, which is the same JPA context the service uses.
        Mockito.doAnswer(invocation -> {
            AuditLog auditLog = invocation.getArgument(0, AuditLog.class);
            // Persist the audit log entity using the same EntityManager as the service transaction
            entityManager.persist(auditLog);
            // Flush all three pending INSERTs (grievance, prediction, audit_log) to PostgreSQL.
            // This proves that all writes have left the JPA cache and hit the database before we throw.
            entityManager.flush();
            throw new RuntimeException("Deliberate post-flush exception to test atomic multi-entity rollback in production service");
        }).when(auditLogRepository).save(Mockito.any(AuditLog.class));

        try {
            assertThatThrownBy(() -> grievancePersistenceService.persistSubmission(uniqueNarrative, validPred))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Deliberate post-flush exception");

            // Using an independent connection, assert that all three corresponding records are absent after rollback
            // Identified using unique test data (uniqueNarrative), not global table counts
            try (Connection conn = dataSource.getConnection()) {
                try (PreparedStatement ps = conn.prepareStatement("SELECT count(*) FROM grievances WHERE narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1))
                                .as("Grievance record must be absent after rollback")
                                .isZero();
                    }
                }

                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT count(*) FROM predictions p JOIN grievances g ON p.grievance_id = g.id WHERE g.narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1))
                                .as("Prediction record must be absent after rollback")
                                .isZero();
                    }
                }

                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT count(*) FROM audit_log a JOIN grievances g ON a.grievance_id = g.id WHERE g.narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1))
                                .as("Audit log record must be absent after rollback")
                                .isZero();
                    }
                }

                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT count(*) FROM grievance_tracking_credentials c JOIN grievances g ON c.grievance_id = g.id WHERE g.narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1))
                                .as("Tracking credential record must be absent after rollback")
                                .isZero();
                    }
                }
            }

            // Also assert via repository in an independent fresh transaction
            TransactionTemplate tx = new TransactionTemplate(transactionManager);
            tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            tx.executeWithoutResult(status -> {
                List<Grievance> foundGrievances = grievanceRepository.findAll()
                        .stream()
                        .filter(g -> uniqueNarrative.equals(g.getNarrative()))
                        .toList();
                assertThat(foundGrievances).isEmpty();

                List<Prediction> foundPredictions = predictionRepository.findAll()
                        .stream()
                        .filter(p -> p.getGrievance() != null && uniqueNarrative.equals(p.getGrievance().getNarrative()))
                        .toList();
                assertThat(foundPredictions).isEmpty();

                List<AuditLog> foundAudits = auditLogRepository.findAll()
                        .stream()
                        .filter(a -> a.getGrievance() != null && uniqueNarrative.equals(a.getGrievance().getNarrative()))
                        .toList();
                assertThat(foundAudits).isEmpty();

                List<GrievanceTrackingCredential> foundCreds = trackingCredentialRepository.findAll()
                        .stream()
                        .filter(c -> foundGrievances.stream().anyMatch(g -> g.getId().equals(c.getGrievanceId())))
                        .toList();
                assertThat(foundCreds).isEmpty();
            });

        } finally {
            Mockito.reset(auditLogRepository);
        }
    }

    @Test
    @DisplayName("4b. Atomic Rollback: Induced confidence constraint failure rolls back all related writes in a fresh transaction")
    void atomicRollbackOnInducedPersistenceFailureInFreshTransaction() throws SQLException {
        String uniqueNarrative = "Unique narrative for atomic rollback test " + UUID.randomUUID() + ". Meets minimum length requirement.";

        // Create an NlpPrediction with an invalid confidence value (2.5), violating PostgreSQL column CHECK (confidence >= 0 AND confidence <= 1) from V1
        NlpPrediction invalidPred = new NlpPrediction(
                "Credit card",
                2.5, // Invalid: exceeds 1.0, violates DB check constraint
                0.5,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                false,
                List.of(),
                "LOW",
                List.of("Keyword: routine inquiry."),
                0.12,
                "POSITIVE",
                "Disclaimer text"
        );

        // Attempt submission; the transaction must fail when flushing prediction to PostgreSQL
        assertThatThrownBy(() -> grievancePersistenceService.persistSubmission(uniqueNarrative, invalidPred))
                .isInstanceOf(Exception.class);

        // Verify across an independent JDBC connection that ZERO rows were committed across grievances, predictions, and audit_log
        try (Connection conn = dataSource.getConnection()) {
            try (PreparedStatement ps = conn.prepareStatement("SELECT count(*) FROM grievances WHERE narrative = ?")) {
                ps.setString(1, uniqueNarrative);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getLong(1))
                            .as("Grievance write must be rolled back completely when downstream write fails")
                            .isZero();
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT count(*) FROM predictions p JOIN grievances g ON p.grievance_id = g.id WHERE g.narrative = ?")) {
                ps.setString(1, uniqueNarrative);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getLong(1))
                            .as("Prediction write must be rolled back completely")
                            .isZero();
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT count(*) FROM audit_log a JOIN grievances g ON a.grievance_id = g.id WHERE g.narrative = ?")) {
                ps.setString(1, uniqueNarrative);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getLong(1))
                            .as("Audit log write must be rolled back completely")
                            .isZero();
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT count(*) FROM grievance_tracking_credentials c JOIN grievances g ON c.grievance_id = g.id WHERE g.narrative = ?")) {
                ps.setString(1, uniqueNarrative);
                try (ResultSet rs = ps.executeQuery()) {
                    rs.next();
                    assertThat(rs.getLong(1))
                            .as("Tracking credential write must be rolled back completely")
                            .isZero();
                }
            }
        }
    }

    // ─── 5. Optimistic Locking Verification ────────────────────────────────────

    @Test
    @DisplayName("5. Optimistic Locking: Two independent transactions produce stale-update OptimisticLockingFailureException")
    void optimisticLockingStaleUpdateConflict() {
        // Step 1: Create a grievance in an initial committed transaction
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID grievanceId = tx.execute(status -> {
            Grievance g = new Grievance(
                    "Narrative for optimistic locking test " + UUID.randomUUID() + ". Meets required length.",
                    "Credit card",
                    TriagePriority.HIGH,
                    GrievanceStatus.PENDING_REVIEW,
                    true
            );
            return grievanceRepository.save(g).getId();
        });

        assertThat(grievanceId).isNotNull();

        // Step 2: Transaction A reads the entity at version 0
        Grievance staleGrievance = tx.execute(status -> grievanceRepository.findById(grievanceId).orElseThrow());
        assertThat(staleGrievance.getVersion()).isEqualTo(0L);

        // Step 3: Transaction B updates the entity concurrently and commits (version increments to 1)
        tx.executeWithoutResult(status -> {
            Grievance g = grievanceRepository.findById(grievanceId).orElseThrow();
            g.setStatus(GrievanceStatus.APPROVED);
            g.setReviewRequired(false);
            grievanceRepository.save(g);
        });

        // Verify version in database is now 1
        Long currentVersion = tx.execute(status -> grievanceRepository.findById(grievanceId).orElseThrow().getVersion());
        assertThat(currentVersion).isEqualTo(1L);

        // Step 4: Transaction A attempts to update using the stale entity (version 0)
        // Hibernate detects version mismatch (UPDATE ... WHERE id = ? AND version = 0 matches 0 rows)
        // and throws OptimisticLockingFailureException
        staleGrievance.setStatus(GrievanceStatus.REJECTED);

        OptimisticLockingFailureException thrown = org.junit.jupiter.api.Assertions.assertThrows(
                OptimisticLockingFailureException.class,
                () -> tx.executeWithoutResult(status -> grievanceRepository.saveAndFlush(staleGrievance))
        );

        assertThat(thrown)
                .as("Hibernate must throw OptimisticLockingFailureException upon stale version conflict")
                .isNotNull();
    }

    @Test
    @DisplayName("5b. Deterministic Concurrent HTTP Race: Interleaved review requests produce HTTP 409 from OptimisticLockingFailureException without SQL details")
    void concurrentHttpReviewRequestsProduceOptimisticLockConflict409() throws Exception {
        // Step 1: Create a grievance in PENDING_REVIEW state at version 0
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID grievanceId = tx.execute(status -> {
            Grievance g = new Grievance(
                    "Narrative for concurrent HTTP race " + UUID.randomUUID() + ". Valid length for grievance.",
                    "Credit card",
                    TriagePriority.HIGH,
                    GrievanceStatus.PENDING_REVIEW,
                    true
            );
            return grievanceRepository.save(g).getId();
        });

        assertThat(grievanceId).isNotNull();

        // Step 2: Synchronize concurrent requests at grievanceRepository.findById().
        // In GrievanceService.review(), grievanceRepository.findById() is invoked before any
        // state mutation, transaction write, or Hibernate flush occurs.
        // Synchronizing both requests here guarantees that both demonstrably observe the exact
        // same initial entity version (version 0) before either attempts its competing update.
        CyclicBarrier barrier = new CyclicBarrier(2);
        java.util.concurrent.atomic.AtomicInteger findCount = new java.util.concurrent.atomic.AtomicInteger(0);

        Mockito.doAnswer(invocation -> {
            UUID id = invocation.getArgument(0);
            Grievance grievance = entityManager.find(Grievance.class, id);
            if (findCount.incrementAndGet() <= 2) {
                try {
                    barrier.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError("Thread interrupted while waiting at concurrency barrier", e);
                } catch (BrokenBarrierException | TimeoutException e) {
                    throw new AssertionError("Concurrency barrier timed out or broken waiting for both requests", e);
                }
            }
            return Optional.ofNullable(grievance);
        }).when(grievanceRepository).findById(grievanceId);

        ExecutorService executor = Executors.newFixedThreadPool(2);

        try {
            // Step 3: Launch Request 1 and Request 2 concurrently on independent threads
            CompletableFuture<MvcResult> req1Future = CompletableFuture.supplyAsync(() -> {
                try {
                    return mockMvc.perform(patch("/api/grievances/{id}/review", grievanceId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {
                                                "action": "APPROVE",
                                                "expectedVersion": 0
                                            }
                                            """)
                                    .with(user("reviewer").roles("REVIEWER")))
                            .andReturn();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, executor);

            CompletableFuture<MvcResult> req2Future = CompletableFuture.supplyAsync(() -> {
                try {
                    return mockMvc.perform(patch("/api/grievances/{id}/review", grievanceId)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {
                                                "action": "APPROVE",
                                                "expectedVersion": 0
                                            }
                                            """)
                                    .with(user("reviewer").roles("REVIEWER")))
                            .andReturn();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, executor);

            MvcResult res1 = req1Future.get(15, TimeUnit.SECONDS);
            MvcResult res2 = req2Future.get(15, TimeUnit.SECONDS);

            // Reset spy immediately so Step 5 database assertions invoke real repository methods
            Mockito.reset(grievanceRepository);

            // Step 4: Verify scheduling-independent HTTP statuses: exactly one 200 OK and one 409 Conflict
            int status1 = res1.getResponse().getStatus();
            int status2 = res2.getResponse().getStatus();

            assertThat(List.of(status1, status2))
                    .as("Exactly one concurrent review request must succeed with 200 and one must fail with 409 Conflict")
                    .containsExactlyInAnyOrder(200, 409);

            MvcResult conflictResult = (status1 == 409) ? res1 : res2;
            String body = conflictResult.getResponse().getContentAsString();

            // ── Structured RFC 9457 ProblemDetail validation ──────────────────────────
            // Parse the response body as a JsonNode to validate each field independently.
            // Raw substring matching on the full body is insufficient because the legitimate
            // `instance` field contains "/api/grievances/{uuid}/review" — which includes the
            // word "grievances" as part of the REST resource path, not as a schema/SQL leak.
            JsonNode problem = objectMapper.readTree(body);

            // 1. HTTP status field
            assertThat(problem.path("status").asInt())
                    .as("ProblemDetail status must be 409")
                    .isEqualTo(409);

            // 2. Conflict type URL — proves OptimisticLockingFailureException was handled,
            //    not a workflow-state rejection (which would produce a different type URI)
            assertThat(problem.path("type").asText())
                    .as("Problem type must be the conflict URI, not a workflow-state error type")
                    .isEqualTo("https://civicresolve.ai/errors/conflict");

            // 3. Human-readable title
            assertThat(problem.path("title").asText())
                    .as("Title must identify a concurrent modification conflict")
                    .isEqualTo("Concurrent Modification Conflict");

            // 4. Safe, user-facing detail message — must not contain SQL or implementation details
            assertThat(problem.path("detail").asText())
                    .as("Detail must contain the safe concurrency message")
                    .contains("The grievance was updated by another transaction. Please refresh and try again.");

            // 5. Instance field — must be the exact REST path for this grievance
            assertThat(problem.path("instance").asText())
                    .as("Instance must be the REST path for the contested grievance review endpoint")
                    .isEqualTo("/api/grievances/" + grievanceId + "/review");

            // ── Sensitive diagnostic leak check ──────────────────────────────────────────
            // Check that no field in the ProblemDetail (other than `instance`, which legitimately
            // contains the REST resource path) exposes SQL statements, schema/table names,
            // internal exception class names, or version-column details.
            //
            // Strategy: build a diagnostic view that excludes the `instance` field value, then
            // assert that none of the prohibited diagnostic strings appear in the remaining content.
            // The word "grievances" is only permitted inside `instance`; all other fields must be clean.
            assertThat(problem).isInstanceOf(ObjectNode.class);
            ObjectNode problemCopy = (ObjectNode) problem.deepCopy();
            problemCopy.remove("instance");
            String bodyWithoutInstance = problemCopy.toString();

            assertThat(bodyWithoutInstance)
                    .as("ProblemDetail fields other than 'instance' must not expose SQL, table names, " +
                        "internal exception types, version-column names, or stack traces")
                    .doesNotContain(
                            "SQL",                    // raw SQL statement or error prefix
                            "grievances",             // database table name (allowed only in instance path)
                            "version",                // optimistic-lock version column name
                            "Table",                  // JDBC/Hibernate table reference
                            "OptimisticLockException" // internal exception class name
                    );

            // Step 5: Verify final database consistency in an independent transaction
            tx.executeWithoutResult(status -> {
                Grievance g = grievanceRepository.findById(grievanceId).orElseThrow();
                assertThat(g.getVersion())
                        .as("Grievance version must have incremented exactly once from 0 to 1")
                        .isEqualTo(1L);
                assertThat(g.getStatus())
                        .as("Grievance status must be APPROVED from the single committed review")
                        .isEqualTo(GrievanceStatus.APPROVED);
                assertThat(g.isReviewRequired())
                        .as("Review required must be cleared after approval")
                        .isFalse();

                // Verify audit trail: only the winning review transaction committed;
                // the losing transaction's audit record was rolled back.
                List<AuditLog> auditLogs = auditLogRepository.findByGrievanceIdOrderByCreatedAtAsc(grievanceId);
                assertThat(auditLogs)
                        .as("Exactly one audit log entry must exist for the review; losing transaction was rolled back")
                        .hasSize(1);
                assertThat(auditLogs.get(0).getAction()).isEqualTo("APPROVE");
                assertThat(auditLogs.get(0).getNewStatus()).isEqualTo(GrievanceStatus.APPROVED);
            });

        } finally {
            // Always release waiting threads and clean up resources
            barrier.reset();
            Mockito.reset(grievanceRepository);
            Mockito.reset(auditLogRepository);
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("5c. Sequential Stale-Client Review: Reviewer A submits with stale version after Reviewer B succeeds → HTTP 409")
    void sequentialStaleClientReviewProducesHttp409() throws Exception {
        // Step 1: Create a grievance in PENDING_REVIEW state at version 0
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        UUID grievanceId = tx.execute(status -> {
            Grievance g = new Grievance(
                    "Narrative for sequential stale review test " + UUID.randomUUID() + ". Meets required length.",
                    "Credit card",
                    TriagePriority.HIGH,
                    GrievanceStatus.PENDING_REVIEW,
                    true
            );
            return grievanceRepository.save(g).getId();
        });

        assertThat(grievanceId).isNotNull();

        // Step 2: Reviewer A and Reviewer B both read the grievance at version 0 (via GET /api/grievances/{id})
        MvcResult getResultA = mockMvc.perform(get("/api/grievances/{id}", grievanceId)
                        .with(user("reviewerA").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.narrative").isNotEmpty())
                .andReturn();

        JsonNode detailNode = objectMapper.readTree(getResultA.getResponse().getContentAsString());
        long observedVersionA = detailNode.path("version").asLong();
        long observedVersionB = observedVersionA; // Reviewer B observed the same initial version 0
        assertThat(observedVersionA).isEqualTo(0L);

        // Step 3: Reviewer B submits a valid review decision using expectedVersion: 0
        mockMvc.perform(patch("/api/grievances/{id}/review", grievanceId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "APPROVE",
                                    "expectedVersion": %d
                                }
                                """.formatted(observedVersionB))
                        .with(user("reviewerB").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.version").value(1));

        // Step 4: Verify version has incremented in the database to 1
        tx.executeWithoutResult(status -> {
            Grievance g = grievanceRepository.findById(grievanceId).orElseThrow();
            assertThat(g.getVersion()).isEqualTo(1L);
            assertThat(g.getStatus()).isEqualTo(GrievanceStatus.APPROVED);
        });

        int auditCountAfterB = tx.execute(status -> auditLogRepository.findByGrievanceIdOrderByCreatedAtAsc(grievanceId).size());
        assertThat(auditCountAfterB).isEqualTo(1);

        // Step 5: Reviewer A attempts to submit a review decision using stale expectedVersion: 0
        // Step 6: Reviewer A receives HTTP 409 Conflict
        mockMvc.perform(patch("/api/grievances/{id}/review", grievanceId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                    "action": "OVERRIDE",
                                    "newCategory": "Debt collection",
                                    "reviewNote": "Reviewer A attempting late override",
                                    "expectedVersion": %d
                                }
                                """.formatted(observedVersionA))
                        .with(user("reviewerA").roles("REVIEWER")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("https://civicresolve.ai/errors/conflict"))
                .andExpect(jsonPath("$.title").value("Concurrent Modification Conflict"))
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.detail").value("The grievance was updated by another reviewer. Please refresh and try again."));

        // Step 7: The grievance remains unchanged after A's rejected operation
        tx.executeWithoutResult(status -> {
            Grievance g = grievanceRepository.findById(grievanceId).orElseThrow();
            assertThat(g.getVersion()).isEqualTo(1L);
            assertThat(g.getStatus()).isEqualTo(GrievanceStatus.APPROVED);
            assertThat(g.getAssignedCategory()).isEqualTo("Credit card"); // NOT changed to "Debt collection"
        });

        // Step 8: The audit table contains no additional event for A's rejected operation
        tx.executeWithoutResult(status -> {
            List<AuditLog> auditLogs = auditLogRepository.findByGrievanceIdOrderByCreatedAtAsc(grievanceId);
            assertThat(auditLogs).hasSize(auditCountAfterB);
            assertThat(auditLogs.get(0).getActor()).isEqualTo("reviewerB");
        });
    }

    // ─── 6–14. Baseline Verification Tests (Preserved from Phase 7) ────────────

    @Test
    @DisplayName("Flyway: exactly 8 product categories are seeded")
    void exactlyEightCategoriesSeeded() {
        long count = productCategoryRepository.count();
        assertThat(count).isEqualTo(8);
    }

    @Test
    @DisplayName("Flyway: all 8 CFPB category labels exist in database")
    void allCfpbCategoryLabelsExist() {
        List<String> labels = List.of(
                "Credit reporting or other personal consumer reports",
                "Debt collection",
                "Credit card",
                "Checking or savings account",
                "Money transfer, virtual currency, or money service",
                "Mortgage",
                "Student loan",
                "Vehicle loan or lease"
        );
        for (String label : labels) {
            assertThat(productCategoryRepository.existsByLabel(label))
                    .as("Category '%s' should exist", label)
                    .isTrue();
        }
    }

    @Test
    @Transactional
    @DisplayName("Grievance: UUID primary key is auto-generated on save")
    void grievanceUuidGenerated() {
        Grievance g = createGrievance();
        assertThat(g.getId()).isNotNull();
    }

    @Test
    @Transactional
    @DisplayName("Grievance: submitted_at and updated_at are set on creation")
    void grievanceTimestampsSet() {
        Grievance g = createGrievance();
        assertThat(g.getSubmittedAt()).isNotNull();
        assertThat(g.getUpdatedAt()).isNotNull();
    }

    @Test
    @Transactional
    @DisplayName("Grievance: roundtrip SELECT matches INSERT values")
    void grievanceRoundtrip() {
        Grievance g = createGrievance();
        Optional<Grievance> found = grievanceRepository.findById(g.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getAssignedCategory()).isEqualTo("Credit card");
        assertThat(found.get().getStatus()).isEqualTo(GrievanceStatus.PENDING_REVIEW);
        assertThat(found.get().getPriority()).isEqualTo(TriagePriority.HIGH);
        assertThat(found.get().isReviewRequired()).isTrue();
    }

    @Test
    @Transactional
    @DisplayName("Prediction: JSONB probabilities persist and retrieve with all 8 keys")
    void predictionJsonbProbabilities() {
        Grievance g = createGrievance();
        Prediction p = createPrediction(g);

        Optional<Prediction> found = predictionRepository.findByGrievanceId(g.getId());
        assertThat(found).isPresent();
        Map<String, Double> probs = found.get().getProbabilities();
        assertThat(probs).hasSize(8);
        assertThat(probs.get("Credit card")).isCloseTo(0.03, org.assertj.core.data.Offset.offset(0.001));
    }

    @Test
    @Transactional
    @DisplayName("Prediction: JSONB review_reasons list persists correctly")
    void predictionJsonbReviewReasons() {
        Grievance g = createGrievance();
        Prediction p = createPrediction(g);

        Optional<Prediction> found = predictionRepository.findByGrievanceId(g.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getReviewReasons())
                .containsExactly("HIGH priority requires human review.");
    }

    @Test
    @Transactional
    @DisplayName("Prediction: sentiment fields persist correctly")
    void predictionSentimentFields() {
        Grievance g = createGrievance();
        Prediction p = createPrediction(g);

        Optional<Prediction> found = predictionRepository.findByGrievanceId(g.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getSentimentScore()).isCloseTo(-0.75, org.assertj.core.data.Offset.offset(0.001));
        assertThat(found.get().getSentimentLabel()).isEqualTo("NEGATIVE");
    }

    @Test
    @Transactional
    @DisplayName("AuditLog: SUBMIT event is persisted with correct fields")
    void auditLogSubmitEvent() {
        Grievance g = createGrievance();
        AuditLog entry = AuditLog.builder(g, "SYSTEM", "SUBMIT")
                .newStatus(GrievanceStatus.PENDING_REVIEW)
                .newCategory("Credit card")
                .newPriority("HIGH")
                .build();
        auditLogRepository.save(entry);

        List<AuditLog> trail = auditLogRepository.findByGrievanceIdOrderByCreatedAtAsc(g.getId());
        assertThat(trail).hasSize(1);
        assertThat(trail.get(0).getAction()).isEqualTo("SUBMIT");
        assertThat(trail.get(0).getActor()).isEqualTo("SYSTEM");
        assertThat(trail.get(0).getCreatedAt()).isNotNull();
    }

    // ─── Stage 2A Tracking Integration Tests ──────────────────────────────

    @Test
    @DisplayName("Stage 2A: Complaint submission persists tracking credential atomically and enables successful tracking query")
    void complaintSubmissionPersistsTrackingCredentialAndEnablesTrackingQuery() {
        String uniqueNarrative = "Submission and tracking integration test " + UUID.randomUUID() + ". Valid character length satisfied.";
        NlpPrediction pred = new NlpPrediction(
                "Credit card",
                0.88,
                0.60,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                false,
                List.of(),
                "LOW",
                List.of("Routine fee inquiry."),
                0.15,
                "POSITIVE",
                "intake disclaimer"
        );

        GrievanceSubmissionResponse submission = grievancePersistenceService.persistSubmission(uniqueNarrative, pred);
        assertThat(submission).isNotNull();
        assertThat(submission.id()).isNotNull();
        assertThat(submission.trackingSecret()).startsWith("trk_");
        assertThat(submission.status()).isEqualTo(GrievanceStatus.AUTO_ROUTED);

        // Verify in PostgreSQL: all four entities are committed
        Optional<Grievance> grievanceOpt = grievanceRepository.findById(submission.id());
        assertThat(grievanceOpt).isPresent();

        Optional<Prediction> predOpt = predictionRepository.findByGrievanceId(submission.id());
        assertThat(predOpt).isPresent();

        List<AuditLog> auditList = auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(submission.id());
        assertThat(auditList).hasSize(1);
        assertThat(auditList.get(0).getAction()).isEqualTo("SUBMIT");

        Optional<GrievanceTrackingCredential> credOpt = trackingCredentialRepository.findByGrievanceId(submission.id());
        assertThat(credOpt).isPresent();
        GrievanceTrackingCredential cred = credOpt.get();
        assertThat(cred.getSecretHash()).hasSize(64);
        assertThat(cred.getSalt()).hasSize(32);
        assertThat(cred.getLookupCount()).isZero();
        assertThat(cred.getLastAccessedAt()).isNull();

        // Query the tracking service with valid secret using dedicated test IP
        GrievanceTrackRequest trackRequest = new GrievanceTrackRequest(submission.id(), submission.trackingSecret());
        GrievanceTrackingResponse trackResponse = grievanceTrackingService.track(trackRequest, "192.0.2.11");

        assertThat(trackResponse).isNotNull();
        assertThat(trackResponse.referenceId()).isEqualTo(submission.id());
        assertThat(trackResponse.status()).isEqualTo(GrievanceStatus.AUTO_ROUTED);
        assertThat(trackResponse.assignedCategory()).isEqualTo("Credit card");
        assertThat(trackResponse.priority()).isEqualTo(TriagePriority.LOW);
        assertThat(trackResponse.timeline()).hasSize(1);
        assertThat(trackResponse.timeline().get(0).stage()).isEqualTo("AUTOMATED_TRIAGE");
        assertThat(trackResponse.timeline().get(0).title()).isEqualTo("Automated Triage Complete");

        // Verify lookup metadata updated in database
        Optional<GrievanceTrackingCredential> updatedCredOpt = trackingCredentialRepository.findByGrievanceId(submission.id());
        assertThat(updatedCredOpt).isPresent();
        assertThat(updatedCredOpt.get().getLookupCount()).isEqualTo(1);
        assertThat(updatedCredOpt.get().getLastAccessedAt()).isNotNull();
    }

    @Test
    @DisplayName("Stage 2A: Tracking query with incorrect secret returns 404 and leaves lookupCount unchanged in DB")
    void trackingCredentialVerificationFailsWithWrongSecretLeavingLookupCountUnchanged() {
        String uniqueNarrative = "Wrong secret tracking test " + UUID.randomUUID() + ". Sufficient character length.";
        NlpPrediction pred = new NlpPrediction(
                "Mortgage",
                0.90,
                0.70,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                true,
                List.of("HIGH priority requires review."),
                "HIGH",
                List.of("Escrow dispute."),
                -0.45,
                "NEGATIVE",
                "intake disclaimer"
        );

        GrievanceSubmissionResponse submission = grievancePersistenceService.persistSubmission(uniqueNarrative, pred);

        // Attempt track with wrong secret (valid format 47 chars, wrong secret) using dedicated test IP
        String wrongSecret = "trk_0000000000000000000000000000000000000000000";
        GrievanceTrackRequest wrongRequest = new GrievanceTrackRequest(submission.id(), wrongSecret);

        assertThatThrownBy(() -> grievanceTrackingService.track(wrongRequest, "192.0.2.12"))
                .isInstanceOf(TrackingNotFoundException.class)
                .hasMessage("Complaint not found or invalid tracking secret.");

        // Verify lookupCount remains 0 and lastAccessedAt remains null
        Optional<GrievanceTrackingCredential> credOpt = trackingCredentialRepository.findByGrievanceId(submission.id());
        assertThat(credOpt).isPresent();
        assertThat(credOpt.get().getLookupCount()).isZero();
        assertThat(credOpt.get().getLastAccessedAt()).isNull();
    }

    @Test
    @DisplayName("Stage 2A: Timeline projection strictly preserves deterministic ascending ordering by created_at and id")
    void trackingTimelineProjectionDeterministicOrdering() {
        String uniqueNarrative = "Timeline ordering test " + UUID.randomUUID() + ". Meets minimum length requirement.";
        NlpPrediction pred = new NlpPrediction(
                "Credit card",
                0.80,
                0.50,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                true,
                List.of("Review required"),
                "HIGH",
                List.of(),
                -0.20,
                "NEGATIVE",
                "disclaimer"
        );

        GrievanceSubmissionResponse submission = grievancePersistenceService.persistSubmission(uniqueNarrative, pred);
        Grievance grievance = grievanceRepository.findById(submission.id()).orElseThrow();

        // Add an additional audit log entry
        AuditLog reviewLog = AuditLog.builder(grievance, "test_reviewer", "APPROVE")
                .previousStatus(GrievanceStatus.PENDING_REVIEW)
                .newStatus(GrievanceStatus.APPROVED)
                .reviewNote("Verified and approved.")
                .build();
        auditLogRepository.save(reviewLog);

        GrievanceTrackRequest trackRequest = new GrievanceTrackRequest(submission.id(), submission.trackingSecret());
        GrievanceTrackingResponse trackResponse = grievanceTrackingService.track(trackRequest, "192.0.2.13");

        assertThat(trackResponse.timeline()).hasSize(2);
        assertThat(trackResponse.timeline().get(0).stage()).isEqualTo("SUBMITTED");
        assertThat(trackResponse.timeline().get(1).stage()).isEqualTo("REVIEW_APPROVED");
        assertThat(trackResponse.timeline().get(0).timestamp())
                .isBeforeOrEqualTo(trackResponse.timeline().get(1).timestamp());
    }

    @Test
    @DisplayName("Stage 2A: Atomic Rollback: When tracking credential save fails, all 4 entities (grievance, prediction, audit, credential) are rolled back completely")
    void atomicRollbackAcrossAllFourEntitiesWhenTrackingCredentialSaveFails() throws SQLException {
        String uniqueNarrative = "Rollback 4-entity test " + UUID.randomUUID() + ". Valid character length satisfied.";
        NlpPrediction pred = new NlpPrediction(
                "Credit card",
                0.88,
                0.60,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                false,
                List.of(),
                "LOW",
                List.of("Routine fee inquiry."),
                0.15,
                "POSITIVE",
                "intake disclaimer"
        );

        Mockito.doAnswer(invocation -> {
            GrievanceTrackingCredential cred = invocation.getArgument(0, GrievanceTrackingCredential.class);
            entityManager.persist(cred);
            entityManager.flush();
            throw new RuntimeException("Deliberate credential persistence failure to test complete 4-entity atomic rollback");
        }).when(trackingCredentialRepository).save(Mockito.any(GrievanceTrackingCredential.class));

        try {
            assertThatThrownBy(() -> grievancePersistenceService.persistSubmission(uniqueNarrative, pred))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Deliberate credential persistence failure");

            // Verify via independent JDBC connection that zero rows exist across all four tables
            try (Connection conn = dataSource.getConnection()) {
                try (PreparedStatement ps = conn.prepareStatement("SELECT count(*) FROM grievances WHERE narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1)).as("Grievance must be rolled back").isZero();
                    }
                }
                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT count(*) FROM predictions p JOIN grievances g ON p.grievance_id = g.id WHERE g.narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1)).as("Prediction must be rolled back").isZero();
                    }
                }
                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT count(*) FROM audit_log a JOIN grievances g ON a.grievance_id = g.id WHERE g.narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1)).as("Audit log must be rolled back").isZero();
                    }
                }
                try (PreparedStatement ps = conn.prepareStatement(
                        "SELECT count(*) FROM grievance_tracking_credentials c JOIN grievances g ON c.grievance_id = g.id WHERE g.narrative = ?")) {
                    ps.setString(1, uniqueNarrative);
                    try (ResultSet rs = ps.executeQuery()) {
                        rs.next();
                        assertThat(rs.getLong(1)).as("Tracking credential must be rolled back").isZero();
                    }
                }
            }
        } finally {
            Mockito.reset(trackingCredentialRepository);
        }
    }

    @Test
    @DisplayName("Stage 2A: Concurrency: Concurrent successful tracking lookups atomically increment lookupCount without lost updates")
    void concurrentSuccessfulLookupsAtomicallyIncrementCountWithoutLoss() throws Exception {
        String uniqueNarrative = "Concurrency tracking test " + UUID.randomUUID() + ". Sufficient length required.";
        NlpPrediction pred = new NlpPrediction(
                "Credit card",
                0.85,
                0.60,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                false,
                List.of(),
                "LOW",
                List.of("Fee dispute"),
                0.10,
                "POSITIVE",
                "disclaimer"
        );

        GrievanceSubmissionResponse submission = grievancePersistenceService.persistSubmission(uniqueNarrative, pred);
        UUID grievanceId = submission.id();
        String secret = submission.trackingSecret();

        int concurrentLookups = 10;
        ExecutorService executor = Executors.newFixedThreadPool(concurrentLookups);
        CyclicBarrier barrier = new CyclicBarrier(concurrentLookups);
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (int i = 0; i < concurrentLookups; i++) {
            futures.add(CompletableFuture.runAsync(() -> {
                try {
                    barrier.await(5, TimeUnit.SECONDS);
                    grievanceTrackingService.track(new GrievanceTrackRequest(grievanceId, secret), "192.0.2.14");
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, executor));
        }

        CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(10, TimeUnit.SECONDS);
        executor.shutdown();

        // Verify in PostgreSQL that lookupCount is exactly equal to concurrentLookups (no lost updates)
        Optional<GrievanceTrackingCredential> credOpt = trackingCredentialRepository.findByGrievanceId(grievanceId);
        assertThat(credOpt).isPresent();
        assertThat(credOpt.get().getLookupCount()).isEqualTo(concurrentLookups);
        assertThat(credOpt.get().getLastAccessedAt()).isNotNull();
    }

    // ─── 15. Reviewer Statistics Endpoint PostgreSQL Integration Tests ─────

    @Test
    @DisplayName("15. Reviewer Stats: Correct aggregation across statuses and priorities, with RBAC enforcement")
    void reviewerStatsEndpointPostgresIntegration() throws Exception {
        // 1. Unauthenticated request returns 401 Unauthorized ProblemDetail
        mockMvc.perform(get("/api/grievances/stats"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.title").value("Unauthorized"));

        // 2. Unauthorized request (e.g. CITIZEN role) returns 403 Forbidden ProblemDetail
        mockMvc.perform(get("/api/grievances/stats")
                        .with(user("citizen").roles("CITIZEN")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Forbidden"));

        // 3. Authenticated request as REVIEWER returns 200 OK and valid JSON breakdown
        long baselineTotal = grievanceRepository.count();
        long baselinePendingReview = grievanceRepository.countByStatus(GrievanceStatus.PENDING_REVIEW);

        // Insert known representative grievances across distinct statuses and priorities
        Grievance g1 = grievanceRepository.save(new Grievance(
                "Representative narrative 1 for stats testing. Length meets criteria.",
                "Credit card",
                TriagePriority.LOW,
                GrievanceStatus.AUTO_ROUTED,
                false
        ));
        Grievance g2 = grievanceRepository.save(new Grievance(
                "Representative narrative 2 for stats testing. Length meets criteria.",
                "Mortgage",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true
        ));
        Grievance g3 = grievanceRepository.save(new Grievance(
                "Representative narrative 3 for stats testing. Length meets criteria.",
                "Debt collection",
                TriagePriority.CRITICAL,
                GrievanceStatus.APPROVED,
                false
        ));

        mockMvc.perform(get("/api/grievances/stats")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(baselineTotal + 3))
                .andExpect(jsonPath("$.pendingReview").value(baselinePendingReview + 1))
                .andExpect(jsonPath("$.byStatus.AUTO_ROUTED").isNumber())
                .andExpect(jsonPath("$.byStatus.PENDING_REVIEW").isNumber())
                .andExpect(jsonPath("$.byStatus.APPROVED").isNumber())
                .andExpect(jsonPath("$.byPriority.LOW").isNumber())
                .andExpect(jsonPath("$.byPriority.HIGH").isNumber())
                .andExpect(jsonPath("$.byPriority.CRITICAL").isNumber());
    }

    // ─── Stage 4 Explainable AI Persistence & Reviewer Tests ───────────────

    @Test
    @Transactional
    @DisplayName("Stage 4: Prediction explanation JSONB persists and round-trips with full mathematical identities and SHA-256")
    void predictionExplanationJsonbPersistenceRoundTrip() {
        Grievance g = createGrievance();

        NlpExplanation explanation = new NlpExplanation(
                "linear_feature_attribution",
                "1.0.0",
                "Credit card",
                "Debt collection",
                3.1415,
                1.2345,
                1.9070,
                0.8500,
                2.2915,
                0.4500,
                0.7845,
                0.4000,
                1.5070,
                24,
                List.of(
                        new NlpExplanation.FeatureContributionItem("late fee", 0.7500),
                        new NlpExplanation.FeatureContributionItem("interest rate", 0.4200)
                ),
                List.of(
                        new NlpExplanation.FeatureContributionItem("mortgage payment", -0.3500)
                ),
                List.of(
                        new NlpExplanation.RunnerUpDifferenceItem("annual fee", 0.6500)
                ),
                List.of(
                        new NlpExplanation.RunnerUpDifferenceItem("repossession", -0.4500)
                ),
                "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0",
                "Linear feature attribution weights computed from fitted logistic regression model."
        );

        Prediction p = new Prediction(
                g,
                "Credit card",
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                0.85,
                0.60,
                VALID_PROBS,
                true,
                List.of("Confidence requires review"),
                "HIGH",
                List.of("Fee dispute"),
                -0.45,
                "NEGATIVE",
                explanation
        );
        predictionRepository.save(p);
        entityManager.flush();
        entityManager.clear();

        // Direct SQL / JDBC verification to prove PostgreSQL JSONB column was populated
        String rawJsonb = (String) entityManager.createNativeQuery(
                "SELECT explanation::text FROM predictions WHERE grievance_id = :gid")
                .setParameter("gid", g.getId())
                .getSingleResult();
        assertThat(rawJsonb).isNotNull();
        assertThat(rawJsonb).contains("linear_feature_attribution");
        assertThat(rawJsonb).contains("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
        assertThat(rawJsonb).contains("late fee");

        // Retrieve from PostgreSQL
        Optional<Prediction> found = predictionRepository.findByGrievanceId(g.getId());
        assertThat(found).isPresent();
        Prediction retrieved = found.get();
        NlpExplanation retrievedExpl = retrieved.getExplanation();

        assertThat(retrievedExpl).isNotNull();
        assertThat(retrievedExpl.method()).isEqualTo("linear_feature_attribution");
        assertThat(retrievedExpl.version()).isEqualTo("1.0.0");
        assertThat(retrievedExpl.predictedClass()).isEqualTo("Credit card");
        assertThat(retrievedExpl.runnerUpClass()).isEqualTo("Debt collection");
        assertThat(retrievedExpl.predictedDecisionScore()).isCloseTo(3.1415, org.assertj.core.data.Offset.offset(1e-4));
        assertThat(retrievedExpl.runnerUpDecisionScore()).isCloseTo(1.2345, org.assertj.core.data.Offset.offset(1e-4));
        assertThat(retrievedExpl.decisionScoreMargin()).isCloseTo(1.9070, org.assertj.core.data.Offset.offset(1e-4));
        assertThat(retrievedExpl.predictedIntercept()).isCloseTo(0.8500, org.assertj.core.data.Offset.offset(1e-4));
        assertThat(retrievedExpl.predictedTotalFeatureContribution()).isCloseTo(2.2915, org.assertj.core.data.Offset.offset(1e-4));
        assertThat(retrievedExpl.activeFeatureCount()).isEqualTo(24);
        assertThat(retrievedExpl.topPositiveFeatures()).hasSize(2);
        assertThat(retrievedExpl.topPositiveFeatures().get(0).feature()).isEqualTo("late fee");
        assertThat(retrievedExpl.topPositiveFeatures().get(0).contribution()).isCloseTo(0.7500, org.assertj.core.data.Offset.offset(1e-4));
        assertThat(retrievedExpl.topNegativeFeatures()).hasSize(1);
        assertThat(retrievedExpl.topNegativeFeatures().get(0).feature()).isEqualTo("mortgage payment");
        assertThat(retrievedExpl.topPositiveRunnerUpDifferences()).hasSize(1);
        assertThat(retrievedExpl.topPositiveRunnerUpDifferences().get(0).feature()).isEqualTo("annual fee");
        assertThat(retrievedExpl.topNegativeRunnerUpDifferences()).hasSize(1);
        assertThat(retrievedExpl.topNegativeRunnerUpDifferences().get(0).feature()).isEqualTo("repossession");
        assertThat(retrievedExpl.modelArtifactSha256()).isEqualTo("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
        assertThat(retrievedExpl.disclaimer()).contains("Linear feature attribution weights");

        // Verify DTO projection for reviewer endpoint
        GrievanceDetailResponse detail = GrievanceDetailResponse.from(g, retrieved);
        assertThat(detail.originalPrediction()).isNotNull();
        GrievanceDetailResponse.ExplanationSummary explSummary = detail.originalPrediction().explanation();
        assertThat(explSummary).isNotNull();
        assertThat(explSummary.predictedClass()).isEqualTo("Credit card");
        assertThat(explSummary.runnerUpClass()).isEqualTo("Debt collection");
        assertThat(explSummary.modelProvenanceSha256()).isEqualTo("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0");
        assertThat(explSummary.topPositiveFeatures().get(0).feature()).isEqualTo("late fee");
        assertThat(explSummary.topPositiveFeatures().get(0).tfidfValue()).isNull();
        assertThat(explSummary.topPositiveFeatures().get(0).coefficient()).isNull();
        assertThat(explSummary.topPositiveFeatures().get(0).contribution()).isCloseTo(0.7500, org.assertj.core.data.Offset.offset(1e-4));
    }

    @Test
    @Transactional
    @DisplayName("Stage 4: Historical prediction with NULL explanation retrieves successfully with null in DTO")
    void historicalPredictionWithNullExplanationRetrieval() {
        Grievance g = createGrievance();

        // Construct prediction with null explanation (historical record)
        Prediction p = new Prediction(
                g,
                "Credit card",
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                0.82,
                0.65,
                VALID_PROBS,
                false,
                List.of(),
                "LOW",
                List.of(),
                0.15,
                "POSITIVE",
                null
        );
        predictionRepository.save(p);
        entityManager.flush();
        entityManager.clear();

        Optional<Prediction> found = predictionRepository.findByGrievanceId(g.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getExplanation()).isNull();

        GrievanceDetailResponse detail = GrievanceDetailResponse.from(g, found.get());
        assertThat(detail.originalPrediction()).isNotNull();
        assertThat(detail.originalPrediction().explanation()).isNull();
    }

    @Test
    @DisplayName("Stage 4: Submission with explanation persists all 4 entities atomically and reviewer detail endpoint serves complete contract")
    void submissionWithExplanationServesCompleteContractToReviewer() throws Exception {
        String uniqueNarrative = "Submission with explanation test " + UUID.randomUUID() + ". Valid character length satisfied.";

        NlpExplanation expl = new NlpExplanation(
                "linear_feature_attribution",
                "1.0.0",
                "Credit card",
                "Debt collection",
                4.1097,
                1.5320,
                2.5777,
                0.8581,
                3.2516,
                0.7842,
                0.7478,
                0.0739,
                2.5038,
                50,
                List.of(new NlpExplanation.FeatureContributionItem("equifax", 0.6997)),
                List.of(new NlpExplanation.FeatureContributionItem("they", -0.1081)),
                List.of(new NlpExplanation.RunnerUpDifferenceItem("equifax", 0.8175)),
                List.of(new NlpExplanation.RunnerUpDifferenceItem("collection", -0.6229)),
                "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0",
                "Mathematical feature contributions."
        );

        NlpPrediction pred = new NlpPrediction(
                "Credit card",
                0.88,
                0.60,
                VALID_PROBS,
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                false,
                List.of(),
                "LOW",
                List.of("Fee dispute"),
                0.15,
                "POSITIVE",
                "intake disclaimer",
                expl
        );

        GrievanceSubmissionResponse submission = grievancePersistenceService.persistSubmission(uniqueNarrative, pred);
        assertThat(submission).isNotNull();
        UUID grievanceId = submission.id();

        // 1. Verify authenticated REVIEWER receives complete explanation payload on GET /api/grievances/{id}
        mockMvc.perform(get("/api/grievances/{id}", grievanceId)
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(grievanceId.toString()))
                .andExpect(jsonPath("$.originalPrediction.explanation.predictedClass").value("Credit card"))
                .andExpect(jsonPath("$.originalPrediction.explanation.runnerUpClass").value("Debt collection"))
                .andExpect(jsonPath("$.originalPrediction.explanation.predictedDecisionScore").value(4.1097))
                .andExpect(jsonPath("$.originalPrediction.explanation.runnerUpDecisionScore").value(1.5320))
                .andExpect(jsonPath("$.originalPrediction.explanation.decisionScoreMargin").value(2.5777))
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].feature").value("equifax"))
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].contribution").value(0.6997))
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].tfidfValue").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction.explanation.topPositiveFeatures[0].coefficient").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction.explanation.topNegativeFeatures[0].feature").value("they"))
                .andExpect(jsonPath("$.originalPrediction.explanation.topNegativeFeatures[0].contribution").value(-0.1081))
                .andExpect(jsonPath("$.originalPrediction.explanation.topDifferenceFeatures[0].feature").value("equifax"))
                .andExpect(jsonPath("$.originalPrediction.explanation.topDifferenceFeatures[0].contribution").value(0.8175))
                .andExpect(jsonPath("$.originalPrediction.explanation.modelProvenanceSha256")
                        .value("7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0"))
                .andExpect(jsonPath("$.originalPrediction.explanation.explanationGeneratedAt").isNotEmpty());

        // 2. Verify public tracking endpoint NEVER exposes explanation or prediction
        GrievanceTrackRequest trackRequest = new GrievanceTrackRequest(grievanceId, submission.trackingSecret());
        mockMvc.perform(post("/api/grievances/track")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(trackRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.referenceId").value(grievanceId.toString()))
                .andExpect(jsonPath("$.explanation").doesNotExist())
                .andExpect(jsonPath("$.originalPrediction").doesNotExist());
    }

    // ─── Helper methods ───────────────────────────────────────────────────

    private Grievance createGrievance() {
        Grievance g = new Grievance(
                "Test narrative for integration testing. This is long enough to meet the minimum requirement.",
                "Credit card",
                TriagePriority.HIGH,
                GrievanceStatus.PENDING_REVIEW,
                true
        );
        return grievanceRepository.save(g);
    }

    private Prediction createPrediction(Grievance g) {
        Prediction p = new Prediction(
                g,
                "Credit card",
                "baseline_tfidf_logreg",
                "7a9964e0ef15514d",
                0.82,
                0.65,
                VALID_PROBS,
                true,
                List.of("HIGH priority requires human review."),
                "HIGH",
                List.of("Keyword: repossession detected."),
                -0.75,
                "NEGATIVE"
        );
        return predictionRepository.save(p);
    }
}
