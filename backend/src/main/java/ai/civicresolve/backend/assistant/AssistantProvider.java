package ai.civicresolve.backend.assistant;

/** Only curated public knowledge and canonical identifiers may be passed to a provider. */
public interface AssistantProvider {
    String generate(String canonicalId, String title, String approvedAnswer, String source);
    String model();
}
