package ai.civicresolve.backend.assistant;

import ai.civicresolve.backend.assistant.AssistantController.Answer;
import ai.civicresolve.backend.config.SecurityConfig;
import ai.civicresolve.backend.exception.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({AssistantController.class, GlobalExceptionHandler.class})
@Import(SecurityConfig.class)
class AssistantControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean AssistantService service;

    @Test void anonymousQuestionUsesPublicRoleRegardlessOfPayload() throws Exception {
        when(service.answer(any(), eq(false), any())).thenReturn(new Answer("Public answer", List.of(), List.of(), List.of(), "local", null, null, null));
        mvc.perform(post("/api/assistant/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"How do I submit?\",\"page\":\"/submit\",\"role\":\"REVIEWER\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.answer").value("Public answer"));
        verify(service).answer(any(), eq(false), any());
    }

    @Test void authenticatedReviewerRoleComesFromSecurityContext() throws Exception {
        when(service.answer(any(), eq(true), any())).thenReturn(new Answer("Reviewer answer", List.of(), List.of(), List.of(), "local", null, null, null));
        mvc.perform(post("/api/assistant/chat").with(user("reviewer").roles("REVIEWER"))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"question\":\"What is the margin?\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.answer").value("Reviewer answer"));
        verify(service).answer(any(), eq(true), any());
    }

    @Test void invalidQuestionReturnsValidationProblem() throws Exception {
        mvc.perform(post("/api/assistant/chat").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"   \"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.title").value("Validation Failed"));
    }
}
