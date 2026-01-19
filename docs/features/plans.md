# Plans Feature

## Overview
The Plans module provides functionality to create and read subscription plans within the Open Subscriptions API. Plans define the pricing and billing cadence for subscriptions, with support for currency conversion.

## Endpoints

### Create Plan
**POST /plans**

Creates a new subscription plan with pricing and billing information.

#### Request Body
```json
{
  "name": "Premium Plan",
  "priceCents": 9900,
  "currency": "USD",
  "interval": "MONTHLY"
}
```

**Fields:**
- `name` (string, required): Plan name, 3-80 characters, whitespace trimmed, must be unique
- `priceCents` (integer, required): Price in cents (≥ 0), no floating point
- `currency` (string, required): Currency code, allowed values: `BRL`, `USD`
- `interval` (string, optional): Billing interval, only `MONTHLY` supported in MVP, defaults to `MONTHLY`

#### Response
**Status: 201 Created**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Premium Plan",
  "priceCents": 9900,
  "currency": "USD",
  "interval": "MONTHLY",
  "createdAt": "2026-01-19T14:13:55.661Z",
  "updatedAt": "2026-01-19T14:13:55.661Z"
}
```

#### Error Responses

**400 Bad Request** - Validation error
```json
{
  "statusCode": 400,
  "message": ["name must be longer than or equal to 3 characters"],
  "error": "Bad Request"
}
```

**409 Conflict** - Duplicate plan name
```json
{
  "statusCode": 409,
  "message": "A plan with this name already exists",
  "error": "Conflict"
}
```

### List Plans
**GET /plans**

Retrieves a paginated list of all plans with optional currency conversion.

#### Query Parameters
- `page` (optional, integer, default: 1, min: 1): Page number
- `pageSize` (optional, integer, default: 20, min: 1, max: 100): Items per page
- `currency` (optional, string, enum: `BRL`, `USD`): Currency for price conversion

#### Response
**Status: 200 OK**

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Premium Plan",
      "priceCents": 9900,
      "currency": "USD",
      "interval": "MONTHLY",
      "createdAt": "2026-01-19T14:13:55.661Z",
      "updatedAt": "2026-01-19T14:13:55.661Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

**With Currency Conversion:**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Premium Plan",
      "priceCents": 51975,
      "currency": "BRL",
      "interval": "MONTHLY",
      "createdAt": "2026-01-19T14:13:55.661Z",
      "updatedAt": "2026-01-19T14:13:55.661Z",
      "fx": {
        "baseCurrency": "USD",
        "quoteCurrency": "BRL",
        "rate": "5.2500000000",
        "asOf": "2026-01-19T14:00:00.000Z",
        "originalPriceCents": 9900
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

#### Error Responses

**400 Bad Request** - Validation error (invalid page/pageSize/currency)

**422 Unprocessable Entity** - Missing exchange rate for requested conversion

### Get Plan by ID
**GET /plans/:id**

Retrieves a single plan by its ID with optional currency conversion.

#### Path Parameters
- `id` (required, string, UUID): Plan identifier

#### Query Parameters
- `currency` (optional, string, enum: `BRL`, `USD`): Currency for price conversion

#### Response
**Status: 200 OK**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Premium Plan",
  "priceCents": 9900,
  "currency": "USD",
  "interval": "MONTHLY",
  "createdAt": "2026-01-19T14:13:55.661Z",
  "updatedAt": "2026-01-19T14:13:55.661Z"
}
```

