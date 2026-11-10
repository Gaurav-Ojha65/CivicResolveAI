package ai.civicresolve.backend.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * Request payload for anonymous public complaint tracking.
 *
 * <p>Submitted strictly via POST body over TLS to avoid URL parameter and proxy logging leakage.
 */
public record GrievanceTrackRequest(
        @NotNull(message = "referenceId is required")
        UUID referenceId,

        @NotNull(message = "trackingSecret is required")
        String trackingSecret
) {
    @Override
    public String toString() {
        return "GrievanceTrackRequest[referenceId=" + referenceId + ", trackingSecret=[PROTECTED]]";
    }
}
