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
public class StockTakeLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "stock_take_id")
    private StockTake stockTake;

    @ManyToOne(optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    @Column(length = 40)
    private String bin;

    private int expected;

    private Integer counted;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitCost;

    protected StockTakeLine() {
    }

    StockTakeLine(StockTake stockTake, Product product, String bin, int expected) {
        this.stockTake = stockTake;
        this.product = product;
        this.bin = bin;
        this.expected = expected;
        this.unitCost = product.getUnitCost();
    }

    public Long getId() { return id; }
    public String getBin() { return bin; }
    public Integer getCounted() { return counted; }
    public BigDecimal getUnitCost() { return unitCost; }

    @JsonIgnore
    public Product getProduct() { return product; }

    public Long getProductId() { return product.getId(); }
    public String getSku() { return product.getSku(); }
    public String getProductName() { return product.getName(); }
    public String getCategory() { return product.getCategory(); }
    public String getUnit() { return product.getUnit(); }

    public Integer getExpected() {
        return stockTake.isHidingExpected() ? null : expected;
    }

    public Integer getVariance() {
        return stockTake.isHidingExpected() || counted == null ? null : variance();
    }

    boolean isCounted() {
        return counted != null;
    }

    int expectedQuantity() {
        return expected;
    }

    int variance() {
        return counted - expected;
    }

    BigDecimal varianceCost() {
        return unitCost.multiply(BigDecimal.valueOf(variance()));
    }

    void setCounted(Integer counted) {
        this.counted = counted;
    }
}
