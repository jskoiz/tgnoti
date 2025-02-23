# Project Map - Source Code Overview

## Recommended Reorganization
The following files should be moved out of the src directory for better organization:

1. Move to /tests:
   - `src/core/MockAffiliateMonitor.ts` → `/tests/mocks/MockAffiliateMonitor.ts`
   - `src/scripts/test-telegram-format.ts` → `/tests/integration/test-telegram-format.ts`

2. Move to /examples (outside src):
   - All files in `src/examples/*` → `/examples/*`

3. Move to /tools:
   - `src/scripts/user-monitor.ts` → `/tools/user-monitor.ts`
   This is a standalone monitoring utility that should be separate from the core application.

## Configuration Redundancies
The following configuration redundancies should be addressed:

1. Rettiwt Client Initialization:
   - Remove duplicate initialization between `affiliate.ts` and `TwitterClient`
   - Consolidate into a single initialization point in `TwitterClient`

2. Container Configuration:
   - Merge `container.affiliate.ts` into main `container.ts`
   - Simplify dependency injection setup

3. Configuration Validation:
   - Consolidate validation logic from `twitter.ts` into `environment.ts`
   - Create a unified validation system

4. Topic Configuration:
   - Consolidate topic definitions from:
     * monitoring.ts
     * telegram.ts
     * telegram.types.ts
   - Create a single source of truth for topic configuration

5. Monitoring Configuration:
   - Move hardcoded group ID to environment variables
   - Clean up commented-out competitor mentions
   - Separate filter strategy implementations into their own file

6. Retry Settings:
   - Consolidate retry configurations from:
     * monitoring.ts (polling retry)
     * telegram.ts (message retry)
     * affiliate.ts (API retry)
   - Create a unified retry configuration system
## Entry Point
- `src/index.ts`: Main application entry point that:
  * Loads environment variables from .env file
  * Initializes the dependency injection container
  * Sets up graceful shutdown handlers:
    - SIGINT handling for clean termination
    - SIGTERM handling for container orchestration
    - Proper service cleanup sequence
  * Manages startup sequence:
    1. Container initialization with service bindings
    2. Environment validation and setup
    3. Telegram bot initialization and verification
    4. Twitter notifier startup and monitoring
  * Provides error handling for fatal startup issues
  * Maintains service references for cleanup
  * Manages base path configuration
  * Coordinates service lifecycle:
    - Proper initialization order
    - Dependency resolution
    - Graceful shutdown
    - Error propagation

## Bot Directory (`src/bot/`)
- `messageFormatter.ts`: Enhanced message formatter that:
  * Converts tweets into rich Telegram messages
  * Implements user information formatting with emojis
  * Handles engagement metrics display
  * Formats timestamps with relative time
  * Manages media indicators and link formatting
  * Creates interactive message buttons
  * Supports quoted tweet formatting

- `telegramBot.ts`: Sophisticated Telegram bot implementation that:
  * Integrates with circuit breaker for API fault tolerance
  * Manages command handling (status, help, affiliate tracking)
  * Implements topic-based message organization
  * Provides admin verification and permissions
  * Handles rate-limited message sending
  * Supports rich message formatting
  * Implements error recovery and retries

- `TopicManager.ts`: Manages Telegram topic organization:
  * Handles topic ID validation and mapping
  * Manages message thread routing
  * Provides topic creation and validation
  * Implements fallback handling

## Config Directory (`src/config/`)
- `affiliate.ts`: Configuration for affiliate tracking:
  * Defines affiliate tracking parameters
  * Sets monitoring intervals
  * Configures caching behavior
  * Defines affiliate types and rules

- `ConfigManager.ts`: Centralized configuration system that:
  * Implements configuration caching
  * Provides type-safe config access
  * Supports custom validation rules
  * Includes detailed validation messaging
  * Manages environment variables
  * Handles configuration initialization
  * Provides validation examples

- `container.affiliate.ts`: Affiliate-specific DI container:
  * Configures affiliate service bindings
  * Manages affiliate service lifecycle
  * Handles affiliate dependencies

- `container.ts`: Main dependency injection container:
  * Manages service lifecycles
  * Handles async initialization
  * Configures service bindings
  * Manages singleton instances
  * Provides service resolution

