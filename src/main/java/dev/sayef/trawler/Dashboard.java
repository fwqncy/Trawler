package dev.sayef.trawler;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/** The overview screen for one store, in one round trip. */
record Dashboard(
        long storeId,
        String storeName,
        BigDecimal stockValue,
        int lines,
        int belowPar,
        int outOfStock,
        long openOrders,
        BigDecimal onOrderValue,
        int overdueOrders,
        Map<OrderStatus, Long> orderCounts,
        LastCount lastStockTake,
        List<Day> usage,
        List<StockMovement> recent) {

    record Day(LocalDate date, int units, BigDecimal value) {
    }

    record LastCount(long id, String reference, Instant completedAt, int linesCounted,
                     int varianceUnits, BigDecimal varianceValue, BigDecimal countedValue) {
    }
}
