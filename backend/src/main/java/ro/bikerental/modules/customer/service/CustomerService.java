package ro.bikerental.modules.customer.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.common.pagination.PageResponse;
import ro.bikerental.modules.customer.dto.CreateCustomerRequest;
import ro.bikerental.modules.customer.dto.CustomerDto;
import ro.bikerental.modules.customer.dto.UpdateCustomerRequest;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.customer.repository.CustomerRepository;

import java.util.UUID;

@Service
public class CustomerService {

    private final CustomerRepository customerRepository;

    public CustomerService(CustomerRepository customerRepository) {
        this.customerRepository = customerRepository;
    }

    @Transactional
    public CustomerDto createCustomer(CreateCustomerRequest request) {
        String phone = request.getPhone().trim();
        if (customerRepository.existsByPhone(phone)) {
            throw new ConflictException("Customer with phone number '" + phone + "' already exists");
        }

        Customer customer = new Customer(
                request.getFullName().trim(),
                phone,
                request.getEmail() != null ? request.getEmail().trim().toLowerCase() : null,
                request.getCnpOrTaxId() != null ? request.getCnpOrTaxId().trim() : null,
                request.getDrivingLicenceNumber() != null ? request.getDrivingLicenceNumber().trim() : null,
                request.getLicenceCategories() != null ? request.getLicenceCategories().trim() : "A,A2",
                request.getLicenceExpiryDate(),
                request.getAddress() != null ? request.getAddress().trim() : null,
                request.getGdprConsentDate(),
                request.getNotes()
        );
        customer.setDateOfBirth(request.getDateOfBirth());
        customer.setLivingCity(request.getLivingCity() != null ? request.getLivingCity().trim() : null);

        Customer saved = customerRepository.save(customer);
        return CustomerDto.fromEntity(saved);
    }

    @Transactional
    public CustomerDto updateCustomer(UUID id, UpdateCustomerRequest request) {
        Customer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer", id));

        String newPhone = request.getPhone().trim();
        if (customerRepository.existsByPhoneAndIdNot(newPhone, id)) {
            throw new ConflictException("Another customer already has phone number '" + newPhone + "'");
        }

        customer.setFullName(request.getFullName().trim());
        customer.setPhone(newPhone);
        customer.setEmail(request.getEmail() != null ? request.getEmail().trim().toLowerCase() : null);
        customer.setCnpOrTaxId(request.getCnpOrTaxId() != null ? request.getCnpOrTaxId().trim() : null);
        customer.setDrivingLicenceNumber(request.getDrivingLicenceNumber() != null ? request.getDrivingLicenceNumber().trim() : null);
        if (request.getLicenceCategories() != null) {
            customer.setLicenceCategories(request.getLicenceCategories().trim());
        }
        customer.setLicenceExpiryDate(request.getLicenceExpiryDate());
        customer.setAddress(request.getAddress() != null ? request.getAddress().trim() : null);
        customer.setNotes(request.getNotes());

        Customer updated = customerRepository.save(customer);
        return CustomerDto.fromEntity(updated);
    }

    @Transactional(readOnly = true)
    public CustomerDto getCustomerById(UUID id) {
        Customer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer", id));
        return CustomerDto.fromEntity(customer);
    }

    @Transactional
    public CustomerDto archiveCustomer(UUID id) {
        Customer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer", id));
        customer.setArchived(true);
        Customer updated = customerRepository.save(customer);
        return CustomerDto.fromEntity(updated);
    }

    @Transactional
    public CustomerDto unarchiveCustomer(UUID id) {
        Customer customer = customerRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Customer", id));
        customer.setArchived(false);
        Customer updated = customerRepository.save(customer);
        return CustomerDto.fromEntity(updated);
    }

    @Transactional(readOnly = true)
    public PageResponse<CustomerDto> listCustomers(String search, boolean includeArchived, Pageable pageable) {
        Page<Customer> page = customerRepository.searchCustomers(search, includeArchived, pageable);
        Page<CustomerDto> dtoPage = page.map(CustomerDto::fromEntity);
        return new PageResponse<>(dtoPage);
    }
}
