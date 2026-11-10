package ai.civicresolve.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * CivicResolve AI — Spring Boot REST API entry point.
 *
 * <p>Phase 7: Spring Boot 4.1.1 / Java 25 / PostgreSQL 18.6
 *
 * <p>Architecture:
 * <ul>
 *   <li>Spring MVC controllers expose REST endpoints under {@code /api}</li>
 *   <li>Spring Data JPA repositories persist to PostgreSQL via {@code civicresolve_app} role</li>
 *   <li>Flyway migrations run under the privileged {@code civicresolve_migrator} role</li>
 *   <li>NLP inference is delegated exclusively to the FastAPI service on port 8000</li>
 * </ul>
 */
@SpringBootApplication
public class CivicResolveApplication {

    public static void main(String[] args) {
        SpringApplication.run(CivicResolveApplication.class, args);
    }
}
