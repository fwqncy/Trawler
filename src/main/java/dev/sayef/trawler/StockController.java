package dev.sayef.trawler;

import java.util.List;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stock")
class StockController {
    private final StockService stock;

    StockController(StockService stock) { this.stock = stock; }

    @GetMapping("/low")
    List<StockItem> lowStock(@RequestParam long storeId) {
        return stock.belowPar(storeId);
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    PurchaseOrder reorder(@Valid @RequestBody ReorderRequest req) {
        return stock.raiseOrder(req.storeId(), req.supplierId());
    }
}
