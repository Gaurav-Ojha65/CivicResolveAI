package ai.civicresolve.backend.config;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.Configuration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationInitializer;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Isolated unit tests for {@link DatabaseIsolationGuard}.
 *
 * <p>Uses Mockito to test code-level fail-closed guards without connecting to PostgreSQL.
 * Verifies that incorrect database names or roles immediately abort migration execution
 * before {@code flyway.migrate()} can be invoked.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DatabaseIsolationGuard — unit tests")
class DatabaseIsolationGuardTest {

    @Mock private Flyway flyway;
    @Mock private Configuration flywayConfiguration;
    @Mock private DataSource flywayDataSource;
    @Mock private DataSource appDataSource;
    @Mock private ObjectProvider<DataSource> appDataSourceProvider;

    @Mock private Connection flywayConnection;
    @Mock private Statement flywayStatement;
    @Mock private ResultSet flywayResultSet;

    @Mock private Connection appConnection;
    @Mock private Statement appStatement;
    @Mock private ResultSet appResultSet;

    private DatabaseIsolationGuard guard;

    @BeforeEach
    void setUp() {
        guard = new DatabaseIsolationGuard(appDataSourceProvider);
    }

    private void setupFlywayConnection(String db, String user) throws SQLException {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(flywayDataSource);
        given(flywayDataSource.getConnection()).willReturn(flywayConnection);
        given(flywayConnection.createStatement()).willReturn(flywayStatement);
        given(flywayStatement.executeQuery(anyString())).willReturn(flywayResultSet);
        given(flywayResultSet.next()).willReturn(true);
        given(flywayResultSet.getString(1)).willReturn(db);
        given(flywayResultSet.getString(2)).willReturn(user);
    }

