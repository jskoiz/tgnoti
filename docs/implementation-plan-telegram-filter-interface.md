# Implementation Plan: Telegram Interactive Filter Management Interface

## Overview

This document outlines the implementation plan for the new interactive filter management interface in the Telegram bot. The implementation will follow the approach described in the ADR, creating a single `/filter` command that launches an interactive menu with buttons for different filter operations.

## Implementation Steps

### 1. Update Type Definitions

#### Update `src/types/telegram.ts`

Add new types for callback queries and inline keyboard markup:

```typescript
export interface CallbackQueryData {
  action: string;
  topicId: number;
  filterType?: string;
  filterValue?: string;
  page?: number;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
```

### 2. Enhance TopicFilterManager

#### Update `src/telegram/bot/TopicFilterManager.ts`

Add a new method to get comprehensive topic information:

```typescript
async getTopicInfo(topicId: number): Promise<string> {
  try {
    const filters = await this.getFilters(topicId);
    const groupedFilters = this.groupFiltersByType(filters);
    
    // Get topic name if available
    const topicName = this.getTopicName(topicId) || `Topic #${topicId}`;
    
    // Build info sections
    const sections = [
      `*${this.escapeMarkdown(topicName)}*`,
      '',
      `*Filter Summary:*`,
      `\\- Total Filters: ${filters.length}/${this.MAX_FILTERS_PER_TOPIC}`,
      `\\- User Filters: ${groupedFilters.user?.length || 0}`,
      `\\- Mention Filters: ${groupedFilters.mention?.length || 0}`,
      `\\- Keyword Filters: ${groupedFilters.keyword?.length || 0}`,
      ''
    ];
    
    // Add filter details
    if (filters.length > 0) {
      sections.push('*Current Filters:*');
      
      if (groupedFilters.user?.length) {
        sections.push('*Users:*');
        sections.push(groupedFilters.user.map(u => `\\- @${this.escapeMarkdown(u)}`).join('\n'));
        sections.push('');
      }
      
      if (groupedFilters.mention?.length) {
        sections.push('*Mentions:*');
        sections.push(groupedFilters.mention.map(m => `\\- @${this.escapeMarkdown(m)}`).join('\n'));
        sections.push('');
      }
      
      if (groupedFilters.keyword?.length) {
        sections.push('*Keywords:*');
        sections.push(groupedFilters.keyword.map(k => `\\- ${this.escapeMarkdown(k)}`).join('\n'));
      }
    } else {
      sections.push('*No filters configured for this topic.*');
    }
    
    return sections.join('\n');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    this.logger.error('Failed to get topic info', err);
    throw err;
  }
}

private groupFiltersByType(filters: TopicFilter[]): Record<FilterType, string[]> {
  return filters.reduce((acc, filter) => {
    if (!acc[filter.type]) {
      acc[filter.type] = [];
    }
    acc[filter.type].push(filter.value);
    return acc;
  }, {} as Record<FilterType, string[]>);
}

private escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

