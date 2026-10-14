package dev.sayef.trawler;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface MovementRepository extends JpaRepository<StockMovement, Long> {

    @Query("""
            select m from StockMovement m join fetch m.product
            where m.store.id = :storeId
              and (:productId is null or m.product.id = :productId)
              and (:reason is null or m.reason = :reason)
            order by m.occurredAt desc, m.id desc""")
    List<StockMovement> search(long storeId, Long productId, MovementReason reason, Pageable page);

    @Query("""
            select new dev.sayef.trawler.Usage(m.product.id, sum(-m.delta))
            from StockMovement m
            where m.store.id = :storeId and m.reason in :reasons and m.occurredAt >= :since
            group by m.product.id""")
    List<Usage> usageSince(long storeId, Collection<MovementReason> reasons, Instant since);

    @Query("""
            select m from StockMovement m join fetch m.product
            where m.store.id = :storeId and m.reason in :reasons and m.occurredAt >= :since""")
    List<StockMovement> findConsumptionSince(long storeId, Collection<MovementReason> reasons, Instant since);
}
