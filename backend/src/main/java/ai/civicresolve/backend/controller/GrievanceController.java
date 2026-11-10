package ai.civicresolve.backend.controller;

import ai.civicresolve.backend.config.TrackingIpRateLimitFilter;
import ai.civicresolve.backend.dto.ActiveLearningManifestResponse;
import ai.civicresolve.backend.dto.ActiveLearningRecord;
import ai.civicresolve.backend.dto.CalibrationMetricsResponse;
import ai.civicresolve.backend.dto.DualModelComparisonRequest;
import ai.civicresolve.backend.dto.DualModelComparisonResponse;
import ai.civicresolve.backend.dto.ExecutiveAnalyticsResponse;
import ai.civicresolve.backend.dto.GrievanceDetailResponse;
import ai.civicresolve.backend.dto.GrievanceRequest;
import ai.civicresolve.backend.dto.GrievanceResponse;
import ai.civicresolve.backend.dto.GrievanceStatsResponse;
import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
import ai.civicresolve.backend.dto.GrievanceTrackRequest;
import ai.civicresolve.backend.dto.GrievanceTrackingResponse;
import ai.civicresolve.backend.dto.ModelAuditResponse;
import ai.civicresolve.backend.dto.PreviewClassifyRequest;
import ai.civicresolve.backend.dto.ReviewRequest;
import ai.civicresolve.backend.dto.SemanticPrecedentResponse;
import ai.civicresolve.backend.dto.SystemStatusResponse;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.service.DemoDataSeederService;
import ai.civicresolve.backend.service.GrievanceService;
import ai.civicresolve.backend.service.GrievanceTrackingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REST controller for grievance submission and management.
 *
 * <p>Endpoints:
 * <ul>
 *   <li>POST /api/grievances — public submission</li>
 *   <li>GET /api/grievances — authenticated paginated list</li>
 *   <li>GET /api/grievances/stats — authenticated dashboard stats</li>
 *   <li>GET /api/grievances/{id} — authenticated detail view</li>
 *   <li>PATCH /api/grievances/{id}/review — authenticated review action</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/grievances")
public class GrievanceController {

    private final GrievanceService grievanceService;
    private final GrievanceTrackingService grievanceTrackingService;
    private final ObjectMapper objectMapper;

    public GrievanceController(GrievanceService grievanceService,
                               GrievanceTrackingService grievanceTrackingService,
                               ObjectMapper objectMapper) {
        this.grievanceService = grievanceService;
        this.grievanceTrackingService = grievanceTrackingService;
        this.objectMapper = objectMapper;
    }

