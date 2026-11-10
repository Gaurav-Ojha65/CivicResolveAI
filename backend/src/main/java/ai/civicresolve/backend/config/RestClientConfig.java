package ai.civicresolve.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;

/**
 * HTTP client configuration for the NLP service integration.
 *
 * <p>Timeouts are configured to enforce the FastAPI SLA:
 * <ul>
 *   <li>Connect timeout: 3 seconds</li>
 *   <li>Read timeout: 10 seconds (classification can be slow for long narratives)</li>
 * </ul>
 */
@Configuration
public class RestClientConfig {

    @Value("${civicresolve.nlp.connect-timeout-ms:3000}")
    private int connectTimeoutMs = 3000;

    @Value("${civicresolve.nlp.read-timeout-ms:10000}")
    private int readTimeoutMs = 10000;

    /**
     * Provides a pre-configured {@link RestClient.Builder} with timeout settings.
     * The {@link ai.civicresolve.backend.service.NlpClientService} injects this bean.
     */
    @Bean
    public RestClient.Builder restClientBuilder() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));

        return RestClient.builder()
                .requestFactory(factory);
    }
}
