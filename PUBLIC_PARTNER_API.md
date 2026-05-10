# The Clash — Public Partner API

This document describes the read/write API surface available to third-party
applications that want to reserve courts on behalf of their end users.

**Base URL (production):** `https://api.theclasheg.com/api/public/v1`
**Base URL (staging):** `https://staging-api.theclasheg.com/api/public/v1`

> Replace the host with whatever the integrator was given. All endpoints below
> are relative to the base URL.

---

## 1. Authentication

Every request must send an API key in the `X-API-Key` header:

```
X-API-Key: pk_live_a1b2c3d4XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- Keys are issued by The Clash admin team and are tied to a single partner
  application.
- The full key is shown **once** at creation. Only the SHA-256 hash is stored
  server-side, so a lost key cannot be recovered — only **rotated**.
- Keys must be sent over HTTPS. Never embed them in client-side code; always
  call this API from your server.
- Requests without a valid, active key receive `401 Unauthorized`.
- Revoked keys also receive `401 Unauthorized`.

If you need a new key issued, your contact at The Clash will provision it from
the admin dashboard. To request a rotation, contact the same person — your
existing key will stop working the moment a new one is generated.

---

## 2. Response envelope

All endpoints return a JSON envelope:

```json
{
  "data": { ... },
  "success": true,
  "message": "",
  "errors": []
}
```

- `success` (bool): `true` on a successful operation.
- `data` (object | array | primitive): the actual payload (varies per endpoint).
- `message` (string): present on errors; describes what went wrong.
- `errors` (array): field-level validation errors when applicable.

HTTP status codes follow standard REST conventions:
`200 OK`, `400 Bad Request`, `401 Unauthorized`, `404 Not Found`,
`500 Internal Server Error`.

---

## 3. Common data structures

### Court

```json
{
  "id": "8f1c2a3b-4d5e-6789-abcd-ef0123456789",
  "name": "Court 1",
  "description": "Outdoor clay court",
  "isActive": true,
  "createdAt": "2025-08-01T09:30:00Z",
  "updatedAt": "2025-08-01T09:30:00Z",
  "reservationCount": 47
}
```

### ReservationCategory

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "User",
  "pricePerHour": 350.00,
  "isActive": true,
  "reservationCount": 15,
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:00:00Z"
}
```

### ReservationStatus (enum)

| Value | Name        | Meaning                                              |
| ----- | ----------- | ---------------------------------------------------- |
| 1     | `Pending`   | Awaiting confirmation                                |
| 2     | `Confirmed` | Active booking — slot is taken                       |
| 3     | `Cancelled` | Cancelled by partner or admin                        |
| 4     | `Completed` | Slot has already happened                            |

Partner-created reservations are stored as `Confirmed` immediately.

### PartnerReservation

The partner-facing reservation record. **Does not** include other users'
account info, payment receipts, or internal Fawry references.

```json
{
  "id": "1d3e7a90-...",
  "courtId": "8f1c2a3b-...",
  "courtName": "Court 1",
  "startTime": "2026-05-10T14:00:00+02:00",
  "endTime":   "2026-05-10T15:00:00+02:00",
  "status": 2,
  "guestName":  "Sara Hassan",
  "guestEmail": "sara@example.com",
  "guestPhone": "+201001234567",
  "reservationCategoryId": "a1b2c3d4-...",
  "reservationCategoryName": "User",
  "needBall": false,
  "cost": 350.00,
  "notes": "Lesson with Coach Ali",
  "externalPaymentReference": "stripe_ch_3PqXxYzAbC",
  "createdAt": "2026-05-05T10:12:33Z",
  "updatedAt": "2026-05-05T10:12:33Z"
}
```

### BusySlot

Identity-free record returned for calendar/availability rendering. Use this
when you need to show *what slots are taken* without exposing other partners'
or users' personal data.

```json
{
  "id": "1d3e7a90-...",
  "courtId": "8f1c2a3b-...",
  "startTime": "2026-05-10T14:00:00+02:00",
  "endTime":   "2026-05-10T15:00:00+02:00",
  "status": 2
}
```

---

## 4. Endpoints

### 4.1 List active courts

`GET /courts`

Returns courts available for booking.

**Example:**

```bash
curl -H "X-API-Key: pk_live_…" \
  https://api.theclasheg.com/api/public/v1/courts
```

**Response:**

```json
{
  "data": [
    { "id": "8f1c…", "name": "Court 1", "isActive": true, "...": "..." }
  ],
  "success": true
}
```

