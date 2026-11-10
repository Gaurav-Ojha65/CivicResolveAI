package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record CalibrationMetricsResponse(
    @JsonProperty("evaluation_dataset") String evaluationDataset,
    @JsonProperty("evaluation_date_utc") String evaluationDateUtc,
    @JsonProperty("total_validation_rows") int totalValidationRows,
    @JsonProperty("calibration_fit_rows") int calibrationFitRows,
    @JsonProperty("calibration_eval_rows") int calibrationEvalRows,
    @JsonProperty("optimal_temperature") double optimalTemperature,
    @JsonProperty("uncalibrated_ece") double uncalibratedEce,
    @JsonProperty("calibrated_ece") double calibratedEce,
    @JsonProperty("ece_reduction_percent") double eceReductionPercent,
    @JsonProperty("uncalibrated_mce") double uncalibratedMce,
    @JsonProperty("calibrated_mce") double calibratedMce,
    @JsonProperty("uncalibrated_brier") double uncalibratedBrier,
    @JsonProperty("calibrated_brier") double calibratedBrier,
    @JsonProperty("brier_reduction_percent") double brierReductionPercent,
    @JsonProperty("uncalibrated_bins") List<ReliabilityBinDto> uncalibratedBins,
    @JsonProperty("calibrated_bins") List<ReliabilityBinDto> calibratedBins,
    @JsonProperty("disclaimer") String disclaimer
) {
    public record ReliabilityBinDto(
        @JsonProperty("bin_index") int binIndex,
        @JsonProperty("bin_lower") double binLower,
        @JsonProperty("bin_upper") double binUpper,
        @JsonProperty("bin_center") double binCenter,
        @JsonProperty("sample_count") int sampleCount,
        @JsonProperty("empirical_accuracy") double empiricalAccuracy,
        @JsonProperty("mean_confidence") double meanConfidence
    ) {}
}
