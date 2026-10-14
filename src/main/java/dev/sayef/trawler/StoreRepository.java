package dev.sayef.trawler;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface StoreRepository extends JpaRepository<Store, Long> {

    List<Store> findAllByOrderByIdAsc();

    List<Store> findByAutoReorderTrue();

    boolean existsByCodeIgnoreCase(String code);
}
