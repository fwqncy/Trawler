package dev.sayef.trawler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** The rest of the API, end to end: catalogue, dashboard, order paperwork, ledger moves. */
@SpringBootTest(webEnvironment = RANDOM_PORT)
@Testcontainers
class TrawlerApiIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:17-alpine");

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired StoreRepository stores;
    @Autowired SupplierRepository suppliers;
    @Autowired ProductRepository products;
    @Autowired StockLevelRepository levels;
    @Autowired ReorderAutopilot autopilot;

    TestHttp http;
    long bondi;
    long surryHills;
    long molino;
    long harbour;

    @BeforeEach
    void setUp() {
        http = new TestHttp(port);
        jdbc.execute("""
                truncate stock_movement, stock_take_line, stock_take, order_line, purchase_order,
                         stock_level, product, supplier, store restart identity cascade""");
        Store store = stores.save(new Store("BON", "Bondi", null));
        Store other = stores.save(new Store("SRY", "Surry Hills", null));
        Supplier tortilleria = suppliers.save(new Supplier("Molino Tortilla Co", null, null, 2, BigDecimal.ZERO));
        Supplier produce = suppliers.save(new Supplier("Harbour Fresh Produce", null, null, 1, BigDecimal.ZERO));
        Product tortillas = products.save(new Product("TORT-12", "Corn Tortillas 12 cm", "Tortillas & Chips", "pack", 10, new BigDecimal("4.80"), tortilleria));
        Product avocados = products.save(new Product("AVO-HASS", "Hass Avocados", "Produce", "each", 24, new BigDecimal("1.65"), produce));
        Product limes = products.save(new Product("LIME-KG", "Limes", "Produce", "kg", 1, new BigDecimal("6.50"), produce));
        levels.save(new StockLevel(store, tortillas, 14, 60));
        levels.save(new StockLevel(store, avocados, 9, 40));
        levels.save(new StockLevel(store, limes, 3, 8));
        levels.save(new StockLevel(other, tortillas, 70, 60));
        bondi = store.getId();
        surryHills = other.getId();
        molino = tortilleria.getId();
        harbour = produce.getId();
    }

    @Test
    void theDashboardSummarisesAStoreInOneCall() {
        String body = http.get("/api/dashboard?storeId={id}", bondi).getBody();

        assertThat(JsonPath.<String>read(body, "$.storeName")).isEqualTo("Bondi");
        assertThat(JsonPath.<Integer>read(body, "$.lines")).isEqualTo(3);
        assertThat(JsonPath.<Integer>read(body, "$.belowPar")).isEqualTo(3);
        assertThat(JsonPath.<Double>read(body, "$.stockValue")).isEqualTo(101.55);
        assertThat(JsonPath.<List<Object>>read(body, "$.usage")).hasSize(14);
        assertThat(JsonPath.<Map<String, Integer>>read(body, "$.orderCounts")).containsEntry("DRAFT", 0).hasSize(5);
        assertThat(JsonPath.<Object>read(body, "$.lastStockTake")).isNull();
        assertThat(http.get("/api/meta").getBody()).contains("\"currency\":\"AUD\"");
    }

    @Test
    void aNewStoreCanCopyAnotherStoresPars() {
        ResponseEntity<String> created = http.post("/api/stores", """
                {"code": "nwt", "name": "Newtown", "address": " ", "autoReorder": false, "copyParsFrom": %d}""".formatted(bondi));
        Integer newtown = JsonPath.read(created.getBody(), "$.id");

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(JsonPath.<String>read(created.getBody(), "$.code")).isEqualTo("NWT");
        String items = http.get("/api/inventory?storeId={id}", newtown).getBody();
        assertThat(JsonPath.<List<Integer>>read(items, "$[*].par")).containsExactly(40, 8, 60);
        assertThat(JsonPath.<List<Integer>>read(items, "$[*].onHand")).containsOnly(0);
        assertThat(http.post("/api/stores", """
                {"code": "NWT", "name": "Newtown again"}""").getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void theAutopilotDraftsOrdersForStoresThatOptIn() {
        http.put("/api/stores/{id}", """
                {"code": "BON", "name": "Bondi Beach", "autoReorder": true}""", bondi);

        autopilot.run();

        String drafts = http.get("/api/orders?storeId={id}&status=DRAFT", bondi).getBody();
        assertThat(JsonPath.<List<String>>read(drafts, "$[*].supplierName"))
                .containsExactlyInAnyOrder("Harbour Fresh Produce", "Molino Tortilla Co");
        assertThat(JsonPath.<List<String>>read(drafts, "$[*].source")).containsOnly("AUTO");
        assertThat(JsonPath.<List<String>>read(http.get("/api/stores").getBody(), "$[*].name"))
                .containsExactly("Bondi Beach", "Surry Hills");
    }

    @Test
    void suppliersCanBeAddedEditedAndListedWithTheirWorkload() {
        ResponseEntity<String> created = http.post("/api/suppliers", """
                {"name": "Pack & Serve", "email": "orders@packserve.example", "leadTimeDays": 5, "minOrderValue": 100}""");
        Integer id = JsonPath.read(created.getBody(), "$.id");
        http.put("/api/suppliers/{id}", """
                {"name": "Pack & Serve", "phone": "03 5550 0107", "leadTimeDays": 4, "minOrderValue": 80, "notes": "Order by 2 pm"}""", id);
        http.post("/api/stock/orders", """
                {"storeId": %d, "supplierId": %d}""".formatted(bondi, harbour));

        String list = http.get("/api/suppliers").getBody();
        assertThat(JsonPath.<List<Integer>>read(list, "$[?(@.name == 'Pack & Serve')].leadTimeDays")).containsExactly(4);
        assertThat(JsonPath.<List<Integer>>read(list, "$[?(@.name == 'Harbour Fresh Produce')].products")).containsExactly(2);
        assertThat(JsonPath.<List<Integer>>read(list, "$[?(@.name == 'Harbour Fresh Produce')].openOrders")).containsExactly(1);
        ResponseEntity<String> invalid = http.post("/api/suppliers", """
                {"name": "", "email": "not-an-email", "leadTimeDays": 90, "minOrderValue": 0}""");
        assertThat(JsonPath.<Map<String, String>>read(invalid.getBody(), "$.errors")).containsOnlyKeys("name", "email", "leadTimeDays");
    }

    @Test
    void productsCanBeAddedWithParsThenEdited() {
        ResponseEntity<String> created = http.post("/api/products", """
                {"sku": "CHIP-1KG", "name": "Corn Chips 1 kg", "category": "Tortillas & Chips", "unit": "bag",
                 "packSize": 6, "unitCost": 7.90, "barcode": "9340120010004", "supplierId": %d, "pars": {"%d": 12}}"""
                .formatted(molino, bondi));
        Integer id = JsonPath.read(created.getBody(), "$.id");
        http.put("/api/products/{id}", """
                {"sku": "CHIP-1KG", "name": "Corn Chips 1 kg", "category": "Tortillas & Chips", "unit": "bag",
                 "packSize": 6, "unitCost": 8.10, "supplierId": %d, "pars": {"%d": 18, "%d": 6}}"""
                .formatted(molino, bondi, surryHills), id);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(JsonPath.<String>read(created.getBody(), "$.supplierName")).isEqualTo("Molino Tortilla Co");
        assertThat(JsonPath.<List<Double>>read(http.get("/api/products").getBody(), "$[?(@.sku == 'CHIP-1KG')].unitCost")).containsExactly(8.1);
        assertThat(JsonPath.<List<Integer>>read(http.get("/api/inventory?storeId={id}", bondi).getBody(), "$[?(@.sku == 'CHIP-1KG')].par")).containsExactly(18);
        assertThat(JsonPath.<List<Integer>>read(http.get("/api/inventory?storeId={id}", surryHills).getBody(), "$[?(@.sku == 'CHIP-1KG')].par")).containsExactly(6);
        assertThat(http.post("/api/products", """
                {"sku": "chip 1kg", "name": "x", "category": "x", "unit": "x", "packSize": 1, "unitCost": 1, "supplierId": 1}""")
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.post("/api/products", """
                {"sku": "CHIP-1KG", "name": "x", "category": "x", "unit": "x", "packSize": 1, "unitCost": 1, "supplierId": %d}"""
                .formatted(molino)).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void draftLinesCanBeAddedChangedAndRemoved() {
        String raised = http.post("/api/orders/auto", """
                {"storeId": %d}""".formatted(bondi)).getBody();
        Integer produce = JsonPath.<List<Integer>>read(raised, "$[?(@.supplierName == 'Harbour Fresh Produce')].id").getFirst();

        String added = http.post("/api/orders/{id}/lines", """
                {"sku": "LIME-KG", "quantity": 2}""", produce).getBody();
        Integer avocadoLine = JsonPath.<List<Integer>>read(added, "$.lines[?(@.sku == 'AVO-HASS')].id").getFirst();
        Integer limeLine = JsonPath.<List<Integer>>read(added, "$.lines[?(@.sku == 'LIME-KG')].id").getFirst();
        http.patch("/api/orders/{id}/lines/{line}", """
                {"quantity": 72}""", produce, avocadoLine);
        String trimmed = http.delete("/api/orders/{id}/lines/{line}", produce, limeLine).getBody();

        assertThat(JsonPath.<List<Integer>>read(added, "$.lines[?(@.sku == 'LIME-KG')].quantity")).containsExactly(7);
        assertThat(JsonPath.<List<String>>read(trimmed, "$.lines[*].sku")).containsExactly("AVO-HASS");
        assertThat(JsonPath.<List<Integer>>read(trimmed, "$.lines[*].quantity")).containsExactly(72);
        ResponseEntity<String> wrongSupplier = http.post("/api/orders/{id}/lines", """
                {"sku": "TORT-12", "quantity": 10}""", produce);
        assertThat(JsonPath.<String>read(wrongSupplier.getBody(), "$.detail"))
                .isEqualTo("TORT-12 comes from Molino Tortilla Co, not Harbour Fresh Produce");
    }

    @Test
    void cancelledOrdersStayCancelled() {
        Integer id = JsonPath.read(http.post("/api/stock/orders", """
                {"storeId": %d, "supplierId": %d}""".formatted(bondi, molino)).getBody(), "$.id");

        ResponseEntity<String> cancelled = http.post("/api/orders/{id}/cancel", null, id);
        ResponseEntity<String> again = http.post("/api/orders/{id}/cancel", null, id);

        assertThat(JsonPath.<String>read(cancelled.getBody(), "$.status")).isEqualTo("CANCELLED");
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(http.post("/api/orders/{id}/send", null, id).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(http.get("/api/orders/999").getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void aShortDeliveryCanBeClosedOffAndExported() {
        String order = http.post("/api/stock/orders", """
                {"storeId": %d, "supplierId": %d}""".formatted(bondi, molino)).getBody();
        Integer id = JsonPath.read(order, "$.id");
        Integer line = JsonPath.read(order, "$.lines[0].id");
        http.post("/api/orders/{id}/send", null, id);

        String partial = http.post("/api/orders/{id}/receive", """
                {"lines": {"%d": 30}}""".formatted(line), id).getBody();
        String closed = http.post("/api/orders/{id}/close", null, id).getBody();

        assertThat(JsonPath.<String>read(partial, "$.status")).isEqualTo("PARTIALLY_RECEIVED");
        assertThat(JsonPath.<String>read(closed, "$.status")).isEqualTo("RECEIVED");
        assertThat(JsonPath.<Integer>read(http.get("/api/orders/summary?storeId={id}", bondi).getBody(), "$.RECEIVED")).isEqualTo(1);
        assertThat(JsonPath.<List<Integer>>read(http.get("/api/orders?status=RECEIVED").getBody(), "$[*].id")).containsExactly(id);
        assertThat(JsonPath.<List<Integer>>read(http.get("/api/orders").getBody(), "$[*].id")).containsExactly(id);
        ResponseEntity<String> csv = http.get("/api/orders/{id}/csv", id);
        assertThat(csv.getHeaders().getContentDisposition().getFilename()).isEqualTo("PO-0001.csv");
        assertThat(csv.getBody()).contains("TORT-12,Corn Tortillas 12 cm,pack,50,4.80,240.00");
    }

    @Test
    void manualMovesWriteTheLedgerAndParsCanBeTuned() {
        String waste = http.post("/api/inventory/adjustments", """
                {"storeId": %d, "sku": "AVO-HASS", "delta": -2, "reason": "WASTE", "note": "Bruised"}""".formatted(bondi)).getBody();
        Integer avocados = JsonPath.read(waste, "$.id");
        http.post("/api/inventory/transfers", """
                {"fromStoreId": %d, "toStoreId": %d, "sku": "TORT-12", "quantity": 10}""".formatted(surryHills, bondi));
        String tuned = http.patch("/api/inventory/{id}", """
                {"par": 30, "bin": " Cool Room "}""", avocados).getBody();

        assertThat(JsonPath.<Integer>read(waste, "$.onHand")).isEqualTo(7);
        assertThat(JsonPath.<Integer>read(tuned, "$.par")).isEqualTo(30);
        assertThat(JsonPath.<String>read(tuned, "$.bin")).isEqualTo("Cool Room");
        assertThat(JsonPath.<String>read(http.get("/api/inventory/{id}", avocados).getBody(), "$.sku")).isEqualTo("AVO-HASS");
        assertThat(JsonPath.<List<String>>read(http.get("/api/inventory/{id}/movements", avocados).getBody(), "$[*].reason")).containsExactly("WASTE");
        assertThat(JsonPath.<List<String>>read(http.get("/api/movements?storeId={id}&reason=TRANSFER_IN", bondi).getBody(), "$[*].reference")).containsExactly("From SRY");
        assertThat(http.post("/api/inventory/adjustments", """
                {"storeId": %d, "sku": "AVO-HASS", "delta": 3, "reason": "USAGE"}""".formatted(bondi)).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.get("/api/movements?storeId={id}&sku=NOPE", bondi).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void onlyOneStockTakeRunsAtATimeAndItCanBeCalledOff() {
        Integer take = JsonPath.read(http.post("/api/stocktakes", """
                {"storeId": %d, "blind": false}""".formatted(bondi)).getBody(), "$.id");

        ResponseEntity<String> second = http.post("/api/stocktakes", """
                {"storeId": %d}""".formatted(bondi));
        String visible = http.get("/api/stocktakes/{id}", take).getBody();
        String cancelled = http.post("/api/stocktakes/{id}/cancel", null, take).getBody();

        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(JsonPath.<List<Integer>>read(visible, "$.lines[*].expected")).doesNotContainNull();
        assertThat(JsonPath.<String>read(cancelled, "$.status")).isEqualTo("CANCELLED");
        assertThat(JsonPath.<List<String>>read(http.get("/api/stocktakes?storeId={id}", bondi).getBody(), "$[*].status")).containsExactly("CANCELLED");
    }

    @Test
    void clientRoutesLoadTheAppAndUnknownApiPathsDoNot() {
        ResponseEntity<String> page = http.get("/orders/12");
        ResponseEntity<String> api = http.get("/api/nothing-here");

        assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(page.getHeaders().getContentType().isCompatibleWith(MediaType.TEXT_HTML)).isTrue();
        assertThat(api.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
