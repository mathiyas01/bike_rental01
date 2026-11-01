package ro.bikerental.common.currency;

public enum SupportedCurrency {
    RON("Romanian Leu", "lei"),
    EUR("Euro", "€"),
    USD("US Dollar", "$");

    private final String displayName;
    private final String symbol;

    SupportedCurrency(String displayName, String symbol) {
        this.displayName = displayName;
        this.symbol = symbol;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getSymbol() {
        return symbol;
    }

    public static boolean isValid(String code) {
        if (code == null) return false;
        try {
            valueOf(code.trim().toUpperCase());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
