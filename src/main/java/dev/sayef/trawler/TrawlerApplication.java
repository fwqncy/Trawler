package dev.sayef.trawler;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class TrawlerApplication {

    public static void main(String[] args) {
        SpringApplication.run(TrawlerApplication.class, args);
    }

    @Bean
    Clock clock(@Value("${trawler.timezone:Australia/Sydney}") ZoneId zone) {
        return Clock.system(zone);
    }
}
