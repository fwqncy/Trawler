package dev.sayef.trawler;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface StockTakeRepository extends JpaRepository<StockTake, Long> {

    List<StockTake> findByStore_IdOrderByStartedAtDesc(long storeId);

    Optional<StockTake> findFirstByStore_IdAndStatusOrderByCompletedAtDesc(long storeId, StockTakeStatus status);

    boolean existsByStore_IdAndStatus(long storeId, StockTakeStatus status);
}
