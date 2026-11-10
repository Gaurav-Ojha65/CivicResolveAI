package ai.civicresolve.backend.controller;

import ai.civicresolve.backend.service.GrievanceService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Endpoint for listing the eight supported product categories.
 * Public — no authentication required.
 */
@RestController
@RequestMapping("/api/product-categories")
public class ProductCategoryController {

    private final GrievanceService grievanceService;

    public ProductCategoryController(GrievanceService grievanceService) {
        this.grievanceService = grievanceService;
    }

    @GetMapping
    public ResponseEntity<Map<String, List<String>>> list() {
        return ResponseEntity.ok(Map.of("categories", grievanceService.listCategories()));
    }
}
