# Plans Feature

## Overview
The Plans module provides functionality to create and manage subscription plans within the Open Subscriptions API. Plans define the pricing and billing cadence for subscriptions.

## Endpoint

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

## Business Rules

1. **Money Handling**: All prices are stored as integer cents to avoid floating-point precision issues
2. **Uniqueness**: Plan names must be unique across the system
3. **Interval**: Only monthly billing is supported in the MVP
4. **Currencies**: Only BRL and USD are supported in the MVP
5. **Immutability**: Plans cannot be updated or deleted in the MVP (future enhancement)

## Validation Rules

1. Name must be 3-80 characters
2. Name is trimmed of leading/trailing whitespace
3. Price must be a non-negative integer
4. Currency must be 'BRL' or 'USD'
5. Interval, if provided, must be 'MONTHLY'

## Logging

Plan creation is logged at INFO level with:
- Plan ID
- Plan name
- Currency

Duplicate name attempts are logged at WARN level.

Database errors are logged at ERROR level with stack trace.

## Implementation Details

### NestJS Features Used
- **Validation**: `ValidationPipe` with `class-validator` decorators
- **Database**: TypeORM with PostgreSQL
- **Configuration**: `@nestjs/config` for environment variables
- **OpenAPI**: `@nestjs/swagger` for API documentation
- **Exception Handling**: Built-in NestJS exception filters

### Error Handling
- Database unique constraint violations (code 23505) are mapped to `ConflictException` (409)
- Other database errors are mapped to `InternalServerErrorException` (500)
- Validation errors return 400 status with detailed field-level messages

## Testing

Unit tests cover:
- Successful plan creation
- Default interval assignment
- Duplicate name handling
- Database error handling

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

## Future Enhancements

- GET /plans (list with pagination)
- GET /plans/:id (retrieve single plan)
- PATCH /plans/:id (update plan)
- Soft delete/archive functionality
- Additional intervals (YEARLY, QUARTERLY)
- Additional currencies
- Plan descriptions and metadata
- Tiered pricing
- Usage-based pricing
