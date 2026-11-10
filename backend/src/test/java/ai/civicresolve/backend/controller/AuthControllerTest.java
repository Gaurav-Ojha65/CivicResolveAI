package ai.civicresolve.backend.controller;

import ai.civicresolve.backend.config.SecurityConfig;
import ai.civicresolve.backend.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * MVC slice tests for {@link AuthController}.
 *
 * <p>Verifies the {@code GET /api/auth/me} identity endpoint:
 * <ul>
 *   <li>Authenticated reviewer receives 200 OK with username and roles.</li>
 *   <li>Unauthenticated request receives 401 JSON ProblemDetail.</li>
 * </ul>
 */
@WebMvcTest({AuthController.class, GlobalExceptionHandler.class})
@Import(SecurityConfig.class)
@DisplayName("AuthController — MVC slice tests")
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    // ─── GET /api/auth/me — authenticated ────────────────────────────────────

    @Test
    @DisplayName("GET /api/auth/me — authenticated reviewer returns 200 with username and ROLE_REVIEWER")
    void meAuthenticatedReturnsUsernameAndRoles() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .with(user("reviewer").roles("REVIEWER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("reviewer"))
                .andExpect(jsonPath("$.roles").isArray())
                .andExpect(jsonPath("$.roles", hasItem("ROLE_REVIEWER")));
    }

    // ─── GET /api/auth/me — unauthenticated ──────────────────────────────────

    @Test
    @DisplayName("GET /api/auth/me — unauthenticated returns 401 JSON ProblemDetail without WWW-Authenticate header")
    void meUnauthenticatedReturns401JsonProblemDetail() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401))
                .andExpect(jsonPath("$.title").value("Unauthorized"))
                .andExpect(jsonPath("$.type").value(containsString("unauthorized")))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.header().doesNotExist("WWW-Authenticate"));
    }

    // ─── GET /api/auth/me — forbidden ────────────────────────────────────────

    @Test
    @DisplayName("GET /api/auth/me — authenticated without ROLE_REVIEWER returns 403 JSON ProblemDetail")
    void meForbiddenReturns403JsonProblemDetail() throws Exception {
        mockMvc.perform(get("/api/auth/me")
                        .with(user("citizen").roles("CITIZEN")))
                .andExpect(status().isForbidden())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(403))
                .andExpect(jsonPath("$.title").value("Forbidden"))
                .andExpect(jsonPath("$.type").value(containsString("forbidden")));
    }
}
