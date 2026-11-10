package ai.civicresolve.backend.controller;

import ai.civicresolve.backend.dto.MeResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Authentication identity endpoint.
 *
 * <p>Allows authenticated reviewers to confirm their identity and granted roles
 * without touching any grievance resource. Used by the frontend on session start
 * to verify the Basic credentials and populate the reviewer header.
 *
 * <p>Endpoint: {@code GET /api/auth/me}
 * <ul>
 *   <li>401 Unauthorized — no credentials supplied (handled by custom entry point).</li>
 *   <li>403 Forbidden — authenticated but missing REVIEWER role (handled by custom access-denied handler).</li>
 *   <li>200 OK — returns {@link MeResponse} with username and roles.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    /**
     * Returns the authenticated reviewer's username and granted roles.
     *
     * <p>The {@link Authentication} parameter is injected by Spring MVC from
     * the Security context — it is never {@code null} because the endpoint
     * requires {@code ROLE_REVIEWER} via {@code @PreAuthorize}.
     */
    @GetMapping("/me")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<MeResponse> me(Authentication authentication) {
        List<String> roles = authentication.getAuthorities().stream()
                .map(a -> a.getAuthority())
                .toList();
        return ResponseEntity.ok(new MeResponse(authentication.getName(), roles));
    }
}
