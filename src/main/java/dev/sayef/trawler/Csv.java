package dev.sayef.trawler;

import java.util.Arrays;
import java.util.stream.Collectors;

/** Just enough CSV for spreadsheet exports: quotes fields that need it, CRLF rows. */
final class Csv {

    private final StringBuilder out = new StringBuilder();

    Csv(String... headers) {
        row((Object[]) headers);
    }

    Csv row(Object... values) {
        out.append(Arrays.stream(values).map(Csv::field).collect(Collectors.joining(","))).append("\r\n");
        return this;
    }

    private static String field(Object value) {
        if (value == null) {
            return "";
        }
        String text = value.toString();
        // A leading =, +, - or @ makes spreadsheets evaluate the cell as a formula.
        if (!text.isEmpty() && "=+-@".indexOf(text.charAt(0)) >= 0 && !(value instanceof Number)) {
            text = "'" + text;
        }
        if (text.contains(",") || text.contains("\"") || text.contains("\n") || text.contains("\r")) {
            return '"' + text.replace("\"", "\"\"") + '"';
        }
        return text;
    }

    @Override
    public String toString() {
        return out.toString();
    }
}
