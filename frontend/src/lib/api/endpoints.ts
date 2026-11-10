import { apiClient } from './api-client';
import {
  GrievanceRequest,
  GrievanceResponse,
  GrievanceSubmissionResponse,
  GrievanceTrackRequest,
  GrievanceTrackingResponse,
  GrievanceDetailResponse,
  ReviewRequest,
  GrievanceStatsResponse,
  ProductCategoriesResponse,
  HealthResponse,
  SpringPage,
  GrievanceStatus,
  TriagePriority,
  PredictionSummary,
  ModelAuditResponse,
  PreviewClassifyRequest,
  ExecutiveAnalyticsResponse,
  SeedDemoResponse,
  DualModelComparisonResponse,
  SemanticPrecedentResponse,
  CalibrationMetricsResponse,
  ActiveLearningManifestResponse,
} from '../../types/grievance';
import { PageableParams } from '../../types/api';

export interface ListGrievancesParams extends PageableParams {
  status?: GrievanceStatus;
  priority?: TriagePriority;
  category?: string;
}

/**
 * CivicResolve AI API Service Endpoints
 *
 * Exclusively invokes Spring Boot backend REST endpoints (:8080).
 * Never connects directly to FastAPI NLP microservice (:8000).
 */

/**
 * Liveness health probe (Public).
 * GET /api/health
 */
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiClient<HealthResponse>('/api/health', {
    method: 'GET',
    requiresAuth: false,
    signal,
  });
}

/**
 * Retrieve supported consumer product categories (Public).
 * GET /api/product-categories
 */
export async function getProductCategories(
  signal?: AbortSignal
): Promise<ProductCategoriesResponse> {
  return apiClient<ProductCategoriesResponse>('/api/product-categories', {
    method: 'GET',
    requiresAuth: false,
    signal,
  });
}

/**
 * Submit an anonymous consumer complaint for automated AI triage (Public).
 * POST /api/grievances
 */
export async function submitGrievance(
  data: GrievanceRequest,
  signal?: AbortSignal
): Promise<GrievanceSubmissionResponse> {
  return apiClient<GrievanceSubmissionResponse>('/api/grievances', {
    method: 'POST',
    body: data,
    requiresAuth: false,
    signal,
  });
}

/**
 * Track an anonymous consumer complaint status and timeline (Public).
 * Enforces body submission over TLS to avoid URL token exposure.
 * POST /api/grievances/track
 */
export async function trackGrievance(
  data: GrievanceTrackRequest,
  signal?: AbortSignal
): Promise<GrievanceTrackingResponse> {
  return apiClient<GrievanceTrackingResponse>('/api/grievances/track', {
    method: 'POST',
    body: data,
    requiresAuth: false,
    signal,
  });
}

/**
 * List paginated grievances for reviewer triage (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances
 */
export async function listGrievances(
  params?: ListGrievancesParams,
  signal?: AbortSignal
): Promise<SpringPage<GrievanceResponse>> {
  return apiClient<SpringPage<GrievanceResponse>>('/api/grievances', {
    method: 'GET',
    params: params as Record<string, string | number | boolean | undefined | null>,
    requiresAuth: true,
    signal,
  });
}

/**
 * Retrieve comprehensive grievance details and NLP prediction metadata (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/{id}
 */
export async function getGrievanceById(
  id: string,
  signal?: AbortSignal
): Promise<GrievanceDetailResponse> {
  return apiClient<GrievanceDetailResponse>(`/api/grievances/${encodeURIComponent(id)}`, {
    method: 'GET',
    requiresAuth: true,
    signal,
  });
}

/**
 * Submit a human reviewer decision on a grievance (Protected, requires ROLE_REVIEWER).
 * PATCH /api/grievances/{id}/review
 */
export async function reviewGrievance(
  id: string,
  review: ReviewRequest,
  signal?: AbortSignal
): Promise<GrievanceResponse> {
  return apiClient<GrievanceResponse>(
    `/api/grievances/${encodeURIComponent(id)}/review`,
    {
      method: 'PATCH',
      body: review,
      requiresAuth: true,
      signal,
    }
  );
}

