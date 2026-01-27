# Billing Simulation

## Overview
The billing simulation feature provides a manual-trigger endpoint to simulate monthly billing for subscriptions. It processes elapsed subscription periods, creates billing records, and advances subscription period windows until they are current.

## Endpoint
- **Method**: `POST`
- **Path**: `/billing/simulate`
- **Content-Type**: `application/json`

## Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `subscriptionId` | string (UUID) | No | - | If provided, simulates billing only for this subscription. If absent, simulates for all eligible subscriptions. |
| `maxSubscriptions` | integer | No | 100 | Maximum number of subscriptions to process when `subscriptionId` is not specified. Min: 1, Max: 1000. |
| `maxPeriodsPerSubscription` | integer | No | 12 | Maximum number of periods to process per subscription. Safety bound to prevent runaway loops. Min: 1, Max: 60. |
| `dryRun` | boolean | No | false | If true, computes what would happen without writing to the database (preview mode). |

### Example Request - Single Subscription
```json
{
  "subscriptionId": "123e4567-e89b-12d3-a456-426614174000",
  "maxPeriodsPerSubscription": 12,
  "dryRun": false
}
```

### Example Request - All Subscriptions
```json
{
  "maxSubscriptions": 100,
  "maxPeriodsPerSubscription": 12,
  "dryRun": false
}
```

## Response Body

| Field | Type | Description |
|-------|------|-------------|
| `processedSubscriptions` | number | Total number of subscriptions processed |
| `createdBillingRecords` | number | Total number of billing records created across all subscriptions |
| `advancedPeriods` | number | Total number of periods advanced across all subscriptions |
| `results` | array | Detailed results for each processed subscription |

### Result Object
Each result in the `results` array contains:

| Field | Type | Description |
|-------|------|-------------|
| `subscriptionId` | string | Subscription ID |
| `periodsProcessed` | number | Number of periods processed for this subscription |
| `billingRecordsCreated` | number | Number of billing records created for this subscription |
| `periodStartBefore` | string (ISO 8601) | Period start before simulation |
| `periodEndBefore` | string (ISO 8601) | Period end before simulation |
| `periodStartAfter` | string (ISO 8601) | Period start after simulation |
| `periodEndAfter` | string (ISO 8601) | Period end after simulation |
| `statusAfter` | string | Persisted status after simulation |
| `computedStatusAfter` | string | Computed status after simulation |
| `hitMaxPeriodsLimit` | boolean | Whether processing was stopped due to reaching `maxPeriodsPerSubscription` limit |

### Example Response
```json
{
  "processedSubscriptions": 1,
  "createdBillingRecords": 3,
  "advancedPeriods": 3,
  "results": [
    {
      "subscriptionId": "123e4567-e89b-12d3-a456-426614174000",
      "periodsProcessed": 3,
      "billingRecordsCreated": 3,
      "periodStartBefore": "2024-01-01T00:00:00.000Z",
      "periodEndBefore": "2024-02-01T00:00:00.000Z",
      "periodStartAfter": "2024-04-01T00:00:00.000Z",
      "periodEndAfter": "2024-05-01T00:00:00.000Z",
      "statusAfter": "ACTIVE",
      "computedStatusAfter": "ACTIVE",
      "hitMaxPeriodsLimit": false
    }
  ]
}
```

## Behavior

### Eligibility
Only subscriptions with `status = ACTIVE` are eligible for billing simulation. Canceled subscriptions are skipped.

### Billing Record Creation
For each elapsed period (where `now >= current_period_end`):
1. A billing record is created with:
   - `subscription_id`: The subscription being processed
   - `period_start`: Start of the period being billed
   - `period_end`: End of the period being billed
   - `amount_cents`: Plan price at time of billing
   - `currency`: Plan currency at time of billing
   - `payment_status`: `PAID` (using deterministic Option A from PRD)

### Period Advancement
After processing a period:
1. Advance the subscription period by exactly one month:
   - `current_period_start = previous current_period_end`
   - `current_period_end = current_period_start + 1 month`
2. Continue looping while `now >= current_period_end`
3. Stop when:
   - `now < current_period_end` (subscription is current), OR
   - `periodsProcessed >= maxPeriodsPerSubscription`

### Idempotency
The simulation is **idempotent** and safe to rerun multiple times:
- A unique constraint on `(subscription_id, period_start, period_end)` prevents duplicate billing records
- If a billing record already exists for a given period, it is not recreated
- The subscription period is still advanced correctly

### Transactional Consistency
For each subscription:
- Billing record creation and subscription period advancement are performed within a database transaction
- If any write fails, the entire transaction is rolled back
- This ensures that billing records and subscription periods remain consistent

### Dry Run Mode
When `dryRun = true`:
- No billing records are created
- No subscription periods are updated
- The response shows what **would** happen if simulation ran

## Error Responses

| Status Code | Description |
|-------------|-------------|
| 200 | Billing simulation completed successfully |
| 400 | Invalid request parameters (validation error) |
| 404 | Subscription not found (when `subscriptionId` is provided) |
| 500 | Internal server error |

## Examples

### Example 1: Simulate Single Subscription
```bash
curl -X POST http://localhost:3000/billing/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptionId": "123e4567-e89b-12d3-a456-426614174000",
    "maxPeriodsPerSubscription": 12,
    "dryRun": false
  }'
```

### Example 2: Dry Run for All Subscriptions
```bash
curl -X POST http://localhost:3000/billing/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "maxSubscriptions": 100,
    "maxPeriodsPerSubscription": 12,
    "dryRun": true
  }'
```

### Example 3: Process Limited Subscriptions
```bash
curl -X POST http://localhost:3000/billing/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "maxSubscriptions": 10,
    "maxPeriodsPerSubscription": 6,
    "dryRun": false
  }'
```

## Performance Considerations
- When processing multiple subscriptions, the query is limited to `maxSubscriptions` to prevent memory issues
- Only eligible subscriptions (ACTIVE status with elapsed periods) are loaded
- Period advancement uses a loop with a safety bound (`maxPeriodsPerSubscription`) to prevent infinite loops
- Indexes on `subscriptions(status, current_period_end)` and `billing_events(subscription_id, period_end)` ensure efficient queries

## Payment Status Simulation
The current implementation uses **Option A** from the PRD:
- All billing records are marked as `PAID`
- This keeps the focus on period advancement and idempotency
- Future enhancements may add deterministic pseudo-random payment outcomes to simulate overdue scenarios

## Future Enhancements
- Scheduled/cron automation (currently manual-trigger only)
- Webhook notifications on billing record creation
- Integration with payment processors
- Proration for partial-month billing
- Dunning flows for unpaid invoices
- Refunds and credits
