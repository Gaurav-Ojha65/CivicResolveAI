package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

public record ActiveLearningManifestResponse(
    @JsonProperty("recordCount") int recordCount,
    @JsonProperty("overrideCount") int overrideCount,
    @JsonProperty("approvalCount") int approvalCount,
    @JsonProperty("sha256Digest") String sha256Digest,
    @JsonProperty("exportedAt") Instant exportedAt,
    @JsonProperty("exportedBy") String exportedBy,
    @JsonProperty("sampleRecords") List<ActiveLearningRecord> sampleRecords
) {}