private getTopicName(topicId: number): string | undefined {
  // Look up topic name from config if available
  for (const [name, config] of Object.entries(TOPIC_CONFIG)) {
    if (config.id === topicId) {
      return name;
    }
  }
  return undefined;
}
```

### 3. Update TelegramBot Class

#### Modify `src/telegram/bot/telegramBot.ts`

1. Add new properties for managing interactive state:

```typescript
private userSessions: Map<number, {
  action: string;
  topicId: number;
  filterType?: string;
  messageId?: number;
  step: string;
}> = new Map();
```

2. Add the main filter command handler:

```typescript
// In setupCommands method
this.telegramBot.onText(/^\/filter$/, async (msg) => {
  if (!msg.message_thread_id) {
    await this.queueMessage({
      text: '❌ This command must be used in a topic',
      parse_mode: 'HTML'
    });
    return;
  }

  await this.sendFilterMenu(msg.chat.id, msg.message_thread_id);
});
```

3. Add method to send the filter menu:

```typescript
private async sendFilterMenu(chatId: number, threadId: number): Promise<void> {
  try {
    const keyboard = {
      inline_keyboard: [
        [{ text: "👁️ View Filters", callback_data: `filter_view_${threadId}` }],
        [{ text: "➕ Add Filter", callback_data: `filter_add_menu_${threadId}` }],
        [{ text: "➖ Remove Filter", callback_data: `filter_remove_menu_${threadId}` }],
        [{ text: "ℹ️ Filter Info", callback_data: `filter_info_${threadId}` }]
      ]
    };

    await this.telegramBot.sendMessage(chatId, "📋 *Filter Management*\nSelect an option:", {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard,
      message_thread_id: threadId
    });
  } catch (error) {
    this.logger.error('Failed to send filter menu', error as Error);
  }
}
```

4. Add callback query handler:

```typescript
// In initialize method, after other event handlers
this.telegramBot.on('callback_query', async (query) => {
  try {
    if (!query.data) return;
    
    if (query.data.startsWith('filter_')) {
      await this.handleFilterCallback(query);
    }
  } catch (error) {
    this.logger.error('Error handling callback query', error as Error);
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "An error occurred. Please try again.",
      show_alert: true
    });
  }
});
```

5. Add method to handle filter callbacks:

```typescript
private async handleFilterCallback(query: TelegramBotApi.CallbackQuery): Promise<void> {
  if (!query.data || !query.message) return;
  
  const parts = query.data.split('_');
  const action = parts[1]; // view, add_menu, remove_menu, info, etc.
  const topicId = parseInt(parts[parts.length - 1]);
  
  if (isNaN(topicId)) {
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "Invalid topic ID",
      show_alert: true
    });
    return;
  }
  
  // Handle different actions
  switch (action) {
    case 'view':
      await this.handleViewFilters(query, topicId);
      break;
    case 'add':
      await this.handleAddFilterType(query, topicId);
      break;
    case 'add_menu':
      await this.showAddFilterMenu(query, topicId);
      break;
    case 'remove_menu':
      await this.showRemoveFilterMenu(query, topicId);
      break;
    case 'remove':
      await this.handleRemoveFilter(query, topicId, parts);
      break;
    case 'info':
      await this.handleFilterInfo(query, topicId);
      break;
    default:
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: "Unknown action",
        show_alert: true
      });
  }
}
```

6. Implement the specific handler methods:

```typescript
private async handleViewFilters(query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
  try {
    const filters = await this.topicFilterManager.listFilters(topicId);
    
    await this.telegramBot.editMessageText(`📋 *Current Filters*\n\n${filters || 'No filters configured.'}`, {
      chat_id: query.message?.chat.id,
      message_id: query.message?.message_id,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Add Filter", callback_data: `filter_add_menu_${topicId}` }],
          [{ text: "➖ Remove Filter", callback_data: `filter_remove_menu_${topicId}` }],
          [{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]
        ]
      }
    });
    
    await this.telegramBot.answerCallbackQuery(query.id);
  } catch (error) {
    this.logger.error('Failed to handle view filters', error as Error);
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "Failed to load filters. Please try again.",
      show_alert: true
    });
  }
}

private async showAddFilterMenu(query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
  try {
    await this.telegramBot.editMessageText("Select filter type to add:", {
      chat_id: query.message?.chat.id,
      message_id: query.message?.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "👤 User", callback_data: `filter_add_type_user_${topicId}` }],
          [{ text: "@ Mention", callback_data: `filter_add_type_mention_${topicId}` }],
          [{ text: "🔤 Keyword", callback_data: `filter_add_type_keyword_${topicId}` }],
          [{ text: "🔙 Back", callback_data: `filter_back_${topicId}` }]
        ]
      }
    });
    
    await this.telegramBot.answerCallbackQuery(query.id);
  } catch (error) {
    this.logger.error('Failed to show add filter menu', error as Error);
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "Failed to load menu. Please try again.",
      show_alert: true
    });
  }
}

