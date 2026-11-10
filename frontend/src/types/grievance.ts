/**
 * CivicResolve AI Domain and DTO Types
 * Strictly mirrored from Spring Boot backend entity & DTO records.
 */

export type TriagePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type GrievanceStatus =
  | 'PENDING_REVIEW'
  | 'AUTO_ROUTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'OVERRIDDEN'
  | 'REJECTED';

export type ReviewAction = 'APPROVE' | 'OVERRIDE' | 'REJECT';

/**
 * Public request to submit a new consumer complaint.
 * Backend constraint: description between 20 and 5000 characters.
 */
export interface GrievanceRequest {
  description: string;
}

/**
 * Standard summary response returned on listing and review completion.
 */
export interface GrievanceResponse {
  id: string; // UUID
  assignedCategory: string;
  priority: TriagePriority;
  status: GrievanceStatus;
  reviewRequired: boolean;
  submittedAt: string; // ISO 8601 UTC Instant
  updatedAt: string; // ISO 8601 UTC Instant
  version?: number; // Current JPA optimistic locking version
}

/**
 * Dedicated response DTO returned exclusively on initial complaint submission (POST /api/grievances).
 * Contains the raw, one-time tracking secret.
 */
export interface GrievanceSubmissionResponse {
  id: string; // UUID
  trackingSecret: string; // Raw one-time tracking secret (format: trk_ followed by 43 URL-safe characters)
  category: string;
  priority: TriagePriority;
  status: GrievanceStatus;
  reviewRequired: boolean;
  submittedAt: string; // ISO 8601 UTC Instant
  updatedAt: string; // ISO 8601 UTC Instant
  version: number;
  assignedCategory?: string; // Optional secondary accessor matching backend DTO
}

/**
 * Public request payload for anonymous complaint tracking (POST /api/grievances/track).
 */
export interface GrievanceTrackRequest {
  referenceId: string; // UUID
  trackingSecret: string; // Format: trk_[A-Za-z0-9_-]{43}
}

/**
 * Consumer-safe chronological timeline event stage identifiers.
 */
export type TimelineStage =
  | 'SUBMITTED'
  | 'AUTOMATED_TRIAGE'
  | 'REVIEW_APPROVED'
  | 'REVIEW_OVERRIDDEN'
  | 'REVIEW_REJECTED'
  | 'STATUS_UPDATE';

/**
 * Customer-safe timeline event projected from append-only audit log.
 */
export interface ConsumerTimelineEvent {
  stage: TimelineStage | string;
  status: GrievanceStatus;
  title: string;
  description: string;
  timestamp: string; // ISO 8601 UTC Instant
}

/**
 * Public response DTO for anonymous consumer complaint tracking.
 */
export interface GrievanceTrackingResponse {
  referenceId: string;
  status: GrievanceStatus;
  assignedCategory: string;
  priority: TriagePriority;
  submittedAt: string;
  updatedAt: string;
  timeline: ConsumerTimelineEvent[];
}

/**
 * Mathematical linear feature attribution item (Prepared for Stage 4).
 */
export interface FeatureContribution {
  feature: string;
  tfidfValue?: number | null;
  coefficient?: number | null;
  contribution: number;
}

/**
 * Structured explanation metadata (Prepared for Stage 4 backend persistence).
 */
export interface ExplanationSummary {
  predictedClass: string;
  predictedDecisionScore: number;
  predictedIntercept: number;
  runnerUpClass: string;
  runnerUpDecisionScore: number;
  runnerUpIntercept: number;
  decisionScoreMargin: number;
  topPositiveFeatures: FeatureContribution[];
  topNegativeFeatures: FeatureContribution[];
  topDifferenceFeatures: FeatureContribution[];
  modelProvenanceSha256: string;
  explanationGeneratedAt: string;
}

/**
 * NLP prediction metadata attached to a grievance.
 */
