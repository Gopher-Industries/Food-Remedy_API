# Services

This folder contains the app's service layer. Goals:

- Provide a single `apiClient` for REST calls (GET/POST/PUT) with timeout
- Normalize errors via `errorHandler.ts` so UI code receives predictable errors
- Provide `services/api/*` for network-facing services and `services/database/*` for low-level DAOs
- Keep `services/index.ts` for stable re-exports when appropriate

Backend checklist to confirm with backend team:

- Base URL and environment variable name (`EXPO_PUBLIC_API_BASE_URL` used by apiClient)
- Authentication scheme (Bearer token in `Authorization` header)
- Product endpoints and routes (e.g. `GET /products/:id`)
- Response body formats and error shapes (fields: `message`, `code`, etc.)
- Error status codes mapping and retry semantics
