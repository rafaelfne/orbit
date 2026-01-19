# Orbit - Open Subscriptions API

A production-grade Open Subscriptions API built with NestJS, TypeScript, and PostgreSQL.

## Overview

The Orbit API provides functionality for managing subscription plans and billing. This is an MVP implementation focused on core subscription management features.

## Current Features

### Plans Management
- Create subscription plans with pricing and billing cadence
- Validation for plan data (name, price, currency, interval)
- Unique plan names with conflict detection
- Support for BRL and USD currencies (MVP)
- Monthly billing intervals (MVP)

### API Documentation
- OpenAPI 3.0 specification at `/openapi.json`
- Interactive API documentation via Scalar at `/docs`
- Full request/response schemas and examples

## Tech Stack

- **Framework**: NestJS 11.x
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 16 (via Docker)
- **ORM**: TypeORM 0.3.x
- **Validation**: class-validator, class-transformer
- **API Docs**: @nestjs/swagger, Scalar
- **Testing**: Jest (unit + E2E)
- **Package Manager**: pnpm

## Project Setup

### Prerequisites
- Node.js 18+ 
- pnpm
- Docker (for PostgreSQL)

### Installation

```bash
pnpm install
```

### Database Setup

Start the PostgreSQL database:

```bash
pnpm docker:up
```

Run migrations:

```bash
pnpm migration:run
```

Other database commands:
- `pnpm docker:down` - Stop database
- `pnpm docker:logs` - View database logs
- `pnpm docker:restart` - Restart database
- `pnpm docker:clean` - Clean volumes (⚠️ deletes data)

## Running the Application

```bash
# Development mode
pnpm start:dev

# Production mode
pnpm start:prod

# Build
pnpm build
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Plans

#### Create Plan
```bash
POST /plans
Content-Type: application/json

{
  "name": "Premium Plan",
  "priceCents": 9900,
  "currency": "USD",
  "interval": "MONTHLY"
}
```

**Response (201 Created):**
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

**Error Responses:**
- `400 Bad Request` - Validation error
- `409 Conflict` - Duplicate plan name

### Documentation

- **OpenAPI Specification**: `GET /openapi.json`
- **Interactive Docs (Scalar)**: `GET /docs`

## Testing

```bash
# Unit tests
pnpm test

# E2E tests (requires database)
pnpm test:e2e

# Test coverage
pnpm test:cov

# Watch mode
pnpm test:watch
```

## Code Quality

```bash
# Format code
pnpm format

# Lint code
pnpm lint
```

## Database Migrations

```bash
# Run pending migrations
pnpm migration:run

# Revert last migration
pnpm migration:revert
```

## Environment Variables

The application supports the following environment variables:

- `PORT` - API server port (default: 3000)
- `DATABASE_HOST` - PostgreSQL host (default: localhost)
- `DATABASE_PORT` - PostgreSQL port (default: 5432)
- `DATABASE_USER` - PostgreSQL user (default: orbit)
- `DATABASE_PASSWORD` - PostgreSQL password (default: orbit)
- `DATABASE_NAME` - PostgreSQL database (default: orbit)
- `NODE_ENV` - Environment (development/production)

## Project Structure

```
src/
├── config/              # Configuration files
│   ├── database.config.ts
│   └── typeorm.config.ts
├── migrations/          # Database migrations
├── modules/
│   └── plans/          # Plans module
│       ├── dto/        # Data Transfer Objects
│       ├── plan.entity.ts
│       ├── plans.controller.ts
│       ├── plans.service.ts
│       └── plans.module.ts
├── app.module.ts       # Root module
└── main.ts             # Application entry point

test/
├── *.e2e-spec.ts      # E2E tests
└── jest-e2e.json      # E2E test config

docs/
└── features/          # Feature documentation
    ├── plans.md
    └── api-documentation.md
```

## Development Guidelines

### NestJS-First Policy
Always use NestJS built-in features and official modules before implementing custom solutions:
- Validation: `ValidationPipe` + `class-validator`
- Configuration: `@nestjs/config`
- Database: `@nestjs/typeorm`
- API Docs: `@nestjs/swagger`

### Money Handling
- Always use integer cents for monetary values
- Never use floating-point for money calculations
- Store as `int` in database

### Timestamps
- Use `timestamptz` for all timestamps
- Store in UTC
- Let database handle defaults with `CURRENT_TIMESTAMP`

### Error Handling
- Map database errors to appropriate HTTP exceptions
- Never expose raw database errors to clients
- Use consistent error response format

## Documentation

Detailed feature documentation is available in `docs/features/`:
- [Plans](docs/features/plans.md) - Plans management
- [API Documentation](docs/features/api-documentation.md) - OpenAPI and Scalar setup

## Roadmap

Future enhancements planned:
- [ ] List plans with pagination (GET /plans)
- [ ] Get single plan (GET /plans/:id)
- [ ] Update plan (PATCH /plans/:id)
- [ ] Subscriptions management
- [ ] Billing simulation
- [ ] Additional currencies and intervals
- [ ] Idempotency keys

## License

UNLICENSED
