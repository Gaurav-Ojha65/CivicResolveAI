package ai.civicresolve.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Core application configuration beans.
 */
@Configuration
public class ApplicationConfig {

    /**
     * System clock bean configured for UTC.
     * Injected into services for deterministic and mockable time operations.
     */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
