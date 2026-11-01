package ro.bikerental.modules.rental.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.repository.BikeRepository;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.customer.repository.CustomerRepository;
import ro.bikerental.modules.rental.dto.CloseRentalRequest;
import ro.bikerental.modules.rental.dto.CreateRentalRequest;
import ro.bikerental.modules.rental.dto.RentalDto;
import ro.bikerental.modules.rental.entity.Rental;
import ro.bikerental.modules.rental.entity.RentalCharge;
import ro.bikerental.modules.rental.entity.RentalStatus;
import ro.bikerental.modules.rental.repository.RentalChargeRepository;
import ro.bikerental.modules.rental.repository.RentalRepository;

import java.util.UUID;

@Service
public class RentalService {

    private final RentalRepository rentalRepository;
    private final RentalChargeRepository rentalChargeRepository;
    private final CustomerRepository customerRepository;
    private final BikeRepository bikeRepository;

    public RentalService(RentalRepository rentalRepository,
                         RentalChargeRepository rentalChargeRepository,
                         CustomerRepository customerRepository,
                         BikeRepository bikeRepository) {
        this.rentalRepository = rentalRepository;
        this.rentalChargeRepository = rentalChargeRepository;
        this.customerRepository = customerRepository;
        this.bikeRepository = bikeRepository;
    }

    @Transactional
    public RentalDto createRental(CreateRentalRequest request) {
        Customer customer = customerRepository.findById(request.getCustomerId())
                .orElseThrow(() -> new ResourceNotFoundException("Customer", request.getCustomerId()));

        if (customer.isArchived()) {
            throw new BusinessException("Cannot create a rental for an archived customer");
        }

        Bike bike = bikeRepository.findById(request.getMotorbikeId())
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", request.getMotorbikeId()));

        if (bike.isArchived()) {
            throw new BusinessException("Cannot rent an archived motorbike");
        }

        if (bike.getStatus() != BikeStatus.AVAILABLE) {
            throw new ConflictException("Motorbike " + bike.getRegistrationNumber() +
                    " is not available (current status: " + bike.getStatus() + ")");
        }

        if (rentalRepository.existsByBikeIdAndStatus(bike.getId(), RentalStatus.ACTIVE)) {
            throw new ConflictException("Motorbike " + bike.getRegistrationNumber() +
                    " already has an active rental agreement");
        }

        Rental rental = new Rental(
                customer,
                bike,
                request.getStartDate(),
                request.getPlannedEndDate(),
                request.getWeeklyRate(),
                request.getCurrency(),
                request.getDepositAmount(),
                request.getDepositCurrency(),
                request.getScheduleAnchorDay(),
                request.getTermsAndNotes()
        );

        Rental savedRental = rentalRepository.save(rental);

        // Update bike status to RENTED
        bike.setStatus(BikeStatus.RENTED);
        bikeRepository.save(bike);

        // Generate initial weekly charge (Sequence 1)
        RentalCharge initialCharge = new RentalCharge(
                savedRental,
                1,
                request.getStartDate(),
                request.getStartDate().plusDays(6),
                request.getStartDate(),
                request.getWeeklyRate(),
                savedRental.getCurrency(),
                "Initial weekly charge on contract start"
        );
        rentalChargeRepository.save(initialCharge);

        return RentalDto.fromEntity(savedRental);
    }

    @Transactional
    public RentalDto closeRental(UUID rentalId, CloseRentalRequest request) {
        Rental rental = rentalRepository.findById(rentalId)
                .orElseThrow(() -> new ResourceNotFoundException("Rental agreement", rentalId));

        if (rental.getStatus() != RentalStatus.ACTIVE) {
            throw new BusinessException("Rental agreement is not active (current status: " + rental.getStatus() + ")");
        }

        if (request.getClosureDate().isBefore(rental.getStartDate())) {
            throw new BusinessException("Closure date cannot be earlier than rental start date");
        }

        rental.setActualClosedDate(request.getClosureDate());
        rental.setStatus(RentalStatus.CLOSED);
        if (request.getNotes() != null && !request.getNotes().isBlank()) {
            String existingNotes = rental.getTermsAndNotes() != null ? rental.getTermsAndNotes() + "\n" : "";
            rental.setTermsAndNotes(existingNotes + "[Closed on " + request.getClosureDate() + "]: " + request.getNotes());
        }
        Rental closedRental = rentalRepository.save(rental);

        // Restore bike status to AVAILABLE
        Bike bike = rental.getBike();
        if (bike.getStatus() == BikeStatus.RENTED) {
            bike.setStatus(BikeStatus.AVAILABLE);
            bikeRepository.save(bike);
        }

        return RentalDto.fromEntity(closedRental);
    }

    @Transactional(readOnly = true)
    public RentalDto getRentalById(UUID rentalId) {
        Rental rental = rentalRepository.findById(rentalId)
                .orElseThrow(() -> new ResourceNotFoundException("Rental agreement", rentalId));
        return RentalDto.fromEntity(rental);
    }

    @Transactional(readOnly = true)
    public PageResponse<RentalDto> listRentals(RentalStatus status, UUID customerId, UUID bikeId, Pageable pageable) {
        Page<Rental> page = rentalRepository.searchRentals(status, customerId, bikeId, pageable);
        Page<RentalDto> dtoPage = page.map(RentalDto::fromEntity);
        return new PageResponse<>(dtoPage);
    }
}
