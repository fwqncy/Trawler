package dev.sayef.trawler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

@ExtendWith(MockitoExtension.class)
class StockServiceTest {

    @Mock StoreRepository stores;
    @Mock SupplierRepository suppliers;
    @Mock ProductRepository products;
    @Mock StockLevelRepository levels;
    @Mock OrderRepository orders;
    @Mock MovementRepository movements;

    final Clock clock = Clock.fixed(Instant.parse("2026-10-14T02:00:00Z"), ZoneId.of("Australia/Sydney"));

    StockService stock;
    Store bondi;
    Store surryHills;
    Supplier molino;
    Supplier harbour;
    Product tortillas;
    Product chips;
    Product avocados;
    Product limes;

    @BeforeEach
    void setUp() {
        stock = new StockService(stores, suppliers, products, levels, orders, movements, clock);
        bondi = withId(new Store("BON", "Bondi", null), 4);
        surryHills = withId(new Store("SRY", "Surry Hills", null), 1);
        molino = withId(new Supplier("Molino Tortilla Co", null, null, 2, BigDecimal.ZERO), 1);
        harbour = withId(new Supplier("Harbour Fresh Produce", null, null, 1, BigDecimal.ZERO), 2);
        tortillas = withId(new Product("TORT-12", "Corn Tortillas 12 cm", "Tortillas & Chips", "pack", 10, new BigDecimal("4.80"), molino), 1);
        chips = withId(new Product("CHIP-1KG", "Corn Chips 1 kg", "Tortillas & Chips", "bag", 6, new BigDecimal("7.90"), molino), 3);
        avocados = withId(new Product("AVO-HASS", "Hass Avocados", "Produce", "each", 24, new BigDecimal("1.65"), harbour), 5);
        limes = withId(new Product("LIME-KG", "Limes", "Produce", "kg", 1, new BigDecimal("6.50"), harbour), 6);
        lenient().when(stores.findById(4L)).thenReturn(Optional.of(bondi));
        lenient().when(stores.findById(1L)).thenReturn(Optional.of(surryHills));
        lenient().when(suppliers.findById(1L)).thenReturn(Optional.of(molino));
        lenient().when(suppliers.findById(2L)).thenReturn(Optional.of(harbour));
        lenient().when(orders.onOrderByProduct(anyLong())).thenReturn(Map.of());
        lenient().when(orders.save(any())).thenAnswer(call -> call.getArgument(0));
        lenient().when(movements.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test
    void belowParPutsTheBiggestShortfallFirst() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(chips, 3, 12), level(tortillas, 14, 60), level(avocados, 9, 40)));

        List<StockItem> low = stock.belowPar(4);

