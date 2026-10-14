package dev.sayef.trawler;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 12)
    private String code;

    @Column(nullable = false, length = 120)
    private String name;

    private String address;

    private boolean autoReorder;

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Store() {
    }

    public Store(String code, String name, String address) {
        this.code = code;
        this.name = name;
        this.address = address;
    }

    public Long getId() { return id; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getAddress() { return address; }
    public boolean isAutoReorder() { return autoReorder; }
    public Instant getCreatedAt() { return createdAt; }

    public void setCode(String code) { this.code = code; }
    public void setName(String name) { this.name = name; }
    public void setAddress(String address) { this.address = address; }
    public void setAutoReorder(boolean autoReorder) { this.autoReorder = autoReorder; }
}
