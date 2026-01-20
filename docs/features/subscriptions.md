# Subscriptions

## Overview
The Subscriptions feature enables customers to subscribe to Plans and tracks their current billing periods for monthly billing simulation. A Subscription links a customer to a Plan and maintains the active billing window.

## Endpoints

### Create Subscription
- **Method**: `POST /subscriptions`
- **Content-Type**: `application/json`

#### Request Body
```json
{
  "planId": "123e4567-e89b-12d3-a456-426614174000",
  "customerId": "customer_123",
  "startDate": "2024-01-20T15:00:00Z" // optional, defaults to now
}
```

#### Response (201 Created)
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174001",
  "planId": "123e4567-e89b-12d3-a456-426614174000",
  "customerId": "customer_123",
  "status": "ACTIVE",
  "startDate": "2024-01-20T15:00:00.000Z",
  "currentPeriodStart": "2024-01-20T15:00:00.000Z",
  "currentPeriodEnd": "2024-02-20T15:00:00.000Z",
  "canceledAt": null,
  "reactivatedAt": null,
  "createdAt": "2024-01-20T15:00:00.000Z",
  "updatedAt": "2024-01-20T15:00:00.000Z"
}
```

#### Error Responses

**400 Bad Request** - Validation errors
- Missing required fields
- Invalid data types
- Invalid ISO date format
- customerId exceeds 64 characters

**404 Not Found** - Plan does not exist
```json
{
  "statusCode": 404,
  "message": "Plan with id <planId> not found",
  "error": "Not Found"
}
```

**409 Conflict** - Duplicate active subscription
```json
{
  "statusCode": 409,
  "message": "An active subscription for this customer and plan already exists",
  "error": "Conflict"
}
```

## Data Model

### Subscription Entity
- `id` (UUID): Primary key
- `planId` (UUID): Foreign key to plans table
- `customerId` (string, max 64 chars): Customer identifier
- `status` (enum): `ACTIVE` or `CANCELED`
- `startDate` (timestamptz): Subscription start date
- `currentPeriodStart` (timestamptz): Current billing period start
- `currentPeriodEnd` (timestamptz): Current billing period end
- `canceledAt` (timestamptz, nullable): Cancellation timestamp
- `reactivatedAt` (timestamptz, nullable): Reactivation timestamp
- `createdAt` (timestamptz): Record creation timestamp
- `updatedAt` (timestamptz): Record update timestamp

## Business Rules

### Uniqueness Constraint
- At most **one ACTIVE subscription** per `(customerId, planId)` pair
- Enforced via partial unique index: `UNIQUE (customer_id, plan_id) WHERE status = 'ACTIVE'`
- Multiple CANCELED subscriptions for the same customer+plan are allowed

### Period Calculation
- On creation:
  - `startDate = provided startDate || now()`
  - `currentPeriodStart = startDate`
  - `currentPeriodEnd = currentPeriodStart + 1 month`
- Month arithmetic handles boundaries correctly (e.g., Jan 31 → Feb 28/29)

### Status
- New subscriptions are created with `status = ACTIVE`
- `canceledAt` and `reactivatedAt` are `null` on creation

## Database Constraints

### Check Constraints
- `status IN ('ACTIVE', 'CANCELED')`
- `current_period_end > current_period_start`

### Foreign Keys
- `plan_id` references `plans(id)` with `ON DELETE RESTRICT`

### Indexes
- `idx_subscriptions_plan_id` on `plan_id`
- `idx_subscriptions_customer_id` on `customer_id`
- `idx_subscriptions_status` on `status`
- `idx_subscriptions_unique_active` partial unique on `(customer_id, plan_id) WHERE status = 'ACTIVE'`

## OpenAPI Documentation
The Create Subscription endpoint is documented in the OpenAPI spec and visible in the Scalar UI at `/docs`.

## Testing

### Unit Tests
- Creates subscription with correct status and period dates
- Validates plan existence (404)
- Enforces uniqueness constraint (409)
- Validates startDate parsing
- Handles custom startDate correctly
- Maps database errors appropriately

### E2E Tests
- Happy path: create plan → create subscription
- Non-existent planId returns 404
- Duplicate ACTIVE subscription returns 409
- Validation errors return 400
- Custom startDate is persisted correctly

## Implementation Notes

### NestJS Components
- **Module**: `SubscriptionsModule`
- **Controller**: `SubscriptionsController`
- **Service**: `SubscriptionsService`
- **Entity**: `Subscription` (TypeORM)
- **DTOs**: `CreateSubscriptionDto`, `SubscriptionResponseDto`

### Logging
Subscription creation is logged at INFO level with non-sensitive fields:
```
Subscription created: id=<id>, planId=<planId>, customerId=<customerId>, periodStart=<iso>, periodEnd=<iso>
```

### Error Handling
- All database errors are mapped to appropriate HTTP exceptions
- Raw database errors are never exposed to clients
- Logging includes stack traces for debugging (server-side only)
