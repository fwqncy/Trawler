package dev.sayef.trawler;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stocktakes")
class StockTakeController {

    record StartRequest(@NotNull Long storeId, Boolean blind) {
    }

    record CountRequest(@PositiveOrZero Integer counted) {
    }

    private final StockTakeService takes;

    StockTakeController(StockTakeService takes) {
        this.takes = takes;
    }

    @GetMapping
    List<StockTake> list(@RequestParam long storeId) {
        return takes.list(storeId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    StockTake start(@Valid @RequestBody StartRequest req) {
        return takes.start(req.storeId(), req.blind() == null || req.blind());
    }

    @GetMapping("/{id}")
    StockTake get(@PathVariable long id) {
        return takes.get(id);
    }

    @PutMapping("/{id}/lines/{lineId}")
    StockTake count(@PathVariable long id, @PathVariable long lineId, @Valid @RequestBody CountRequest req) {
        return takes.count(id, lineId, req.counted());
    }

    @PostMapping("/{id}/complete")
    StockTake complete(@PathVariable long id) {
        return takes.complete(id);
    }

    @PostMapping("/{id}/cancel")
    StockTake cancel(@PathVariable long id) {
        return takes.cancel(id);
    }
}
