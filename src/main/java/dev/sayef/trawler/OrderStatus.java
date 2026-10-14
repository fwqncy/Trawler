package dev.sayef.trawler;

import java.util.EnumSet;
import java.util.Set;

public enum OrderStatus {
    DRAFT,
    SENT,
    PARTIALLY_RECEIVED,
    RECEIVED,
    CANCELLED;

    /** Orders whose outstanding quantities still count as stock on the way. */
    static final Set<OrderStatus> OPEN = EnumSet.of(DRAFT, SENT, PARTIALLY_RECEIVED);

    boolean isOpen() {
        return OPEN.contains(this);
    }
}
