package dev.sayef.trawler;

/** The request is fine, but the thing it acts on isn't in a state that allows it. */
class ConflictException extends RuntimeException {

    ConflictException(String message) {
        super(message);
    }
}
