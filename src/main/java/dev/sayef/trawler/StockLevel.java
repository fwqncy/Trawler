package dev.sayef.trawler;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

/** How much of one product a store holds, and how much it should hold. */
@Entity
@Table(uniqueConstraints = @UniqueConstraint(columnNames = {"store_id", "product_id"}))
public class StockLevel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "store_id")
    private Store store;

    @ManyToOne(optional = false)
    @JoinColumn(name = "product_id")
    private Product product;

    private int onHand;

    private int par;

    @Column(length = 40)
    private String bin;

    @Version
    private long version;

    protected StockLevel() {
    }

    public StockLevel(Store store, Product product, int onHand, int par) {
        this.store = store;
        this.product = product;
        this.onHand = onHand;
        this.par = par;
    }

    public Long getId() { return id; }
    public Store getStore() { return store; }
    public Product getProduct() { return product; }
    public int getOnHand() { return onHand; }
    public int getPar() { return par; }
    public String getBin() { return bin; }
    public long getVersion() { return version; }

    public void setPar(int par) { this.par = par; }
    public void setBin(String bin) { this.bin = bin; }

    boolean isBelowPar() {
        return onHand < par;
    }

    int shortfall() {
        return Math.max(0, par - onHand);
    }

    /**
     * Moves on-hand by {@code delta} and returns the ledger entry that explains it.
     * Stock never goes negative: a count or usage that would do so is a data problem to fix first.
     */
    StockMovement apply(int delta, MovementReason reason, String reference, String note, Instant at) {
        if (onHand + delta < 0) {
            throw new ConflictException(
                    "%s has only %d %s on hand".formatted(product.getSku(), onHand, product.getUnit()));
        }
        onHand += delta;
        return new StockMovement(store, product, delta, onHand, reason, reference, note, at);
    }
}
