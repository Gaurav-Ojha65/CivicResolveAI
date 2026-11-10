package ai.civicresolve.backend.repository;

import ai.civicresolve.backend.entity.ProductCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data JPA repository for {@link ProductCategory}.
 * Application role has SELECT only (categories are seeded by Flyway).
 */
@Repository
public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Integer> {

    boolean existsByLabel(String label);
}
