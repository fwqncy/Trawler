package dev.sayef.trawler;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface StockLevelRepository extends JpaRepository<StockLevel, Long> {

    @Query("""
            select l from StockLevel l join fetch l.product p join fetch p.supplier
            where l.store.id = :storeId
            order by p.sku""")
    List<StockLevel> findByStore(long storeId);

    @Query("""
            select l from StockLevel l join fetch l.product p join fetch p.supplier
            where l.store.id = :storeId and l.onHand < l.par
            order by p.sku""")
    List<StockLevel> findBelowPar(long storeId);

    Optional<StockLevel> findByStore_IdAndProduct_Id(long storeId, long productId);

    List<StockLevel> findByProduct_Id(long productId);
}
