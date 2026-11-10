package ai.civicresolve.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Version;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression tests for schema integrity, entity mappings, and Flyway migration assumptions.
 *
 * <p>Validates:
 * <ul>
 *   <li>Optimistic locking JPA {@code @Version} on {@link Grievance}</li>
 *   <li>Category foreign key alignment on {@link Prediction}</li>
 *   <li>Flyway V4 forward migration DDL correctness and backward compatibility</li>
 *   <li>Integrity preservation of baseline migrations V1–V3</li>
 * </ul>
 */
@DisplayName("SchemaIntegrityTest — entity and migration contract tests")
class SchemaIntegrityTest {

    @Test
    @DisplayName("Grievance entity has @Version field of type Long for optimistic locking")
    void grievanceHasOptimisticLockVersion() throws Exception {
        Field versionField = Grievance.class.getDeclaredField("version");
        assertThat(versionField.getType()).isEqualTo(Long.class);
        assertThat(versionField.isAnnotationPresent(Version.class))
                .as("Grievance.version must be annotated with @Version")
                .isTrue();

        Column column = versionField.getAnnotation(Column.class);
        assertThat(column).isNotNull();
        assertThat(column.name()).isEqualTo("version");
        assertThat(column.nullable()).isFalse();

        Method getter = Grievance.class.getMethod("getVersion");
        assertThat(getter.getReturnType()).isEqualTo(Long.class);
    }

    @Test
    @DisplayName("Prediction entity maps predicted_category matching foreign key schema column")
    void predictionCategoryMapping() throws Exception {
        Field categoryField = Prediction.class.getDeclaredField("predictedCategory");
        assertThat(categoryField.getType()).isEqualTo(String.class);

        Column column = categoryField.getAnnotation(Column.class);
        assertThat(column).isNotNull();
        assertThat(column.name()).isEqualTo("predicted_category");
        assertThat(column.nullable()).isFalse();
        assertThat(column.length()).isEqualTo(120);
        assertThat(column.updatable()).isFalse();
    }

    @Test
    @DisplayName("Flyway V4 migration exists and enforces optimistic locking and foreign key integrity")
    void flywayV4MigrationIntegrity() throws Exception {
        String script = readResource("/db/migration/V4__add_version_and_prediction_category_fk.sql");
        assertThat(script).isNotBlank();

        // 1. Optimistic locking column: strict ADD COLUMN without IF NOT EXISTS
        assertThat(script).contains("ALTER TABLE grievances");
        assertThat(script).contains("ADD COLUMN version BIGINT NOT NULL DEFAULT 0;");
        assertThat(script).doesNotContain("ADD COLUMN IF NOT EXISTS");

        // 2. Foreign key on predictions.predicted_category: ON UPDATE RESTRICT and non-deferrable
        assertThat(script).contains("ALTER TABLE predictions");
        assertThat(script).contains("ADD CONSTRAINT fk_predictions_category");
        assertThat(script).contains("FOREIGN KEY (predicted_category)");
        assertThat(script).contains("REFERENCES product_categories (label)");
        assertThat(script).contains("ON UPDATE RESTRICT;");
        assertThat(script).doesNotContain("DEFERRABLE");

        // 3. Foreign key index
        assertThat(script).contains("CREATE INDEX IF NOT EXISTS idx_predictions_category ON predictions (predicted_category);");
    }

    @Test
    @DisplayName("Baseline Flyway migrations V1–V3 are preserved without modification")
    void baselineMigrationsPreserved() throws Exception {
        String v1 = readResource("/db/migration/V1__create_schema.sql");
        assertThat(v1).contains("CREATE TABLE IF NOT EXISTS product_categories");
        assertThat(v1).contains("CREATE TABLE IF NOT EXISTS grievances");
        assertThat(v1).contains("CREATE TABLE IF NOT EXISTS predictions");
        assertThat(v1).contains("CREATE TABLE IF NOT EXISTS audit_log");

        String v2 = readResource("/db/migration/V2__seed_categories.sql");
        assertThat(v2).contains("INSERT INTO product_categories (label) VALUES");
        assertThat(v2).contains("Credit reporting or other personal consumer reports");

        String v3 = readResource("/db/migration/V3__grant_privileges.sql");
        assertThat(v3).contains("GRANT SELECT, INSERT, UPDATE ON grievances TO civicresolve_app;");
        assertThat(v3).contains("GRANT SELECT, INSERT ON predictions TO civicresolve_app;");
    }

    @Test
    @DisplayName("Flyway V5 migration exists and enforces strict DDL and least-privilege grants")
    void flywayV5MigrationIntegrity() throws Exception {
        String script = readResource("/db/migration/V5__add_complaint_tracking.sql");
        assertThat(script).isNotBlank();

        // 1. Strict table creation without IF NOT EXISTS
        assertThat(script).contains("CREATE TABLE grievance_tracking_credentials (");
        assertThat(script).doesNotContain("CREATE TABLE IF NOT EXISTS");

        // 2. Schema constraints and types
        assertThat(script).contains("grievance_id      UUID            PRIMARY KEY,");
        assertThat(script).contains("secret_hash       VARCHAR(64)     NOT NULL,");
        assertThat(script).contains("salt              VARCHAR(32)     NOT NULL,");
        assertThat(script).contains("CONSTRAINT fk_tracking_credentials_grievance");
        assertThat(script).contains("FOREIGN KEY (grievance_id)");
        assertThat(script).contains("REFERENCES grievances (id)");
        assertThat(script).contains("ON DELETE CASCADE");

        // 3. Least-privilege grants for civicresolve_app
        assertThat(script).contains("REVOKE ALL PRIVILEGES ON grievance_tracking_credentials FROM civicresolve_app;");
        assertThat(script).contains("GRANT SELECT, INSERT, UPDATE ON grievance_tracking_credentials TO civicresolve_app;");
    }

    @Test
    @DisplayName("GrievanceTrackingCredential entity maps table columns and constraints correctly")
    void trackingCredentialEntityMapping() throws Exception {
        Field idField = GrievanceTrackingCredential.class.getDeclaredField("grievanceId");
        assertThat(idField.isAnnotationPresent(jakarta.persistence.Id.class)).isTrue();
        Column idCol = idField.getAnnotation(Column.class);
        assertThat(idCol.name()).isEqualTo("grievance_id");
        assertThat(idCol.nullable()).isFalse();

        Field hashField = GrievanceTrackingCredential.class.getDeclaredField("secretHash");
        Column hashCol = hashField.getAnnotation(Column.class);
        assertThat(hashCol.name()).isEqualTo("secret_hash");
        assertThat(hashCol.length()).isEqualTo(64);
        assertThat(hashCol.nullable()).isFalse();

        Field saltField = GrievanceTrackingCredential.class.getDeclaredField("salt");
        Column saltCol = saltField.getAnnotation(Column.class);
        assertThat(saltCol.name()).isEqualTo("salt");
        assertThat(saltCol.length()).isEqualTo(32);
        assertThat(saltCol.nullable()).isFalse();
    }

    private String readResource(String resourcePath) throws Exception {
        try (InputStream in = getClass().getResourceAsStream(resourcePath)) {
            assertThat(in).as("Resource %s must exist on classpath", resourcePath).isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
