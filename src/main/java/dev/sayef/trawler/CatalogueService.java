package dev.sayef.trawler;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stores, suppliers and the product catalogue. */
@Service
@Transactional
class CatalogueService {

    record StoreForm(
            @NotBlank @Size(max = 12) String code,
            @NotBlank @Size(max = 120) String name,
            @Size(max = 255) String address,
            boolean autoReorder,
            Long copyParsFrom) {
    }

    record SupplierForm(
            @NotBlank @Size(max = 120) String name,
            @Email @Size(max = 200) String email,
            @Size(max = 40) String phone,
            @Min(0) @Max(60) int leadTimeDays,
            @NotNull @PositiveOrZero BigDecimal minOrderValue,
            @Size(max = 1000) String notes) {
    }

    record ProductForm(
            @NotBlank @Pattern(regexp = "[A-Z0-9][A-Z0-9-]{1,31}", message = "use 2–32 capitals, digits or dashes") String sku,
            @NotBlank @Size(max = 160) String name,
            @NotBlank @Size(max = 60) String category,
            @NotBlank @Size(max = 20) String unit,
            @Min(1) int packSize,
            @NotNull @PositiveOrZero BigDecimal unitCost,
            @Size(max = 32) String barcode,
            @NotNull Long supplierId,
            Map<Long, @PositiveOrZero Integer> pars) {
    }

    record SupplierView(long id, String name, String email, String phone, int leadTimeDays,
                        BigDecimal minOrderValue, String notes, long products, long openOrders) {
    }

    private final StoreRepository stores;
    private final SupplierRepository suppliers;
    private final ProductRepository products;
    private final StockLevelRepository levels;
    private final OrderRepository orders;

    CatalogueService(StoreRepository stores, SupplierRepository suppliers, ProductRepository products,
                     StockLevelRepository levels, OrderRepository orders) {
        this.stores = stores;
        this.suppliers = suppliers;
        this.products = products;
        this.levels = levels;
        this.orders = orders;
    }

    @Transactional(readOnly = true)
    List<Store> stores() {
        return stores.findAllByOrderByIdAsc();
    }

    /** Opens a store, optionally copying another store's pars so it's ready to order from day one. */
    Store createStore(StoreForm form) {
        String code = form.code().strip().toUpperCase();
        if (stores.existsByCodeIgnoreCase(code)) {
            throw new ConflictException("A store with code %s already exists".formatted(code));
        }
        Store store = new Store(code, form.name().strip(), blankToNull(form.address()));
        store.setAutoReorder(form.autoReorder());
        stores.save(store);
        if (form.copyParsFrom() != null) {
            levels.findByStore(form.copyParsFrom()).forEach(source -> {
                StockLevel level = new StockLevel(store, source.getProduct(), 0, source.getPar());
                level.setBin(source.getBin());
                levels.save(level);
            });
        }
        return store;
    }

    Store updateStore(long storeId, StoreForm form) {
        Store store = stores.findById(storeId)
                .orElseThrow(() -> new NotFoundException("Store %d doesn't exist".formatted(storeId)));
        store.setCode(form.code().strip().toUpperCase());
        store.setName(form.name().strip());
        store.setAddress(blankToNull(form.address()));
        store.setAutoReorder(form.autoReorder());
        return store;
    }

    @Transactional(readOnly = true)
    List<SupplierView> suppliers() {
        return suppliers.findAllByOrderByNameAsc().stream()
                .map(supplier -> new SupplierView(supplier.getId(), supplier.getName(), supplier.getEmail(),
                        supplier.getPhone(), supplier.getLeadTimeDays(), supplier.getMinOrderValue(),
                        supplier.getNotes(), products.countBySupplier_Id(supplier.getId()),
                        orders.countBySupplier_IdAndStatusIn(supplier.getId(), OrderStatus.OPEN)))
                .toList();
    }

    Supplier createSupplier(SupplierForm form) {
        Supplier supplier = new Supplier(form.name().strip(), blankToNull(form.email()), blankToNull(form.phone()),
                form.leadTimeDays(), form.minOrderValue());
        supplier.setNotes(blankToNull(form.notes()));
        return suppliers.save(supplier);
    }

    Supplier updateSupplier(long supplierId, SupplierForm form) {
        Supplier supplier = requireSupplier(supplierId);
        supplier.setName(form.name().strip());
        supplier.setEmail(blankToNull(form.email()));
        supplier.setPhone(blankToNull(form.phone()));
        supplier.setLeadTimeDays(form.leadTimeDays());
        supplier.setMinOrderValue(form.minOrderValue());
        supplier.setNotes(blankToNull(form.notes()));
        return supplier;
    }

    @Transactional(readOnly = true)
    List<Product> products() {
        return products.findAllByOrderBySkuAsc();
    }

    /** Adds a product and starts stocking it wherever a par was given. */
    Product createProduct(ProductForm form) {
        Product product = new Product(form.sku().strip(), form.name().strip(), form.category().strip(),
                form.unit().strip(), form.packSize(), form.unitCost(), requireSupplier(form.supplierId()));
        product.setBarcode(blankToNull(form.barcode()));
        products.save(product);
        applyPars(product, form.pars());
        return product;
    }

    Product updateProduct(long productId, ProductForm form) {
        Product product = products.findById(productId)
                .orElseThrow(() -> new NotFoundException("Product %d doesn't exist".formatted(productId)));
        product.setSku(form.sku().strip());
        product.setName(form.name().strip());
        product.setCategory(form.category().strip());
        product.setUnit(form.unit().strip());
        product.setPackSize(form.packSize());
        product.setUnitCost(form.unitCost());
        product.setBarcode(blankToNull(form.barcode()));
        product.setSupplier(requireSupplier(form.supplierId()));
        applyPars(product, form.pars());
        return product;
    }

    private void applyPars(Product product, Map<Long, Integer> pars) {
        if (pars == null) {
            return;
        }
        pars.forEach((storeId, par) -> {
            if (par == null) {
                return;
            }
            levels.findByStore_IdAndProduct_Id(storeId, product.getId()).ifPresentOrElse(
                    level -> level.setPar(par),
                    () -> levels.save(new StockLevel(stores.findById(storeId)
                            .orElseThrow(() -> new NotFoundException("Store %d doesn't exist".formatted(storeId))),
                            product, 0, par)));
        });
    }

    private Supplier requireSupplier(long supplierId) {
        return suppliers.findById(supplierId)
                .orElseThrow(() -> new NotFoundException("Supplier %d doesn't exist".formatted(supplierId)));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }
}
