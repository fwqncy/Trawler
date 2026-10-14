package dev.sayef.trawler;

/** The request breaks a business rule about its own values, such as a negative count. */
class InvalidRequestException extends RuntimeException {

    InvalidRequestException(String message) {
        super(message);
    }
}
