package ai.civicresolve.backend.assistant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/assistant")
public class AssistantController {
    private final AssistantService service;
    private final java.util.Set<String> trustedProxies;

    public AssistantController(AssistantService service,
                               @Value("${civicassist.trusted-proxy-ips:}") String trustedProxyIps) {
        this.service = service;
        this.trustedProxies = java.util.Arrays.stream(trustedProxyIps.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    @PostMapping("/chat")
    public ResponseEntity<Answer> chat(@Valid @RequestBody Question question,
                                       Authentication authentication, HttpServletRequest request) {
        boolean reviewer = authentication != null && authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_REVIEWER"));
        String remote = request.getRemoteAddr();
        String client = trustedProxies.contains(remote)
                ? AssistantRateLimiter.forwardedClient(remote, request.getHeader("X-Forwarded-For"), trustedProxies) : remote;
        return ResponseEntity.ok(service.answer(question, reviewer, client));
    }

    public record Question(@NotBlank @Size(max = 500) String question,
                           @Pattern(regexp = "/|/submit|/track|/reviewer|/reviewer/grievances|/reviewer/analytics|/reviewer/audit") String page,
                           @Pattern(regexp = "en|hi") String language,
                           @Pattern(regexp = "simple|technical") String mode,
                           @Size(max = 64) @Pattern(regexp = "[a-z0-9_-]+") String previousKnowledgeId) { }

    public record Source(String id, String title, String reference) { }
    public record Navigation(String label, String route) { }
    public record Answer(String answer, List<Source> sources, List<String> followUps,
                         List<Navigation> navigation, String responseMode, String knowledgeId,
                         String warning, String model) { }
}
