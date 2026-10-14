package dev.sayef.trawler;

import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
class OrderController {

    record AutoOrderRequest(@NotNull Long storeId) {
    }

    record ReceiveRequest(Map<Long, Integer> lines) {
    }

    record LineRequest(@NotBlank String sku, @Positive int quantity) {
    }

    record QuantityRequest(@Positive int quantity) {
    }

    private final OrderService orders;
    private final StockService stock;

    OrderController(OrderService orders, StockService stock) {
        this.orders = orders;
        this.stock = stock;
    }

    @GetMapping
    List<PurchaseOrder> list(@RequestParam(required = false) Long storeId,
                             @RequestParam(required = false) OrderStatus status) {
        return orders.list(storeId, status);
    }

    @GetMapping("/summary")
    Map<OrderStatus, Long> summary(@RequestParam long storeId) {
        return orders.summary(storeId);
    }

    @GetMapping("/{id}")
    PurchaseOrder get(@PathVariable long id) {
        return orders.get(id);
    }

    @GetMapping(value = "/{id}/csv", produces = "text/csv")
    ResponseEntity<String> csv(@PathVariable long id) {
        PurchaseOrder order = orders.get(id);
        Csv csv = new Csv("SKU", "Item", "Unit", "Quantity", "Unit cost", "Line total");
        order.getLines().forEach(line -> csv.row(line.getSku(), line.getProductName(), line.getUnit(),
                line.getQuantity(), line.getUnitCost(), line.getLineTotal()));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"%s.csv\"".formatted(order.getReference()))
                .body(csv.toString());
    }

    /** Raises a draft with every supplier that has something below par. */
    @PostMapping("/auto")
    @ResponseStatus(HttpStatus.CREATED)
    List<PurchaseOrder> raiseAll(@Valid @RequestBody AutoOrderRequest req) {
        return stock.raiseOrders(req.storeId(), OrderSource.MANUAL);
    }

    @PostMapping("/{id}/send")
    PurchaseOrder send(@PathVariable long id) {
        return orders.send(id);
    }

    @PostMapping("/{id}/receive")
    PurchaseOrder receive(@PathVariable long id, @RequestBody(required = false) ReceiveRequest req) {
        return stock.receive(id, req == null ? Map.of() : req.lines());
    }

    @PostMapping("/{id}/close")
    PurchaseOrder close(@PathVariable long id) {
        return orders.closeShort(id);
    }

    @PostMapping("/{id}/cancel")
    PurchaseOrder cancel(@PathVariable long id) {
        return orders.cancel(id);
    }

    @PostMapping("/{id}/lines")
    PurchaseOrder addLine(@PathVariable long id, @Valid @RequestBody LineRequest req) {
        return orders.addLine(id, req.sku(), req.quantity());
    }

    @PatchMapping("/{id}/lines/{lineId}")
    PurchaseOrder changeQuantity(@PathVariable long id, @PathVariable long lineId,
                                 @Valid @RequestBody QuantityRequest req) {
        return orders.changeQuantity(id, lineId, req.quantity());
    }

    @DeleteMapping("/{id}/lines/{lineId}")
    PurchaseOrder removeLine(@PathVariable long id, @PathVariable long lineId) {
        return orders.removeLine(id, lineId);
    }
}