**With Currency Conversion:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Premium Plan",
  "priceCents": 51975,
  "currency": "BRL",
  "interval": "MONTHLY",
  "createdAt": "2026-01-19T14:13:55.661Z",
  "updatedAt": "2026-01-19T14:13:55.661Z",
  "fx": {
    "baseCurrency": "USD",
    "quoteCurrency": "BRL",
    "rate": "5.2500000000",
    "asOf": "2026-01-19T14:00:00.000Z",
    "originalPriceCents": 9900
  }
}
```

#### Error Responses

**404 Not Found** - Plan does not exist

**400 Bad Request** - Validation error (invalid currency)

**422 Unprocessable Entity** - Missing exchange rate for requested conversion

## Currency Conversion Feature

### Overview
Plans can be retrieved with prices converted to a different currency using deterministic exchange rates stored in the database.

### How It Works
1. **Storage**: Plans are always stored in their original currency and price
2. **Conversion**: When a `currency` query parameter is provided that differs from the plan's stored currency, the API converts the price
3. **FX Rates**: Exchange rates are stored in the `fx_rates` table and selected deterministically (latest rate where `as_of <= now()`)
4. **Metadata**: When conversion is applied, the response includes an `fx` object with conversion details

### Conversion Rules
- If no `currency` parameter is provided, return stored values
- If `currency` equals the plan's stored currency, return stored values (no conversion)
- If `currency` differs, convert the price and include `fx` metadata
- If no FX rate exists for the requested pair, return 422 error

### FX Rates Table
The `fx_rates` table stores exchange rate data:
- `base_currency` (string): Source currency (e.g., USD)
- `quote_currency` (string): Target currency (e.g., BRL)
- `rate` (numeric with high precision): Exchange rate
- `as_of` (timestamptz, UTC): Timestamp when rate was valid

### Money-Safe Arithmetic
- Prices are stored as integer cents (no floating point)
- Conversion: `convertedPriceCents = round_half_up(priceCents * rate)`
- Result is always an integer in cents

## Data Model

### Plans Table
- `id`: UUID (primary key)
- `name`: VARCHAR(80) (unique, not null)
- `price_cents`: INTEGER (not null, check: ≥ 0)
- `currency`: VARCHAR(3) (not null)
- `interval`: VARCHAR(20) (not null, default: 'MONTHLY', check: = 'MONTHLY')
- `created_at`: TIMESTAMPTZ (not null)
- `updated_at`: TIMESTAMPTZ (not null)

**Constraints:**
- Unique constraint on `name`
- Check constraint: `price_cents >= 0`
- Check constraint: `interval = 'MONTHLY'` (MVP)

**Indexes:**
- Unique index on `name` (idx_plans_name_unique)

### FX Rates Table
- `id`: UUID (primary key)
- `base_currency`: VARCHAR(3) (not null)
- `quote_currency`: VARCHAR(3) (not null)
- `rate`: NUMERIC(20,10) (not null)
- `as_of`: TIMESTAMPTZ (not null)
- `created_at`: TIMESTAMPTZ (not null)

**Indexes:**
- Composite index on `(base_currency, quote_currency, as_of)` for efficient rate lookups

## Business Rules

1. **Money Handling**: All prices are stored as integer cents to avoid floating-point precision issues
2. **Uniqueness**: Plan names must be unique across the system
3. **Interval**: Only monthly billing is supported in the MVP
4. **Currencies**: Only BRL and USD are supported in the MVP
5. **Immutability**: Plans cannot be updated or deleted in the MVP (future enhancement)
6. **Pagination**: List endpoint enforces pagination with a maximum of 100 items per page
7. **Default Ordering**: Plans are ordered by `createdAt DESC` (most recent first)
8. **Currency Conversion**: Response-only operation; never modifies stored plan data

## Validation Rules

### Create Plan
1. Name must be 3-80 characters
2. Name is trimmed of leading/trailing whitespace
3. Price must be a non-negative integer
4. Currency must be 'BRL' or 'USD'
5. Interval, if provided, must be 'MONTHLY'

### List Plans
1. `page` must be ≥ 1
2. `pageSize` must be between 1 and 100
3. `currency`, if provided, must be 'BRL' or 'USD'

### Get Plan by ID
1. `id` must be a valid UUID
2. `currency`, if provided, must be 'BRL' or 'USD'

## Logging

Plan operations are logged at appropriate levels:
- **INFO**: Plan creation with id, name, and currency
- **WARN**: Duplicate plan name attempts
- **ERROR**: Database errors with stack trace

## Implementation Details

### NestJS Features Used
- **Validation**: `ValidationPipe` with `class-validator` decorators
- **Database**: TypeORM with PostgreSQL
- **Configuration**: `@nestjs/config` for environment variables
- **OpenAPI**: `@nestjs/swagger` for API documentation
- **Exception Handling**: Built-in NestJS exception filters
- **Transformation**: `class-transformer` for query parameter type conversion

### Error Handling
- Database unique constraint violations (code 23505) are mapped to `ConflictException` (409)
- Missing plans return `NotFoundException` (404)
- Missing FX rates for conversion return `UnprocessableEntityException` (422)
- Validation errors return `BadRequestException` (400)
- Other database errors are mapped to `InternalServerErrorException` (500) without exposing internal details

### Performance Considerations
- Pagination prevents unbounded result sets
- FX rate lookups use indexed columns for efficiency
- Conversion logic avoids N+1 queries by batching FX rate lookups
- Database connection pooling via TypeORM

## Testing

Unit tests cover:
- Successful plan creation
- Default interval assignment
- Duplicate name handling
- Database error handling
- Paginated list retrieval
- Currency conversion with FX rates
- Error cases (missing plan, missing FX rate)

E2E tests cover:
- Happy path creation
- Explicit interval setting
- Whitespace trimming
- Duplicate name rejection (409)
- Missing required fields (400)
- Invalid name length (400)
- Invalid currency (400)
- Negative price (400)
- Invalid interval (400)
- Zero price acceptance
- Empty list retrieval
- Paginated list with multiple plans
- Pagination parameter handling and validation
- Currency conversion with seeded FX rates
- Same currency (no conversion)
- Missing FX rate (422)
- Invalid currency parameter (400)
- Get plan by valid ID
- Get plan with 404 for non-existent ID
- Get plan with currency conversion
- Get plan with invalid currency (400)

## Future Enhancements

- PATCH /plans/:id (update plan)
- Soft delete/archive functionality
- Additional intervals (YEARLY, QUARTERLY)
- Additional currencies
- Plan descriptions and metadata
- Tiered pricing
- Usage-based pricing
- Advanced filtering and search
- Sorting customization
- Live FX provider integration (background sync)
