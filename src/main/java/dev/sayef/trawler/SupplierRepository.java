package dev.sayef.trawler;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface SupplierRepository extends JpaRepository<Supplier, Long> {

    List<Supplier> findAllByOrderByNameAsc();
}
