package dev.sayef.trawler;

import static java.util.Comparator.comparing;
import static java.util.Comparator.comparingInt;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stock against par: what's low, what to order, and every movement that changes on-hand.
 */
@Service
@Transactional
class StockService {

    static final int USAGE_WINDOW_DAYS = 14;

    static final Set<MovementReason> CONSUMPTION = EnumSet.of(MovementReason.USAGE, MovementReason.WASTE);

    private static final Set<MovementReason> MANUAL_REASONS =
            EnumSet.of(MovementReason.USAGE, MovementReason.WASTE, MovementReason.ADJUSTMENT);

    private final StoreRepository stores;
    private final SupplierRepository suppliers;
    private final ProductRepository products;
    private final StockLevelRepository levels;
    private final OrderRepository orders;
    private final MovementRepository movements;
    private final Clock clock;

    StockService(StoreRepository stores, SupplierRepository suppliers, ProductRepository products,
                 StockLevelRepository levels, OrderRepository orders, MovementRepository movements, Clock clock) {
        this.stores = stores;
        this.suppliers = suppliers;
        this.products = products;
        this.levels = levels;
        this.orders = orders;
        this.movements = movements;
        this.clock = clock;
    }

    /** Lines below par, biggest shortfall first: the order a stock-take sheet is worked through. */
    @Transactional(readOnly = true)
    List<StockItem> belowPar(long storeId) {
        requireStore(storeId);
        return items(storeId, levels.findBelowPar(storeId)).stream()
                .sorted(comparingInt(StockItem::shortfall).reversed().thenComparing(StockItem::sku))
                .toList();
    }

    @Transactional(readOnly = true)
    List<StockItem> levels(long storeId) {
        requireStore(storeId);
        return items(storeId, levels.findByStore(storeId));
    }

    @Transactional(readOnly = true)
    StockItem item(long levelId) {
        StockLevel level = requireLevel(levelId);
        return items(level.getStore().getId(), List.of(level)).getFirst();
    }

    StockItem updateLevel(long levelId, int par, String bin) {
        if (par < 0) {
            throw new InvalidRequestException("Par can't be negative");
        }
        StockLevel level = requireLevel(levelId);
        level.setPar(par);
        level.setBin(bin == null || bin.isBlank() ? null : bin.strip());
        return item(levelId);
    }

    /** Raises (or tops up) a draft order with one supplier, enough to bring every line back to par. */
    PurchaseOrder raiseOrder(long storeId, long supplierId) {
        Store store = requireStore(storeId);
        Supplier supplier = suppliers.findById(supplierId)
                .orElseThrow(() -> new NotFoundException("Supplier %d doesn't exist".formatted(supplierId)));
        List<StockLevel> due = levels.findBelowPar(storeId).stream()
                .filter(level -> supplierId == level.getProduct().getSupplier().getId())
                .toList();
        PurchaseOrder order = draftFor(store, supplier, OrderSource.MANUAL);
        if (topUp(order, due, orders.onOrderByProduct(storeId)) == 0) {
            throw new ConflictException("Nothing from %s is below par at %s once open orders are counted"
                    .formatted(supplier.getName(), store.getName()));
        }
        return orders.save(order);
    }

    /** One draft per supplier for everything below par. This is what the autopilot runs each morning. */
    List<PurchaseOrder> raiseOrders(long storeId, OrderSource source) {
        Store store = requireStore(storeId);
        Map<Long, Integer> onOrder = orders.onOrderByProduct(storeId);
        Map<Long, List<StockLevel>> bySupplier = levels.findBelowPar(storeId).stream()
                .collect(Collectors.groupingBy(level -> level.getProduct().getSupplier().getId(),
                        LinkedHashMap::new, Collectors.toList()));
        List<PurchaseOrder> raised = new ArrayList<>();
        bySupplier.values().forEach(due -> {
            PurchaseOrder order = draftFor(store, due.getFirst().getProduct().getSupplier(), source);
            if (topUp(order, due, onOrder) > 0) {
                raised.add(orders.save(order));
            }
        });
        raised.sort(comparing(PurchaseOrder::getSupplierName));
        return raised;
    }

    /**
     * Books a delivery into stock. An empty map receives everything outstanding.
     */
    PurchaseOrder receive(long orderId, Map<Long, Integer> quantities) {
        PurchaseOrder order = orders.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order %d doesn't exist".formatted(orderId)));
        Map<Long, Integer> toReceive = new LinkedHashMap<>();
        if (quantities == null || quantities.isEmpty()) {
            order.getLines().forEach(line -> toReceive.put(line.getId(), line.getOutstanding()));
        } else {
            toReceive.putAll(quantities);
        }
        if (toReceive.values().stream().noneMatch(quantity -> quantity != null && quantity > 0)) {
            throw new InvalidRequestException("Enter at least one quantity to receive");
        }
        Instant now = clock.instant();
        Store store = order.getStore();
        toReceive.forEach((lineId, quantity) -> {
            if (quantity == null || quantity == 0) {
                return;
            }
            OrderLine line = order.line(lineId);
            order.receive(line, quantity);
            StockLevel level = levelFor(store, line.getProduct());
            movements.save(level.apply(quantity, MovementReason.RECEIPT, order.getReference(),
                    "Delivery from " + order.getSupplierName(), now));
        });
        order.settleAfterReceipt(now);
        return order;
    }

