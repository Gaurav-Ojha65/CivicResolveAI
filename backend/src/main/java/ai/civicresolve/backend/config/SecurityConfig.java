package ai.civicresolve.backend.config;

import ai.civicresolve.backend.service.TrackingRateLimiter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

/**
 * Spring Security configuration for CivicResolve AI backend.
 *
 * <p>Access policy:
 * <ul>
 *   <li>{@code POST /api/grievances} — public (citizens submit complaints anonymously)</li>
 *   <li>{@code GET /api/product-categories} — public (lookup list)</li>
 *   <li>{@code GET /api/health} — public (liveness probe)</li>
 *   <li>All other {@code /api/**} endpoints — require authentication as {@code REVIEWER}</li>
 * </ul>
 *
 * <p>Authentication: HTTP Basic (in-memory for prototype; replace with LDAP/OIDC in production).
 * BCrypt strength-12 password hashing.
 *
 * <p>Passwords are supplied via environment variables. No hardcoded production credentials.
 * The reviewer account is configured from {@code REVIEWER_PASSWORD} env var.
 *
 * <p>401/403 responses: RFC 9457 ProblemDetail JSON via custom entry point and access-denied handler.
 *
 * <p>CORS: configurable via {@code civicresolve.cors.allowed-origins} property.
 *
 * @see #securityFilterChain(HttpSecurity, ProblemDetailAuthEntryPoint, ProblemDetailAccessDeniedHandler)
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    /**
     * Comma-separated list of allowed CORS origins.
     * Defaults to Vite dev server (ports 3000, 3001, or 5173, localhost and 127.0.0.1) and preview server for local development.
     * Set {@code app.cors.allowed-origins} or {@code CORS_ALLOWED_ORIGINS} in production.
     */
    @Value("${app.cors.allowed-origins:${civicresolve.cors.allowed-origins:http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173}}")
    private String[] allowedOrigins;

    @Autowired(required = false)
    private TrackingRateLimiter trackingRateLimiter;

    @Bean
    public ProblemDetailAuthEntryPoint problemDetailAuthEntryPoint() {
        return new ProblemDetailAuthEntryPoint();
    }

    @Bean
    public ProblemDetailAccessDeniedHandler problemDetailAccessDeniedHandler() {
        return new ProblemDetailAccessDeniedHandler();
    }

    /**
     * BCrypt encoder with cost factor 12 for reviewer accounts.
     * Do not reduce cost factor below 10 in production.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    /**
     * In-memory user store for prototype.
     *
     * <p>The reviewer password must be supplied via the {@code REVIEWER_PASSWORD}
     * environment variable before starting the application. If absent, a random
     * 64-character secret is generated — ensuring the account is inaccessible
     * unless the variable is explicitly configured.
     */
    @Bean
    public UserDetailsService userDetailsService(PasswordEncoder encoder) {
        String rawPassword = System.getenv("REVIEWER_PASSWORD");
        if (rawPassword == null || rawPassword.isBlank()) {
            // Generate a random inaccessible password — the account will be locked
            // until REVIEWER_PASSWORD is explicitly configured.
            rawPassword = java.util.UUID.randomUUID().toString()
                    + java.util.UUID.randomUUID().toString();
        }

        return new InMemoryUserDetailsManager(
                User.builder()
                        .username("reviewer")
                        .password(encoder.encode(rawPassword))
                        .roles("REVIEWER")
                        .build()
        );
    }

    /**
     * CORS configuration allowing the configured frontend origins to make credentialed
     * requests. Credentials (Authorization header) are required for HTTP Basic over CORS.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.asList(allowedOrigins));
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept", "X-Requested-With"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    /**
     * Security filter chain defining URL authorization rules.
     *
     * <p>CSRF is disabled for the REST API (stateless). CORS is configured per-origin
     * from the {@link #corsConfigurationSource()} bean.
     * Custom entry point and access-denied handler produce JSON ProblemDetail responses.
     */
    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            ProblemDetailAuthEntryPoint authEntryPoint,
            ProblemDetailAccessDeniedHandler accessDeniedHandler) throws Exception {
        TrackingRateLimiter rateLimiter = this.trackingRateLimiter != null
                ? this.trackingRateLimiter
                : new TrackingRateLimiter();
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .httpBasic(basic -> basic.authenticationEntryPoint(authEntryPoint))
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint(authEntryPoint)
                    .accessDeniedHandler(accessDeniedHandler)
            )
            .addFilterBefore(
                    new TrackingIpRateLimitFilter(rateLimiter),
                    org.springframework.security.web.access.intercept.AuthorizationFilter.class
            )
            .authorizeHttpRequests(auth -> auth
                    // Allow CORS preflight OPTIONS requests before authentication
                    .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                    // Public endpoints
                    .requestMatchers(HttpMethod.POST, "/api/grievances").permitAll()
                    .requestMatchers(HttpMethod.POST, "/api/grievances/track").permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/product-categories").permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/health").permitAll()
                    // All other API endpoints require REVIEWER role
                    .requestMatchers("/api/**").hasRole("REVIEWER")
                    // Deny everything else
                    .anyRequest().denyAll()
            );
        return http.build();
    }
}
