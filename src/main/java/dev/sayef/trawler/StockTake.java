package dev.sayef.trawler;

import java.math.BigDecimal;
import java.time.Instant;
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

/**
 * A count of every stocked line in one store. Expected quantities are snapshotted when the
 * count starts, so deliveries and usage during the count don't skew the variance.
 */
@Entity
public class StockTake {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "store_id")
    private Store store;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StockTakeStatus status = StockTakeStatus.IN_PROGRESS;

    private boolean blind = true;

    @Column(nullable = false)
    private Instant startedAt;

    private Instant completedAt;

    @OneToMany(mappedBy = "stockTake", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("bin ASC, id ASC")
    private List<StockTakeLine> lines = new ArrayList<>();

    protected StockTake() {
    }

    public StockTake(Store store, boolean blind, Instant startedAt) {
        this.store = store;
        this.blind = blind;
        this.startedAt = startedAt;
    }

    public Long getId() { return id; }
    public StockTakeStatus getStatus() { return status; }
    public boolean isBlind() { return blind; }
    public Instant getStartedAt() { return startedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public List<StockTakeLine> getLines() { return lines; }

    @JsonIgnore
    public Store getStore() { return store; }

    public String getReference() { return id == null ? null : "ST-%04d".formatted(id); }
    public Long getStoreId() { return store.getId(); }
    public String getStoreName() { return store.getName(); }
    public int getLineCount() { return lines.size(); }

    public int getCountedCount() {
        return (int) lines.stream().filter(StockTakeLine::isCounted).count();
    }

    /** Hidden while a blind count is running, so counters can't anchor on the system figure. */
    public Integer getVarianceUnits() {
        if (isHidingExpected()) {
            return null;
        }
        return lines.stream().filter(StockTakeLine::isCounted).mapToInt(StockTakeLine::variance).sum();
    }

    public BigDecimal getVarianceValue() {
        if (isHidingExpected()) {
            return null;
        }
        return lines.stream()
                .filter(StockTakeLine::isCounted)
                .map(StockTakeLine::varianceCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    boolean isHidingExpected() {
        return blind && status == StockTakeStatus.IN_PROGRESS;
    }

    StockTakeLine addLine(Product product, String bin, int expected) {
        StockTakeLine line = new StockTakeLine(this, product, bin, expected);
        lines.add(line);
        return line;
    }

    StockTakeLine line(long lineId) {
        return lines.stream()
                .filter(line -> line.getId() != null && line.getId() == lineId)
                .findFirst()
                .orElseThrow(() -> new NotFoundException("Line %d is not on %s".formatted(lineId, getReference())));
    }

    void count(long lineId, Integer counted) {
        requireInProgress();
        if (counted != null && counted < 0) {
            throw new InvalidRequestException("Counts can't be negative");
        }
        line(lineId).setCounted(counted);
    }

    void complete(Instant now) {
        requireInProgress();
        status = StockTakeStatus.COMPLETED;
        completedAt = now;
    }

    void cancel(Instant now) {
        requireInProgress();
        status = StockTakeStatus.CANCELLED;
        completedAt = now;
    }

    private void requireInProgress() {
        if (status != StockTakeStatus.IN_PROGRESS) {
            throw new ConflictException("%s is already %s".formatted(getReference(), status.name().toLowerCase()));
        }
    }
}
