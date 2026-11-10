package ai.civicresolve.backend.entity;

/**
 * Workflow status for a grievance case.
 *
 * <ul>
 *   <li>{@code PENDING_REVIEW} — FastAPI flagged the case for human review.</li>
 *   <li>{@code AUTO_ROUTED} — Routed automatically; no review trigger.</li>
 *   <li>{@code APPROVED} — A reviewer confirmed the automated routing.</li>
 *   <li>{@code OVERRIDDEN} — A reviewer changed the category or priority.</li>
 *   <li>{@code REJECTED} — A reviewer rejected the complaint as invalid.</li>
 * </ul>
 */
public enum GrievanceStatus {
    PENDING_REVIEW,
    AUTO_ROUTED,
    APPROVED,
    OVERRIDDEN,
    REJECTED
}
