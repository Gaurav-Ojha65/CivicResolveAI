package ai.civicresolve.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Lookup entity for the eight supported consumer-finance product categories.
 * Seeded by Flyway migration V2; never modified at runtime by the application.
 */
@Entity
@Table(name = "product_categories")
public class ProductCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Integer id;

    @Column(name = "label", nullable = false, unique = true, length = 120)
    private String label;

    protected ProductCategory() {}

    public ProductCategory(String label) {
        this.label = label;
    }

    public Integer getId() { return id; }
    public String getLabel() { return label; }

    @Override
    public String toString() {
        return "ProductCategory{id=" + id + ", label='" + label + "'}";
    }
}
