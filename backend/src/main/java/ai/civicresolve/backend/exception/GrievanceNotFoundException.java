package ai.civicresolve.backend.exception;

import java.util.UUID;

/** Thrown when a grievance with the given ID cannot be found. */
public class GrievanceNotFoundException extends RuntimeException {
    private final UUID grievanceId;

    public GrievanceNotFoundException(UUID id) {
        super("Grievance not found: " + id);
        this.grievanceId = id;
    }

    public UUID getGrievanceId() { return grievanceId; }
}
