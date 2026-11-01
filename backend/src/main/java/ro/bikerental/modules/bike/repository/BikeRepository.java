package ro.bikerental.modules.bike.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface BikeRepository extends JpaRepository<Bike, UUID> {

    Optional<Bike> findByRegistrationNumber(String registrationNumber);

    boolean existsByRegistrationNumber(String registrationNumber);

    boolean existsByRegistrationNumberAndIdNot(String registrationNumber, UUID id);

    boolean existsByVin(String vin);

    boolean existsByVinAndIdNot(String vin, UUID id);

    long countByStatusAndArchivedFalse(BikeStatus status);

    long countByArchivedFalse();

    @Query("SELECT b FROM Bike b WHERE " +
           "(:includeArchived = true OR b.archived = false) AND " +
           "(:status IS NULL OR b.status = :status) AND " +
           "(:search IS NULL OR :search = '' OR " +
           "LOWER(b.registrationNumber) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(b.vin) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(b.make) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "LOWER(b.model) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<Bike> searchBikes(
            @Param("search") String search,
            @Param("status") BikeStatus status,
            @Param("includeArchived") boolean includeArchived,
            Pageable pageable
    );
}