---

### 4.2 List active reservation categories

`GET /reservation-categories`

Returns categories the partner may attach to a reservation. Each category
carries the per-hour price used to compute `cost` at booking time.

**Example:**

```bash
curl -H "X-API-Key: pk_live_…" \
  https://api.theclasheg.com/api/public/v1/reservation-categories
```

---

### 4.3 Check availability for a single time range

`GET /availability?courtId=…&startTime=…&endTime=…`

Returns `true` if the requested slot is free, `false` if it overlaps an
existing confirmed booking. Use this right before submitting a reservation.

**Query parameters:**

| Name        | Type             | Required | Description                                  |
| ----------- | ---------------- | -------- | -------------------------------------------- |
| `courtId`   | UUID             | yes      | The court being booked                       |
| `startTime` | ISO 8601 / RFC 3339 | yes   | Slot start (with timezone offset)            |
| `endTime`   | ISO 8601 / RFC 3339 | yes   | Slot end (with timezone offset)              |

**Example:**

```bash
curl -H "X-API-Key: pk_live_…" \
  "https://api.theclasheg.com/api/public/v1/availability\
?courtId=8f1c2a3b-4d5e-6789-abcd-ef0123456789\
&startTime=2026-05-10T14:00:00%2B02:00\
&endTime=2026-05-10T15:00:00%2B02:00"
```

**Response:**

```json
{ "data": true, "success": true }
```

---

### 4.4 List busy slots for a court (calendar view)

`GET /busy-slots?courtId=…&from=…&to=…`

Returns every taken slot on a court between `from` and `to`, with **no user
or guest information**. Use this to render a calendar of taken vs. free time
in your own UI. Slots in `Pending` and `Confirmed` status are both returned;
`Cancelled` and `Completed` are excluded.

**Query parameters:**

| Name      | Type             | Required | Description                                |
| --------- | ---------------- | -------- | ------------------------------------------ |
| `courtId` | UUID             | yes      | The court to inspect                       |
| `from`    | ISO 8601 / RFC 3339 | yes   | Window start (inclusive, with tz offset)   |
| `to`      | ISO 8601 / RFC 3339 | yes   | Window end   (exclusive, with tz offset)   |

**Example:**

```bash
curl -H "X-API-Key: pk_live_…" \
  "https://api.theclasheg.com/api/public/v1/busy-slots\
?courtId=8f1c2a3b-…\
&from=2026-05-10T00:00:00%2B02:00\
&to=2026-05-11T00:00:00%2B02:00"
```

**Response:**

```json
{
  "data": [
    {
      "id": "1d3e7a90-…",
      "courtId": "8f1c…",
      "startTime": "2026-05-10T14:00:00+02:00",
      "endTime":   "2026-05-10T15:00:00+02:00",
      "status": 2
    }
  ],
  "success": true
}
```

---

### 4.5 Create a reservation

`POST /reservations`

Books a court for a specific guest. The reservation is stored as `Confirmed`
immediately; settlement with the venue happens out of band against the
`externalPaymentReference` you provide (see § 5).

**Request body:**

| Field                       | Type              | Required | Notes                                           |
| --------------------------- | ----------------- | -------- | ----------------------------------------------- |
| `courtId`                   | UUID              | yes      | Must be an active court                         |
| `startTime`                 | ISO 8601          | yes      | Must be before `endTime`                        |
| `endTime`                   | ISO 8601          | yes      | Must be after `startTime`                       |
| `guestName`                 | string (≤200)     | yes      | The end user being booked                       |
| `guestEmail`                | string (≤200)     | yes      | Used for confirmation email                     |
| `guestPhone`                | string (≤50)      | yes      |                                                 |
| `needBall`                  | bool              | no       | Default `false`. Adds a 50 EGP ball charge      |
| `reservationCategoryId`     | UUID              | no       | If omitted, default pricing applies (350/hr)    |
| `notes`                     | string (≤1000)    | no       | Free-form text                                  |
| `externalPaymentReference`  | string (≤100)     | yes      | Your own payment id (e.g. Stripe charge id)     |

**Example:**