        assertThat(low).extracting(StockItem::sku).containsExactly("TORT-12", "AVO-HASS", "CHIP-1KG");
        assertThat(low.getFirst()).extracting(StockItem::onHand, StockItem::par, StockItem::shortfall).containsExactly(14, 60, 46);
    }

    @Test
    void belowParRejectsAStoreThatDoesNotExist() {
        assertThatThrownBy(() -> stock.belowPar(99))
                .isInstanceOf(NotFoundException.class)
                .hasMessage("Store 99 doesn't exist");
    }

    @Test
    void belowParWorksOutDaysOfCoverFromTheLastFortnightOfUsage() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(tortillas, 14, 60)));
        when(movements.usageSince(eq(4L), anyCollection(), any())).thenReturn(List.of(new Usage(1L, 140L)));

        StockItem item = stock.belowPar(4).getFirst();

        assertThat(item.dailyUsage()).isEqualTo(10.0);
        assertThat(item.daysOfCover()).isEqualTo(1.4);
    }

    @Test
    void belowParMarksEmptyLinesAsOutAndTheRestAsLow() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(chips, 0, 12), level(avocados, 9, 40)));

        assertThat(stock.belowPar(4)).extracting(StockItem::sku, StockItem::status)
                .containsExactly(tuple("AVO-HASS", StockStatus.LOW),
                        tuple("CHIP-1KG", StockStatus.OUT));
    }

    @Test
    void raiseOrderTopsALineBackUpToPar() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(limes, 3, 8)));

        PurchaseOrder order = stock.raiseOrder(4, 2);

        assertThat(order.getStatus()).isEqualTo(OrderStatus.DRAFT);
        assertThat(order.getSource()).isEqualTo(OrderSource.MANUAL);
        assertThat(order.getLines()).extracting(OrderLine::getSku, OrderLine::getQuantity)
                .containsExactly(tuple("LIME-KG", 5));
    }

    @Test
    void raiseOrderRoundsUpToWholeCases() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(tortillas, 14, 60), level(chips, 3, 12)));

        PurchaseOrder order = stock.raiseOrder(4, 1);

        assertThat(order.getLines()).extracting(OrderLine::getQuantity).containsExactly(50, 12);
        assertThat(order.getTotal()).isEqualByComparingTo("334.80");
    }

    @Test
    void raiseOrderNetsOffStockAlreadyOnTheWay() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(tortillas, 14, 60)));
        when(orders.onOrderByProduct(4)).thenReturn(Map.of(1L, 40));

        PurchaseOrder order = stock.raiseOrder(4, 1);

        assertThat(order.getLines()).extracting(OrderLine::getQuantity).containsExactly(10);
    }

    @Test
    void raiseOrderOnlyIncludesTheChosenSuppliersLines() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(tortillas, 14, 60), level(avocados, 9, 40)));

        PurchaseOrder order = stock.raiseOrder(4, 2);

        assertThat(order.getSupplierName()).isEqualTo("Harbour Fresh Produce");
        assertThat(order.getLines()).extracting(OrderLine::getSku).containsExactly("AVO-HASS");
    }

    @Test
    void raiseOrderAddsToAnOpenDraftRatherThanStartingAnother() {
        PurchaseOrder draft = withId(new PurchaseOrder(bondi, molino, OrderSource.AUTO, clock.instant()), 7);
        draft.addLine(withId(new Product("MASA-10", "Masa Harina", "Tortillas & Chips", "sack", 1, new BigDecimal("38.00"), molino), 4), 2);
        when(orders.findFirstByStore_IdAndSupplier_IdAndStatusOrderByCreatedAtDesc(4, 1, OrderStatus.DRAFT))
                .thenReturn(Optional.of(draft));
        when(levels.findBelowPar(4)).thenReturn(List.of(level(chips, 3, 12)));

        PurchaseOrder order = stock.raiseOrder(4, 1);

        assertThat(order).isSameAs(draft);
        assertThat(order.getLines()).extracting(OrderLine::getSku).containsExactly("MASA-10", "CHIP-1KG");
    }

    @Test
    void raiseOrderRefusesWhenNothingIsDue() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(tortillas, 14, 60)));
        when(orders.onOrderByProduct(4)).thenReturn(Map.of(1L, 46));

        assertThatThrownBy(() -> stock.raiseOrder(4, 1))
                .isInstanceOf(ConflictException.class)
                .hasMessage("Nothing from Molino Tortilla Co is below par at Bondi once open orders are counted");
        verify(orders, never()).save(any());
    }

    @Test
    void raiseOrdersDraftsOneOrderPerSupplier() {
        when(levels.findBelowPar(4)).thenReturn(List.of(level(tortillas, 14, 60), level(avocados, 9, 40), level(chips, 3, 12)));

        List<PurchaseOrder> raised = stock.raiseOrders(4, OrderSource.AUTO);

        assertThat(raised).extracting(PurchaseOrder::getSupplierName)
                .containsExactly("Harbour Fresh Produce", "Molino Tortilla Co");
        assertThat(raised).allMatch(order -> order.getSource() == OrderSource.AUTO);
        assertThat(raised.get(1).getLines()).extracting(OrderLine::getSku).containsExactly("TORT-12", "CHIP-1KG");
    }

    @Test
    void receiveBooksTheDeliveryIntoStockAndLeavesTheRestOutstanding() {
        StockLevel shelf = level(tortillas, 14, 60);
        PurchaseOrder order = sentOrder();
        when(orders.findById(7L)).thenReturn(Optional.of(order));
        when(levels.findByStore_IdAndProduct_Id(4, 1)).thenReturn(Optional.of(shelf));

        stock.receive(7, Map.of(100L, 30));

        assertThat(order.getStatus()).isEqualTo(OrderStatus.PARTIALLY_RECEIVED);
        assertThat(shelf.getOnHand()).isEqualTo(44);
        ArgumentCaptor<StockMovement> booked = ArgumentCaptor.forClass(StockMovement.class);
        verify(movements).save(booked.capture());
        assertThat(booked.getValue()).extracting(StockMovement::getReason, StockMovement::getDelta,
                StockMovement::getBalanceAfter, StockMovement::getReference)
                .containsExactly(MovementReason.RECEIPT, 30, 44, "PO-0007");
    }

    @Test
    void receiveWithoutQuantitiesTakesEverythingOutstanding() {
        PurchaseOrder order = sentOrder();
        when(orders.findById(7L)).thenReturn(Optional.of(order));
        when(levels.findByStore_IdAndProduct_Id(anyLong(), anyLong())).thenReturn(Optional.empty());
        when(levels.save(any())).thenAnswer(call -> call.getArgument(0));

        stock.receive(7, Map.of());

        assertThat(order.getStatus()).isEqualTo(OrderStatus.RECEIVED);
        assertThat(order.getClosedAt()).isEqualTo(clock.instant());
        assertThat(order.getUnitsOutstanding()).isZero();
    }

    @Test
    void receiveRefusesMoreThanWasOrdered() {
        when(orders.findById(7L)).thenReturn(Optional.of(sentOrder()));

        assertThatThrownBy(() -> stock.receive(7, Map.of(100L, 51)))
                .isInstanceOf(InvalidRequestException.class)
                .hasMessage("TORT-12: receive between 0 and 50");
    }

    @Test
    void receiveRefusesAnOrderThatWasNeverSent() {
        PurchaseOrder draft = withId(new PurchaseOrder(bondi, molino, OrderSource.MANUAL, clock.instant()), 7);
        withId(draft.addLine(tortillas, 50), 100);
        when(orders.findById(7L)).thenReturn(Optional.of(draft));

        assertThatThrownBy(() -> stock.receive(7, Map.of(100L, 10)))
                .isInstanceOf(ConflictException.class)
                .hasMessage("PO-0007 is draft, so it can't be received");
    }

    @Test
    void adjustWritesALedgerEntryWithTheNewBalance() {
        StockLevel shelf = level(avocados, 14, 40);
        when(products.findBySku("AVO-HASS")).thenReturn(Optional.of(avocados));
        when(levels.findByStore_IdAndProduct_Id(4, 5)).thenReturn(Optional.of(shelf));

        StockItem item = stock.adjust(4, "AVO-HASS", -2, MovementReason.WASTE, "  Bruised  ");

        assertThat(item.onHand()).isEqualTo(12);
        ArgumentCaptor<StockMovement> booked = ArgumentCaptor.forClass(StockMovement.class);
        verify(movements).save(booked.capture());
        assertThat(booked.getValue()).extracting(StockMovement::getReason, StockMovement::getBalanceAfter, StockMovement::getNote)
                .containsExactly(MovementReason.WASTE, 12, "Bruised");
    }

    @Test
    void adjustNeverTakesStockBelowZero() {
        when(products.findBySku("CHIP-1KG")).thenReturn(Optional.of(chips));
        when(levels.findByStore_IdAndProduct_Id(4, 3)).thenReturn(Optional.of(level(chips, 3, 12)));

        assertThatThrownBy(() -> stock.adjust(4, "CHIP-1KG", -5, MovementReason.USAGE, null))
                .isInstanceOf(ConflictException.class)
                .hasMessage("CHIP-1KG has only 3 bag on hand");
        verify(movements, never()).save(any());
    }

    @Test
    void transferMovesStockAndWritesAMatchingPair() {
        StockLevel from = level(tortillas, 14, 60);
        when(products.findBySku("TORT-12")).thenReturn(Optional.of(tortillas));
        when(levels.findByStore_IdAndProduct_Id(4, 1)).thenReturn(Optional.of(from));
        when(levels.findByStore_IdAndProduct_Id(1, 1)).thenReturn(Optional.empty());
        when(levels.save(any())).thenAnswer(call -> call.getArgument(0));

        List<StockMovement> pair = stock.transfer(4, 1, "TORT-12", 4, "Short for Saturday");

        assertThat(from.getOnHand()).isEqualTo(10);
        assertThat(pair).extracting(StockMovement::getReason, StockMovement::getDelta, StockMovement::getReference)
                .containsExactly(
                        tuple(MovementReason.TRANSFER_OUT, -4, "To SRY"),
                        tuple(MovementReason.TRANSFER_IN, 4, "From BON"));
        assertThat(pair.get(1).getBalanceAfter()).isEqualTo(4);
    }

    private StockLevel level(Product product, int onHand, int par) {
        return withId(new StockLevel(bondi, product, onHand, par), product.getId() + 100);
    }

    private PurchaseOrder sentOrder() {
        PurchaseOrder order = withId(new PurchaseOrder(bondi, molino, OrderSource.MANUAL, clock.instant()), 7);
        withId(order.addLine(tortillas, 50), 100);
        order.send(clock.instant(), LocalDate.now(clock));
        return order;
    }

    static <T> T withId(T entity, long id) {
        ReflectionTestUtils.setField(entity, "id", id);
        return entity;
    }
}