/**
 * Retrieve aggregated triage metrics and status counts (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/stats
 */
export async function getGrievanceStats(
  signal?: AbortSignal
): Promise<GrievanceStatsResponse> {
  return apiClient<GrievanceStatsResponse>('/api/grievances/stats', {
    method: 'GET',
    requiresAuth: true,
    signal,
  });
}

/**
 * Retrieve aggregated AI calibration and reviewer agreement metrics (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/analytics/model-audit
 */
export async function getModelAudit(
  signal?: AbortSignal
): Promise<ModelAuditResponse> {
  return apiClient<ModelAuditResponse>('/api/grievances/analytics/model-audit', {
    method: 'GET',
    requiresAuth: true,
    signal,
  });
}

/**
 * Perform a stateless counterfactual "what-if" classification on edited text (Protected, requires ROLE_REVIEWER).
 * POST /api/grievances/preview-classify
 */
export async function previewClassify(
  data: PreviewClassifyRequest,
  signal?: AbortSignal
): Promise<PredictionSummary> {
  return apiClient<PredictionSummary>('/api/grievances/preview-classify', {
    method: 'POST',
    body: data,
    requiresAuth: true,
    signal,
  });
}

/**
 * Retrieve comprehensive executive analytics and operational telemetry (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/analytics/overview
 */
export async function getExecutiveAnalytics(
  signal?: AbortSignal
): Promise<ExecutiveAnalyticsResponse> {
  return apiClient<ExecutiveAnalyticsResponse>('/api/grievances/analytics/overview', {
    method: 'GET',
    requiresAuth: true,
    signal,
  });
}

/**
 * Seed realistic CFPB demo grievances and telemetry across all 8 product categories (Protected, requires ROLE_REVIEWER).
 * POST /api/grievances/analytics/seed-demo
 */
export async function seedDemoTelemetry(
  signal?: AbortSignal
): Promise<SeedDemoResponse> {
  return apiClient<SeedDemoResponse>('/api/grievances/analytics/seed-demo', {
    method: 'POST',
    requiresAuth: true,
    signal,
  });
}



/**
 * Execute dual-model side-by-side comparison on complaint narrative (Protected, requires ROLE_REVIEWER).
 * POST /api/grievances/compare-models
 */
export async function compareModels(
  text: string,
  signal?: AbortSignal
): Promise<DualModelComparisonResponse> {
  return apiClient<DualModelComparisonResponse>('/api/grievances/compare-models', {
    method: 'POST',
    body: { text },
    requiresAuth: true,
    signal,
  });
}

/**
 * Retrieve Top-3 historical precedents ranked by Lexical TF-IDF Cosine Similarity (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/{id}/precedents
 */
export async function getPrecedents(
  id: string,
  signal?: AbortSignal
): Promise<SemanticPrecedentResponse> {
  return apiClient<SemanticPrecedentResponse>(
    `/api/grievances/${encodeURIComponent(id)}/precedents`,
    {
      method: 'GET',
      requiresAuth: true,
      signal,
    }
  );
}

/**
 * Retrieve probability calibration and 10-bin reliability diagram data from validation split (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/analytics/calibration
 */
export async function getCalibrationMetrics(
  signal?: AbortSignal
): Promise<CalibrationMetricsResponse> {
  return apiClient<CalibrationMetricsResponse>(
    '/api/grievances/analytics/calibration',
    {
      method: 'GET',
      requiresAuth: true,
      signal,
    }
  );
}

/**
 * Retrieve active learning export manifest metadata (Protected, requires ROLE_REVIEWER).
 * GET /api/grievances/analytics/active-learning-export?format=manifest
 */
export async function getActiveLearningManifest(
  onlyOverrides: boolean = false,
  signal?: AbortSignal
): Promise<ActiveLearningManifestResponse> {
  return apiClient<ActiveLearningManifestResponse>(
    `/api/grievances/analytics/active-learning-export?format=manifest&onlyOverrides=${onlyOverrides}`,
    {
      method: 'GET',
      requiresAuth: true,
      signal,
    }
  );
}
