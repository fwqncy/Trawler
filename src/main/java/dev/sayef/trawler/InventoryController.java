package dev.sayef.trawler;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Every stocked line, the ledger behind it, and manual moves. */
@RestController
@RequestMapping("/api")
class InventoryController {

    record LevelForm(@PositiveOrZero int par, @Size(max = 40) String bin) {
    }

    record AdjustmentRequest(@NotNull Long storeId, @NotBlank String sku, int delta,
                             @NotNull MovementReason reason, @Size(max = 255) String note) {
    }

    record TransferRequest(@NotNull Long fromStoreId, @NotNull Long toStoreId, @NotBlank String sku,
                           @Positive int quantity, @Size(max = 255) String note) {
    }

    private final StockService stock;
    private final StockLevelRepository levels;
    private final ProductRepository products;
    private final MovementRepository movements;

    InventoryController(StockService stock, StockLevelRepository levels, ProductRepository products,
                        MovementRepository movements) {
        this.stock = stock;
        this.levels = levels;
        this.products = products;
        this.movements = movements;
    }

    @GetMapping("/inventory")
    List<StockItem> levels(@RequestParam long storeId) {
        return stock.levels(storeId);
    }

    @GetMapping("/inventory/{id}")
    StockItem item(@PathVariable long id) {
        return stock.item(id);
    }

    @PatchMapping("/inventory/{id}")
    StockItem update(@PathVariable long id, @Valid @RequestBody LevelForm form) {
        return stock.updateLevel(id, form.par(), form.bin());
    }

    @GetMapping("/inventory/{id}/movements")
    List<StockMovement> history(@PathVariable long id) {
        StockLevel level = levels.findById(id)
                .orElseThrow(() -> new NotFoundException("Stock line %d doesn't exist".formatted(id)));
        return movements.search(level.getStore().getId(), level.getProduct().getId(), null, PageRequest.of(0, 60));
    }

    @PostMapping("/inventory/adjustments")
    StockItem adjust(@Valid @RequestBody AdjustmentRequest req) {
        return stock.adjust(req.storeId(), req.sku(), req.delta(), req.reason(), req.note());
    }

    @PostMapping("/inventory/transfers")
    List<StockMovement> transfer(@Valid @RequestBody TransferRequest req) {
        return stock.transfer(req.fromStoreId(), req.toStoreId(), req.sku(), req.quantity(), req.note());
    }

    @GetMapping(value = "/inventory/export", produces = "text/csv")
    ResponseEntity<String> export(@RequestParam long storeId) {
        Csv csv = new Csv("SKU", "Item", "Category", "Bin", "Unit", "On hand", "Par", "Shortfall", "On order",
                "Daily usage", "Days of cover", "Unit cost", "Value", "Supplier", "Status");
        stock.levels(storeId).forEach(item -> csv.row(item.sku(), item.name(), item.category(), item.bin(),
                item.unit(), item.onHand(), item.par(), item.shortfall(), item.onOrder(), item.dailyUsage(),
                item.daysOfCover(), item.unitCost(), item.value(), item.supplier(), item.status()));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"stock-store-%d.csv\"".formatted(storeId))
                .body(csv.toString());
    }

    @GetMapping("/movements")
    List<StockMovement> movements(@RequestParam long storeId,
                                  @RequestParam(required = false) String sku,
                                  @RequestParam(required = false) MovementReason reason,
                                  @RequestParam(defaultValue = "0") @Min(0) int page,
                                  @RequestParam(defaultValue = "50") @Min(1) @Max(200) int size) {
        Long productId = null;
        if (sku != null && !sku.isBlank()) {
            productId = products.findBySku(sku.strip())
                    .orElseThrow(() -> new NotFoundException("SKU %s doesn't exist".formatted(sku)))
                    .getId();
        }
        return movements.search(storeId, productId, reason, PageRequest.of(page, size));
    }
}