    private void setupAppConnection(String db, String user) throws SQLException {
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);
        given(appDataSource.getConnection()).willReturn(appConnection);
        given(appConnection.createStatement()).willReturn(appStatement);
        given(appStatement.executeQuery(anyString())).willReturn(appResultSet);
        given(appResultSet.next()).willReturn(true);
        given(appResultSet.getString(1)).willReturn(db);
        given(appResultSet.getString(2)).willReturn(user);
    }

    @Test
    @DisplayName("Permits migration when both connections target civicresolve_test with authorized roles")
    void permitsMigrationWhenIdentitiesMatch() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_migrator");
        setupAppConnection("civicresolve_test", "civicresolve_app");

        assertThatCode(() -> guard.migrate(flyway)).doesNotThrowAnyException();
        verify(flyway).migrate();
    }

    @Test
    @DisplayName("Aborts migration when Flyway database is civicresolve (development fallback attempt)")
    void abortsWhenFlywayTargetsDevDatabase() throws SQLException {
        setupFlywayConnection("civicresolve", "civicresolve_migrator");
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway connection database mismatch")
                .hasMessageContaining("Expected 'civicresolve_test', but connected to 'civicresolve'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Aborts migration when Flyway role is not civicresolve_migrator")
    void abortsWhenFlywayRoleMismatch() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_app");
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway connection user mismatch")
                .hasMessageContaining("Expected 'civicresolve_migrator', but connected as 'civicresolve_app'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Aborts migration when Application database is civicresolve")
    void abortsWhenAppTargetsDevDatabase() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_migrator");
        setupAppConnection("civicresolve", "civicresolve_app");

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Application datasource database mismatch")
                .hasMessageContaining("Expected 'civicresolve_test', but connected to 'civicresolve'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Aborts migration when Application role is not civicresolve_app (e.g. postgres superuser)")
    void abortsWhenAppRoleMismatch() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_migrator");
        setupAppConnection("civicresolve_test", "postgres");

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Application datasource user mismatch")
                .hasMessageContaining("Expected 'civicresolve_app', but connected as 'postgres'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Aborts migration when Flyway DataSource is null")
    void abortsWhenFlywayDataSourceIsNull() {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(null);
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway DataSource is null");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Aborts migration when Application DataSource is null")
    void abortsWhenAppDataSourceIsNull() {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(flywayDataSource);
        given(appDataSourceProvider.getIfAvailable()).willReturn(null);

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Application DataSource is null");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Aborts migration when JDBC query throws SQLException")
    void abortsWhenJdbcQueryThrowsSQLException() throws SQLException {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(flywayDataSource);
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);
        given(flywayDataSource.getConnection()).willThrow(new SQLException("Connection refused"));

        assertThatThrownBy(() -> guard.migrate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Failed to verify Flyway connection identity")
                .hasMessageContaining("Connection refused");

        verify(flyway, never()).migrate();
    }

    // ─── Spring Boot 4.1.1 Wiring & Initializer Delegation Tests ─────────────────

    @Test
    @DisplayName("Wiring: DatabaseIsolationGuard implements Spring Boot 4 FlywayMigrationStrategy")
    void implementsFlywayMigrationStrategyInterface() {
        assertThat(FlywayMigrationStrategy.class).isAssignableFrom(DatabaseIsolationGuard.class);
        assertThat(guard).isInstanceOf(FlywayMigrationStrategy.class);
    }

    @Test
    @DisplayName("Wiring: DatabaseIsolationGuard is annotated with @Component and @Profile('it')")
    void annotatedWithComponentAndProfileIt() {
        Component component = DatabaseIsolationGuard.class.getAnnotation(Component.class);
        assertThat(component).as("@Component must be present").isNotNull();

        Profile profile = DatabaseIsolationGuard.class.getAnnotation(Profile.class);
        assertThat(profile).as("@Profile must be present").isNotNull();
        assertThat(profile.value()).containsExactly("it");
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer delegates to guard and triggers migrate on success")
    void flywayMigrationInitializerDelegatesToGuardOnSuccess() throws Exception {
        setupFlywayConnection("civicresolve_test", "civicresolve_migrator");
        setupAppConnection("civicresolve_test", "civicresolve_app");

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);
        initializer.afterPropertiesSet();

        verify(flyway).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when Flyway targets dev database")
    void flywayMigrationInitializerAbortsWhenFlywayTargetsDevDatabase() throws SQLException {
        setupFlywayConnection("civicresolve", "civicresolve_migrator");
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway connection database mismatch")
                .hasMessageContaining("Expected 'civicresolve_test', but connected to 'civicresolve'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when Flyway user is wrong")
    void flywayMigrationInitializerAbortsWhenFlywayUserMismatch() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_app");
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway connection user mismatch")
                .hasMessageContaining("Expected 'civicresolve_migrator', but connected as 'civicresolve_app'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when App targets dev database")
    void flywayMigrationInitializerAbortsWhenAppTargetsDevDatabase() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_migrator");
        setupAppConnection("civicresolve", "civicresolve_app");

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Application datasource database mismatch")
                .hasMessageContaining("Expected 'civicresolve_test', but connected to 'civicresolve'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when App user is wrong")
    void flywayMigrationInitializerAbortsWhenAppUserMismatch() throws SQLException {
        setupFlywayConnection("civicresolve_test", "civicresolve_migrator");
        setupAppConnection("civicresolve_test", "postgres");

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Application datasource user mismatch")
                .hasMessageContaining("Expected 'civicresolve_app', but connected as 'postgres'");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when Flyway DataSource is null")
    void flywayMigrationInitializerAbortsWhenFlywayDataSourceIsNull() {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(null);
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Flyway DataSource is null");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when App DataSource is null")
    void flywayMigrationInitializerAbortsWhenAppDataSourceIsNull() {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(flywayDataSource);
        given(appDataSourceProvider.getIfAvailable()).willReturn(null);

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Application DataSource is null");

        verify(flyway, never()).migrate();
    }

    @Test
    @DisplayName("Initializer: FlywayMigrationInitializer aborts before migrate when query throws SQLException")
    void flywayMigrationInitializerAbortsWhenSQLExceptionThrown() throws SQLException {
        given(flyway.getConfiguration()).willReturn(flywayConfiguration);
        given(flywayConfiguration.getDataSource()).willReturn(flywayDataSource);
        given(appDataSourceProvider.getIfAvailable()).willReturn(appDataSource);
        given(flywayDataSource.getConnection()).willThrow(new SQLException("Connection refused"));

        FlywayMigrationInitializer initializer = new FlywayMigrationInitializer(flyway, guard);

        assertThatThrownBy(initializer::afterPropertiesSet)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Failed to verify Flyway connection identity")
                .hasMessageContaining("Connection refused");

        verify(flyway, never()).migrate();
    }
}
