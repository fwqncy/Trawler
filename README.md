# Trawler

Stock and supplier ordering REST API. Trawler tracks stock against par levels across stores and raises supplier orders automatically. It runs on Spring Boot and PostgreSQL, with a full integration test suite. It was built to flag stock below par and raise supplier orders the way stock-takes are run in restaurants.

**Stack:** Java 21 · Spring Boot 4.1 · PostgreSQL 17 · JPA (Hibernate 7) · Flyway · JUnit 6 · Testcontainers 2. The web client uses plain ES modules with Three.js and GSAP, with no build step.

```http
GET /api/stock/low?storeId=4

200 OK
[
  { "sku": "TORT-12",  "onHand": 14, "par": 60, ... },
  { "sku": "AVO-HASS", "onHand": 9,  "par": 40, ... },
  { "sku": "CHIP-1KG", "onHand": 3,  "par": 12, ... }
]
```

## Run It

You need **JDK 21+** and **PostgreSQL** with a `trawler` database owned by a `trawler` user (password `trawler`).

```bash
# Option A: a local Postgres
psql -d postgres -c "create role trawler login password 'trawler'" && createdb -O trawler trawler
# Option B: Docker
docker compose up -d

./mvnw spring-boot:run
```

Open <http://localhost:8080>. On first start with an empty database, Trawler seeds four demo cantinas with 30 days of history. Store 4 (Bondi) returns exactly the response above.

| Variable | Default | Purpose |
|---|---|---|
| `TRAWLER_DB_URL` | `jdbc:postgresql://localhost:5432/trawler` | JDBC URL |
| `TRAWLER_DB_USER` / `TRAWLER_DB_PASSWORD` | `trawler` / `trawler` | Credentials |
| `TRAWLER_DEMO_DATA` | `true` | Seed demo stores when the database is empty |
| `PORT` | `8080` | HTTP port |

`trawler.reorder.cron` (default 5 am, Sydney time) controls when the autopilot drafts orders. Set it to `-` to turn the autopilot off.

## Test It

```bash
./mvnw verify
```

`verify` runs the Mockito unit tests, the Testcontainers repository and API tests against a real `postgres:17-alpine`, and a JaCoCo line-coverage gate of 85%. The coverage report is written to `target/site/jacoco/index.html`.

Testcontainers needs Docker. With **Colima** on macOS, export these first:

```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

## What It Does

- **Par levels per store.** Every line shows on-hand against par, units short, units already on order, and days of cover from the last 14 days of usage.
- **Ordering that doesn't double up.** A reorder tops each line back to par, nets off stock already on open orders, rounds up to whole cases, and merges into an open draft for that supplier rather than starting a second one.
- **Autopilot.** For stores that opt in, a scheduled job drafts one order per supplier every morning. Drafts wait for a person to check and send them.
- **Purchase order lifecycle.** Draft → Sent → Part Received → Received, or Cancelled. Expected dates come from supplier lead times, overdue orders are flagged, short deliveries can be closed off, and each order exports to CSV.
- **Blind stock-takes.** Expected quantities are snapshotted at the start and hidden while counting. On completion, the variance posts against current on-hand, so deliveries made mid-count still land correctly.
- **A stock ledger.** Every change (receipt, usage, waste, adjustment, transfer, count) writes a movement with the resulting balance. The ledger always sums to on-hand.
- **Transfers between stores**, with a matching pair of ledger entries.
- **Optimistic locking** on stock levels and orders. Concurrent edits get a clear 409 instead of overwriting each other.
- **Problem details.** Errors are returned as RFC 9457 problem details, with per-field validation messages.

## API

| Method & Path | Does |
|---|---|
| `GET /api/stock/low?storeId=` | Lines below par, biggest shortfall first |
| `POST /api/stock/orders` `{storeId, supplierId}` | Raise or top up a draft for one supplier (201) |
| `POST /api/orders/auto` `{storeId}` | Draft orders for every supplier with something below par |
| `GET /api/orders?storeId=&status=` · `GET /api/orders/{id}` · `GET /api/orders/summary?storeId=` | Browse orders |
| `POST /api/orders/{id}/send` · `/receive` · `/close` · `/cancel` | Move an order along |
| `POST /api/orders/{id}/lines` · `PATCH`/`DELETE /api/orders/{id}/lines/{lineId}` | Edit a draft |
| `GET /api/orders/{id}/csv` | Order as CSV |
| `GET /api/inventory?storeId=` · `GET`/`PATCH /api/inventory/{id}` | Every line at a store; change par and bin |
| `GET /api/inventory/{id}/movements` | One line's history |
| `POST /api/inventory/adjustments` · `POST /api/inventory/transfers` | Usage, waste, adjustments, transfers |
| `GET /api/inventory/export?storeId=` | Stock as CSV |
| `GET /api/movements?storeId=&sku=&reason=&page=&size=` | The ledger |
| `GET`/`POST /api/stocktakes` · `GET /api/stocktakes/{id}` | Stock-takes |
| `PUT /api/stocktakes/{id}/lines/{lineId}` · `POST .../complete` · `POST .../cancel` | Count and post a stock-take |
| `GET`/`POST`/`PUT /api/stores`, `/api/suppliers`, `/api/products` | Catalogue |
| `GET /api/dashboard?storeId=` · `GET /api/meta` | Overview figures; currency and business date |

## The Web Client

The client is served from `src/main/resources/static`. Three.js and GSAP are vendored, so the app runs offline.

- **Sky and paper.** A WebGL shader paints a risograph cloud sky that ends in a cloud bank, with faint water light over the paper. Content reveals through rolling cloud.
- **The whirlpool.** Every stock line is a fish drawn as a constellation. Lines at or above par circle the rim; the further below par a line runs, the deeper and faster it's pulled toward the eye. Hover or use the arrow keys to read a fish, and click or press Enter to open it. Drag to spin.
- **Themes.** Tide (navy and cream) is the default. Claret is burgundy and gold. Custom builds the whole palette in OKLCH from colours picked on a colour wheel, and keeps text contrast readable.
- **Built to the Vercel Web Interface Guidelines.** The URL holds every filter, tab and open item. Everything is keyboard-operable with a ⌘K palette, optimistic updates come with undo, destructive actions ask first, reduced motion is honoured, and status is never shown by colour alone.

## Layout

```
trawler-api/
├── src/main/java/dev/sayef/trawler/      # entities, repositories, services, controllers
├── src/main/resources/db/migration/     # Flyway schema
├── src/main/resources/static/           # web client (js/views, js/scene, css, vendor, fonts)
└── src/test/java/dev/sayef/trawler/      # StockServiceTest, OrderRepositoryTest, StockControllerIT, TrawlerApiIT
```
