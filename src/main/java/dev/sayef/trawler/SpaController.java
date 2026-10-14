package dev.sayef.trawler;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Hands client-side routes to the single-page app so deep links and refreshes work. */
@Controller
class SpaController {

    @GetMapping("/{route:(?!api$|actuator$|css$|js$|vendor$|fonts$|error$)[a-z][a-z0-9-]*}/**")
    String app() {
        return "forward:/index.html";
    }
}
