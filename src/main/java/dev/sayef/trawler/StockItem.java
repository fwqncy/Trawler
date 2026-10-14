package dev.sayef.trawler;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** One stocked line at a store, as the API shows it. */
@JsonPropertyOrder({"sku", "onHand", "par"})
record StockItem(
        String sku,
        int onHand,
        int par,
        long id,
        long storeId,
        long productId,
        String name,
        String category,
        String unit,
        int packSize,
        String bin,
        BigDecimal unitCost,
        BigDecimal value,
        long supplierId,
        String supplier,
        int shortfall,
        int onOrder,
        double dailyUsage,
        Double daysOfCover,
        StockStatus status) {

    static StockItem of(StockLevel level, int onOrder, double dailyUsage) {
        Product product = level.getProduct();
        int onHand = level.getOnHand();
        StockStatus status = onHand == 0 && level.getPar() > 0 ? StockStatus.OUT
                : level.isBelowPar() ? StockStatus.LOW
                : StockStatus.OK;
        Double cover = dailyUsage > 0 ? Math.round(onHand / dailyUsage * 10) / 10.0 : null;
        return new StockItem(
                product.getSku(),
                onHand,
                level.getPar(),
                level.getId() == null ? 0 : level.getId(),
                level.getStore().getId() == null ? 0 : level.getStore().getId(),
                product.getId() == null ? 0 : product.getId(),
                product.getName(),
                product.getCategory(),
                product.getUnit(),
                product.getPackSize(),
                level.getBin(),
                product.getUnitCost(),
                product.getUnitCost().multiply(BigDecimal.valueOf(onHand)),
                product.getSupplier().getId() == null ? 0 : product.getSupplier().getId(),
                product.getSupplier().getName(),
                level.shortfall(),
                onOrder,
                Math.round(dailyUsage * 100) / 100.0,
                cover,
                status);
    }
}
