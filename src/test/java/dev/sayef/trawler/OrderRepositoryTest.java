package dev.sayef.trawler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.EnumSet;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@DataJpaTest(showSql = false)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class OrderRepositoryTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:17-alpine");

    static final Instant NOW = Instant.parse("2026-10-14T02:00:00Z");
    static final LocalDate TODAY = LocalDate.parse("2026-10-14");

    @Autowired OrderRepository orders;
    @Autowired TestEntityManager em;

    Store bondi;
    Store surryHills;
    Supplier molino;
    Supplier harbour;
    Product tortillas;
    Product chips;
    Product avocados;

    @BeforeEach
    void setUp() {
        bondi = em.persist(new Store("BON", "Bondi", null));
        surryHills = em.persist(new Store("SRY", "Surry Hills", null));
        molino = em.persist(new Supplier("Molino Tortilla Co", null, null, 2, BigDecimal.ZERO));
        harbour = em.persist(new Supplier("Harbour Fresh Produce", null, null, 1, BigDecimal.ZERO));
        tortillas = em.persist(new Product("TORT-12", "Corn Tortillas", "Tortillas & Chips", "pack", 10, new BigDecimal("4.80"), molino));
        chips = em.persist(new Product("CHIP-1KG", "Corn Chips", "Tortillas & Chips", "bag", 6, new BigDecimal("7.90"), molino));
        avocados = em.persist(new Product("AVO-HASS", "Hass Avocados", "Produce", "each", 24, new BigDecimal("1.65"), harbour));
    }

    @Test
    void savingAnOrderGivesItAReference() {
        PurchaseOrder order = orders.save(draft(bondi, molino, 0));

        assertThat(order.getReference()).isEqualTo("PO-%04d".formatted(order.getId()));
    }

    @Test
    void linesAreSavedAlongWithTheirOrder() {
        PurchaseOrder order = draft(bondi, molino, 0);
        order.addLine(tortillas, 50);
        order.addLine(chips, 12);
        long id = orders.saveAndFlush(order).getId();
        em.clear();

        assertThat(orders.findById(id).orElseThrow().getLines())
                .extracting(OrderLine::getSku, OrderLine::getQuantity)
                .containsExactly(tuple("TORT-12", 50), tuple("CHIP-1KG", 12));
    }

    @Test
    void removingALineDeletesIt() {
        PurchaseOrder order = draft(bondi, molino, 0);
        order.addLine(tortillas, 50);
        order.addLine(chips, 12);
        orders.saveAndFlush(order);

        order.removeLine(order.getLines().getFirst().getId());
        orders.saveAndFlush(order);
        em.clear();

        assertThat(orders.findById(order.getId()).orElseThrow().getLines()).extracting(OrderLine::getSku).containsExactly("CHIP-1KG");
    }

    @Test
    void findsAStoresOrdersNewestFirst() {
        PurchaseOrder older = orders.save(draft(bondi, molino, 2));
        PurchaseOrder newer = orders.save(draft(bondi, harbour, 1));
        orders.save(draft(surryHills, molino, 0));

        assertThat(orders.findByStore_IdOrderByCreatedAtDesc(bondi.getId())).containsExactly(newer, older);
    }

    @Test
    void filtersByStoreAndStatusTogether() {
        PurchaseOrder sent = orders.save(sent(bondi, molino, tortillas, 20, 3));
        orders.save(draft(bondi, harbour, 0));
        orders.save(sent(surryHills, molino, tortillas, 20, 3));

        assertThat(orders.findByStore_IdAndStatusOrderByCreatedAtDesc(bondi.getId(), OrderStatus.SENT)).containsExactly(sent);
    }

    @Test
    void findsOrdersInAStatusAcrossEveryStore() {
        PurchaseOrder here = orders.save(sent(bondi, molino, tortillas, 20, 3));
        PurchaseOrder there = orders.save(sent(surryHills, molino, tortillas, 20, 2));
        orders.save(draft(bondi, harbour, 0));

        assertThat(orders.findByStatusOrderByCreatedAtDesc(OrderStatus.SENT)).containsExactly(there, here);
    }

    @Test
    void findsTheOpenDraftForASupplier() {
        orders.save(sent(bondi, molino, tortillas, 20, 3));
        PurchaseOrder draft = orders.save(draft(bondi, molino, 1));

        assertThat(orders.findFirstByStore_IdAndSupplier_IdAndStatusOrderByCreatedAtDesc(
                bondi.getId(), molino.getId(), OrderStatus.DRAFT)).contains(draft);
        assertThat(orders.findFirstByStore_IdAndSupplier_IdAndStatusOrderByCreatedAtDesc(
                bondi.getId(), harbour.getId(), OrderStatus.DRAFT)).isEmpty();
    }

    @Test
    void onOrderAddsUpOutstandingUnitsPerProduct() {
        orders.save(sent(bondi, molino, tortillas, 20, 3));
        PurchaseOrder draft = draft(bondi, molino, 0);
        draft.addLine(tortillas, 10);
        draft.addLine(chips, 6);
        orders.saveAndFlush(draft);

        assertThat(orders.onOrderByProduct(bondi.getId()))
                .containsEntry(tortillas.getId(), 30)
                .containsEntry(chips.getId(), 6)
                .hasSize(2);
    }

    @Test
    void onOrderIgnoresReceivedAndCancelledOrders() {
        PurchaseOrder received = sent(bondi, molino, tortillas, 20, 3);
        received.receive(received.getLines().getFirst(), 20);
        received.settleAfterReceipt(NOW);
        orders.save(received);
        PurchaseOrder cancelled = draft(bondi, molino, 1);
        cancelled.addLine(chips, 6);
        cancelled.cancel(NOW);
        orders.saveAndFlush(cancelled);

        assertThat(orders.onOrderByProduct(bondi.getId())).isEmpty();
    }

    @Test
    void onOrderCountsOnlyWhatIsStillToArriveOnAPartDelivery() {
        PurchaseOrder partial = sent(bondi, molino, tortillas, 50, 3);
        partial.receive(partial.getLines().getFirst(), 30);
        partial.settleAfterReceipt(NOW);
        orders.saveAndFlush(partial);

        assertThat(partial.getStatus()).isEqualTo(OrderStatus.PARTIALLY_RECEIVED);
        assertThat(orders.onOrderByProduct(bondi.getId())).containsExactlyEntriesOf(Map.of(tortillas.getId(), 20));
    }

    @Test
    void onOrderIsScopedToOneStore() {
        orders.saveAndFlush(sent(surryHills, molino, tortillas, 20, 3));

        assertThat(orders.onOrderByProduct(bondi.getId())).isEmpty();
        assertThat(orders.onOrderByProduct(surryHills.getId())).containsEntry(tortillas.getId(), 20);
    }

    @Test
    void countsOrdersPerStatus() {
        orders.save(draft(bondi, molino, 0));
        orders.save(draft(bondi, harbour, 0));
        orders.save(sent(bondi, molino, tortillas, 20, 3));
        orders.saveAndFlush(sent(surryHills, molino, tortillas, 20, 3));

        assertThat(orders.countByStatus(bondi.getId())).containsExactlyInAnyOrder(
                new StatusCount(OrderStatus.DRAFT, 2L), new StatusCount(OrderStatus.SENT, 1L));
    }

    @Test
    void findsSentOrdersPastTheirExpectedDate() {
        PurchaseOrder late = orders.save(sent(bondi, molino, tortillas, 20, 5));
        orders.save(sent(bondi, harbour, avocados, 24, 0));
        PurchaseOrder delivered = sent(bondi, molino, chips, 6, 6);
        delivered.receive(delivered.getLines().getFirst(), 6);
        delivered.settleAfterReceipt(NOW);
        orders.saveAndFlush(delivered);

        assertThat(orders.findOverdue(bondi.getId(), EnumSet.of(OrderStatus.SENT, OrderStatus.PARTIALLY_RECEIVED), TODAY))
                .containsExactly(late);
    }

    @Test
    void valuesOnlyTheUnitsStillToArrive() {
        PurchaseOrder partial = sent(bondi, molino, tortillas, 50, 3);
        partial.receive(partial.getLines().getFirst(), 30);
        partial.settleAfterReceipt(NOW);
        orders.save(partial);
        PurchaseOrder draft = draft(bondi, harbour, 0);
        draft.addLine(avocados, 48);
        orders.saveAndFlush(draft);

        assertThat(orders.outstandingValue(bondi.getId(), OrderStatus.OPEN)).isEqualByComparingTo("175.20");
    }

    @Test
    void countsOpenOrdersPerSupplier() {
        orders.save(draft(bondi, molino, 0));
        orders.save(sent(surryHills, molino, tortillas, 20, 3));
        PurchaseOrder cancelled = draft(bondi, molino, 1);
        cancelled.cancel(NOW);
        orders.save(cancelled);
        orders.saveAndFlush(draft(bondi, harbour, 0));

        assertThat(orders.countBySupplier_IdAndStatusIn(molino.getId(), OrderStatus.OPEN)).isEqualTo(2);
    }

    private PurchaseOrder draft(Store store, Supplier supplier, int daysAgo) {
        return new PurchaseOrder(store, supplier, OrderSource.MANUAL, NOW.minus(daysAgo, ChronoUnit.DAYS));
    }

    /** An order sent {@code daysAgo} days ago, due after the supplier's lead time. */
    private PurchaseOrder sent(Store store, Supplier supplier, Product product, int quantity, int daysAgo) {
        PurchaseOrder order = draft(store, supplier, daysAgo);
        order.addLine(product, quantity);
        order.send(NOW.minus(daysAgo, ChronoUnit.DAYS), TODAY.minusDays(daysAgo));
        return order;
    }
}