```bash
curl -X POST \
  -H "X-API-Key: pk_live_…" \
  -H "Content-Type: application/json" \
  -d '{
    "courtId": "8f1c2a3b-4d5e-6789-abcd-ef0123456789",
    "startTime": "2026-05-10T14:00:00+02:00",
    "endTime":   "2026-05-10T15:00:00+02:00",
    "guestName":  "Sara Hassan",
    "guestEmail": "sara@example.com",
    "guestPhone": "+201001234567",
    "needBall": false,
    "externalPaymentReference": "stripe_ch_3PqXxYzAbC"
  }' \
  https://api.theclasheg.com/api/public/v1/reservations
```

**Successful response:** the created `PartnerReservation` (see § 3).

**Common errors:**

| Status | Message                                              | Cause                                       |
| ------ | ---------------------------------------------------- | ------------------------------------------- |
| 400    | `Court is already reserved for this time period`     | Slot was taken between availability check and create — retry availability |
| 400    | `Court not found` / `Court is not active`            | Bad `courtId` or court was deactivated      |
| 400    | `Start time must be before end time`                 | Time range invalid                          |
| 400    | Field validation error                               | Missing required field; see `errors[]`      |
| 401    | Unauthorized                                          | Missing / invalid / revoked API key         |

---

### 4.6 List your reservations

`GET /reservations`

Returns every reservation **created by your application**. Reservations made
through other channels (the mobile app, the dashboard, other partners) are
not returned.

**Example:**

```bash
curl -H "X-API-Key: pk_live_…" \
  https://api.theclasheg.com/api/public/v1/reservations
```

**Response:** array of `PartnerReservation`.

---

### 4.7 Get a specific reservation

`GET /reservations/{id}`

Returns a single reservation if it was created by your application, otherwise
`404 Not Found`.

**Example:**

```bash
curl -H "X-API-Key: pk_live_…" \
  https://api.theclasheg.com/api/public/v1/reservations/1d3e7a90-…
```

---

### 4.8 Cancel a reservation

`DELETE /reservations/{id}`

Cancels (deletes) a reservation your application created. Returns `200` with
`data: true` on success. Reservations created through other channels are
rejected.

**Example:**

```bash
curl -X DELETE -H "X-API-Key: pk_live_…" \
  https://api.theclasheg.com/api/public/v1/reservations/1d3e7a90-…
```

> **Refunds:** This API does not process refunds. If you need to refund the
> end user, do it on your side using the `externalPaymentReference` you
> recorded at booking. We'll reconcile the cancelled booking against your
> next settlement statement.

---

## 5. Payments & settlement

This API does **not** process card payments. The intended model is:

1. Your application charges the end user in your own checkout flow (Stripe,
   Paymob, in-app credit, …).
2. You call `POST /reservations` with `externalPaymentReference` set to your
   own payment identifier (charge id, transaction id, etc.).
3. The Clash records the booking with `cost` and `externalPaymentReference`.
4. The Clash invoices your application monthly for the sum of `cost` over
   confirmed reservations created by your key during the period.
5. Your `externalPaymentReference` is the audit trail for any disputed line
   on the settlement statement.

Cancellations issued by you (`DELETE /reservations/{id}`) are excluded from
the next settlement automatically.

---

## 6. Privacy & data minimisation

The partner API deliberately strips end-user PII from responses you don't
strictly need:

- `GET /busy-slots` returns time + status only — no names, emails, or IDs.
- `GET /availability` returns a boolean.
- `GET /reservations` and `GET /reservations/{id}` return only reservations
  you created — guest fields you submitted yourself are echoed back; no other
  partner's or user's data is exposed.

If you only need to render a calendar, prefer `/busy-slots` over
`/reservations` to avoid handling guest information you don't need.

---

## 7. Rate limits & timeouts

- Soft limit: 60 requests / minute per API key. Sustained higher volume —
  contact us in advance.
- Recommended client timeout: **15 seconds**.
- Retry idempotently on `5xx`. Do **not** retry `POST /reservations` blindly
  on a network error — check `GET /reservations` first to see if the booking
  was created, otherwise you risk double-booking.

---

## 8. Time zones

All timestamps are ISO 8601 with timezone offsets. Always send a timezone
offset in `startTime` / `endTime` / `from` / `to` (e.g. `+02:00` for Cairo).
Responses are returned with explicit offsets too.

---

## 9. Changelog

| Version | Date       | Notes                                              |
| ------- | ---------- | -------------------------------------------------- |
| v1      | 2026-05-05 | Initial release: courts, availability, busy-slots, reservation CRUD, external payment reference. |

---

## 10. Support

- Integration questions / new key requests: clash@theclasheg.com
- Production issues: same address with subject prefix `[URGENT]`
