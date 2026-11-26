package ai.civicresolve.backend.assistant;

import ai.civicresolve.backend.assistant.AssistantController.Answer;
import ai.civicresolve.backend.assistant.AssistantController.Question;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import static org.assertj.core.api.Assertions.assertThat;

class AssistantEvaluationTest {
    @Test void fixedCorpusMeasuresLocalTopOneAndPrivacy() throws Exception {
        AssistantProvider offline = new AssistantProvider() {
            public String generate(String id, String title, String answer, String source) { return null; }
            public String model() { return ""; }
        };
        AssistantService service = new AssistantService(offline);
        ObjectMapper mapper = new ObjectMapper();
        Map<String, Integer> counts = new HashMap<>();
        List<Long> latencyMicros = new ArrayList<>();
        int total = 0, correct = 0, cited = 0, heldOut = 0, heldOutCorrect = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                Objects.requireNonNull(getClass().getResourceAsStream("/assistant/evaluation.jsonl")), StandardCharsets.UTF_8))) {
            for (String line; (line = reader.readLine()) != null; ) {
                JsonNode row = mapper.readTree(line);
                String category = row.path("category").asText();
                counts.merge(category, 1, Integer::sum);
                String expected = row.path("expectedKnowledgeId").isNull() ? null : row.path("expectedKnowledgeId").asText();
                boolean reviewer = row.path("reviewer").asBoolean();
                long start = System.nanoTime();
                Answer answer = service.answer(new Question(row.path("question").asText(), row.path("page").asText(),
                        row.path("language").asText(), "simple", row.path("previousKnowledgeId").isNull()
                        ? null : row.path("previousKnowledgeId").asText()), reviewer, "evaluation-" + total);
                latencyMicros.add((System.nanoTime() - start) / 1000);
                boolean hit = Objects.equals(expected, answer.knowledgeId());
                if (hit) correct++;
                if (expected != null && hit && answer.sources().stream().anyMatch(s -> s.reference().equals(row.path("expectedSource").asText()))) cited++;
                assertThat(answer.responseMode()).isEqualTo("local");
                assertThat(answer.answer()).doesNotContain("trk_", "Reviewer123!");
                if (!reviewer) assertThat(answer.sources()).allMatch(s -> !s.id().matches("queue|audit|analytics|modelaudit|margin|attribution|models"));
                if (row.path("split").asText().equals("held_out")) {
                    heldOut++;
                    if (hit) heldOutCorrect++;
                }
                total++;
            }
        }
        assertThat(total).isEqualTo(150);
        assertThat(counts).containsEntry("citizen_workflow", 25).containsEntry("reviewer_workflow", 20)
                .containsEntry("ml_explainability", 25).containsEntry("follow_up", 15)
                .containsEntry("hindi_hinglish", 25).containsEntry("privacy_authorization", 20)
                .containsEntry("injection_unsupported", 20);
        Collections.sort(latencyMicros);
        System.out.printf("CIVICASSIST_EVAL n=%d top1=%d citation_hits=%d heldout=%d/%d median_us=%d p95_us=%d%n",
                total, correct, cited, heldOutCorrect, heldOut, latencyMicros.get(74), latencyMicros.get(142));
    }
}
