package dev.sayef.trawler;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Seeds four cantinas with 30 days of believable history on first run: daily usage, waste,
 * deliveries that each belong to a received purchase order, a finished stock-take, and a
 * handful of open orders. The ledger always sums to on-hand.
 * <p>
 * Store 4 (Bondi) ends with exactly three lines below par, so
 * {@code GET /api/stock/low?storeId=4} returns TORT-12, AVO-HASS and CHIP-1KG.
 */
@Component
@ConditionalOnProperty(name = "trawler.demo-data", havingValue = "true")
class DemoData implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoData.class);

    private static final int HISTORY_DAYS = 30;
    private static final int STOCKTAKE_DAY = 6;

    private record SupplierSeed(String name, String email, String phone, int leadDays, int minOrder, int cadence) {
    }

    private record ProductSeed(String sku, String name, String category, String unit, int pack, String cost,
                               int supplier, String bin, int par) {
    }

    private record Move(long storeId, long productId, int delta, int balanceAfter, MovementReason reason,
                        String note, Instant at, Delivery delivery) {
    }

    /** One supplier drop at one store on one morning; becomes one received purchase order. */
    private record Delivery(int store, int supplier, LocalDate day) {
    }

    private static final List<SupplierSeed> SUPPLIERS = List.of(
            new SupplierSeed("Molino Tortilla Co", "orders@molino.example", "02 5550 0141", 2, 150, 3),
            new SupplierSeed("Harbour Fresh Produce", "sales@harbourfresh.example", "02 5550 0178", 1, 80, 2),
            new SupplierSeed("Southern Cross Dairy", "orders@scdairy.example", "02 5550 0112", 2, 100, 3),
            new SupplierSeed("Bayside Meats", "butcher@baysidemeats.example", "02 5550 0190", 2, 200, 4),
            new SupplierSeed("Larder & Co", "hello@larderco.example", "03 5550 0123", 3, 120, 7),
            new SupplierSeed("Coastal Beverages", "trade@coastalbev.example", "02 5550 0166", 4, 150, 7),
            new SupplierSeed("Pack & Serve", "orders@packserve.example", "03 5550 0107", 5, 100, 10));

    private static final List<ProductSeed> PRODUCTS = List.of(
            new ProductSeed("TORT-12", "Corn Tortillas 12 cm", "Tortillas & Chips", "pack", 10, "4.80", 0, "Dry 1", 60),
            new ProductSeed("TORT-25", "Flour Tortillas 25 cm", "Tortillas & Chips", "pack", 12, "5.60", 0, "Dry 1", 36),
            new ProductSeed("CHIP-1KG", "Corn Chips 1 kg", "Tortillas & Chips", "bag", 6, "7.90", 0, "Dry 1", 12),
            new ProductSeed("MASA-10", "Masa Harina 10 kg", "Tortillas & Chips", "sack", 1, "38.00", 0, "Dry 2", 3),
            new ProductSeed("AVO-HASS", "Hass Avocados", "Produce", "each", 24, "1.65", 1, "Cool Room", 40),
            new ProductSeed("LIME-KG", "Limes", "Produce", "kg", 1, "6.50", 1, "Cool Room", 8),
            new ProductSeed("CORI-BN", "Coriander", "Produce", "bunch", 12, "1.80", 1, "Cool Room", 24),
            new ProductSeed("TOMA-KG", "Roma Tomatoes", "Produce", "kg", 5, "5.20", 1, "Cool Room", 15),
            new ProductSeed("ONIO-KG", "Red Onions", "Produce", "kg", 10, "3.10", 1, "Dry 2", 20),
            new ProductSeed("JALA-KG", "Jalapeños", "Produce", "kg", 1, "12.00", 1, "Cool Room", 4),
            new ProductSeed("SCRM-2L", "Sour Cream 2 L", "Dairy", "tub", 6, "9.40", 2, "Cool Room", 12),
            new ProductSeed("CHSE-OAX", "Oaxaca Cheese 2 kg", "Dairy", "block", 1, "42.00", 2, "Cool Room", 6),
            new ProductSeed("MILK-2L", "Full Cream Milk 2 L", "Dairy", "bottle", 6, "3.20", 2, "Cool Room", 18),
            new ProductSeed("CHKN-THG", "Chicken Thigh Fillet", "Meat", "kg", 5, "11.50", 3, "Freezer", 30),
            new ProductSeed("BEEF-BRK", "Beef Brisket", "Meat", "kg", 5, "18.90", 3, "Freezer", 20),
            new ProductSeed("PORK-SHL", "Pork Shoulder", "Meat", "kg", 5, "13.40", 3, "Freezer", 20),
            new ProductSeed("CHOR-1KG", "Chorizo 1 kg", "Meat", "pack", 1, "21.00", 3, "Freezer", 6),
            new ProductSeed("RICE-5KG", "Long Grain Rice 5 kg", "Dry Goods", "bag", 4, "11.80", 4, "Dry 2", 8),
            new ProductSeed("BEAN-BLK", "Black Beans 2.5 kg", "Dry Goods", "tin", 6, "6.70", 4, "Dry 2", 12),
            new ProductSeed("CHPT-ADB", "Chipotle in Adobo 2.8 kg", "Dry Goods", "tin", 6, "24.50", 4, "Dry 2", 6),
            new ProductSeed("OIL-20L", "Canola Oil 20 L", "Dry Goods", "drum", 1, "58.00", 4, "Dry 3", 3),
            new ProductSeed("SALT-FLK", "Sea Salt Flakes 1 kg", "Dry Goods", "tub", 6, "9.90", 4, "Dry 3", 6),
            new ProductSeed("JARR-MND", "Jarritos Mandarin 370 mL", "Beverages", "bottle", 24, "2.10", 5, "Bar", 72),
            new ProductSeed("WATR-SPK", "Sparkling Water 750 mL", "Beverages", "bottle", 12, "1.90", 5, "Bar", 48),
            new ProductSeed("COFF-1KG", "Espresso Beans 1 kg", "Beverages", "bag", 6, "34.00", 5, "Bar", 6),
            new ProductSeed("BOWL-650", "Takeaway Bowls 650 mL (50)", "Packaging", "sleeve", 10, "14.50", 6, "Dry 3", 20),
            new ProductSeed("NAPK-1PL", "Napkins 1-Ply (500)", "Packaging", "pack", 20, "3.40", 6, "Dry 3", 40),
            new ProductSeed("FOIL-30", "Foil Roll 30 cm", "Packaging", "roll", 6, "16.80", 6, "Dry 3", 4));

    /** Par multiplier per store: Newtown is small, Fitzroy is the busiest. */
    private static final double[] PAR_SCALE = {1.0, 0.8, 1.2, 1.0};

    /** Lines that end below par, per store index. Everything else ends at or above par. */
    private static final List<Map<String, Integer>> LOW = List.of(
            Map.of("LIME-KG", 3, "SCRM-2L", 4, "BEEF-BRK", 0, "JARR-MND", 30),
            Map.of("CORI-BN", 5, "CHKN-THG", 11, "OIL-20L", 1, "NAPK-1PL", 12),
            Map.of("TOMA-KG", 6, "COFF-1KG", 0, "BOWL-650", 9, "MASA-10", 1),
            Map.of("TORT-12", 14, "AVO-HASS", 9, "CHIP-1KG", 3));

    /** Stock-take variances found at Surry Hills last week. */
    private static final Map<String, Integer> COUNT_VARIANCE = Map.of(
            "AVO-HASS", -3, "LIME-KG", -1, "CHSE-OAX", -1, "JARR-MND", 2, "CORI-BN", -2, "NAPK-1PL", -4);

    private static final String[] WASTE_NOTES = {"Spoiled in the cool room", "Past use-by", "Dropped on the line"};

    private final StoreRepository stores;
    private final SupplierRepository suppliers;
    private final ProductRepository products;
    private final StockLevelRepository levels;
    private final OrderRepository orders;
    private final StockTakeRepository takes;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;

    DemoData(StoreRepository stores, SupplierRepository suppliers, ProductRepository products,
             StockLevelRepository levels, OrderRepository orders, StockTakeRepository takes, JdbcTemplate jdbc,
             TransactionTemplate tx, Clock clock) {
        this.stores = stores;
        this.suppliers = suppliers;
        this.products = products;
        this.levels = levels;
        this.orders = orders;
        this.takes = takes;
        this.jdbc = jdbc;
        this.tx = tx;
        this.clock = clock;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (stores.count() > 0) {
            return;
        }
        tx.executeWithoutResult(status -> seed());
        log.info("Seeded demo data: {} stores, {} suppliers, {} products, {} orders",
                stores.count(), suppliers.count(), products.count(), orders.count());
    }

    private void seed() {
        ZoneId zone = clock.getZone();
        LocalDate today = LocalDate.now(clock);

        List<Store> storeList = List.of(
                new Store("SRY", "Surry Hills", "112 Crown St, Surry Hills NSW 2010"),
                new Store("NWT", "Newtown", "301 King St, Newtown NSW 2042"),
                new Store("FTZ", "Fitzroy", "88 Gertrude St, Fitzroy VIC 3065"),
                new Store("BON", "Bondi", "140 Campbell Pde, Bondi Beach NSW 2026"));
        storeList.get(0).setAutoReorder(true);
        storeList.get(3).setAutoReorder(true);
        stores.saveAll(storeList);

        List<Supplier> supplierList = SUPPLIERS.stream().map(seed -> {
            Supplier supplier = new Supplier(seed.name(), seed.email(), seed.phone(), seed.leadDays(),
                    BigDecimal.valueOf(seed.minOrder()));
            supplier.setNotes("Order by 2 pm for delivery in %d day%s.".formatted(seed.leadDays(), seed.leadDays() == 1 ? "" : "s"));
            return suppliers.save(supplier);
        }).toList();

        List<Product> productList = new ArrayList<>();
        for (int i = 0; i < PRODUCTS.size(); i++) {
            ProductSeed seed = PRODUCTS.get(i);
            Product product = new Product(seed.sku(), seed.name(), seed.category(), seed.unit(), seed.pack(),
                    new BigDecimal(seed.cost()), supplierList.get(seed.supplier()));
            product.setBarcode(ean13("93" + "4012" + "%06d".formatted(1000 + i * 37)));
            productList.add(products.save(product));
        }

        List<Move> moves = new ArrayList<>();
        Map<Delivery, Map<Product, Integer>> deliveries = new LinkedHashMap<>();
        StockTake count = new StockTake(storeList.get(0), true,
                today.minusDays(STOCKTAKE_DAY).atTime(14, 0).atZone(zone).toInstant());

        for (int s = 0; s < storeList.size(); s++) {
            Store store = storeList.get(s);
            Random random = new Random(42L + s);
            for (int p = 0; p < productList.size(); p++) {
                Product product = productList.get(p);
                ProductSeed seed = PRODUCTS.get(p);
                int par = Math.max(1, (int) Math.round(seed.par() * PAR_SCALE[s]));
                int target = LOW.get(s).getOrDefault(seed.sku(),
                        par + (int) Math.round(par * (0.05 + random.nextDouble() * 0.5)));
                StockLevel level = new StockLevel(store, product, target, par);
                level.setBin(seed.bin());
                levels.save(level);
                simulate(s, store, product, seed, par, target, random, today, zone, moves, deliveries, count);
            }
        }

        // Deliveries become received orders, oldest first so references climb with time.
        Map<Delivery, PurchaseOrder> received = new LinkedHashMap<>();
        Delivery shortShipped = deliveries.keySet().stream()
                .filter(d -> d.store() == 0 && d.supplier() == 1)
                .max(Comparator.comparing(Delivery::day))
                .orElse(null);
        deliveries.keySet().stream().sorted(Comparator.comparing(Delivery::day)).forEach(delivery -> {
            Supplier supplier = supplierList.get(delivery.supplier());
            LocalDate sentOn = delivery.day().minusDays(supplier.getLeadTimeDays());
            Store store = storeList.get(delivery.store());
            PurchaseOrder order = new PurchaseOrder(store, supplier,
                    store.isAutoReorder() ? OrderSource.AUTO : OrderSource.MANUAL,
                    sentOn.minusDays(1).atTime(16, 30).atZone(zone).toInstant());
            Map<Product, Integer> lines = deliveries.get(delivery);
            lines.forEach(order::addLine);
            if (delivery.equals(shortShipped)) {
                OrderLine first = order.getLines().getFirst();
                first.setQuantity(first.getQuantity() + Math.max(2, first.getPackSize()));
            }
            order.send(sentOn.atTime(9, 15).atZone(zone).toInstant(), sentOn);
            Instant at = delivery.day().atTime(7, 0).atZone(zone).toInstant();
            order.getLines().forEach(line -> order.receive(line, lines.get(line.getProduct())));
            order.settleAfterReceipt(at);
            received.put(delivery, orders.save(order));
        });

        count.complete(today.minusDays(STOCKTAKE_DAY).atTime(15, 10).atZone(zone).toInstant());
        takes.save(count);

        seedOpenOrders(storeList, supplierList, productList, today, zone);

        jdbc.batchUpdate("""
                        insert into stock_movement
                            (store_id, product_id, delta, balance_after, reason, reference, note, occurred_at)
                        values (?, ?, ?, ?, ?, ?, ?, ?)""",
                moves.stream().sorted(Comparator.comparing(Move::at)).toList(), 500, (ps, move) -> {
                    ps.setLong(1, move.storeId());
                    ps.setLong(2, move.productId());
                    ps.setInt(3, move.delta());
                    ps.setInt(4, move.balanceAfter());
                    ps.setString(5, move.reason().name());
                    String reference = move.delivery() != null ? received.get(move.delivery()).getReference()
                            : move.reason() == MovementReason.STOCKTAKE ? count.getReference()
                            : null;
                    ps.setString(6, reference);
                    ps.setString(7, move.note());
                    ps.setObject(8, OffsetDateTime.ofInstant(move.at(), ZoneOffset.UTC));
                });
    }

    /**
     * Walks one line's history backwards from today's on-hand, so the ledger lands exactly on target:
     * each day undoes waste, then usage, then the morning delivery.
     */
    private void simulate(int s, Store store, Product product, ProductSeed seed, int par, int target, Random random,
                          LocalDate today, ZoneId zone, List<Move> moves,
                          Map<Delivery, Map<Product, Integer>> deliveries, StockTake count) {
        SupplierSeed supplier = SUPPLIERS.get(seed.supplier());
        double dailyUse = par / 5.5;
        boolean perishable = seed.category().equals("Produce") || seed.category().equals("Dairy");
        int balance = target;
        for (int d = 1; d <= HISTORY_DAYS; d++) {
            LocalDate day = today.minusDays(d);
            if (perishable && random.nextDouble() < 0.14) {
                int waste = 1 + random.nextInt(Math.max(1, par / 12));
                moves.add(new Move(store.getId(), product.getId(), -waste, balance, MovementReason.WASTE,
                        WASTE_NOTES[random.nextInt(WASTE_NOTES.length)], at(day, 22, 10, zone), null));
                balance += waste;
            }
            int used = (int) Math.round(dailyUse * (0.6 + random.nextDouble() * 0.8));
            if (used > 0) {
                moves.add(new Move(store.getId(), product.getId(), -used, balance, MovementReason.USAGE,
                        "End-of-day usage", at(day, 21, 30, zone), null));
                balance += used;
            }
            if (s == 0 && d == STOCKTAKE_DAY) {
                int variance = COUNT_VARIANCE.getOrDefault(seed.sku(), 0);
                if (variance > balance) {
                    variance = 0;
                }
                int expected = balance - variance;
                if (variance != 0) {
                    moves.add(new Move(store.getId(), product.getId(), variance, balance, MovementReason.STOCKTAKE,
                            "Counted %d, expected %d".formatted(balance, expected), at(day, 15, 10, zone), null));
                }
                count.addLine(product, seed.bin(), expected).setCounted(balance);
                balance = expected;
            }
            boolean deliveryDay = (d + s + seed.supplier()) % supplier.cadence() == 0;
            if (deliveryDay) {
                int before = (int) Math.round(par * (0.15 + random.nextDouble() * 0.2));
                int quantity = ((balance - before) / product.getPackSize()) * product.getPackSize();
                if (quantity >= product.getPackSize() && quantity > 0) {
                    Delivery delivery = new Delivery(s, seed.supplier(), day);
                    moves.add(new Move(store.getId(), product.getId(), quantity, balance, MovementReason.RECEIPT,
                            "Delivery from " + supplier.name(), at(day, 7, 0, zone), delivery));
                    deliveries.computeIfAbsent(delivery, key -> new LinkedHashMap<>()).put(product, quantity);
                    balance -= quantity;
                }
            }
        }
        if (balance > 0) {
            moves.add(new Move(store.getId(), product.getId(), balance, balance, MovementReason.OPENING,
                    "Opening balance", at(today.minusDays(HISTORY_DAYS + 1), 6, 0, zone), null));
        }
    }

    private void seedOpenOrders(List<Store> storeList, List<Supplier> supplierList, List<Product> productList,
                                LocalDate today, ZoneId zone) {
        Map<String, Product> bySku = new LinkedHashMap<>();
        productList.forEach(product -> bySku.put(product.getSku(), product));

        // Surry Hills: meat on the way for the brisket that ran out.
        PurchaseOrder meat = new PurchaseOrder(storeList.get(0), supplierList.get(3), OrderSource.AUTO,
                at(today.minusDays(1), 5, 0, zone));
        meat.addLine(bySku.get("BEEF-BRK"), 20);
        meat.addLine(bySku.get("PORK-SHL"), 10);
        meat.send(at(today.minusDays(1), 8, 40, zone), today.minusDays(1));
        orders.save(meat);

        // Newtown: drinks that should have arrived two days ago.
        PurchaseOrder drinks = new PurchaseOrder(storeList.get(1), supplierList.get(5), OrderSource.MANUAL,
                at(today.minusDays(6), 15, 20, zone));
        drinks.addLine(bySku.get("JARR-MND"), 48);
        drinks.addLine(bySku.get("WATR-SPK"), 24);
        drinks.send(at(today.minusDays(6), 15, 25, zone), today.minusDays(6));
        orders.save(drinks);

        // Newtown: this morning's autopilot draft, waiting for a once-over.
        PurchaseOrder oil = new PurchaseOrder(storeList.get(1), supplierList.get(4), OrderSource.AUTO,
                at(today, 5, 0, zone));
        oil.addLine(bySku.get("OIL-20L"), 2);
        oil.setNotes("Raised by autopilot");
        orders.save(oil);

        // Fitzroy: out of coffee, someone started an order.
        PurchaseOrder coffee = new PurchaseOrder(storeList.get(2), supplierList.get(5), OrderSource.MANUAL,
                at(today, 9, 5, zone));
        coffee.addLine(bySku.get("COFF-1KG"), 12);
        orders.save(coffee);

        // Fitzroy: a duplicate that got cancelled.
        PurchaseOrder duplicate = new PurchaseOrder(storeList.get(2), supplierList.get(6), OrderSource.MANUAL,
                at(today.minusDays(5), 11, 0, zone));
        duplicate.addLine(bySku.get("BOWL-650"), 20);
        duplicate.setNotes("Duplicate of the Monday order");
        duplicate.cancel(at(today.minusDays(5), 11, 20, zone));
        orders.save(duplicate);
    }

    private static Instant at(LocalDate day, int hour, int minute, ZoneId zone) {
        return day.atTime(LocalTime.of(hour, minute)).atZone(zone).toInstant();
    }

    private static String ean13(String twelveDigits) {
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int digit = twelveDigits.charAt(i) - '0';
            sum += i % 2 == 0 ? digit : digit * 3;
        }
        return twelveDigits + (10 - sum % 10) % 10;
    }
}
