package ro.bikerental.modules.rental.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RentalRepository extends JpaRepository<Rental, UUID> {

    boolean existsByBikeIdAndStatus(UUID bikeId, RentalStatus status);

    Optional<Rental> findFirstByBikeIdAndStatus(UUID bikeId, RentalStatus status);

    List<Rental> findAllByCustomerIdOrderByStartDateDesc(UUID customerId);

    List<Rental> findAllByBikeIdOrderByStartDateDesc(UUID bikeId);

    long countByStatus(RentalStatus status);

    @Query("SELECT r FROM Rental r " +
           "JOIN FETCH r.customer c " +
           "JOIN FETCH r.bike b " +
           "WHERE (:status IS NULL OR r.status = :status) " +
           "AND (:customerId IS NULL OR c.id = :customerId) " +
           "AND (:bikeId IS NULL OR b.id = :bikeId)")
    Page<Rental> searchRentals(
            @Param("status") RentalStatus status,
            @Param("customerId") UUID customerId,
            @Param("bikeId") UUID bikeId,
            Pageable pageable
    );
}
