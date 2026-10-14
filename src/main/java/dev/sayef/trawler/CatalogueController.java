package dev.sayef.trawler;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class CatalogueController {

    private final CatalogueService catalogue;
    private final DashboardService dashboard;
    private final Clock clock;
    private final String currency;

    CatalogueController(CatalogueService catalogue, DashboardService dashboard, Clock clock,
                        @Value("${trawler.currency:AUD}") String currency) {
        this.catalogue = catalogue;
        this.dashboard = dashboard;
        this.clock = clock;
        this.currency = currency;
    }

    /** What the client needs to format money and dates the way the business does. */
    @GetMapping("/meta")
    Map<String, Object> meta() {
        return Map.of("currency", currency, "timezone", clock.getZone().getId(), "today", LocalDate.now(clock));
    }

    @GetMapping("/dashboard")
    Dashboard dashboard(@RequestParam long storeId) {
        return dashboard.forStore(storeId);
    }

    @GetMapping("/stores")
    List<Store> stores() {
        return catalogue.stores();
    }

    @PostMapping("/stores")
    @ResponseStatus(HttpStatus.CREATED)
    Store createStore(@Valid @RequestBody CatalogueService.StoreForm form) {
        return catalogue.createStore(form);
    }

    @PutMapping("/stores/{id}")
    Store updateStore(@PathVariable long id, @Valid @RequestBody CatalogueService.StoreForm form) {
        return catalogue.updateStore(id, form);
    }

    @GetMapping("/suppliers")
    List<CatalogueService.SupplierView> suppliers() {
        return catalogue.suppliers();
    }

    @PostMapping("/suppliers")
    @ResponseStatus(HttpStatus.CREATED)
    Supplier createSupplier(@Valid @RequestBody CatalogueService.SupplierForm form) {
        return catalogue.createSupplier(form);
    }

    @PutMapping("/suppliers/{id}")
    Supplier updateSupplier(@PathVariable long id, @Valid @RequestBody CatalogueService.SupplierForm form) {
        return catalogue.updateSupplier(id, form);
    }

    @GetMapping("/products")
    List<Product> products() {
        return catalogue.products();
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    Product createProduct(@Valid @RequestBody CatalogueService.ProductForm form) {
        return catalogue.createProduct(form);
    }

    @PutMapping("/products/{id}")
    Product updateProduct(@PathVariable long id, @Valid @RequestBody CatalogueService.ProductForm form) {
        return catalogue.updateProduct(id, form);
    }
}
