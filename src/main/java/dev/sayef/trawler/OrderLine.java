package dev.sayef.trawler;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class OrderLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private PurchaseOrder order;

    @ManyToOne(optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    private int quantity;

    private int received;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitCost;

    protected OrderLine() {
    }

    OrderLine(PurchaseOrder order, Product product, int quantity, BigDecimal unitCost) {
        if (quantity <= 0) {
            throw new InvalidRequestException("Order at least 1 " + product.getUnit());
        }
        this.order = order;
        this.product = product;
        this.quantity = quantity;
        this.unitCost = unitCost;
    }

    public Long getId() { return id; }
    public int getQuantity() { return quantity; }
    public int getReceived() { return received; }
    public BigDecimal getUnitCost() { return unitCost; }

    @JsonIgnore
    public Product getProduct() { return product; }

    public Long getProductId() { return product.getId(); }
    public String getSku() { return product.getSku(); }
    public String getProductName() { return product.getName(); }
    public String getUnit() { return product.getUnit(); }
    public int getPackSize() { return product.getPackSize(); }

    public int getOutstanding() {
        return Math.max(0, quantity - received);
    }

    public BigDecimal getLineTotal() {
        return unitCost.multiply(BigDecimal.valueOf(quantity));
    }

    void setQuantity(int quantity) {
        if (quantity <= 0) {
            throw new InvalidRequestException("Order at least 1 " + product.getUnit());
        }
        this.quantity = quantity;
    }

    void setReceived(int received) {
        this.received = received;
    }
}
