package ro.bikerental.modules.customer.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import ro.bikerental.modules.customer.entity.Customer;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    Optional<Customer> findByPhone(String phone);

    boolean existsByPhone(String phone);

    boolean existsByPhoneAndIdNot(String phone, UUID id);

    @Query("SELECT c FROM Customer c WHERE " +
           "(:includeArchived = true OR c.archived = false) AND " +
           "(:search IS NULL OR :search = '' OR " +
           "LOWER(c.fullName) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "c.phone LIKE CONCAT('%', :search, '%') OR " +
           "LOWER(c.email) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
           "c.cnpOrTaxId LIKE CONCAT('%', :search, '%'))")
    Page<Customer> searchCustomers(
            @Param("search") String search,
            @Param("includeArchived") boolean includeArchived,
            Pageable pageable
    );
}
