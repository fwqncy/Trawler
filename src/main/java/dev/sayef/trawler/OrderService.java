package dev.sayef.trawler;

import java.time.Clock;
import java.time.LocalDate;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The paperwork side of purchase orders: editing drafts, sending, cancelling. Receiving lives in {@link StockService}. */
@Service
@Transactional
class OrderService {

    private final OrderRepository orders;
    private final ProductRepository products;
    private final Clock clock;

    OrderService(OrderRepository orders, ProductRepository products, Clock clock) {
        this.orders = orders;
        this.products = products;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    List<PurchaseOrder> list(Long storeId, OrderStatus status) {
        if (storeId == null) {
            return status == null ? orders.findAllByOrderByCreatedAtDesc() : orders.findByStatusOrderByCreatedAtDesc(status);
        }
        return status == null
                ? orders.findByStore_IdOrderByCreatedAtDesc(storeId)
                : orders.findByStore_IdAndStatusOrderByCreatedAtDesc(storeId, status);
    }

    @Transactional(readOnly = true)
    PurchaseOrder get(long orderId) {
        return orders.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order %d doesn't exist".formatted(orderId)));
    }

    /** Every status with its count, zeros included, so tabs never jump around. */
    @Transactional(readOnly = true)
    Map<OrderStatus, Long> summary(long storeId) {
        Map<OrderStatus, Long> counts = new EnumMap<>(OrderStatus.class);
        for (OrderStatus status : OrderStatus.values()) {
            counts.put(status, 0L);
        }
        orders.countByStatus(storeId).forEach(row -> counts.put(row.status(), row.count()));
        return counts;
    }

    PurchaseOrder send(long orderId) {
        PurchaseOrder order = get(orderId);
        order.send(clock.instant(), LocalDate.now(clock));
        return order;
    }

    PurchaseOrder cancel(long orderId) {
        PurchaseOrder order = get(orderId);
        order.cancel(clock.instant());
        return order;
    }

    PurchaseOrder closeShort(long orderId) {
        PurchaseOrder order = get(orderId);
        order.closeShort(clock.instant());
        return order;
    }

    PurchaseOrder addLine(long orderId, String sku, int quantity) {
        PurchaseOrder order = get(orderId);
        Product product = products.findBySku(sku)
                .orElseThrow(() -> new NotFoundException("SKU %s doesn't exist".formatted(sku)));
        if (!product.getSupplier().getId().equals(order.getSupplierId())) {
            throw new InvalidRequestException("%s comes from %s, not %s"
                    .formatted(sku, product.getSupplierName(), order.getSupplierName()));
        }
        order.addLine(product, quantity);
        return orders.saveAndFlush(order);
    }

    PurchaseOrder changeQuantity(long orderId, long lineId, int quantity) {
        PurchaseOrder order = get(orderId);
        order.changeQuantity(lineId, quantity);
        return order;
    }

    PurchaseOrder removeLine(long orderId, long lineId) {
        PurchaseOrder order = get(orderId);
        order.removeLine(lineId);
        return order;
    }
}
