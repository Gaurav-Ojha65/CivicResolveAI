package ai.civicresolve.backend.config;

import ai.civicresolve.backend.service.TrackingRateLimiter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Perimeter security filter enforcing IP velocity rate limiting for anonymous complaint tracking.
 *
 * <p>Applied before Spring MVC message converters and Bean Validation to guarantee that malformed JSON,
 * invalid UUIDs, or bad secret formats cannot bypass IP rate limiting or consume unmetered server resources.
 *
 * <p>Trusts only {@link HttpServletRequest#getRemoteAddr()}; client-controlled headers
 * such as {@code X-Forwarded-For} and {@code X-Real-IP} are strictly ignored.
 *
 * <p>The 429 response body is a fixed, statically valid RFC 9457 ProblemDetail JSON object.
 * Internal rate-limiter state such as {@code capacitySaturated} and internal reason strings
 * are never exposed to clients — they are logged server-side only.
 */
public class TrackingIpRateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(TrackingIpRateLimitFilter.class);

    public static final String IP_RATE_LIMITED_ATTRIBUTE = "CIVICRESOLVE_IP_RATE_LIMITED";
    public static final String FIXED_RATE_LIMIT_DETAIL = "Too many requests. Please try again later.";
    private static final String TRACKING_PATH_SUFFIX = "/api/grievances/track";

    private static final String RATE_LIMIT_JSON_RESPONSE = """
            {"type":"https://civicresolve.ai/errors/rate-limit-exceeded","title":"Too Many Requests","status":429,"detail":"Too many requests. Please try again later."}""";

    private final TrackingRateLimiter trackingRateLimiter;

    public TrackingIpRateLimitFilter(TrackingRateLimiter trackingRateLimiter) {
        this.trackingRateLimiter = trackingRateLimiter;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {

        // Use getRequestURI() suffix check to handle optional servlet context paths correctly
        if ("POST".equalsIgnoreCase(request.getMethod())
                && request.getRequestURI().endsWith(TRACKING_PATH_SUFFIX)) {
            // Strictly resolve client IP from socket connection (no header spoofing)
            String clientIp = request.getRemoteAddr();
            TrackingRateLimiter.RateLimitResult result = trackingRateLimiter.checkIpRateLimit(clientIp);

            if (!result.allowed()) {
                log.warn("Perimeter IP rate limit triggered for IP {}: reason={}, capacitySaturated={}",
                        clientIp, result.reason(), result.capacitySaturated());

                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setContentType("application/problem+json");
                response.setCharacterEncoding("UTF-8");
                response.getWriter().write(RATE_LIMIT_JSON_RESPONSE);
                return;
            }

            // Mark request attribute so downstream controller knows rate limiting was enforced at the perimeter
            request.setAttribute(IP_RATE_LIMITED_ATTRIBUTE, Boolean.TRUE);
        }

        filterChain.doFilter(request, response);
    }
}