- `environment.ts`: Environment management that:
  * Implements strict validation rules for:
    - Telegram bot tokens
    - Group IDs
    - Twitter bearer tokens
    - Rettiwt API keys
  * Supports production/staging environments
  * Provides detailed validation feedback
  * Includes example configurations
  * Handles environment-specific logic

- `initialization.ts`: System initialization that:
  * Manages startup sequence
  * Handles dependency ordering
  * Validates system state
  * Initializes core services

- `monitoring.ts`: Monitoring configuration:
  * Defines metric collection rules
  * Configures logging levels
  * Sets up health checks
  * Manages monitoring intervals

- `telegram.ts`: Telegram-specific configuration:
  * Manages bot tokens and chat IDs
  * Configures rate limits
  * Sets up command definitions
  * Handles message formatting rules

- `twitter.ts`: Twitter API configuration:
  * Manages API credentials
  * Configures rate limiting
  * Sets up search parameters
  * Handles API version compatibility

## Core Directory (`src/core/`)
- `AffiliateMonitor.ts`: Implements organization affiliate tracking with sophisticated features:
  * Interval-based monitoring with configurable check periods
  * In-memory caching system with time-based invalidation
  * Change detection for affiliate additions/removals
  * Metrics tracking for monitoring and errors
  * Persistent storage integration for affiliate state
  * Automatic cleanup of stale monitoring intervals
  * Support for multiple concurrent organization monitoring

- `FilterPipeline.ts`: Implements a flexible message filtering system:
  * Dynamic filter registration and removal
  * Asynchronous filter chain execution
  * Per-filter metrics collection
  * Error handling with detailed logging
  * Filter result tracking and reporting
  * Support for custom filter functions
  * Pipeline initialization and cleanup

- `MessageProcessor.ts`: Coordinates message processing workflow:
  * Integration with FilterPipeline for message validation
  * Rate-limited message processing using RateLimitedQueue
  * Comprehensive error handling with ErrorHandler
  * Detailed metrics tracking for message flow
  * Graceful initialization and shutdown
  * Message lifecycle management
  * Processing status monitoring

- `RateLimitedQueue.ts`: Sophisticated rate limiting implementation:
  * Token bucket-style rate limiting
  * Asynchronous task queue processing
  * Dynamic rate adjustment capabilities
  * Non-blocking initialization
  * Precise timing control for request spacing
  * Queue size monitoring and metrics
  * Graceful queue draining on shutdown
  * Error resilient task processing

- `TweetMonitor.ts`: Implements Twitter monitoring service:
  * Configurable monitoring intervals
  * Integration with TwitterClient for tweet fetching
  * Metrics collection for monitoring activity
  * Error handling with automatic recovery
  * State management for monitoring status
  * Clean shutdown capabilities
  * Activity status reporting

- `TwitterNotifier.ts`: Core orchestration service that:
  * Manages the complete tweet processing lifecycle
  * Implements robust initialization sequence:
    - System time validation
    - Environment validation
    - Configuration loading
    - Storage verification
    - Telegram bot initialization
  * Processes new tweets with:
    - Date validation
    - Search window validation
    - Topic-based routing
    - Message formatting
    - Delivery confirmation
  * Implements error recovery:
    - Circuit breaker integration
    - Automatic retries
    - Fallback message formats
  * Maintains system health:
    - Processing metrics
    - Status monitoring
    - Resource cleanup
    - Storage management

## Twitter Directory (`src/twitter/`)
- `rettiwtKeyManager.ts`: API key management system that:
  * Handles API key rotation
  * Validates key formats
  * Manages key expiration
  * Implements key refresh logic
  * Provides key status monitoring

- `rettiwtSearchBuilder.ts`: Search query builder that:
  * Constructs complex search filters
  * Supports multiple search criteria
  * Handles parameter validation
  * Implements query optimization
  * Provides search result formatting

- `twitterClient.ts`: Robust Twitter API client that:
  * Implements circuit breaker protection
  * Manages rate limiting
  * Provides user details caching
  * Handles API error recovery
  * Supports affiliated account fetching
  * Implements exponential backoff
  * Manages API response parsing

