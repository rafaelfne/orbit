# Subscription Cancellation Policy

## Overview
This document defines the cancellation policy for subscriptions in the Open Subscriptions API. While the Create Subscription endpoint does not implement cancellation, this policy will guide future implementation of the cancel/reactivate endpoints.

## Cancellation Policy (Future Implementation)

### Immediate Cancellation
The Open Subscriptions API follows an **immediate cancellation** policy:

- Cancellation takes effect immediately
- No prorated refunds in MVP
- Subscription remains in the database with `status = CANCELED`
- Access ends at cancellation time (not at period end)

### Rationale
This policy was chosen for MVP simplicity:
- No complex proration calculations required
- No partial refund processing needed
- Clear state transitions
- Easier to reason about billing periods

### Future Considerations
For production, consider:
- **End-of-period cancellation**: Allow access until current period ends
- **Prorated refunds**: Calculate and issue refunds for unused time
- **Grace periods**: Allow configurable grace periods before access ends
- **Cancellation reasons**: Track why subscriptions are canceled

## State Transitions

### On Cancellation (Future)
```
ACTIVE → CANCELED
```

**Changes**:
- `status = CANCELED`
- `canceled_at = now()`
- `current_period_start` and `current_period_end` remain unchanged

### On Reactivation (Future)
```
CANCELED → ACTIVE
```

**Changes**:
- `status = ACTIVE`
- `reactivated_at = now()`
- `current_period_start = now()`
- `current_period_end = now() + 1 month`

**Rules**:
- Only CANCELED subscriptions can be reactivated
- Reactivation starts a new billing period immediately
- Previous billing history is preserved

## Database Considerations

### Soft Deletes
- Subscriptions are **never deleted** from the database
- Cancellation is a status change, not a deletion
- This preserves:
  - Billing history
  - Audit trail
  - Customer subscription patterns

### Uniqueness After Cancellation
- The uniqueness constraint only applies to ACTIVE subscriptions
- After cancellation, a new ACTIVE subscription can be created for the same customer+plan pair
- This is enforced via the partial unique index: `UNIQUE (customer_id, plan_id) WHERE status = 'ACTIVE'`

## Related Endpoints (Future)

### Cancel Subscription
- **Method**: `POST /subscriptions/:id/cancel`
- **Status**: 200 OK
- **Effect**: Sets status to CANCELED, records canceled_at timestamp

### Reactivate Subscription
- **Method**: `POST /subscriptions/:id/reactivate`
- **Status**: 200 OK
- **Effect**: Sets status to ACTIVE, records reactivated_at timestamp, starts new period

## Implementation Status
- ✅ Database schema supports cancellation (status, canceled_at, reactivated_at)
- ✅ Uniqueness constraint allows multiple CANCELED subscriptions
- ⏳ Cancel endpoint: Not implemented (separate PRD)
- ✅ Reactivate endpoint: Implemented
- ⏳ Billing simulation: Not implemented (separate PRD)

## Reactivate Subscription Endpoint

### Endpoint
- **Method**: `POST /subscriptions/:id/reactivate`
- **Status**: 200 OK
- **Effect**: Sets status to ACTIVE, records reactivated_at timestamp, starts new period

### Behavior
1. Lookup subscription by `id`
   - If not found: `404 Not Found`

2. State transition rules
   - If current `status == CANCELED`:
     - Set `status = ACTIVE`
     - Set `reactivated_at = now()` (UTC)
     - Set `current_period_start = now()` (UTC)
     - Set `current_period_end = current_period_start + 1 month`
     - Do NOT change:
       - start_date (preserved for audit)
       - plan_id
       - customer_id
       - canceled_at (preserved for audit)
   - If current `status == ACTIVE`:
     - Return `409 Conflict` (already active)
     - Do not modify the record

3. Response
   - Status: `200 OK`
   - Body: Subscription object (same schema as GET /subscriptions/:id), including:
     - persisted `status` (ACTIVE)
     - `computedStatus` (expected ACTIVE immediately after reactivation)
     - updated period fields

### Error Handling
- `404` if subscription not found
- `409` if subscription is already active

### Logging
Reactivation is logged at INFO level with non-sensitive fields:
- subscriptionId, customerId, planId, reactivatedAt, periodStart, periodEnd

### Testing
- Unit tests verify:
  - Reactivates CANCELED subscription correctly
  - Returns 409 for ACTIVE subscription
  - Returns 404 for non-existent subscription
  - Handles database errors appropriately
- E2E tests verify:
  - Reactivation via API endpoint
  - Period fields reset correctly
  - canceledAt remains unchanged
  - OpenAPI documentation includes endpoint

## Notes
This policy is documented now to ensure consistency in schema design and future implementation. It may be revised based on business requirements before the cancel/reactivate endpoints are implemented.