export interface PredictionSummary {
  predictedCategory: string;
  modelUsed: string;
  modelVersion: string;
  confidence: number;
  margin: number;
  probabilities: Record<string, number>;
  flagForReview: boolean;
  reviewReasons: string[];
  triagePriority: string;
  priorityReasons: string[];
  sentimentScore: number | null;
  sentimentLabel: string | null;
  predictedAt: string; // ISO 8601 UTC Instant
  explanation?: ExplanationSummary | null; // Stage 4 explainability integration point
}

/**
 * Append-only immutable audit trail record for internal reviewer timeline.
 */
export interface AuditHistoryItem {
  id: number;
  actor: string;
  action: string;
  previousStatus: GrievanceStatus | null;
  newStatus: GrievanceStatus | null;
  previousCategory: string | null;
  newCategory: string | null;
  previousPriority: string | null;
  newPriority: string | null;
  reviewNote: string | null;
  timestamp: string; // ISO 8601 UTC Instant
}

/**
 * Detailed view of a single grievance, available only to staff.
 */
export interface GrievanceDetailResponse {
  id: string; // UUID
  narrative: string; // Complaint narrative submitted by citizen (visible to authenticated reviewers)
  assignedCategory: string;
  priority: TriagePriority;
  status: GrievanceStatus;
  reviewRequired: boolean;
  submittedAt: string; // ISO 8601 UTC Instant
  updatedAt: string; // ISO 8601 UTC Instant
  version: number; // JPA version counter for optimistic locking
  originalPrediction: PredictionSummary | null;
  auditHistory?: AuditHistoryItem[];
}

/**
 * Review action payload submitted to PATCH /api/grievances/{id}/review.
 */
export interface ReviewRequest {
  action: ReviewAction;
  newCategory?: string;
  newPriority?: TriagePriority | '';
  reviewNote?: string;
  expectedVersion: number;
}

/**
 * Aggregated statistics for the reviewer dashboard.
 */
export interface GrievanceStatsResponse {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  pendingReview: number;
}

/**
 * Aggregated AI model calibration and reviewer agreement metrics.
 * Returned from GET /api/grievances/analytics/model-audit.
 */
export interface ModelAuditResponse {
  totalAdjudicated: number;
  reviewerAgreementRate: number;
  categoryOverrideDistribution: Record<string, number>;
  confusionMatrix: Record<string, Record<string, number>>;
  triggerBreakdown: {
    LOW_CONFIDENCE?: number;
    SMALL_MARGIN?: number;
    CRITICAL_PRIORITY_POLICY?: number;
    AUTO_ROUTED?: number;
    [key: string]: number | undefined;
  };
}

/**
 * Request payload for stateless counterfactual "what-if" classification.
 */
export interface PreviewClassifyRequest {
  text: string;
}

/**
 * Response from GET /api/product-categories.
 */
export interface ProductCategoriesResponse {
  categories: string[];
}

/**
 * Response from GET /api/health.
 */
export interface HealthResponse {
  status: string;
  service: string;
  timestamp_utc: string;
}

/**
 * Spring Data Page container for paginated list endpoints.
 */
export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number; // 0-based page index
  first: boolean;
  last: boolean;
  empty: boolean;
  numberOfElements?: number;
}

/**
 * Breakdown of volume and triage priority by CFPB product category.
 */
export interface CategoryVolumePriority {
  category: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  autoRouted: number;
  pendingReview: number;
  approved: number;
  overridden: number;
  rejected: number;
}

/**
 * Confidence score and decision margin distribution buckets.
 */
export interface ConfidenceSentimentBuckets {
  confidenceUnder55: number;
  confidence55To75: number;
  confidence75To90: number;
  confidenceOver90: number;
  narrowMargin: number;
  clearMargin: number;
  negativeSentiment: number;
  neutralSentiment: number;
  positiveSentiment: number;
}

/**
 * Service level agreement aging buckets based on submission timestamp.
 */
