package dev.sayef.trawler;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;

@Entity
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String sku;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(nullable = false, length = 60)
    private String category;

    @Column(nullable = false, length = 20)
    private String unit;

    private int packSize = 1;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal unitCost;

    @Column(unique = true, length = 32)
    private String barcode;

    @ManyToOne(optional = false)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    private boolean active = true;

    protected Product() {
    }

    public Product(String sku, String name, String category, String unit, int packSize,
                   BigDecimal unitCost, Supplier supplier) {
        this.sku = sku;
        this.name = name;
        this.category = category;
        this.unit = unit;
        this.packSize = packSize;
        this.unitCost = unitCost;
        this.supplier = supplier;
    }

    public Long getId() { return id; }
    public String getSku() { return sku; }
    public String getName() { return name; }
    public String getCategory() { return category; }
    public String getUnit() { return unit; }
    public int getPackSize() { return packSize; }
    public BigDecimal getUnitCost() { return unitCost; }
    public String getBarcode() { return barcode; }
    public boolean isActive() { return active; }

    @JsonIgnore
    public Supplier getSupplier() { return supplier; }

    public Long getSupplierId() { return supplier.getId(); }
    public String getSupplierName() { return supplier.getName(); }

    public void setSku(String sku) { this.sku = sku; }
    public void setName(String name) { this.name = name; }
    public void setCategory(String category) { this.category = category; }
    public void setUnit(String unit) { this.unit = unit; }
    public void setPackSize(int packSize) { this.packSize = packSize; }
    public void setUnitCost(BigDecimal unitCost) { this.unitCost = unitCost; }
    public void setBarcode(String barcode) { this.barcode = barcode; }
    public void setSupplier(Supplier supplier) { this.supplier = supplier; }
    public void setActive(boolean active) { this.active = active; }

    /** Rounds a quantity up to whole cases, the only way suppliers sell it. */
    int roundUpToPack(int quantity) {
        if (quantity <= 0) {
            return 0;
        }
        return ((quantity + packSize - 1) / packSize) * packSize;
    }
}
