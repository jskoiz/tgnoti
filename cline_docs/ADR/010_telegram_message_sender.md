# ADR 010: Telegram Message Sender Implementation

## Context

The application had a circular dependency between TelegramBot, TelegramMessageQueue, and TwitterNotifier components:

```
TwitterNotifier -> TelegramBot -> TelegramMessageQueue -> TelegramBot
```

This circular dependency was causing initialization issues and making the codebase harder to maintain.

## Decision

We decided to:

1. Extract message sending logic into a dedicated TelegramMessageSender service
2. Make TelegramMessageQueue depend on TelegramMessageSender instead of TelegramBot
3. Keep TelegramBot focused on command handling and polling
4. Use interfaces to maintain loose coupling

The new dependency chain is linear:
```
TwitterNotifier -> TelegramBot -> TelegramMessageQueue -> TelegramMessageSender -> TelegramBotApi
```

## Implementation

1. Created ITelegramMessageSender interface and TelegramMessageSender implementation
2. Updated TelegramMessageQueue to use TelegramMessageSender
3. Modified TelegramBot to focus on command handling
4. Updated container configuration to bind TelegramBotApi and TelegramMessageSender

## Benefits

1. Eliminated circular dependencies
2. Better separation of concerns
3. More maintainable and testable code
4. Clearer component responsibilities:
   - TelegramBot: Commands and polling
   - TelegramMessageQueue: Message queueing and rate limiting
   - TelegramMessageSender: Actual message sending

## Consequences

1. Added one more layer of abstraction
2. Slightly more complex initial setup in container configuration
3. Better testability as components can be mocked independently

## Status

Implemented and resolved circular dependency issue.