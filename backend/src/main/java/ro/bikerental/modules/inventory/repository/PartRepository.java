package ro.bikerental.modules.inventory.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.inventory.entity.Part;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PartRepository extends JpaRepository<Part, UUID> {

    boolean existsByPartCodeIgnoreCase(String partCode);

    Optional<Part> findByPartCodeIgnoreCase(String partCode);

    @Query("SELECT p FROM Part p " +
           "LEFT JOIN FETCH p.defaultSupplier s " +
           "WHERE p.active = true AND p.currentQuantity <= p.minReorderLevel " +
           "ORDER BY p.currentQuantity ASC")
    List<Part> findLowStockParts();

    @EntityGraph(attributePaths = "defaultSupplier")
    @Query(value = "SELECT p FROM Part p " +
           "WHERE (:includeArchived = true OR p.active = true) " +
           "AND (COALESCE(:category, '') = '' OR LOWER(p.category) = LOWER(:category)) " +
           "AND (:lowStockOnly = false OR (p.active = true AND p.currentQuantity <= p.minReorderLevel)) " +
           "AND (COALESCE(:search, '') = '' OR LOWER(p.partCode) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.description) LIKE LOWER(CONCAT('%', :search, '%')))",
           countQuery = "SELECT COUNT(p) FROM Part p " +
           "WHERE (:includeArchived = true OR p.active = true) " +
           "AND (COALESCE(:category, '') = '' OR LOWER(p.category) = LOWER(:category)) " +
           "AND (:lowStockOnly = false OR (p.active = true AND p.currentQuantity <= p.minReorderLevel)) " +
           "AND (COALESCE(:search, '') = '' OR LOWER(p.partCode) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(p.description) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Part> searchParts(
            @Param("search") String search,
            @Param("category") String category,
            @Param("lowStockOnly") boolean lowStockOnly,
            @Param("includeArchived") boolean includeArchived,
            Pageable pageable
    );
}
