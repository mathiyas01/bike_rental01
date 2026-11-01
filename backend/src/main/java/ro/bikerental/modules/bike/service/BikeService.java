package ro.bikerental.modules.bike.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.BusinessException;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.bike.dto.BikeDto;
import ro.bikerental.modules.bike.dto.CreateBikeRequest;
import ro.bikerental.modules.bike.dto.UpdateBikeRequest;
import ro.bikerental.modules.bike.entity.Bike;
import ro.bikerental.modules.bike.entity.BikeStatus;
import ro.bikerental.modules.bike.repository.BikeRepository;

import java.util.UUID;

@Service
public class BikeService {

    private final BikeRepository bikeRepository;

    public BikeService(BikeRepository bikeRepository) {
        this.bikeRepository = bikeRepository;
    }

    @Transactional
    public BikeDto createBike(CreateBikeRequest request) {
        String reg = request.getRegistrationNumber().toUpperCase().trim();
        if (bikeRepository.existsByRegistrationNumber(reg)) {
            throw new ConflictException("Motorbike with registration number '" + reg + "' already exists");
        }

        String vin = request.getVin().toUpperCase().trim();
        if (bikeRepository.existsByVin(vin)) {
            throw new ConflictException("Motorbike with VIN '" + vin + "' already exists");
        }

        Bike bike = new Bike(
                reg,
                vin,
                request.getMake().trim(),
                request.getModel().trim(),
                request.getManufactureYear(),
                request.getCurrentOdometer(),
                request.getItpExpiryDate(),
                request.getRcaExpiryDate(),
                request.getCascoExpiryDate(),
                request.getStatus() != null ? request.getStatus() : BikeStatus.AVAILABLE,
                request.getNotes()
        );

        Bike saved = bikeRepository.save(bike);
        return BikeDto.fromEntity(saved);
    }

    @Transactional
    public BikeDto updateBike(UUID id, UpdateBikeRequest request) {
        Bike bike = bikeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", id));

        String newReg = request.getRegistrationNumber().toUpperCase().trim();
        if (bikeRepository.existsByRegistrationNumberAndIdNot(newReg, id)) {
            throw new ConflictException("Another motorbike with registration number '" + newReg + "' already exists");
        }

        String newVin = request.getVin().toUpperCase().trim();
        if (bikeRepository.existsByVinAndIdNot(newVin, id)) {
            throw new ConflictException("Another motorbike with VIN '" + newVin + "' already exists");
        }

        bike.setRegistrationNumber(newReg);
        bike.setVin(newVin);
        bike.setMake(request.getMake().trim());
        bike.setModel(request.getModel().trim());
        bike.setManufactureYear(request.getManufactureYear());
        bike.setCurrentOdometer(request.getCurrentOdometer());
        bike.setItpExpiryDate(request.getItpExpiryDate());
        bike.setRcaExpiryDate(request.getRcaExpiryDate());
        bike.setCascoExpiryDate(request.getCascoExpiryDate());
        if (request.getStatus() != null) {
            bike.setStatus(request.getStatus());
        }
        bike.setNotes(request.getNotes());

        Bike updated = bikeRepository.save(bike);
        return BikeDto.fromEntity(updated);
    }

    @Transactional(readOnly = true)
    public BikeDto getBikeById(UUID id) {
        Bike bike = bikeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", id));
        return BikeDto.fromEntity(bike);
    }

    @Transactional
    public BikeDto updateBikeStatus(UUID id, BikeStatus newStatus) {
        Bike bike = bikeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", id));

        if (bike.getStatus() == BikeStatus.RENTED && newStatus != BikeStatus.RENTED) {
            throw new BusinessException("Cannot directly change status of a currently rented bike. Please close the active rental agreement first.");
        }

        bike.setStatus(newStatus);
        Bike updated = bikeRepository.save(bike);
        return BikeDto.fromEntity(updated);
    }

    @Transactional
    public BikeDto archiveBike(UUID id) {
        Bike bike = bikeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", id));

        if (bike.getStatus() == BikeStatus.RENTED) {
            throw new BusinessException("Cannot archive a motorbike with an active rental");
        }

        bike.setArchived(true);
        bike.setStatus(BikeStatus.INACTIVE);
        Bike updated = bikeRepository.save(bike);
        return BikeDto.fromEntity(updated);
    }

    @Transactional
    public BikeDto unarchiveBike(UUID id) {
        Bike bike = bikeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Motorbike", id));

        bike.setArchived(false);
        bike.setStatus(BikeStatus.AVAILABLE);
        Bike updated = bikeRepository.save(bike);
        return BikeDto.fromEntity(updated);
    }

    @Transactional(readOnly = true)
    public PageResponse<BikeDto> listBikes(String search, BikeStatus status, boolean includeArchived, Pageable pageable) {
        Page<Bike> page = bikeRepository.searchBikes(search, status, includeArchived, pageable);
        Page<BikeDto> dtoPage = page.map(BikeDto::fromEntity);
        return new PageResponse<>(dtoPage);
    }
}
