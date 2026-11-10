package ai.civicresolve.backend.entity;

/**
 * Triage priority levels, mirroring the FastAPI service contract.
 * These values are purely heuristic rule-based recommendations.
 */
public enum TriagePriority {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
}
