package dev.sayef.trawler;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Version;

/** A supplier order for one store, from draft through to delivery. */
@Entity
public class PurchaseOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "store_id")
    private Store store;

    @ManyToOne(optional = false)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private OrderStatus status = OrderStatus.DRAFT;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private OrderSource source;

    @Column(length = 500)
    private String notes;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant sentAt;

    private LocalDate expectedOn;

    private Instant closedAt;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("id")
    private List<OrderLine> lines = new ArrayList<>();

    @Version
    private long version;

    protected PurchaseOrder() {
    }

    public PurchaseOrder(Store store, Supplier supplier, OrderSource source, Instant createdAt) {
        this.store = store;
        this.supplier = supplier;
        this.source = source;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public OrderStatus getStatus() { return status; }
    public OrderSource getSource() { return source; }
    public String getNotes() { return notes; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getSentAt() { return sentAt; }
    public LocalDate getExpectedOn() { return expectedOn; }
    public Instant getClosedAt() { return closedAt; }
    public List<OrderLine> getLines() { return lines; }
    public long getVersion() { return version; }

    @JsonIgnore
    public Store getStore() { return store; }

    @JsonIgnore
    public Supplier getSupplier() { return supplier; }

    public String getReference() { return id == null ? null : "PO-%04d".formatted(id); }
    public Long getStoreId() { return store.getId(); }
    public String getStoreName() { return store.getName(); }
    public Long getSupplierId() { return supplier.getId(); }
    public String getSupplierName() { return supplier.getName(); }
    public String getSupplierEmail() { return supplier.getEmail(); }

    public BigDecimal getTotal() {
        return lines.stream().map(OrderLine::getLineTotal).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    public int getUnitsOutstanding() {
        return lines.stream().mapToInt(OrderLine::getOutstanding).sum();
    }

    public void setNotes(String notes) { this.notes = notes; }

    /** Adds a product to a draft, topping up the existing line if the product is already on it. */
    OrderLine addLine(Product product, int quantity) {
        requireStatus(OrderStatus.DRAFT, "add lines to");
        for (OrderLine line : lines) {
            if (sameProduct(line.getProduct(), product)) {
                line.setQuantity(line.getQuantity() + quantity);
                return line;
            }
        }
        OrderLine line = new OrderLine(this, product, quantity, product.getUnitCost());
        lines.add(line);
        return line;
    }

    OrderLine line(long lineId) {
        return lines.stream()
                .filter(line -> line.getId() != null && line.getId() == lineId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Line %d is not on %s".formatted(lineId, getReference())));
    }

    void changeQuantity(long lineId, int quantity) {
        requireStatus(OrderStatus.DRAFT, "edit");
        line(lineId).setQuantity(quantity);
    }

    void removeLine(long lineId) {
        requireStatus(OrderStatus.DRAFT, "edit");
        lines.remove(line(lineId));
    }

    void send(Instant now, LocalDate today) {
        requireStatus(OrderStatus.DRAFT, "send");
        if (lines.isEmpty()) {
            throw new ConflictException("%s has no lines to send".formatted(getReference()));
        }
        status = OrderStatus.SENT;
        sentAt = now;
        expectedOn = today.plusDays(supplier.getLeadTimeDays());
    }

    /** Books {@code quantity} more of a line as delivered. The caller moves the stock. */
    void receive(OrderLine line, int quantity) {
        if (status != OrderStatus.SENT && status != OrderStatus.PARTIALLY_RECEIVED) {
            throw new ConflictException("%s is %s, so it can't be received".formatted(getReference(), label(status)));
        }
        if (quantity < 0 || quantity > line.getOutstanding()) {
            throw new InvalidRequestException("%s: receive between 0 and %d".formatted(line.getSku(), line.getOutstanding()));
        }
        line.setReceived(line.getReceived() + quantity);
    }

    void settleAfterReceipt(Instant now) {
        if (getUnitsOutstanding() == 0) {
            status = OrderStatus.RECEIVED;
            closedAt = now;
        } else if (lines.stream().anyMatch(line -> line.getReceived() > 0)) {
            status = OrderStatus.PARTIALLY_RECEIVED;
        }
    }

    /** Closes a part-delivered order, writing off whatever the supplier never sent. */
    void closeShort(Instant now) {
        requireStatus(OrderStatus.PARTIALLY_RECEIVED, "close");
        status = OrderStatus.RECEIVED;
        closedAt = now;
    }

    void cancel(Instant now) {
        if (status != OrderStatus.DRAFT && status != OrderStatus.SENT) {
            throw new ConflictException("%s is %s, so it can't be cancelled".formatted(getReference(), label(status)));
        }
        status = OrderStatus.CANCELLED;
        closedAt = now;
    }

    private void requireStatus(OrderStatus required, String action) {
        if (status != required) {
            throw new ConflictException("%s is %s, so you can't %s it".formatted(
                    getReference() == null ? "This order" : getReference(), label(status), action));
        }
    }

    private static boolean sameProduct(Product a, Product b) {
        return a == b || (a.getId() != null && a.getId().equals(b.getId()));
    }

    private static String label(OrderStatus status) {
        return status.name().toLowerCase().replace('_', ' ');
    }
}
