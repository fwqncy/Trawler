package dev.sayef.trawler;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
class DashboardService {

    static final int USAGE_DAYS = 14;

    private final StockService stock;
    private final OrderService orderService;
    private final StoreRepository stores;
    private final OrderRepository orders;
    private final MovementRepository movements;
    private final StockTakeRepository takes;
    private final Clock clock;

    DashboardService(StockService stock, OrderService orderService, StoreRepository stores, OrderRepository orders,
                     MovementRepository movements, StockTakeRepository takes, Clock clock) {
        this.stock = stock;
        this.orderService = orderService;
        this.stores = stores;
        this.orders = orders;
        this.movements = movements;
        this.takes = takes;
        this.clock = clock;
    }

    Dashboard forStore(long storeId) {
        Store store = stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store %d doesn't exist".formatted(storeId)));
        List<StockItem> items = stock.levels(storeId);
        BigDecimal stockValue = items.stream().map(StockItem::value).reduce(BigDecimal.ZERO, BigDecimal::add);
        int below = (int) items.stream().filter(item -> item.status() != StockStatus.OK).count();
        int out = (int) items.stream().filter(item -> item.status() == StockStatus.OUT).count();

        Map<OrderStatus, Long> counts = orderService.summary(storeId);
        long open = OrderStatus.OPEN.stream().mapToLong(counts::get).sum();
        LocalDate today = LocalDate.now(clock);
        int overdue = orders.findOverdue(storeId,
                EnumSet.of(OrderStatus.SENT, OrderStatus.PARTIALLY_RECEIVED), today).size();

        Dashboard.LastCount last = takes
                .findFirstByStore_IdAndStatusOrderByCompletedAtDesc(storeId, StockTakeStatus.COMPLETED)
                .map(DashboardService::lastCount)
                .orElse(null);

        return new Dashboard(storeId, store.getName(), stockValue, items.size(), below, out, open,
                orders.outstandingValue(storeId, OrderStatus.OPEN), overdue, counts, last,
                usage(storeId, today), movements.search(storeId, null, null, PageRequest.of(0, 8)));
    }

    /** Units and cost used or wasted per day, oldest first, with quiet days as zeros. */
    private List<Dashboard.Day> usage(long storeId, LocalDate today) {
        ZoneId zone = clock.getZone();
        LocalDate first = today.minusDays(USAGE_DAYS - 1);
        Map<LocalDate, int[]> units = new TreeMap<>();
        Map<LocalDate, BigDecimal> value = new TreeMap<>();
        for (LocalDate day = first; !day.isAfter(today); day = day.plusDays(1)) {
            units.put(day, new int[1]);
            value.put(day, BigDecimal.ZERO);
        }
        movements.findConsumptionSince(storeId, StockService.CONSUMPTION, first.atStartOfDay(zone).toInstant())
                .forEach(movement -> {
                    LocalDate day = LocalDate.ofInstant(movement.getOccurredAt(), zone);
                    if (units.containsKey(day)) {
                        int used = -movement.getDelta();
                        units.get(day)[0] += used;
                        value.merge(day, movement.getProduct().getUnitCost().multiply(BigDecimal.valueOf(used)),
                                BigDecimal::add);
                    }
                });
        List<Dashboard.Day> days = new ArrayList<>();
        units.forEach((day, total) -> days.add(new Dashboard.Day(day, total[0], value.get(day))));
        return days;
    }

    private static Dashboard.LastCount lastCount(StockTake take) {
        BigDecimal counted = take.getLines().stream()
                .filter(StockTakeLine::isCounted)
                .map(line -> line.getUnitCost().multiply(BigDecimal.valueOf(line.getCounted())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new Dashboard.LastCount(take.getId(), take.getReference(), take.getCompletedAt(),
                take.getCountedCount(), take.getVarianceUnits(), take.getVarianceValue(), counted);
    }
}
