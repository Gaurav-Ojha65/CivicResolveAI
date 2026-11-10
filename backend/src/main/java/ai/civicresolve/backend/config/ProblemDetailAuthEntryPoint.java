package ai.civicresolve.backend.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Replaces Spring Security's default HTML 401 response with a RFC 9457 ProblemDetail JSON body.
 *
 * <p>Triggered whenever an unauthenticated request reaches a protected resource.
 * The {@code WWW-Authenticate: Basic} header is intentionally OMITTED to prevent the browser
 * from displaying a native modal credentials dialog in SPA fetch requests.
 * No stack traces or internal details are emitted.
 */
public class ProblemDetailAuthEntryPoint implements AuthenticationEntryPoint {

    private static final String BODY = """
            {
              "type": "https://civicresolve.ai/errors/unauthorized",
              "title": "Unauthorized",
              "status": 401,
              "detail": "Authentication is required to access this resource."
            }""";

    @Override
    public void commence(HttpServletRequest request,
                         HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getOutputStream().write(BODY.getBytes(StandardCharsets.UTF_8));
    }
}
