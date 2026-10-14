package dev.sayef.trawler;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Drafts supplier orders every morning for stores that opted in, before anyone's on the floor. */
@Component
class ReorderAutopilot {

    private static final Logger log = LoggerFactory.getLogger(ReorderAutopilot.class);

    private final StoreRepository stores;
    private final StockService stock;

    ReorderAutopilot(StoreRepository stores, StockService stock) {
        this.stores = stores;
        this.stock = stock;
    }

    @Scheduled(cron = "${trawler.reorder.cron:0 0 5 * * *}", zone = "${trawler.timezone:Australia/Sydney}")
    void run() {
        for (Store store : stores.findByAutoReorderTrue()) {
            List<PurchaseOrder> raised = stock.raiseOrders(store.getId(), OrderSource.AUTO);
            if (!raised.isEmpty()) {
                log.info("Autopilot drafted {} order(s) for {}", raised.size(), store.getName());
            }
        }
    }
}