private async handleAddFilterType(query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
  if (!query.data || !query.from) return;
  
  const parts = query.data.split('_');
  if (parts.length < 5) return;
  
  const filterType = parts[3] as FilterType; // user, mention, keyword
  
  // Store session state for this user
  this.userSessions.set(query.from.id, {
    action: 'add',
    topicId,
    filterType,
    messageId: query.message?.message_id,
    step: 'waiting_for_value'
  });
  
  // Prompt for filter value
  let promptText = '';
  switch (filterType) {
    case 'user':
      promptText = "Please enter the Twitter username to add (with or without @):";
      break;
    case 'mention':
      promptText = "Please enter the Twitter username to track mentions for (with or without @):";
      break;
    case 'keyword':
      promptText = "Please enter the keyword to track:";
      break;
  }
  
  await this.telegramBot.editMessageText(promptText, {
    chat_id: query.message?.chat.id,
    message_id: query.message?.message_id,
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Cancel", callback_data: `filter_cancel_${topicId}` }]
      ]
    }
  });
  
  await this.telegramBot.answerCallbackQuery(query.id);
}

private async showRemoveFilterMenu(query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
  try {
    const filters = await this.topicFilterManager.getFilters(topicId);
    
    if (filters.length === 0) {
      await this.telegramBot.editMessageText("No filters to remove.", {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]
          ]
        }
      });
      
      await this.telegramBot.answerCallbackQuery(query.id);
      return;
    }
    
    // Group filters by type for better organization
    const groupedFilters = filters.reduce((acc, filter) => {
      if (!acc[filter.type]) {
        acc[filter.type] = [];
      }
      acc[filter.type].push(filter);
      return acc;
    }, {} as Record<FilterType, TopicFilter[]>);
    
    const keyboard: { text: string; callback_data: string }[][] = [];
    
    // Add user filters
    if (groupedFilters.user?.length) {
      keyboard.push([{ text: "👤 User Filters", callback_data: `filter_header_${topicId}` }]);
      
      for (const filter of groupedFilters.user) {
        keyboard.push([{
          text: `@${filter.value} ❌`,
          callback_data: `filter_remove_user_${filter.value}_${topicId}`
        }]);
      }
    }
    
    // Add mention filters
    if (groupedFilters.mention?.length) {
      keyboard.push([{ text: "@ Mention Filters", callback_data: `filter_header_${topicId}` }]);
      
      for (const filter of groupedFilters.mention) {
        keyboard.push([{
          text: `@${filter.value} ❌`,
          callback_data: `filter_remove_mention_${filter.value}_${topicId}`
        }]);
      }
    }
    
    // Add keyword filters
    if (groupedFilters.keyword?.length) {
      keyboard.push([{ text: "🔤 Keyword Filters", callback_data: `filter_header_${topicId}` }]);
      
      for (const filter of groupedFilters.keyword) {
        keyboard.push([{
          text: `${filter.value} ❌`,
          callback_data: `filter_remove_keyword_${filter.value}_${topicId}`
        }]);
      }
    }
    
    // Add back button
    keyboard.push([{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]);
    
    await this.telegramBot.editMessageText("Select a filter to remove:", {
      chat_id: query.message?.chat.id,
      message_id: query.message?.message_id,
      reply_markup: { inline_keyboard: keyboard }
    });
    
    await this.telegramBot.answerCallbackQuery(query.id);
  } catch (error) {
    this.logger.error('Failed to show remove filter menu', error as Error);
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "Failed to load filters. Please try again.",
      show_alert: true
    });
  }
}

private async handleRemoveFilter(
  query: TelegramBotApi.CallbackQuery, 
  topicId: number,
  parts: string[]
): Promise<void> {
  if (!query.from || parts.length < 5) return;
  
  const filterType = parts[2] as FilterType; // user, mention, keyword
  const filterValue = parts[3];
  
  try {
    const result = await this.topicFilterManager.removeFilter(
      topicId,
      { type: filterType, value: filterValue },
      query.from.id
    );
    
    if (result.success) {
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: `✅ Removed ${filterType} filter: ${filterValue}`,
        show_alert: true
      });
      
      // Refresh the remove filter menu
      await this.showRemoveFilterMenu(query, topicId);
    } else {
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: `❌ ${result.message}`,
        show_alert: true
      });
    }
  } catch (error) {
    this.logger.error('Failed to remove filter', error as Error);
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "Failed to remove filter. Please try again.",
      show_alert: true
    });
  }
}

