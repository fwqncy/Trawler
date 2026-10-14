package dev.sayef.trawler;

import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

/** A JSON client for integration tests that hands back every response, errors included. */
final class TestHttp {

    private final RestClient client;

    TestHttp(int port) {
        this.client = RestClient.create("http://localhost:" + port);
    }

    ResponseEntity<String> get(String uri, Object... vars) {
        return send(HttpMethod.GET, uri, null, vars);
    }

    ResponseEntity<String> post(String uri, String json, Object... vars) {
        return send(HttpMethod.POST, uri, json, vars);
    }

    ResponseEntity<String> put(String uri, String json, Object... vars) {
        return send(HttpMethod.PUT, uri, json, vars);
    }

    ResponseEntity<String> patch(String uri, String json, Object... vars) {
        return send(HttpMethod.PATCH, uri, json, vars);
    }

    ResponseEntity<String> delete(String uri, Object... vars) {
        return send(HttpMethod.DELETE, uri, null, vars);
    }

    private ResponseEntity<String> send(HttpMethod method, String uri, String json, Object... vars) {
        RestClient.RequestBodySpec spec = client.method(method).uri(uri, vars);
        if (json != null) {
            spec.contentType(MediaType.APPLICATION_JSON).body(json);
        }
        return spec.retrieve().onStatus(status -> true, (req, res) -> { }).toEntity(String.class);
    }
}
