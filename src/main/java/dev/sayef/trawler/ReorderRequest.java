package dev.sayef.trawler;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

record ReorderRequest(@NotNull @Positive Long storeId, @NotNull @Positive Long supplierId) {
}
