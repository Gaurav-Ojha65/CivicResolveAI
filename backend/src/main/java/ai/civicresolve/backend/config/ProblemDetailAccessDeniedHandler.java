package ai.civicresolve.backend.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Replaces Spring Security's default HTML 403 response with a RFC 9457 ProblemDetail JSON body.
 *
 * <p>Triggered when an authenticated user attempts to access a resource for which they
 * lack the required role. No stack traces or internal details are emitted.
 */
public class ProblemDetailAccessDeniedHandler implements AccessDeniedHandler {

    private static final String BODY = """
            {
              "type": "https://civicresolve.ai/errors/forbidden",
              "title": "Forbidden",
              "status": 403,
              "detail": "You do not have permission to access this resource."
            }""";

    @Override
    public void handle(HttpServletRequest request,
                       HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getOutputStream().write(BODY.getBytes(StandardCharsets.UTF_8));
    }
}
