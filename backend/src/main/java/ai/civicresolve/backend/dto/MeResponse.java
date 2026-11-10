package ai.civicresolve.backend.dto;

import java.util.List;

/**
 * Response DTO for the authenticated identity endpoint {@code GET /api/auth/me}.
 *
 * <p>Used by the frontend to confirm the authenticated reviewer's username and roles
 * without round-tripping to any protected grievance endpoint.
 */
public record MeResponse(
        /** Authenticated reviewer username derived from Spring Security context. */
        String username,
        /** Granted authority names (e.g., {@code ["ROLE_REVIEWER"]}). */
        List<String> roles
) {}
