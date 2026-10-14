package dev.sayef.trawler;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Counting a store: snapshot, count, then post the variance as adjustments. */
@Service
@Transactional
class StockTakeService {

    private final StockTakeRepository takes;
    private final StoreRepository stores;
    private final StockLevelRepository levels;
    private final MovementRepository movements;
    private final Clock clock;

    StockTakeService(StockTakeRepository takes, StoreRepository stores, StockLevelRepository levels,
                     MovementRepository movements, Clock clock) {
        this.takes = takes;
        this.stores = stores;
        this.levels = levels;
        this.movements = movements;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    List<StockTake> list(long storeId) {
        return takes.findByStore_IdOrderByStartedAtDesc(storeId);
    }

    @Transactional(readOnly = true)
    StockTake get(long takeId) {
        return takes.findById(takeId)
                .orElseThrow(() -> new NotFoundException("Stock-take %d doesn't exist".formatted(takeId)));
    }

    StockTake start(long storeId, boolean blind) {
        Store store = stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store %d doesn't exist".formatted(storeId)));
        if (takes.existsByStore_IdAndStatus(storeId, StockTakeStatus.IN_PROGRESS)) {
            throw new ConflictException("A stock-take is already running at " + store.getName());
        }
        List<StockLevel> stocked = levels.findByStore(storeId);
        if (stocked.isEmpty()) {
            throw new ConflictException("Nothing is stocked at %s yet".formatted(store.getName()));
        }
        StockTake take = new StockTake(store, blind, clock.instant());
        stocked.stream()
                .sorted(Comparator.comparing((StockLevel level) -> level.getBin() == null ? "~" : level.getBin())
                        .thenComparing(level -> level.getProduct().getSku()))
                .forEach(level -> take.addLine(level.getProduct(), level.getBin(), level.getOnHand()));
        return takes.save(take);
    }

    StockTake count(long takeId, long lineId, Integer counted) {
        StockTake take = get(takeId);
        take.count(lineId, counted);
        return take;
    }

    /**
     * Posts each counted line's variance against current on-hand, so anything delivered or used
     * mid-count still lands correctly. Uncounted lines keep their on-hand.
     */
    StockTake complete(long takeId) {
        StockTake take = get(takeId);
        Instant now = clock.instant();
        take.complete(now);
        long storeId = take.getStoreId();
        for (StockTakeLine line : take.getLines()) {
            if (!line.isCounted() || line.variance() == 0) {
                continue;
            }
            levels.findByStore_IdAndProduct_Id(storeId, line.getProductId()).ifPresent(level -> {
                int delta = Math.max(line.variance(), -level.getOnHand());
                if (delta != 0) {
                    String note = "Counted %d, expected %d".formatted(line.getCounted(), line.expectedQuantity());
                    movements.save(level.apply(delta, MovementReason.STOCKTAKE, take.getReference(), note, now));
                }
            });
        }
        return take;
    }

    StockTake cancel(long takeId) {
        StockTake take = get(takeId);
        take.cancel(clock.instant());
        return take;
    }
}
