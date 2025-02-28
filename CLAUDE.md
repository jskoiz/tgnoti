# CLAUDE.md - Dev Reference for Twitter-Telegram Notification Bridge

## Build & Run Commands
- `npm run build`: Build the TypeScript project
- `npm run start`: Run the built application
- `npm run dev`: Run in development mode with watch/reload
- `npm run lint`: Run ESLint on TypeScript files
- `npm run format`: Format code with Prettier
- `npm test`: Run Jest tests
- `npx jest <testname>`: Run specific test

## Code Style
- **Architecture**: Use dependency injection with inversify
- **Naming**: PascalCase for classes/interfaces, camelCase for variables/functions
- **Imports**: Sort imports by category (core/types/implementation)
- **Types**: Strict typing with interfaces for all components
- **Error Handling**: Use custom error classes from ErrorHandler
- **Logging**: Use LogService with appropriate levels and correlation IDs
- **Documentation**: JSDoc comments for public interfaces and complex methods
- **Error Chain**: Always propagate original error context

## Pattern Guidelines
- Prefer composition over inheritance
- Use pipeline pattern for data processing
- Use event-based architecture for decoupling
- Implement circuit breakers for external services
- Correlation IDs for tracing requests through the system