package ai.civicresolve.backend.config;

import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * Fail-closed database isolation guard for integration test environments.
 *
 * <p>Enforces that:
 * <ul>
 *   <li>The Flyway migration connection connects to {@code civicresolve_test} as {@code civicresolve_migrator}.</li>
 *   <li>The application datasource connects to {@code civicresolve_test} as {@code civicresolve_app}.</li>
 *   <li>Actual connection identity is verified via {@code SELECT current_database(), current_user} before any Flyway migration runs.</li>
 *   <li>Any database name or role mismatch immediately aborts execution with a fatal exception prior to {@code flyway.migrate()}.</li>
 * </ul>
 */
@Component
@Profile("it")
public class DatabaseIsolationGuard implements FlywayMigrationStrategy {

    private static final Logger log = LoggerFactory.getLogger(DatabaseIsolationGuard.class);

    public static final String EXPECTED_DATABASE = "civicresolve_test";
    public static final String EXPECTED_FLYWAY_USER = "civicresolve_migrator";
    public static final String EXPECTED_APP_USER = "civicresolve_app";

    private final ObjectProvider<DataSource> appDataSourceProvider;

    public DatabaseIsolationGuard(ObjectProvider<DataSource> appDataSourceProvider) {
        this.appDataSourceProvider = appDataSourceProvider;
    }

    public record ConnectionIdentity(String database, String user) {}

    /**
     * Verifies connection identity for both the Flyway datasource and the application datasource,
     * and only invokes {@code flyway.migrate()} if both target {@code civicresolve_test} with
     * authorized roles.
     *
     * @param flyway the Flyway instance to migrate
     * @throws IllegalStateException if either connection fails validation or a mismatch is detected
     */
    @Override
    public void migrate(Flyway flyway) {
        if (flyway == null || flyway.getConfiguration() == null) {
            throw new IllegalStateException("SAFETY GUARD VIOLATION: Flyway configuration is null. Aborting migration.");
        }

        DataSource flywayDataSource = flyway.getConfiguration().getDataSource();
        DataSource appDataSource = appDataSourceProvider != null ? appDataSourceProvider.getIfAvailable() : null;

        validateIsolation(flywayDataSource, appDataSource);

        log.info("DatabaseIsolationGuard: Both connections verified for '{}'. Proceeding with Flyway migration.",
                EXPECTED_DATABASE);
        flyway.migrate();
    }

    /**
     * Validates connection identity for both the Flyway datasource and the application datasource.
     * Throws {@link IllegalStateException} if either connection fails to match the expected database or role.
     */
    public void validateIsolation(DataSource flywayDataSource, DataSource appDataSource) {
        if (flywayDataSource == null) {
            throw new IllegalStateException(
                    "SAFETY GUARD VIOLATION: Flyway DataSource is null. Aborting migration before execution.");
        }
        if (appDataSource == null) {
            throw new IllegalStateException(
                    "SAFETY GUARD VIOLATION: Application DataSource is null. Aborting migration before execution.");
        }

        // 1. Verify Flyway connection identity
        try (Connection conn = flywayDataSource.getConnection()) {
            ConnectionIdentity identity = queryIdentity(conn, "Flyway");
            if (!EXPECTED_DATABASE.equalsIgnoreCase(identity.database())) {
                throw new IllegalStateException(String.format(
                        "SAFETY GUARD VIOLATION: Flyway connection database mismatch. Expected '%s', but connected to '%s'. Aborting migration before execution.",
                        EXPECTED_DATABASE, identity.database()));
            }
            if (!EXPECTED_FLYWAY_USER.equalsIgnoreCase(identity.user())) {
                throw new IllegalStateException(String.format(
                        "SAFETY GUARD VIOLATION: Flyway connection user mismatch. Expected '%s', but connected as '%s'. Aborting migration before execution.",
                        EXPECTED_FLYWAY_USER, identity.user()));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("SAFETY GUARD VIOLATION: Failed to verify Flyway connection identity: " + e.getMessage(), e);
        }

        // 2. Verify Application connection identity
        try (Connection conn = appDataSource.getConnection()) {
            ConnectionIdentity identity = queryIdentity(conn, "Application");
            if (!EXPECTED_DATABASE.equalsIgnoreCase(identity.database())) {
                throw new IllegalStateException(String.format(
                        "SAFETY GUARD VIOLATION: Application datasource database mismatch. Expected '%s', but connected to '%s'. Aborting migration before execution.",
                        EXPECTED_DATABASE, identity.database()));
            }
            if (!EXPECTED_APP_USER.equalsIgnoreCase(identity.user())) {
                throw new IllegalStateException(String.format(
                        "SAFETY GUARD VIOLATION: Application datasource user mismatch. Expected '%s', but connected as '%s'. Aborting migration before execution.",
                        EXPECTED_APP_USER, identity.user()));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("SAFETY GUARD VIOLATION: Failed to verify Application connection identity: " + e.getMessage(), e);
        }
    }

    /**
     * Executes {@code SELECT current_database(), current_user} on the provided connection to determine actual identity.
     */
    public ConnectionIdentity queryIdentity(Connection conn, String connectionName) throws SQLException {
        if (conn == null) {
            throw new IllegalArgumentException("Connection cannot be null for " + connectionName);
        }
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT current_database(), current_user")) {
            if (!rs.next()) {
                throw new SQLException("No identity rows returned by database query for " + connectionName);
            }
            String db = rs.getString(1);
            String user = rs.getString(2);
            return new ConnectionIdentity(db != null ? db.trim() : null, user != null ? user.trim() : null);
        }
    }
}