    /** A manual correction: usage, waste or a plain adjustment. */
    StockItem adjust(long storeId, String sku, int delta, MovementReason reason, String note) {
        if (!MANUAL_REASONS.contains(reason)) {
            throw new InvalidRequestException("Use usage, waste or adjustment for manual changes");
        }
        if (delta == 0) {
            throw new InvalidRequestException("Enter a quantity other than 0");
        }
        if (reason != MovementReason.ADJUSTMENT && delta > 0) {
            throw new InvalidRequestException("Usage and waste take stock away, so the quantity must be negative");
        }
        Product product = requireProduct(sku);
        StockLevel level = levels.findByStore_IdAndProduct_Id(storeId, product.getId())
                .orElseThrow(() -> new NotFoundException("%s isn't stocked at store %d".formatted(sku, storeId)));
        movements.save(level.apply(delta, reason, null, blankToNull(note), clock.instant()));
        return items(storeId, List.of(level)).getFirst();
    }

    /** Moves stock between two stores, writing a matching pair of ledger entries. */
    List<StockMovement> transfer(long fromStoreId, long toStoreId, String sku, int quantity, String note) {
        if (fromStoreId == toStoreId) {
            throw new InvalidRequestException("Pick two different stores");
        }
        if (quantity <= 0) {
            throw new InvalidRequestException("Transfer at least 1");
        }
        Store from = requireStore(fromStoreId);
        Store to = requireStore(toStoreId);
        Product product = requireProduct(sku);
        StockLevel source = levels.findByStore_IdAndProduct_Id(fromStoreId, product.getId())
                .orElseThrow(() -> new NotFoundException("%s isn't stocked at %s".formatted(sku, from.getName())));
        StockLevel target = levelFor(to, product);
        Instant now = clock.instant();
        String cleanNote = blankToNull(note);
        return List.of(
                movements.save(source.apply(-quantity, MovementReason.TRANSFER_OUT, "To " + to.getCode(), cleanNote, now)),
                movements.save(target.apply(quantity, MovementReason.TRANSFER_IN, "From " + from.getCode(), cleanNote, now)));
    }

    private List<StockItem> items(long storeId, List<StockLevel> list) {
        Map<Long, Integer> onOrder = orders.onOrderByProduct(storeId);
        Map<Long, Long> usage = movements
                .usageSince(storeId, CONSUMPTION, clock.instant().minus(Duration.ofDays(USAGE_WINDOW_DAYS)))
                .stream()
                .collect(Collectors.toMap(Usage::productId, Usage::units));
        return list.stream()
                .map(level -> {
                    Long productId = level.getProduct().getId();
                    double daily = usage.getOrDefault(productId, 0L) / (double) USAGE_WINDOW_DAYS;
                    return StockItem.of(level, onOrder.getOrDefault(productId, 0), daily);
                })
                .toList();
    }

    /** Adds what each line needs to reach par, net of stock already on the way, in whole cases. */
    private static int topUp(PurchaseOrder order, List<StockLevel> due, Map<Long, Integer> onOrder) {
        int added = 0;
        for (StockLevel level : due) {
            Product product = level.getProduct();
            int needed = level.getPar() - level.getOnHand() - onOrder.getOrDefault(product.getId(), 0);
            int quantity = product.roundUpToPack(needed);
            if (quantity > 0) {
                order.addLine(product, quantity);
                added++;
            }
        }
        return added;
    }

    private PurchaseOrder draftFor(Store store, Supplier supplier, OrderSource source) {
        return orders.findFirstByStore_IdAndSupplier_IdAndStatusOrderByCreatedAtDesc(
                        store.getId(), supplier.getId(), OrderStatus.DRAFT)
                .orElseGet(() -> new PurchaseOrder(store, supplier, source, clock.instant()));
    }

    private StockLevel levelFor(Store store, Product product) {
        return levels.findByStore_IdAndProduct_Id(store.getId(), product.getId())
                .orElseGet(() -> levels.save(new StockLevel(store, product, 0, 0)));
    }

    private Store requireStore(long storeId) {
        return stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store %d doesn't exist".formatted(storeId)));
    }

    private StockLevel requireLevel(long levelId) {
        return levels.findById(levelId)
                .orElseThrow(() -> new NotFoundException("Stock line %d doesn't exist".formatted(levelId)));
    }

    private Product requireProduct(String sku) {
        return products.findBySku(sku)
                .orElseThrow(() -> new NotFoundException("SKU %s doesn't exist".formatted(sku)));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
