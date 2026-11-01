package ro.bikerental.modules.customer.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import ro.bikerental.common.exception.ConflictException;
import ro.bikerental.common.exception.ResourceNotFoundException;
import ro.bikerental.modules.customer.dto.CreateCustomerRequest;
import ro.bikerental.modules.customer.dto.CustomerDto;
import ro.bikerental.modules.customer.dto.UpdateCustomerRequest;
import ro.bikerental.modules.customer.entity.Customer;
import ro.bikerental.modules.customer.repository.CustomerRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    @Mock
    private CustomerRepository customerRepository;

    private CustomerService customerService;

    @BeforeEach
    void setUp() {
        customerService = new CustomerService(customerRepository);
    }

    @Test
    @DisplayName("Should successfully create a customer")
    void createCustomer_success() {
        CreateCustomerRequest request = new CreateCustomerRequest(
                "Andrei Vasilescu",
                "+40721234567",
                "andrei@test.ro",
                "1940512123456",
                "B00123456Z",
                "A,B",
                LocalDate.of(2030, 8, 20),
                "Str. Victoriei nr. 45, București",
                "Courier rider"
        );

        when(customerRepository.existsByPhone("+40721234567")).thenReturn(false);
        when(customerRepository.save(any(Customer.class))).thenAnswer(invocation -> {
            Customer c = invocation.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        CustomerDto created = customerService.createCustomer(request);

        assertThat(created).isNotNull();
        assertThat(created.getId()).isNotNull();
        assertThat(created.getFullName()).isEqualTo("Andrei Vasilescu");
        assertThat(created.getPhone()).isEqualTo("+40721234567");
        assertThat(created.isArchived()).isFalse();
        verify(customerRepository).save(any(Customer.class));
    }

    @Test
    @DisplayName("Should reject customer creation when phone number already exists")
    void createCustomer_duplicatePhone_throwsConflict() {
        CreateCustomerRequest request = new CreateCustomerRequest(
                "Andrei Vasilescu",
                "+40721234567",
                "andrei@test.ro",
                null, null, null, null, null, null
        );

        when(customerRepository.existsByPhone("+40721234567")).thenReturn(true);

        assertThatThrownBy(() -> customerService.createCustomer(request))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("+40721234567");

        verify(customerRepository, never()).save(any());
    }

    @Test
    @DisplayName("Should update customer details successfully")
    void updateCustomer_success() {
        UUID customerId = UUID.randomUUID();
        Customer customer = new Customer("Old Name", "+40721000000", null, null, null, null, null, null, null, null);
        customer.setId(customerId);

        UpdateCustomerRequest updateReq = new UpdateCustomerRequest();
        updateReq.setFullName("New Name");
        updateReq.setPhone("+40721999999");
        updateReq.setEmail("new@test.ro");

        when(customerRepository.findById(customerId)).thenReturn(Optional.of(customer));
        when(customerRepository.existsByPhoneAndIdNot("+40721999999", customerId)).thenReturn(false);
        when(customerRepository.save(any(Customer.class))).thenAnswer(i -> i.getArgument(0));

        CustomerDto updated = customerService.updateCustomer(customerId, updateReq);

        assertThat(updated.getFullName()).isEqualTo("New Name");
        assertThat(updated.getPhone()).isEqualTo("+40721999999");
        assertThat(updated.getEmail()).isEqualTo("new@test.ro");
    }

    @Test
    @DisplayName("Should soft-archive customer without deleting records")
    void archiveCustomer_success() {
        UUID customerId = UUID.randomUUID();
        Customer customer = new Customer("Andrei", "+40721234567", null, null, null, null, null, null, null, null);
        customer.setId(customerId);
        customer.setArchived(false);

        when(customerRepository.findById(customerId)).thenReturn(Optional.of(customer));
        when(customerRepository.save(any(Customer.class))).thenAnswer(i -> i.getArgument(0));

        CustomerDto archived = customerService.archiveCustomer(customerId);

        assertThat(archived.isArchived()).isTrue();
        verify(customerRepository).save(customer);
    }
}
