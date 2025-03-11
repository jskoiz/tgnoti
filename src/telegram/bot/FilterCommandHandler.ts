import TelegramBotApi from 'node-telegram-bot-api';
import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { FilterType, TopicFilter } from '../../types/filters.js';
import { TopicFilterManager } from './TopicFilterManager.js';
import { TelegramMessage } from '../../types/telegram.js';

/**
 * Handles the interactive filter command functionality
 */
@injectable()
export class FilterCommandHandler {
  private userSessions: Map<number, {
    action: string;
    topicId: number;
    filterType?: string;
    messageId?: number;
    step: string;
  }> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TopicFilterManager) private topicFilterManager: TopicFilterManager
  ) {
    this.logger.setComponent('FilterCommandHandler');
  }

  /**
   * Registers the filter command and callback handlers with the Telegram bot
   */
  registerHandlers(telegramBot: TelegramBotApi): void {
    // Register the main filter command
    telegramBot.onText(/^\/filter(@\w+)?$/, async (msg) => {
      try {
        if (!msg.message_thread_id) {
          await telegramBot.sendMessage(msg.chat.id, '❌ This command must be used in a topic', {
            parse_mode: 'HTML'
          });
          return;
        }

        await this.sendFilterMenu(telegramBot, msg.chat.id, msg.message_thread_id);
      } catch (error) {
        this.logger.error('Failed to handle filter command', error as Error);
      }
    });

    // Register callback query handler for button interactions
    telegramBot.on('callback_query', async (query) => {
      try {
        if (!query.data || !query.data.startsWith('filter_')) return;
        
        this.logger.info(`Received callback query with data: ${query.data}`);
        this.logger.info(`Callback data length: ${query.data.length} bytes`);
        this.logger.info(`From user: ${query.from?.id}, chat: ${query.message?.chat.id}, message: ${query.message?.message_id}`);
        
        await this.handleFilterCallback(telegramBot, query);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error handling filter callback query: ${errorMessage}`, error as Error);
        this.logger.error(`Callback data: ${query.data}`);
        
        await telegramBot.answerCallbackQuery(query.id, {
          text: `Error: ${errorMessage.substring(0, 100)}`,
          show_alert: true
        });
      }
    });
  }

  /**
   * Handles message input for filter values
   */
  async handleFilterValueInput(telegramBot: TelegramBotApi, msg: TelegramMessage): Promise<void> {
    if (!msg.from || !msg.text || !msg.message_thread_id) return;
    
    this.logger.info(`Received message from user ${msg.from.id} in thread ${msg.message_thread_id}: ${msg.text}`);
    
    const session = this.userSessions.get(msg.from.id);
    this.logger.info(`User session: ${JSON.stringify(session)}`);
    
    if (!session || session.step !== 'waiting_for_value') return;
    
    // Clear the session
    this.userSessions.delete(msg.from.id);
    
    const { action, topicId, filterType } = session;
    
    this.logger.info(`Processing input with action: ${action}, topicId: ${topicId}, filterType: ${filterType}`);
    
    if (action === 'add' && filterType) {
      let value = msg.text.trim();
      
      // Normalize username if needed
      if (filterType === 'user' || filterType === 'mention') {
        value = value.replace(/^@/, '');
      }
      
      this.logger.info(`Adding filter: type=${filterType}, value=${value}, topicId=${topicId}`);
      
      try {
        // Create filter object
        const filterObj = { type: filterType as FilterType, value };
        this.logger.info(`Filter object for adding: ${JSON.stringify(filterObj)}`);
        
        const result = await this.topicFilterManager.addFilter(
          topicId,
          filterObj,
          msg.from.id
        );
        
        this.logger.info(`Add filter result: ${JSON.stringify(result)}`);
        
        await telegramBot.sendMessage(
          msg.chat.id,
          result.success ? `✅ Added ${filterType} filter: ${value}` : `❌ ${result.message}`,
          {
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id
          }
        );
        
        // Send a new filter menu
        await this.sendFilterMenu(telegramBot, msg.chat.id, msg.message_thread_id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to add filter: ${errorMessage}`, error as Error);
        this.logger.error(`Filter type: ${filterType}, Filter value: ${value}, Topic ID: ${topicId}`);
        
        await telegramBot.sendMessage(
          msg.chat.id,
          `❌ Failed to add filter: ${errorMessage.substring(0, 100)}`,
          {
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id
          }
        );
      }
    } else if (action === 'remove' && filterType) {
      let value = msg.text.trim();
      
      // Normalize username if needed
      if (filterType === 'user' || filterType === 'mention') {
        value = value.replace(/^@/, '');
      }
      
      this.logger.info(`Removing filter: type=${filterType}, value=${value}, topicId=${topicId}`);
      
      try {
        // Create filter object
        const filterObj = { type: filterType as FilterType, value };
        this.logger.info(`Filter object for removal: ${JSON.stringify(filterObj)}`);
        
        const result = await this.topicFilterManager.removeFilter(
          topicId,
          filterObj,
          msg.from.id
        );
        
        this.logger.info(`Remove filter result: ${JSON.stringify(result)}`);
        
        await telegramBot.sendMessage(
          msg.chat.id,
          result.success ? `✅ Removed ${filterType} filter: ${value}` : `❌ ${result.message}`,
          {
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id
          }
        );
        
        // Send a new filter menu
        await this.sendFilterMenu(telegramBot, msg.chat.id, msg.message_thread_id);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to remove filter: ${errorMessage}`, error as Error);
        this.logger.error(`Filter type: ${filterType}, Filter value: ${value}, Topic ID: ${topicId}`);
        
        await telegramBot.sendMessage(
          msg.chat.id,
          `❌ Failed to remove filter: ${errorMessage.substring(0, 100)}`,
          {
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id
          }
        );
      }
    }
  }

  /**
   * Sends the main filter menu
   */
  private async sendFilterMenu(telegramBot: TelegramBotApi, chatId: number, threadId: number): Promise<void> {
    try {
      const keyboard = {
        inline_keyboard: [
          [{ text: "👁️ View Filters & Info", callback_data: `filter_view_${threadId}` }],
          [{ text: "➕ Add Filter", callback_data: `filter_add_menu_${threadId}` }],
          [{ text: "➖ Remove Filter", callback_data: `filter_remove_menu_${threadId}` }]
        ]
      };

      await telegramBot.sendMessage(chatId, "📋 <b>Filter Management</b>\nSelect an option:", {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        message_thread_id: threadId
      });
    } catch (error) {
      this.logger.error('Failed to send filter menu', error as Error);
    }
  }

  /**
   * Handles callback queries from filter menu buttons
   */
  private async handleFilterCallback(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery): Promise<void> {
    if (!query.data || !query.message) return;
    
    // Log the raw callback data for debugging
    this.logger.info(`Processing callback data: ${query.data}`);
    this.logger.info(`Callback data length: ${query.data.length} bytes`);
    
    // Use regex to extract parts more reliably
    // Extract the action part (everything between "filter_" and the last "_NUMBER")
    const actionMatch = query.data.match(/^filter_(.+)_\d+$/);
    const topicIdMatch = query.data.match(/_(\d+)$/);
    
    if (!actionMatch || !topicIdMatch) {
      this.logger.error(`Invalid callback data format: ${query.data}`);
      await telegramBot.answerCallbackQuery(query.id, {
        text: "Invalid callback data format. Please try again.",
        show_alert: true
      });
      return;
    }
    
    // Extract the action part (everything between "filter_" and the last underscore)
    let action = '';
    if (actionMatch) {
      // For actions like view, info, back, cancel
      if (actionMatch[1].indexOf('_') === -1) {
        action = actionMatch[1];
      } else {
        // For actions like add_menu, add_type, remove_menu, remove
        const parts = actionMatch[1].split('_');
        if (parts[0] === 'add' && parts[1] === 'type') {
          action = 'add_type';
        } else if (parts[0] === 'add' && parts[1] === 'menu') {
          action = 'add_menu';
        } else if (parts[0] === 'remove' && parts[1] === 'menu') {
          action = 'remove_menu';
        } else if (parts[0] === 'remove' && parts.length > 2) {
          action = 'remove';
        } else {
          action = parts.join('_');
        }
      }
    }
    
    const topicId = parseInt(topicIdMatch[1]);
    
    this.logger.info(`Parsed action: ${action}, topicId: ${topicId}`);
    
    if (isNaN(topicId)) {
      this.logger.error(`Invalid topic ID in callback data: ${query.data}`);
      await telegramBot.answerCallbackQuery(query.id, {
        text: "Invalid topic ID. Please try again or contact support.",
        show_alert: true
      });
      return;
    }
    
    // Handle different actions
    switch (action) {
      case 'view':
        await this.handleViewFilters(telegramBot, query, topicId);
        break;
      case 'add_type':
        this.logger.info(`Handling add_type action with data: ${query.data}`);
        await this.handleAddFilterType(telegramBot, query, topicId);
        break;
      case 'add_menu':
        this.logger.info(`Handling add_menu action with data: ${query.data}`);
        await this.showAddFilterMenu(telegramBot, query, topicId);
        break;
      case 'remove_menu':
        this.logger.info(`Handling remove_menu action with data: ${query.data}`);
        await this.showRemoveFilterMenu(telegramBot, query, topicId);
        break;
      case 'remove_list':
        this.logger.info(`Handling remove_list action with data: ${query.data}`);
        await this.showRemoveFilterList(telegramBot, query, topicId);
        break;
      case 'remove_type':
        this.logger.info(`Handling remove_type action with data: ${query.data}`);
        await this.handleRemoveFilterByTyping(telegramBot, query, topicId);
        break;
      case 'remove':
        // For remove action, extract filter type and value using regex
        // The pattern needs to match filter_remove_TYPE_VALUE_TOPICID
        // where VALUE can contain encoded characters
        this.logger.info(`Processing remove action with data: ${query.data}`);
        
        // Check if this is just the remove menu button (not an actual remove action)
        if (query.data === `filter_remove_menu_${topicId}`) {
          this.logger.info(`This is the remove menu button, showing remove filter menu`);
          await this.showRemoveFilterMenu(telegramBot, query, topicId);
          break;
        }
        
        const removeMatch = query.data.match(/^filter_remove_([^_]+)_(.+)_\d+$/);
        this.logger.info(`Remove regex match result: ${JSON.stringify(removeMatch)}`);
        
        if (!removeMatch) {
          this.logger.error(`Invalid remove callback data: ${query.data}`);
          await telegramBot.answerCallbackQuery(query.id, {
            text: "Invalid remove format. Please try again.",
            show_alert: true
          });
          break;
        }
        
        const filterType = removeMatch[1] as FilterType;
        // Extract the value by removing the prefix and suffix
        const encodedValue = query.data.replace(`filter_remove_${filterType}_`, '').replace(`_${topicId}`, '');
        
        try {
          this.logger.debug(`Before decoding: encodedValue=${encodedValue}`);
          const filterValue = decodeURIComponent(encodedValue);
          this.logger.debug(`Extracted filter: type=${filterType}, encodedValue=${encodedValue}, decodedValue=${filterValue}`);
          
          // Check if the value might have been truncated (if it's at the 64-byte limit)
          if (query.data.length >= 64) {
            this.logger.warn(`Callback data may have been truncated: ${query.data.length} bytes`);
            // We'll still try to process it, but log a warning
          }
          
          this.logger.debug(`Calling handleRemoveFilter with: topicId=${topicId}, filterType=${filterType}, filterValue=${filterValue}`);
          await this.handleRemoveFilter(telegramBot, query, topicId, filterType, filterValue);
        } catch (error) {
          this.logger.error(`Failed to decode filter value: ${encodedValue}`, error as Error);
          await telegramBot.answerCallbackQuery(query.id, {
            text: "Invalid filter value encoding. Please try again.",
            show_alert: true
          });
        }
        break;
      case 'info':
        await this.handleFilterInfo(telegramBot, query, topicId);
        break;
      case 'back':
        await this.sendFilterMenu(telegramBot, query.message.chat.id, topicId);
        await telegramBot.answerCallbackQuery(query.id);
        break;
      case 'cancel':
        // Clear any pending session
        if (query.from) {
          this.userSessions.delete(query.from.id);
        }
        await this.sendFilterMenu(telegramBot, query.message.chat.id, topicId);
        await telegramBot.answerCallbackQuery(query.id, {
          text: "Operation cancelled",
          show_alert: true
        });
        break;
      default:
        this.logger.error(`Unknown action: ${action} in callback data: ${query.data}`);
        await telegramBot.answerCallbackQuery(query.id, {
          text: "Unknown action",
          show_alert: true
        });
    }
  }

  /**
   * Handles the "View Filters" action
   */
  private async handleViewFilters(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    try {
      const filters = await this.topicFilterManager.listFilters(topicId);
      const topicInfo = await this.topicFilterManager.getTopicInfo(topicId);
      
      // Combine filters and topic info
      const combinedInfo = `📋 <b>Current Filters</b>\n\n${filters || 'No filters configured.'}\n\n<b>Topic Information</b>\n${topicInfo}`;
      
      await telegramBot.editMessageText(combinedInfo, {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Add Filter", callback_data: `filter_add_menu_${topicId}` }],
            [{ text: "➖ Remove Filter", callback_data: `filter_remove_menu_${topicId}` }],
            [{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]
          ]
        }
      });
      
      await telegramBot.answerCallbackQuery(query.id);
    } catch (error) {
      this.logger.error('Failed to handle view filters', error as Error);
      await telegramBot.answerCallbackQuery(query.id, {
        text: "Failed to load filters. Please try again.",
        show_alert: true
      });
    }
  }

  /**
   * Shows the menu for adding a filter
   */
  private async showAddFilterMenu(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    try {
      await telegramBot.editMessageText("Select filter type to add:", {
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
      
      await telegramBot.answerCallbackQuery(query.id);
    } catch (error) {
      this.logger.error('Failed to show add filter menu', error as Error);
      await telegramBot.answerCallbackQuery(query.id, {
        text: "Failed to load menu. Please try again.",
        show_alert: true
      });
    }
  }

  /**
   * Handles the selection of a filter type to add
   */
  private async handleAddFilterType(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    this.logger.info(`handleAddFilterType called with topicId: ${topicId}`);
    
    if (!query.data || !query.from) {
      this.logger.error(`Invalid query data or sender: ${JSON.stringify({
        hasData: !!query.data,
        hasFrom: !!query.from,
        queryId: query.id
      })}`);
      return;
    }
    
    const parts = query.data.split('_');
    this.logger.info(`Query data parts: ${JSON.stringify(parts)}`);
    
    if (parts.length < 5) {
      this.logger.error(`Invalid query data format: parts.length = ${parts.length}, expected >= 5`);
      return;
    }
    
    const filterType = parts[3] as FilterType; // user, mention, keyword
    this.logger.info(`Selected filter type: ${filterType}`);
    
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
    
    await telegramBot.editMessageText(promptText, {
      chat_id: query.message?.chat.id,
      message_id: query.message?.message_id,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Cancel", callback_data: `filter_cancel_${topicId}` }]
        ]
      }
    });
    
    await telegramBot.answerCallbackQuery(query.id);
  }

  /**
   * Shows the menu for removing a filter
   */
  private async showRemoveFilterMenu(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    this.logger.info(`showRemoveFilterMenu called with topicId: ${topicId}`);
    
    // Telegram has a limit of 64 bytes for callback data
    const MAX_CALLBACK_DATA_LENGTH = 64;
    
    try {
      this.logger.info(`Getting filters for topic ${topicId}`);
      const filters = await this.topicFilterManager.getFilters(topicId);
      this.logger.info(`Got ${filters.length} filters for topic ${topicId}`);
      
      if (filters.length === 0) {
        this.logger.info(`No filters found for topic ${topicId}`);
        await telegramBot.editMessageText("No filters to remove.", {
          chat_id: query.message?.chat.id,
          message_id: query.message?.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]
            ]
          }
        });
        
        await telegramBot.answerCallbackQuery(query.id);
        return;
      }
      
      // Offer two options: list filters or type to remove
      const removeMenuKeyboard: TelegramBotApi.InlineKeyboardButton[][] = [
        [
          {
            text: "List All Filters",
            callback_data: `filter_remove_list_${topicId}`
          }
        ],
        [
          {
            text: "Type Filter to Remove",
            callback_data: `filter_remove_type_${topicId}`
          }
        ],
        [
          {
            text: "🔙 Back to Menu",
            callback_data: `filter_back_${topicId}`
          }
        ]
      ];
      
      await telegramBot.editMessageText("How would you like to remove a filter?", {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: removeMenuKeyboard
        }
      });
      
      await telegramBot.answerCallbackQuery(query.id);
      
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
          let userCallbackData = `filter_remove_user_${encodeURIComponent(filter.value)}_${topicId}`;
          
          // Check if callback data exceeds Telegram's limit
          if (userCallbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            // Truncate the encoded value to fit within the limit
            const prefix = `filter_remove_user_`;
            const suffix = `_${topicId}`;
            const maxValueLength = MAX_CALLBACK_DATA_LENGTH - prefix.length - suffix.length;
            const truncatedValue = encodeURIComponent(filter.value).substring(0, maxValueLength);
            userCallbackData = `${prefix}${truncatedValue}${suffix}`;
            this.logger.warn(`Truncated callback data for user filter: ${filter.value} (${userCallbackData.length} bytes)`);
          }
          
          this.logger.debug(`Creating user filter button: value=${filter.value}, callback=${userCallbackData} (${userCallbackData.length} bytes)`);
          keyboard.push([{
            text: `@${filter.value} ❌`,
            callback_data: userCallbackData
          }]);
        }
      }
      
      // Add mention filters
      if (groupedFilters.mention?.length) {
        keyboard.push([{ text: "@ Mention Filters", callback_data: `filter_header_${topicId}` }]);
        
        for (const filter of groupedFilters.mention) {
          let mentionCallbackData = `filter_remove_mention_${encodeURIComponent(filter.value)}_${topicId}`;
          
          // Check if callback data exceeds Telegram's limit
          if (mentionCallbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            // Truncate the encoded value to fit within the limit
            const prefix = `filter_remove_mention_`;
            const suffix = `_${topicId}`;
            const maxValueLength = MAX_CALLBACK_DATA_LENGTH - prefix.length - suffix.length;
            const truncatedValue = encodeURIComponent(filter.value).substring(0, maxValueLength);
            mentionCallbackData = `${prefix}${truncatedValue}${suffix}`;
            this.logger.warn(`Truncated callback data for mention filter: ${filter.value} (${mentionCallbackData.length} bytes)`);
          }
          
          this.logger.debug(`Creating mention filter button: value=${filter.value}, callback=${mentionCallbackData} (${mentionCallbackData.length} bytes)`);
          keyboard.push([{
            text: `@${filter.value} ❌`,
            callback_data: mentionCallbackData
          }]);
        }
      }
      
      // Add keyword filters
      if (groupedFilters.keyword?.length) {
        keyboard.push([{ text: "🔤 Keyword Filters", callback_data: `filter_header_${topicId}` }]);
        
        for (const filter of groupedFilters.keyword) {
          let keywordCallbackData = `filter_remove_keyword_${encodeURIComponent(filter.value)}_${topicId}`;
          
          // Check if callback data exceeds Telegram's limit
          if (keywordCallbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            // Truncate the encoded value to fit within the limit
            const prefix = `filter_remove_keyword_`;
            const suffix = `_${topicId}`;
            const maxValueLength = MAX_CALLBACK_DATA_LENGTH - prefix.length - suffix.length;
            const truncatedValue = encodeURIComponent(filter.value).substring(0, maxValueLength);
            keywordCallbackData = `${prefix}${truncatedValue}${suffix}`;
            this.logger.warn(`Truncated callback data for keyword filter: ${filter.value} (${keywordCallbackData.length} bytes)`);
          }
          
          this.logger.debug(`Creating keyword filter button: value=${filter.value}, callback=${keywordCallbackData} (${keywordCallbackData.length} bytes)`);
          keyboard.push([{
            text: `${filter.value} ❌`,
            callback_data: keywordCallbackData
          }]);
        }
      }
      
      // Add back button
      keyboard.push([{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]);
      
      await telegramBot.editMessageText("Select a filter to remove:", {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        reply_markup: { inline_keyboard: keyboard }
      });
      
      await telegramBot.answerCallbackQuery(query.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to show remove filter menu: ${errorMessage}`, error as Error);
      this.logger.error(`Topic ID: ${topicId}`);
      
      await telegramBot.answerCallbackQuery(query.id, {
        text: `Failed to load filters: ${errorMessage.substring(0, 100)}`,
        show_alert: true
      });
    }
  }

  /**
   * Handles the removal of a filter
   */
  private async handleRemoveFilter(
    telegramBot: TelegramBotApi,
    query: TelegramBotApi.CallbackQuery,
    topicId: number,
    filterType: FilterType,
    filterValue: string
  ): Promise<void> {
    if (!query.from) return;
    
    this.logger.info(`handleRemoveFilter called with: topicId=${topicId}, filterType=${filterType}, filterValue=${filterValue}`);
    
    try {
      // Log the filter object being sent to removeFilter
      const filterObj = { type: filterType, value: filterValue };
      this.logger.info(`Filter object for removal: ${JSON.stringify(filterObj)}`);
      
      const result = await this.topicFilterManager.removeFilter(
        topicId,
        filterObj,
        query.from.id
      );
      
      this.logger.debug(`Remove filter result: ${JSON.stringify(result)}`);
      
      if (result.success) {
        await telegramBot.answerCallbackQuery(query.id, {
          text: `✅ Removed ${filterType} filter: ${filterValue}`,
          show_alert: true
        });
        
        // Refresh the remove filter menu
        await this.showRemoveFilterMenu(telegramBot, query, topicId);
      } else {
        await telegramBot.answerCallbackQuery(query.id, {
          text: `❌ ${result.message}`,
          show_alert: true
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to remove filter: ${errorMessage}`, error as Error);
      this.logger.error(`Filter type: ${filterType}, Filter value: ${filterValue}, Topic ID: ${topicId}`);
      
      await telegramBot.answerCallbackQuery(query.id, {
        text: `Failed to remove filter: ${errorMessage.substring(0, 100)}`,
        show_alert: true
      });
    }
  }

  /**
   * Handles the "Filter Info" action
   */
  private async handleFilterInfo(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    try {
      const topicInfo = await this.topicFilterManager.getTopicInfo(topicId);
      
      await telegramBot.editMessageText(topicInfo, {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔙 Back to Menu", callback_data: `filter_back_${topicId}` }]
          ]
        }
      });
      
      await telegramBot.answerCallbackQuery(query.id);
    } catch (error) {
      this.logger.error('Failed to handle filter info', error as Error);
      await telegramBot.answerCallbackQuery(query.id, {
        text: "Failed to load topic information. Please try again.",
        show_alert: true
      });
    }
  }

  /**
   * Shows a list of all filters for removal
   */
  private async showRemoveFilterList(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    this.logger.info(`showRemoveFilterList called with topicId: ${topicId}`);
    
    // Telegram has a limit of 64 bytes for callback data
    const MAX_CALLBACK_DATA_LENGTH = 64;
    
    try {
      this.logger.info(`Getting filters for topic ${topicId}`);
      const filters = await this.topicFilterManager.getFilters(topicId);
      this.logger.info(`Got ${filters.length} filters for topic ${topicId}`);
      
      if (filters.length === 0) {
        this.logger.info(`No filters found for topic ${topicId}`);
        await telegramBot.editMessageText("No filters to remove.", {
          chat_id: query.message?.chat.id,
          message_id: query.message?.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔙 Back", callback_data: `filter_remove_menu_${topicId}` }]
            ]
          }
        });
        
        await telegramBot.answerCallbackQuery(query.id);
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
      
      const listKeyboard: { text: string; callback_data: string }[][] = [];
      
      // Add user filters
      if (groupedFilters.user?.length) {
        listKeyboard.push([{ text: "👤 User Filters", callback_data: `filter_header_${topicId}` }]);
        
        for (const filter of groupedFilters.user) {
          let userCallbackData = `filter_remove_user_${encodeURIComponent(filter.value)}_${topicId}`;
          
          // Check if callback data exceeds Telegram's limit
          if (userCallbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            // Truncate the encoded value to fit within the limit
            const prefix = `filter_remove_user_`;
            const suffix = `_${topicId}`;
            const maxValueLength = MAX_CALLBACK_DATA_LENGTH - prefix.length - suffix.length;
            const truncatedValue = encodeURIComponent(filter.value).substring(0, maxValueLength);
            userCallbackData = `${prefix}${truncatedValue}${suffix}`;
            this.logger.warn(`Truncated callback data for user filter: ${filter.value} (${userCallbackData.length} bytes)`);
          }
          
          this.logger.debug(`Creating user filter button: value=${filter.value}, callback=${userCallbackData} (${userCallbackData.length} bytes)`);
          listKeyboard.push([{
            text: `@${filter.value} ❌`,
            callback_data: userCallbackData
          }]);
        }
      }
      
      // Add mention filters
      if (groupedFilters.mention?.length) {
        listKeyboard.push([{ text: "@ Mention Filters", callback_data: `filter_header_${topicId}` }]);
        
        for (const filter of groupedFilters.mention) {
          let mentionCallbackData = `filter_remove_mention_${encodeURIComponent(filter.value)}_${topicId}`;
          
          // Check if callback data exceeds Telegram's limit
          if (mentionCallbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            // Truncate the encoded value to fit within the limit
            const prefix = `filter_remove_mention_`;
            const suffix = `_${topicId}`;
            const maxValueLength = MAX_CALLBACK_DATA_LENGTH - prefix.length - suffix.length;
            const truncatedValue = encodeURIComponent(filter.value).substring(0, maxValueLength);
            mentionCallbackData = `${prefix}${truncatedValue}${suffix}`;
            this.logger.warn(`Truncated callback data for mention filter: ${filter.value} (${mentionCallbackData.length} bytes)`);
          }
          
          this.logger.debug(`Creating mention filter button: value=${filter.value}, callback=${mentionCallbackData} (${mentionCallbackData.length} bytes)`);
          listKeyboard.push([{
            text: `@${filter.value} ❌`,
            callback_data: mentionCallbackData
          }]);
        }
      }
      
      // Add keyword filters
      if (groupedFilters.keyword?.length) {
        listKeyboard.push([{ text: "🔤 Keyword Filters", callback_data: `filter_header_${topicId}` }]);
        
        for (const filter of groupedFilters.keyword) {
          let keywordCallbackData = `filter_remove_keyword_${encodeURIComponent(filter.value)}_${topicId}`;
          
          // Check if callback data exceeds Telegram's limit
          if (keywordCallbackData.length > MAX_CALLBACK_DATA_LENGTH) {
            // Truncate the encoded value to fit within the limit
            const prefix = `filter_remove_keyword_`;
            const suffix = `_${topicId}`;
            const maxValueLength = MAX_CALLBACK_DATA_LENGTH - prefix.length - suffix.length;
            const truncatedValue = encodeURIComponent(filter.value).substring(0, maxValueLength);
            keywordCallbackData = `${prefix}${truncatedValue}${suffix}`;
            this.logger.warn(`Truncated callback data for keyword filter: ${filter.value} (${keywordCallbackData.length} bytes)`);
          }
          
          this.logger.debug(`Creating keyword filter button: value=${filter.value}, callback=${keywordCallbackData} (${keywordCallbackData.length} bytes)`);
          listKeyboard.push([{
            text: `${filter.value} ❌`,
            callback_data: keywordCallbackData
          }]);
        }
      }
      
      // Add back button
      listKeyboard.push([{ text: "🔙 Back", callback_data: `filter_remove_menu_${topicId}` }]);
      
      await telegramBot.editMessageText("Select a filter to remove:", {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        reply_markup: { inline_keyboard: listKeyboard }
      });
      
      await telegramBot.answerCallbackQuery(query.id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to show remove filter list: ${errorMessage}`, error as Error);
      this.logger.error(`Topic ID: ${topicId}`);
      
      await telegramBot.answerCallbackQuery(query.id, {
        text: `Failed to load filters: ${errorMessage.substring(0, 100)}`,
        show_alert: true
      });
    }
  }
  
  /**
   * Handles the removal of a filter by typing the filter value
   */
  private async handleRemoveFilterByTyping(telegramBot: TelegramBotApi, query: TelegramBotApi.CallbackQuery, topicId: number): Promise<void> {
    if (!query.from) return;
    
    this.logger.info(`handleRemoveFilterByTyping called with topicId: ${topicId}`);
    
    try {
      // Show filter type selection first
      await telegramBot.editMessageText("Select the type of filter to remove:", {
        chat_id: query.message?.chat.id,
        message_id: query.message?.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 User", callback_data: `filter_remove_type_user_${topicId}` }],
            [{ text: "@ Mention", callback_data: `filter_remove_type_mention_${topicId}` }],
            [{ text: "🔤 Keyword", callback_data: `filter_remove_type_keyword_${topicId}` }],
            [{ text: "🔙 Back", callback_data: `filter_remove_menu_${topicId}` }]
          ]
        }
      });
      
      await telegramBot.answerCallbackQuery(query.id);
      
      // If the callback data includes the filter type, set up a session for the user to type the value
      if (query.data) {
        const typeMatch = query.data.match(/filter_remove_type_([^_]+)_\d+$/);
        if (typeMatch) {
          const filterType = typeMatch[1] as FilterType;
          
          // Store session state for this user
          this.userSessions.set(query.from.id, {
            action: 'remove',
            topicId,
            filterType,
            messageId: query.message?.message_id,
            step: 'waiting_for_value'
          });
          
          // Prompt for filter value
          let promptText = '';
          switch (filterType) {
            case 'user':
              promptText = "Please enter the Twitter username to remove (with or without @):";
              break;
            case 'mention':
              promptText = "Please enter the Twitter username mention to remove (with or without @):";
              break;
            case 'keyword':
              promptText = "Please enter the keyword to remove:";
              break;
          }
          
          await telegramBot.editMessageText(promptText, {
            chat_id: query.message?.chat.id,
            message_id: query.message?.message_id,
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔙 Cancel", callback_data: `filter_cancel_${topicId}` }]
              ]
            }
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to handle remove filter by typing: ${errorMessage}`, error as Error);
      
      await telegramBot.answerCallbackQuery(query.id, {
        text: `Error: ${errorMessage.substring(0, 100)}`,
        show_alert: true
      });
    }
  }
}