private async handleFilterInfo(query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
  try {
    const topicInfo = await this.topicFilterManager.getTopicInfo(topicId);
    
    await this.telegramBot.editMessageText(topicInfo, {
      chat_id: query.message?.chat.id,
      message_id: query.message?.message_id,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]
        ]
      }
    });
    
    await this.telegramBot.answerCallbackQuery(query.id);
  } catch (error) {
    this.logger.error('Failed to handle filter info', error as Error);
    await this.telegramBot.answerCallbackQuery(query.id, {
      text: "Failed to load topic information. Please try again.",
      show_alert: true
    });
  }
}
```

7. Add message handler for filter value input:

```typescript
// In initialize method, after other event handlers
this.telegramBot.on('message', async (msg) => {
  // Handle existing message logic
  await this.handleMessage(msg);
  
  // Handle filter value input
  await this.handleFilterValueInput(msg);
});

private async handleFilterValueInput(msg: TelegramMessage): Promise<void> {
  if (!msg.from || !msg.text || !msg.message_thread_id) return;
  
  const session = this.userSessions.get(msg.from.id);
  if (!session || session.step !== 'waiting_for_value') return;
  
  // Clear the session
  this.userSessions.delete(msg.from.id);
  
  const { action, topicId, filterType } = session;
  
  if (action === 'add' && filterType) {
    let value = msg.text.trim();
    
    // Normalize username if needed
    if (filterType === 'user' || filterType === 'mention') {
      value = value.replace(/^@/, '');
    }
    
    try {
      const result = await this.topicFilterManager.addFilter(
        topicId,
        { type: filterType, value },
        msg.from.id
      );
      
      await this.queueMessage({
        text: result.success ? `✅ Added ${filterType} filter: ${value}` : `❌ ${result.message}`,
        parse_mode: 'HTML',
        message_thread_id: msg.message_thread_id
      });
      
      // Send a new filter menu
      await this.sendFilterMenu(msg.chat.id, msg.message_thread_id);
    } catch (error) {
      this.logger.error('Failed to add filter', error as Error);
      await this.queueMessage({
        text: '❌ Failed to add filter. Please try again later.',
        parse_mode: 'HTML',
        message_thread_id: msg.message_thread_id
      });
    }
  }
}
```

8. Update the help command to include the new filter interface:

```typescript
this.telegramBot.onText(/\/help/, async (msg) => {
  try {
    this.logger.debug('Received /help command');
    const helpText = [
      '*Available Commands*',
      '',
      '*General Commands:*',
      '/status \\- Check system status',
      '/help \\- Show this help message',
      '/user \\[username\\] \\- Get details about a Twitter user',
      '',
      '*Filter Management:*',
      '/filter \\- Open interactive filter management menu',
      '',
      '*Note:* Filter commands only work in topics\\.'
    ].join('\n');

    await this.queueMessage({
      text: helpText,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    });
  } catch (error) {
    this.logger.error('Failed to send help', error as Error);
  }
});
```

### 4. Update Command Registration

Update the command registration in the `initialize` method:

```typescript
await this.telegramBot.setMyCommands([
  { command: 'status', description: 'Check system status' },
  { command: 'help', description: 'Show help message' },
  { command: 'user', description: 'Get details about a Twitter user' },
  { command: 'filter', description: 'Manage filters for this topic' }
]);
```

## Testing Plan

1. **Unit Tests**:
   - Test filter type detection
   - Test session management
   - Test callback data parsing

2. **Manual Testing**:
   - Test the `/filter` command in different topics
   - Test adding filters of each type
   - Test removing filters
   - Test viewing filter information
   - Test error handling and edge cases

## Rollout Strategy

1. **Phase 1: Development**
   - Implement the new interface
   - Add comprehensive logging
   - Test in development environment

2. **Phase 2: Limited Release**
   - Deploy to production with feature flag
   - Enable for specific test topics
   - Gather feedback and metrics

3. **Phase 3: Full Release**
   - Enable for all topics
   - Monitor usage and performance