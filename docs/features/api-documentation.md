# API Documentation

## Overview
The Open Subscriptions API uses OpenAPI 3.0 for API documentation and Scalar for the interactive documentation UI.

## OpenAPI Specification

The API provides a machine-readable OpenAPI specification at:

**GET /openapi.json**

This endpoint returns the complete OpenAPI 3.0 specification in JSON format, including:
- All available endpoints
- Request/response schemas
- Validation rules
- Error responses
- Example payloads

## Interactive Documentation (Scalar)

Interactive API documentation is available at:

**GET /docs**

The documentation UI is powered by [Scalar](https://scalar.com/), which provides:
- Beautiful, modern interface
- Interactive API exploration
- Request/response examples
- "Try it out" functionality
- Auto-generated code samples in multiple languages
- Dark/light mode support

## Implementation Details

### NestJS Integration
The API documentation is implemented using:
- `@nestjs/swagger` - Official NestJS OpenAPI module
- `@scalar/nestjs-api-reference` - Scalar integration for NestJS

### Configuration
The OpenAPI document is configured in `src/main.ts`:
- **Title**: Open Subscriptions API
- **Description**: API for managing subscription plans and billing
- **Version**: 1.0

### API Decorators
All endpoints use OpenAPI decorators to provide rich documentation:
- `@ApiTags()` - Groups endpoints by resource
- `@ApiOperation()` - Describes endpoint purpose
- `@ApiResponse()` - Documents response codes and schemas
- `@ApiProperty()` - Documents DTO properties with examples

### Example Usage

#### View OpenAPI Specification
```bash
curl http://localhost:3000/openapi.json
```

#### Access Interactive Documentation
Open your browser to:
```
http://localhost:3000/docs
```

## Best Practices

1. **Keep Documentation Updated**: OpenAPI docs are generated from code, so decorators should always match implementation
2. **Provide Examples**: Use realistic examples in `@ApiProperty()` decorators
3. **Document All Responses**: Include all possible HTTP status codes
4. **Use Descriptions**: Add clear descriptions to endpoints and properties
5. **Group Related Endpoints**: Use `@ApiTags()` to organize endpoints logically

## Adding New Endpoints

When adding new endpoints to the API:

1. Add appropriate OpenAPI decorators to the controller:
   ```typescript
   @ApiTags('resource-name')
   @Controller('resource-name')
   export class ResourceController {
     @Post()
     @ApiOperation({ summary: 'Create a new resource' })
     @ApiResponse({ status: 201, description: 'Created', type: ResourceDto })
     @ApiResponse({ status: 400, description: 'Bad request' })
     async create(@Body() dto: CreateResourceDto) {
       // ...
     }
   }
   ```

2. Add `@ApiProperty()` decorators to DTOs:
   ```typescript
   export class CreateResourceDto {
     @ApiProperty({
       description: 'Resource name',
       example: 'Example Name',
       minLength: 3,
       maxLength: 80,
     })
     @IsString()
     name: string;
   }
   ```

3. Verify documentation by:
   - Checking `/openapi.json` includes the new endpoint
   - Confirming it appears in `/docs` with correct details
   - Testing the "Try it out" functionality

## References

- [NestJS OpenAPI Documentation](https://docs.nestjs.com/openapi/introduction)
- [Scalar Documentation](https://scalar.com/products/api-references/openapi)
- [Scalar NestJS Integration](https://scalar.com/products/api-references/integrations/nestjs)
- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
