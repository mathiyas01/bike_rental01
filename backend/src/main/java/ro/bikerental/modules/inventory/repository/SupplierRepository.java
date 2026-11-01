package ro.bikerental.modules.inventory.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.inventory.entity.Supplier;

import java.util.UUID;

@Repository
public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    boolean existsByNameIgnoreCase(String name);

    @Query("SELECT s FROM Supplier s " +
           "WHERE (:includeArchived = true OR s.active = true) " +
           "AND (:search IS NULL OR LOWER(s.name) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(s.contactPerson) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(s.phone) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(s.email) LIKE LOWER(CONCAT('%', :search, '%')) " +
           "     OR LOWER(s.taxCui) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Supplier> searchSuppliers(
            @Param("search") String search,
            @Param("includeArchived") boolean includeArchived,
            Pageable pageable
    );
}

