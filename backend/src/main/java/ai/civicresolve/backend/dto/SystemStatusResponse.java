package ai.civicresolve.backend.dto;

import java.time.Instant;

/**
 * Live operational telemetry and health status response for reviewer header and command palette.
 */
public record SystemStatusResponse(
        String backendStatus,
        String databaseSchemaVersion,
        boolean nlpServiceReachable,
        double nlpProbeLatencyMs,
        String activeModelName,
        Instant serverTimestamp,
        boolean demoBatchSeeded
) {}