## Utils Directory (`src/utils/`)
- `circuitBreaker.ts`: Circuit breaker implementation:
  * Configurable failure thresholds
  * Half-open state testing
  * Automatic recovery
  * Rate limit error handling
  * Status monitoring
  * Error tracking
  * Circuit state management

- `dateValidation.ts`: Date validation utilities:
  * Tweet timestamp validation
  * System time verification
  * Date range checking
  * Timezone handling
  * Format conversion

- `ErrorHandler.ts`: Error management system:
  * Custom error types
  * Error categorization
  * Logging integration
  * Recovery strategies
  * Error tracking

- `logger.ts`: Logging system:
  * Multiple severity levels
  * Structured logging
  * Context preservation
  * Error formatting
  * Debug information

- `messageValidator.ts`: Message validation:
  * Format verification
  * Content validation
  * Security checks
  * Size limitations
  * Character encoding

- `MetricsManager.ts`: Metrics collection:
  * Performance tracking
  * Error rate monitoring
  * System health metrics
  * Custom metric support
  * Metric aggregation

- `sanitizer.ts`: Input/output sanitization:
  * HTML escaping
  * URL sanitization
  * Input validation
  * Character encoding
  * Security filtering

- `typeGuards.ts`: TypeScript type guards:
  * Runtime type checking
  * Type validation
  * Custom type guards
  * Type inference helpers

## Storage Directory (`src/storage/`)
- `affiliateStorage.ts`: Affiliate data storage:
  * Persistent state management
  * Change tracking
  * Data validation
  * Cache management
  * State synchronization

- `messageStorage.ts`: Message storage system:
  * Message persistence
  * Metadata management
  * Query capabilities
  * Storage optimization
  * Data cleanup

- `storage.ts`: Base storage implementation:
  * File system integration
  * Data serialization
  * Error handling
  * Atomic operations
  * Storage validation

## Types Directory (`src/types/`)
- `affiliate.ts`: Type definitions for affiliate system:
  * Affiliate monitoring interfaces
  * Storage type definitions
  * Change tracking types
  * Client interfaces
  * Configuration types

- `di.ts`: Dependency injection type system:
  * Injection tokens
  * Service identifiers
  * Container types
  * Provider interfaces
  * Scope definitions

- `logger.ts`: Logging system types:
  * Logger interface
  * Log level definitions
  * Log entry types
  * Context types
  * Formatting options

- `messageStorage.ts`: Message storage types:
  * Storage interfaces
  * Message metadata types
  * Query types
  * Index definitions
  * Cache types

- `metrics.ts`: Metrics and monitoring types:
  * Metric definitions
  * Counter types
  * Gauge interfaces
  * Timer types
  * Label definitions

- `monitoring.ts`: Monitoring system types:
  * Health check interfaces
  * Status types
  * Alert definitions
  * Threshold types
  * Monitor configurations

- `rettiwt.ts`: Rettiwt API type definitions:
  * API response types
  * Request parameters
  * Error types
  * Rate limit types
  * API options

- `storage.ts`: Storage system types:
  * Storage interfaces
  * Data models
  * Query types
  * Transaction types
  * Cache definitions

- `telegram.ts`: Telegram integration types:
  * Bot configuration types:
    - Token and group settings
    - Retry configurations
    - Topic management
  * Message formatting:
    - HTML/Markdown options
    - Button definitions
    - Preview settings
  * Topic configuration:
    - Topic mappings
    - Fallback settings
    - Required topics
  * Message types:
    - Enhanced message options
    - Tweet message config
    - Button interfaces
    - Formatter interfaces

- `twitter.ts`: Twitter integration types:
  * Tweet data structures:
    - Core tweet properties
    - User information
    - Engagement metrics
    - Media types
  * Search configurations:
    - Query parameters
    - Filter options
    - Language settings
    - Time constraints
  * User types:
    - Basic user info
    - Verification status
    - Follower metrics
  * Affiliation types:
    - Organization metadata
    - Team member info
    - Verification types
  * GraphQL types:
    - Query variables
    - Feature flags
    - Response structures
  * Type mapping functions:
    - Rettiwt to internal formats
    - Safe type assertions
    - Entity mapping
