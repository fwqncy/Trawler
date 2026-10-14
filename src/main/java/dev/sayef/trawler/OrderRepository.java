package dev.sayef.trawler;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface OrderRepository extends JpaRepository<PurchaseOrder, Long> {

    List<PurchaseOrder> findAllByOrderByCreatedAtDesc();

    List<PurchaseOrder> findByStatusOrderByCreatedAtDesc(OrderStatus status);

    List<PurchaseOrder> findByStore_IdOrderByCreatedAtDesc(long storeId);

    List<PurchaseOrder> findByStore_IdAndStatusOrderByCreatedAtDesc(long storeId, OrderStatus status);

    Optional<PurchaseOrder> findFirstByStore_IdAndSupplier_IdAndStatusOrderByCreatedAtDesc(
            long storeId, long supplierId, OrderStatus status);

    long countBySupplier_IdAndStatusIn(long supplierId, Collection<OrderStatus> statuses);

    @Query("""
            select new dev.sayef.trawler.OnOrder(l.product.id, sum(l.quantity - l.received))
            from OrderLine l
            where l.order.store.id = :storeId and l.order.status in :statuses
            group by l.product.id""")
    List<OnOrder> onOrder(long storeId, Collection<OrderStatus> statuses);

    @Query("""
            select new dev.sayef.trawler.StatusCount(o.status, count(o))
            from PurchaseOrder o
            where o.store.id = :storeId
            group by o.status""")
    List<StatusCount> countByStatus(long storeId);

    @Query("""
            select o from PurchaseOrder o
            where o.store.id = :storeId and o.status in :statuses and o.expectedOn < :today
            order by o.expectedOn""")
    List<PurchaseOrder> findOverdue(long storeId, Collection<OrderStatus> statuses, LocalDate today);

    @Query("""
            select coalesce(sum((l.quantity - l.received) * l.unitCost), 0)
            from OrderLine l
            where l.order.store.id = :storeId and l.order.status in :statuses""")
    BigDecimal outstandingValue(long storeId, Collection<OrderStatus> statuses);

    /** Units still to arrive per product, across every open order at the store. */
    default Map<Long, Integer> onOrderByProduct(long storeId) {
        return onOrder(storeId, OrderStatus.OPEN).stream()
                .collect(Collectors.toMap(OnOrder::productId, row -> row.quantity().intValue()));
    }
}
