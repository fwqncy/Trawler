package dev.sayef.trawler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import java.math.BigDecimal;
import java.util.List;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
class StockControllerIT {
    @Container static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", db::getJdbcUrl);
        registry.add("spring.datasource.username", db::getUsername);
        registry.add("spring.datasource.password", db::getPassword);
    }

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired StoreRepository stores;
    @Autowired SupplierRepository suppliers;
    @Autowired ProductRepository products;
    @Autowired StockLevelRepository levels;

    TestHttp http;
    long bondi;
    long molino;

    @BeforeEach
    void setUp() {
        http = new TestHttp(port);
        jdbc.execute("""
                truncate stock_movement, stock_take_line, stock_take, order_line, purchase_order,
                         stock_level, product, supplier, store restart identity cascade""");
        Store store = stores.save(new Store("BON", "Bondi", "140 Campbell Pde"));
        Supplier tortilleria = suppliers.save(new Supplier("Molino Tortilla Co", "orders@molino.example", null, 2, BigDecimal.ZERO));
        Supplier produce = suppliers.save(new Supplier("Harbour Fresh Produce", null, null, 1, BigDecimal.ZERO));
        stock(store, new Product("TORT-12", "Corn Tortillas 12 cm", "Tortillas & Chips", "pack", 10, new BigDecimal("4.80"), tortilleria), 14, 60);
        stock(store, new Product("AVO-HASS", "Hass Avocados", "Produce", "each", 24, new BigDecimal("1.65"), produce), 9, 40);
        stock(store, new Product("CHIP-1KG", "Corn Chips 1 kg", "Tortillas & Chips", "bag", 6, new BigDecimal("7.90"), tortilleria), 3, 12);
        stock(store, new Product("SALT-FLK", "Sea Salt Flakes 1 kg", "Dry Goods", "tub", 6, new BigDecimal("9.90"), produce), 10, 6);
        bondi = store.getId();
        molino = tortilleria.getId();
    }

    @Test
    void lowStockListsLinesBelowParBiggestShortfallFirst() {
        ResponseEntity<String> res = get("/api/stock/low?storeId={id}", bondi);

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(res.getBody()).startsWith("[{\"sku\":\"TORT-12\",\"onHand\":14,\"par\":60,");
        assertThat(JsonPath.<List<String>>read(res.getBody(), "$[*].sku")).containsExactly("TORT-12", "AVO-HASS", "CHIP-1KG");
        assertThat(JsonPath.<List<Integer>>read(res.getBody(), "$[*].onHand")).containsExactly(14, 9, 3);
        assertThat(JsonPath.<List<Integer>>read(res.getBody(), "$[*].par")).containsExactly(60, 40, 12);
    }

    @Test
    void lowStockForAStoreThatDoesNotExistIsNotFound() {
        ResponseEntity<String> res = get("/api/stock/low?storeId=404");

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(res.getHeaders().getContentType()).isEqualTo(MediaType.APPLICATION_PROBLEM_JSON);
        assertThat(JsonPath.<String>read(res.getBody(), "$.detail")).isEqualTo("Store 404 doesn't exist");
    }

    @Test
    void lowStockNeedsAStore() {
        assertThat(get("/api/stock/low").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void reorderRaisesADraftThatBringsTheSupplierLinesBackToPar() {
        ResponseEntity<String> res = post("/api/stock/orders", """
                {"storeId": %d, "supplierId": %d}""".formatted(bondi, molino));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(JsonPath.<String>read(res.getBody(), "$.status")).isEqualTo("DRAFT");
        assertThat(JsonPath.<String>read(res.getBody(), "$.reference")).isEqualTo("PO-0001");
        assertThat(JsonPath.<List<String>>read(res.getBody(), "$.lines[*].sku")).containsExactly("CHIP-1KG", "TORT-12");
        assertThat(JsonPath.<List<Integer>>read(res.getBody(), "$.lines[*].quantity")).containsExactly(12, 50);
        assertThat(JsonPath.<Double>read(res.getBody(), "$.total")).isEqualTo(334.8);
    }

    @Test
    void reorderNamesEachMissingField() {
        ResponseEntity<String> res = post("/api/stock/orders", "{}");

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(JsonPath.<String>read(res.getBody(), "$.errors.storeId")).isEqualTo("must not be null");
        assertThat(JsonPath.<String>read(res.getBody(), "$.errors.supplierId")).isEqualTo("must not be null");
    }

    @Test
    void reorderConflictsOnceEverythingIsAlreadyOnOrder() {
        String body = """
                {"storeId": %d, "supplierId": %d}""".formatted(bondi, molino);
        post("/api/stock/orders", body);

        ResponseEntity<String> again = post("/api/stock/orders", body);

        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(JsonPath.<String>read(again.getBody(), "$.detail"))
                .isEqualTo("Nothing from Molino Tortilla Co is below par at Bondi once open orders are counted");
    }

    @Test
    void sendingThenReceivingAnOrderRestocksTheStore() {
        Integer orderId = JsonPath.read(post("/api/stock/orders", """
                {"storeId": %d, "supplierId": %d}""".formatted(bondi, molino)).getBody(), "$.id");

        ResponseEntity<String> sent = post("/api/orders/{id}/send", null, orderId);
        ResponseEntity<String> received = post("/api/orders/{id}/receive", null, orderId);

        assertThat(JsonPath.<String>read(sent.getBody(), "$.status")).isEqualTo("SENT");
        assertThat(JsonPath.<String>read(received.getBody(), "$.status")).isEqualTo("RECEIVED");
        assertThat(JsonPath.<List<String>>read(get("/api/stock/low?storeId={id}", bondi).getBody(), "$[*].sku"))
                .containsExactly("AVO-HASS");
        String ledger = get("/api/movements?storeId={id}&sku=TORT-12", bondi).getBody();
        assertThat(JsonPath.<String>read(ledger, "$[0].reason")).isEqualTo("RECEIPT");
        assertThat(JsonPath.<Integer>read(ledger, "$[0].balanceAfter")).isEqualTo(64);
        assertThat(JsonPath.<String>read(ledger, "$[0].reference")).isEqualTo("PO-0001");
    }

    @Test
    void aBlindStockTakePostsItsVarianceWhenCompleted() {
        String take = post("/api/stocktakes", """
                {"storeId": %d}""".formatted(bondi)).getBody();
        Integer takeId = JsonPath.read(take, "$.id");
        Integer tortillaLine = JsonPath.<List<Integer>>read(take, "$.lines[?(@.sku == 'TORT-12')].id").getFirst();
        assertThat(JsonPath.<List<Object>>read(take, "$.lines[*].expected")).containsOnlyNulls();

        put("/api/stocktakes/{id}/lines/{line}", """
                {"counted": 10}""", takeId, tortillaLine);
        String done = post("/api/stocktakes/{id}/complete", null, takeId).getBody();

        assertThat(JsonPath.<Integer>read(done, "$.varianceUnits")).isEqualTo(-4);
        String items = get("/api/inventory?storeId={id}", bondi).getBody();
        assertThat(JsonPath.<List<Integer>>read(items, "$[?(@.sku == 'TORT-12')].onHand")).containsExactly(10);
        String ledger = get("/api/movements?storeId={id}&reason=STOCKTAKE", bondi).getBody();
        assertThat(JsonPath.<String>read(ledger, "$[0].note")).isEqualTo("Counted 10, expected 14");
    }

    @Test
    void exportsTheStoresStockAsCsv() {
        ResponseEntity<String> res = get("/api/inventory/export?storeId={id}", bondi);

        assertThat(res.getHeaders().getContentType().toString()).startsWith("text/csv");
        assertThat(res.getHeaders().getContentDisposition().getFilename()).isEqualTo("stock-store-%d.csv".formatted(bondi));
        assertThat(res.getBody().lines())
                .first().asString().startsWith("SKU,Item,Category,Bin,Unit,On hand,Par");
        assertThat(res.getBody()).contains("TORT-12,Corn Tortillas 12 cm,Tortillas & Chips,,pack,14,60,46,0");
    }

    private void stock(Store store, Product product, int onHand, int par) {
        levels.save(new StockLevel(store, products.save(product), onHand, par));
    }

    private ResponseEntity<String> get(String uri, Object... vars) {
        return http.get(uri, vars);
    }

    private ResponseEntity<String> post(String uri, String json, Object... vars) {
        return http.post(uri, json, vars);
    }

    private ResponseEntity<String> put(String uri, String json, Object... vars) {
        return http.put(uri, json, vars);
    }
}
