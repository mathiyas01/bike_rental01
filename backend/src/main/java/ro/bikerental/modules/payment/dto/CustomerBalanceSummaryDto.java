package ro.bikerental.modules.payment.dto;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class CustomerBalanceSummaryDto {
    private UUID customerId;
    private String customerName;
    private Map<String, CurrencyBalanceDto> balances = new HashMap<>();

    public CustomerBalanceSummaryDto() {
        // Initialize all 3 supported currencies with zero values
        balances.put("RON", new CurrencyBalanceDto("RON"));
        balances.put("EUR", new CurrencyBalanceDto("EUR"));
        balances.put("USD", new CurrencyBalanceDto("USD"));
    }

    public CustomerBalanceSummaryDto(UUID customerId, String customerName) {
        this();
        this.customerId = customerId;
        this.customerName = customerName;
    }

    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }

    public String getCustomerName() { return customerName; }
    public void setCustomerName(String customerName) { this.customerName = customerName; }

    public Map<String, CurrencyBalanceDto> getBalances() { return balances; }
    public void setBalances(Map<String, CurrencyBalanceDto> balances) { this.balances = balances; }

    public static class CurrencyBalanceDto {
        private String currency;
        private BigDecimal totalBilled = BigDecimal.ZERO;
        private BigDecimal totalPaid = BigDecimal.ZERO;
        private BigDecimal totalOutstanding = BigDecimal.ZERO;

        public CurrencyBalanceDto() {}

        public CurrencyBalanceDto(String currency) {
            this.currency = currency;
            this.totalBilled = BigDecimal.ZERO;
            this.totalPaid = BigDecimal.ZERO;
            this.totalOutstanding = BigDecimal.ZERO;
        }

        public CurrencyBalanceDto(String currency, BigDecimal totalBilled, BigDecimal totalPaid, BigDecimal totalOutstanding) {
            this.currency = currency;
            this.totalBilled = totalBilled != null ? totalBilled : BigDecimal.ZERO;
            this.totalPaid = totalPaid != null ? totalPaid : BigDecimal.ZERO;
            this.totalOutstanding = totalOutstanding != null ? totalOutstanding : BigDecimal.ZERO;
        }

        public String getCurrency() { return currency; }
        public void setCurrency(String currency) { this.currency = currency; }

        public BigDecimal getTotalBilled() { return totalBilled; }
        public void setTotalBilled(BigDecimal totalBilled) { this.totalBilled = totalBilled; }

        public BigDecimal getTotalPaid() { return totalPaid; }
        public void setTotalPaid(BigDecimal totalPaid) { this.totalPaid = totalPaid; }

        public BigDecimal getTotalOutstanding() { return totalOutstanding; }
        public void setTotalOutstanding(BigDecimal totalOutstanding) { this.totalOutstanding = totalOutstanding; }
    }
}