export interface SlaAgingBreakdown {
  onTrack: number;
  atRisk: number;
  breached: number;
  totalPending: number;
}

/**
 * Daily intake and resolution trend point.
 */
export interface DailyIntakeTrendPoint {
  date: string;
  intakeCount: number;
  autoRoutedCount: number;
  humanReviewedCount: number;
}

/**
 * Aggregated executive analytics overview response.
 * Returned from GET /api/grievances/analytics/overview.
 */
export interface ExecutiveAnalyticsResponse {
  totalComplaints: number;
  pendingReview: number;
  autoRouted: number;
  humanReviewed: number;
  autoRoutingEfficiencyRate: number;
  slaComplianceRate: number;
  priorityDistribution: Record<string, number>;
  statusDistribution: Record<string, number>;
  categoryVolumeMatrix: CategoryVolumePriority[];
  confidenceSentimentBuckets: ConfidenceSentimentBuckets;
  dailyIntakeTrend: DailyIntakeTrendPoint[];
  slaAgingBreakdown: SlaAgingBreakdown;
}

/**
 * Response from POST /api/grievances/analytics/seed-demo.
 */
export interface SeedDemoResponse {
  message: string;
  recordsCreated: number;
  status: string;
}



// ============================================================================
// Phase 9 Advanced RegTech & MLOps Interfaces
// ============================================================================

export interface ModelInferenceSummary {
  model_name: string;
  model_type: string;
  model_version_sha256: string;
  predicted_category: string;
  confidence: number;
  margin: number;
  probabilities: Record<string, number>;
  latency_ms: number;
  token_or_feature_count: number;
  truncated: boolean;
}

export interface DualModelComparisonResponse {
  baseline: ModelInferenceSummary;
  bilstm: ModelInferenceSummary;
  models_agree: boolean;
  confidence_delta: number;
  disclaimer: string;
}

export interface SemanticPrecedentItem {
  grievanceId: string;
  similarityScore: number;
  similarityMetric: string;
  predictedCategory: string;
  assignedCategory: string;
  status: string;
  sanitizedSnippet: string;
  adjudicatedAt: string | null;
}

export interface SemanticPrecedentResponse {
  queryGrievanceId: string;
  candidatesEvaluated: number;
  precedents: SemanticPrecedentItem[];
}

export interface ReliabilityBin {
  bin_index: number;
  bin_lower: number;
  bin_upper: number;
  bin_center: number;
  sample_count: number;
  empirical_accuracy: number;
  mean_confidence: number;
}

export interface CalibrationMetricsResponse {
  evaluation_dataset: string;
  evaluation_date_utc: string;
  total_validation_rows: number;
  calibration_fit_rows: number;
  calibration_eval_rows: number;
  optimal_temperature: number;
  uncalibrated_ece: number;
  calibrated_ece: number;
  ece_reduction_percent: number;
  uncalibrated_mce: number;
  calibrated_mce: number;
  uncalibrated_brier: number;
  calibrated_brier: number;
  brier_reduction_percent: number;
  uncalibrated_bins: ReliabilityBin[];
  calibrated_bins: ReliabilityBin[];
  disclaimer: string;
}

export interface ActiveLearningRecord {
  id: string;
  maskedNarrative: string;
  predictedCategory: string;
  assignedCategory: string;
  status: string;
  priority: string;
  isOverride: boolean;
  submittedAt: string;
  adjudicatedAt: string;
}

export interface ActiveLearningManifestResponse {
  recordCount: number;
  overrideCount: number;
  approvalCount: number;
  sha256Digest: string;
  exportedAt: string;
  exportedBy: string;
  sampleRecords: ActiveLearningRecord[];
}

export interface SystemStatusResponse {
  backendStatus: string;
  databaseSchemaVersion: string;
  nlpServiceReachable: boolean;
  nlpProbeLatencyMs: number;
  activeModelName: string;
  serverTimestamp: string;
  demoBatchSeeded: boolean;
}
