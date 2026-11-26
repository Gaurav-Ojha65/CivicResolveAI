package ai.civicresolve.backend.assistant;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

    public AssistantController(AssistantService service) {
        this.service = service;
    }

    @PostMapping("/chat")
    public ResponseEntity<Answer> chat(@Valid @RequestBody Question question,
                                       Authentication authentication, HttpServletRequest request) {
        boolean reviewer = authentication != null && authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_REVIEWER"));
        return ResponseEntity.ok(service.answer(question, reviewer, request.getRemoteAddr()));
    }

    public record Question(@NotBlank @Size(max = 500) String question,
                           String page, String language, String mode, String previousKnowledgeId) { }

    public record Source(String id, String title, String reference) { }
    public record Navigation(String label, String route) { }
    public record Answer(String answer, List<Source> sources, List<String> followUps,
                         List<Navigation> navigation, String responseMode, String knowledgeId,
                         String warning, String model) { }
}
