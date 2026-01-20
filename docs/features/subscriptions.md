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
  "computedStatus": "ACTIVE",
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

### List Subscriptions
- **Method**: `GET /subscriptions`
- **Content-Type**: `application/json`

#### Query Parameters
- `page` (optional, integer, default: 1, min: 1): Page number for pagination
- `pageSize` (optional, integer, default: 20, min: 1, max: 100): Number of items per page
- `customerId` (optional, string, max 64 chars): Filter subscriptions by customer ID

#### Response (200 OK)
```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "planId": "123e4567-e89b-12d3-a456-426614174000",
      "customerId": "customer_123",
      "status": "ACTIVE",
      "computedStatus": "ACTIVE",
      "startDate": "2024-01-20T15:00:00.000Z",
      "currentPeriodStart": "2024-01-20T15:00:00.000Z",
      "currentPeriodEnd": "2024-02-20T15:00:00.000Z",
      "canceledAt": null,
      "reactivatedAt": null,
      "createdAt": "2024-01-20T15:00:00.000Z",
      "updatedAt": "2024-01-20T15:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

#### Error Responses

**400 Bad Request** - Validation errors
- Invalid page number (less than 1)
- Invalid pageSize (less than 1 or greater than 100)
- Invalid customerId format or length

### Get Subscription by ID
- **Method**: `GET /subscriptions/:id`
- **Content-Type**: `application/json`

#### Path Parameters
- `id` (required, UUID): Subscription ID

#### Response (200 OK)
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174001",
  "planId": "123e4567-e89b-12d3-a456-426614174000",
  "customerId": "customer_123",
  "status": "ACTIVE",
  "computedStatus": "ACTIVE",
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

**404 Not Found** - Subscription does not exist
```json
{
  "statusCode": 404,
  "message": "Subscription with id <id> not found",
  "error": "Not Found"
}
```

## Data Model

### Subscription Entity
- `id` (UUID): Primary key
- `planId` (UUID): Foreign key to plans table
- `customerId` (string, max 64 chars): Customer identifier
- `status` (enum): `ACTIVE` or `CANCELED` (persisted)
- `computedStatus` (enum): `ACTIVE`, `OVERDUE`, or `CANCELED` (derived at read-time)
- `startDate` (timestamptz): Subscription start date
- `currentPeriodStart` (timestamptz): Current billing period start
- `currentPeriodEnd` (timestamptz): Current billing period end
- `canceledAt` (timestamptz, nullable): Cancellation timestamp
- `reactivatedAt` (timestamptz, nullable): Reactivation timestamp
- `createdAt` (timestamptz): Record creation timestamp
- `updatedAt` (timestamptz): Record update timestamp

## Business Rules

### Computed Status

The `computedStatus` field is derived at read-time based on the following rules:

1. **CANCELED**: If `status == CANCELED`, return `CANCELED`
2. **ACTIVE**: If `status == ACTIVE` and `currentPeriodEnd >= now`, return `ACTIVE`
3. **OVERDUE**: If `status == ACTIVE` and `currentPeriodEnd < now`, return `OVERDUE`

Note: The OVERDUE status indicates that the subscription period has expired. In a full implementation with billing events, this would check if a payment exists for the expired period. Currently, any expired ACTIVE subscription is considered OVERDUE.

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
All Subscription endpoints are documented in the OpenAPI spec and visible in the Scalar UI at `/docs`.

## Testing

### Unit Tests
- Creates subscription with correct status and period dates
- Validates plan existence (404)
- Enforces uniqueness constraint (409)
- Validates startDate parsing
- Handles custom startDate correctly
- Maps database errors appropriately
- Computes ACTIVE status for non-expired subscriptions
- Computes OVERDUE status for expired subscriptions
- Computes CANCELED status for canceled subscriptions
- Lists subscriptions with pagination
- Filters subscriptions by customerId
- Returns subscription by ID

### E2E Tests
- Happy path: create plan → create subscription
- Non-existent planId returns 404
- Duplicate ACTIVE subscription returns 409
- Validation errors return 400
- Custom startDate is persisted correctly
- GET /subscriptions returns paginated structure
- GET /subscriptions filters by customerId
- GET /subscriptions validates pagination parameters
- GET /subscriptions/:id returns expected subscription fields
- GET /subscriptions/:id for missing id returns 404
- computedStatus is ACTIVE for current subscriptions
- computedStatus is OVERDUE for expired subscriptions

## Implementation Notes

### NestJS Components
- **Module**: `SubscriptionsModule`
- **Controller**: `SubscriptionsController`
- **Service**: `SubscriptionsService`
- **Entity**: `Subscription` (TypeORM)
- **DTOs**: 
  - `CreateSubscriptionDto`
  - `SubscriptionResponseDto`
  - `ListSubscriptionsQueryDto`
  - `PaginatedSubscriptionsResponseDto`
  - `ComputedStatus` (enum)

### Logging
Subscription creation is logged at INFO level with non-sensitive fields:
```
Subscription created: id=<id>, planId=<planId>, customerId=<customerId>, periodStart=<iso>, periodEnd=<iso>
```

### Error Handling
- All database errors are mapped to appropriate HTTP exceptions
- Raw database errors are never exposed to clients
- Logging includes stack traces for debugging (server-side only)

### Performance Considerations
- List endpoint uses query builder for efficient pagination
- No N+1 queries: computed status is calculated in-memory for each subscription
- Indexes on customer_id, plan_id, and status support efficient filtering and sorting
