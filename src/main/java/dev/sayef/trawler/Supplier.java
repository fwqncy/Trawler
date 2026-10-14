package dev.sayef.trawler;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity
public class Supplier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 120)
    private String name;

    private String email;

    private String phone;

    private int leadTimeDays = 2;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal minOrderValue = BigDecimal.ZERO;

    @Column(length = 1000)
    private String notes;

    protected Supplier() {
    }

    public Supplier(String name, String email, String phone, int leadTimeDays, BigDecimal minOrderValue) {
        this.name = name;
        this.email = email;
        this.phone = phone;
        this.leadTimeDays = leadTimeDays;
        this.minOrderValue = minOrderValue;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public int getLeadTimeDays() { return leadTimeDays; }
    public BigDecimal getMinOrderValue() { return minOrderValue; }
    public String getNotes() { return notes; }

    public void setName(String name) { this.name = name; }
    public void setEmail(String email) { this.email = email; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setLeadTimeDays(int leadTimeDays) { this.leadTimeDays = leadTimeDays; }
    public void setMinOrderValue(BigDecimal minOrderValue) { this.minOrderValue = minOrderValue; }
    public void setNotes(String notes) { this.notes = notes; }
}
