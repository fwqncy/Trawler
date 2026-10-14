package dev.sayef.trawler;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

/** One line in the stock ledger. Every change to on-hand writes one of these. */
@Entity
public class StockMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "store_id")
    private Store store;

    @ManyToOne(optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    private int delta;

    private int balanceAfter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MovementReason reason;

    @Column(length = 40)
    private String reference;

    private String note;

    @Column(nullable = false)
    private Instant occurredAt;

    protected StockMovement() {
    }

    StockMovement(Store store, Product product, int delta, int balanceAfter, MovementReason reason,
                  String reference, String note, Instant occurredAt) {
        this.store = store;
        this.product = product;
        this.delta = delta;
        this.balanceAfter = balanceAfter;
        this.reason = reason;
        this.reference = reference;
        this.note = note;
        this.occurredAt = occurredAt;
    }

    public Long getId() { return id; }
    public int getDelta() { return delta; }
    public int getBalanceAfter() { return balanceAfter; }
    public MovementReason getReason() { return reason; }
    public String getReference() { return reference; }
    public String getNote() { return note; }
    public Instant getOccurredAt() { return occurredAt; }

    @JsonIgnore
    public Store getStore() { return store; }

    @JsonIgnore
    public Product getProduct() { return product; }

    public Long getStoreId() { return store.getId(); }
    public String getStoreName() { return store.getName(); }
    public String getSku() { return product.getSku(); }
    public String getProductName() { return product.getName(); }
    public String getUnit() { return product.getUnit(); }
}
