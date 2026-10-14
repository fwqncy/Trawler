package dev.sayef.trawler;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface ProductRepository extends JpaRepository<Product, Long> {

    Optional<Product> findBySku(String sku);

    List<Product> findAllByOrderBySkuAsc();

    List<Product> findByActiveTrue();

    long countBySupplier_Id(long supplierId);
}