    /**
     * Submit a new complaint narrative.
     * Public endpoint — no authentication required.
     */
    @PostMapping
    public ResponseEntity<GrievanceSubmissionResponse> submit(
            @Valid @RequestBody GrievanceRequest request) {
        GrievanceSubmissionResponse response = grievanceService.submit(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(response.id())
                .toUri();
        return ResponseEntity.created(location).body(response);
    }

    /**
     * Public complaint tracking endpoint.
     * Authenticates using one-time secret and returns sanitized consumer timeline.
     * No reviewer authentication required.
     */
    @PostMapping("/track")
    public ResponseEntity<GrievanceTrackingResponse> track(
            @Valid @RequestBody GrievanceTrackRequest request,
            HttpServletRequest servletRequest) {
        boolean ipAlreadyChecked = Boolean.TRUE.equals(
                servletRequest.getAttribute(TrackingIpRateLimitFilter.IP_RATE_LIMITED_ATTRIBUTE));
        String clientIp = ipAlreadyChecked ? null : servletRequest.getRemoteAddr();
        GrievanceTrackingResponse response = grievanceTrackingService.track(request, clientIp);
        return ResponseEntity.ok(response);
    }

    /**
     * List grievances with optional filters and pagination.
     * Requires REVIEWER role.
     */
    @GetMapping
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<Page<GrievanceResponse>> list(
            @RequestParam(required = false) GrievanceStatus status,
            @RequestParam(required = false) TriagePriority priority,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        if (search != null && !search.isBlank()) {
            return ResponseEntity.ok(grievanceService.list(status, priority, category, search, page, size));
        }
        return ResponseEntity.ok(grievanceService.list(status, priority, category, page, size));
    }

    /**
     * Reviewer dashboard statistics.
     * Requires REVIEWER role.
     */
    @GetMapping("/stats")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<GrievanceStatsResponse> stats() {
        return ResponseEntity.ok(grievanceService.getStats());
    }

    /**
     * Aggregated model audit and reviewer calibration analytics.
     * Requires REVIEWER role.
     */
    @GetMapping("/analytics/model-audit")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<ModelAuditResponse> modelAudit() {
        return ResponseEntity.ok(grievanceService.getModelAuditAnalytics());
    }

    /**
     * Executive operational telemetry and real-time operations dashboard.
     * Requires REVIEWER role.
     */
    @GetMapping("/analytics/overview")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<ExecutiveAnalyticsResponse> executiveAnalytics() {
        return ResponseEntity.ok(grievanceService.getExecutiveAnalytics());
    }

    /**
     * Reviewer-protected operational system health and telemetry status.
     * Evaluates backend uptime, Flyway migration version, NLP reachability probe, and demo batch presence.
     */
    @GetMapping("/analytics/system-status")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<SystemStatusResponse> getSystemStatus() {
        return ResponseEntity.ok(grievanceService.getSystemStatus());
    }

    /**
     * Seeds realistic CFPB complaints across all 8 product categories for demo and testing.
     * Requires REVIEWER role and confirmation query parameter confirm=true.
     */
    @PostMapping("/analytics/seed-demo")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<Map<String, Object>> seedDemoData(
            @RequestParam(name = "confirm", defaultValue = "false") boolean confirm) {
        if (!confirm) {
            return ResponseEntity.badRequest().body(Map.of(
                    "status", "error",
                    "message", "Seeding confirmation required. Pass confirm=true to proceed.",
                    "recordsCreated", 0,
                    "alreadySeeded", false
            ));
        }
        DemoDataSeederService.SeedResult result = grievanceService.seedRealisticDemoTelemetry(confirm);
        return ResponseEntity.ok(Map.of(
                "status", "success",
                "message", result.alreadySeeded()
                        ? "Synthetic demo telemetry already initialized (idempotent no-op)."
                        : "Realistic CFPB operational telemetry seeded successfully.",
                "recordsCreated", result.recordsCreated(),
                "alreadySeeded", result.alreadySeeded()
        ));
    }

    /**
     * Stateless counterfactual "what-if" classification.
     * Evaluates simulated narrative without persisting state or audit events.
     * Requires REVIEWER role.
     */
    @PostMapping("/preview-classify")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<GrievanceDetailResponse.PredictionSummary> previewClassify(
            @Valid @RequestBody PreviewClassifyRequest request) {
        return ResponseEntity.ok(grievanceService.previewClassify(request.text()));
    }

    /**
     * Side-by-side inference comparison between TF-IDF baseline and PyTorch Bi-LSTM.
     * Requires REVIEWER role.
     */
    @PostMapping("/compare-models")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<DualModelComparisonResponse> compareModels(
            @Valid @RequestBody DualModelComparisonRequest request) {
        return ResponseEntity.ok(grievanceService.compareModels(request));
    }

    /**
     * Model probability calibration metrics and 10-bin reliability curves evaluated on val.csv.
     * Requires REVIEWER role.
     */
    @GetMapping("/analytics/calibration")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<CalibrationMetricsResponse> calibration() {
        return ResponseEntity.ok(grievanceService.getCalibrationMetrics());
    }

    /**
     * Export curated human-adjudicated records for active learning and model retraining.
     * Requires REVIEWER role.
     * Formats: jsonl, csv, manifest.
     */
    @GetMapping("/analytics/active-learning-export")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<?> exportActiveLearning(
            @RequestParam(defaultValue = "jsonl") String format,
            @RequestParam(defaultValue = "false") boolean onlyOverrides,
            java.security.Principal principal) {
        List<ActiveLearningRecord> records = grievanceService.exportActiveLearning(onlyOverrides);
        int total = records.size();
        int overrides = (int) records.stream().filter(ActiveLearningRecord::isOverride).count();
        int approvals = total - overrides;
        String actor = principal != null ? principal.getName() : "anonymous_reviewer";
        Instant now = Instant.now();

        if ("manifest".equalsIgnoreCase(format)) {
            List<ActiveLearningRecord> sample = records.stream().limit(5).toList();
            String sha256 = computeSha256(records.toString().getBytes(StandardCharsets.UTF_8));
            return ResponseEntity.ok(new ActiveLearningManifestResponse(
                    total, overrides, approvals, sha256, now, actor, sample
            ));
        }

        byte[] payloadBytes;
        String contentType;
        String fileExt;

        if ("csv".equalsIgnoreCase(format)) {
            StringBuilder sb = new StringBuilder();
            sb.append("id,status,priority,predicted_category,assigned_category,is_override,submitted_at,adjudicated_at,masked_narrative\n");
            for (ActiveLearningRecord r : records) {
                sb.append(escapeCsv(r.id().toString())).append(",")
                  .append(escapeCsv(r.status())).append(",")
                  .append(escapeCsv(r.priority())).append(",")
                  .append(escapeCsv(r.predictedCategory())).append(",")
                  .append(escapeCsv(r.assignedCategory())).append(",")
                  .append(r.isOverride()).append(",")
                  .append(r.submittedAt() != null ? r.submittedAt().toString() : "").append(",")
                  .append(r.adjudicatedAt() != null ? r.adjudicatedAt().toString() : "").append(",")
                  .append(escapeCsv(r.maskedNarrative())).append("\n");
            }
            payloadBytes = sb.toString().getBytes(StandardCharsets.UTF_8);
            contentType = "text/csv; charset=UTF-8";
            fileExt = "csv";
        } else {
            StringBuilder sb = new StringBuilder();
            try {
                for (ActiveLearningRecord r : records) {
                    sb.append(objectMapper.writeValueAsString(r)).append("\n");
                }
            } catch (Exception e) {
                throw new RuntimeException("Failed to serialize active learning JSONL", e);
            }
            payloadBytes = sb.toString().getBytes(StandardCharsets.UTF_8);
            contentType = "application/x-ndjson; charset=UTF-8";
            fileExt = "jsonl";
        }

        String sha256 = computeSha256(payloadBytes);
        String filename = "active_learning_export_" + now.toEpochMilli() + "." + fileExt;

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .header("X-Export-SHA256", sha256)
                .header("X-Export-Record-Count", String.valueOf(total))
                .header("X-Export-Override-Count", String.valueOf(overrides))
                .header("X-Export-Timestamp", now.toString())
                .header("X-Export-Actor", actor)
                .body(payloadBytes);
    }

    /**
     * Detailed view of a single grievance including original prediction.
     * Requires REVIEWER role. Path regex ensures UUIDs are strictly matched and analytics paths never conflict.
     */
    @GetMapping("/{id:[0-9a-fA-F\\-]{36}}")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<GrievanceDetailResponse> getById(
            @PathVariable UUID id) {
        return ResponseEntity.ok(grievanceService.getById(id));
    }

    /**
     * Top-3 similar historical human-adjudicated precedents ranked by Lexical TF-IDF Cosine Similarity.
     * Requires REVIEWER role.
     */
    @GetMapping("/{id:[0-9a-fA-F\\-]{36}}/precedents")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<SemanticPrecedentResponse> getPrecedents(
            @PathVariable UUID id) {
        return ResponseEntity.ok(grievanceService.getPrecedents(id));
    }

    /**
     * Perform a review action (APPROVE, OVERRIDE, REJECT).
     * Actor identity derived from Spring Security — never from request body.
     * Requires REVIEWER role.
     */
    @PatchMapping("/{id}/review")
    @PreAuthorize("hasRole('REVIEWER')")
    public ResponseEntity<GrievanceResponse> review(
            @PathVariable UUID id,
            @Valid @RequestBody ReviewRequest request) {
        return ResponseEntity.ok(grievanceService.review(id, request));
    }

    private static String computeSha256(byte[] data) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(data);
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return "";
        }
    }

    private static String escapeCsv(String value) {
        if (value == null) return "\"\"";
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }
}
