import { LogEntry } from '../LogService.js';
import { ColorFormatter } from '../../utils/colors.js';
import { TweetMetadata } from '../../types/telegram.js';

/**
 * LogTransport interface - Defines the contract for log transports
 * 
 * Log transports are responsible for delivering log entries to their destination,
 * such as the console, a file, or an external service.
 */
export interface LogTransport {
  /**
   * Log an entry to the transport
   * 
   * @param entry The log entry to be logged
   */
  log(entry: LogEntry): void;
  
  /**
   * Flush any buffered log entries
   * 
   * @returns A promise that resolves when the flush is complete
   */
  flush(): Promise<void>;
}

/**
 * Console Transport - Outputs logs to the console
 */
export class ConsoleTransport implements LogTransport {
  private readonly useColors: boolean;
  private readonly format: 'json' | 'text';
  private readonly formatter: ColorFormatter;
  private pendingRejections: Map<string, { count: number, usernames: string[] }>;
  private currentSearchType: string | null;
  private flushTimeoutId: NodeJS.Timeout | null = null;
  private readonly quietMode: boolean;
  
  constructor(options: { useColors?: boolean; format?: 'json' | 'text'; quietMode?: boolean } = {}) {
    this.useColors = options.useColors ?? true;
    this.format = options.format ?? 'text';
    this.formatter = new ColorFormatter(this.useColors);
    this.quietMode = options.quietMode ?? false;
    // Initialize collections
    this.currentSearchType = null;
    this.pendingRejections = new Map();
  }
  
  log(entry: LogEntry): void {
    // Add log category prefix based on component and message
    if (this.format === 'text' && !entry.message.startsWith('[')) {
      if (entry.component === 'TweetProcessor') entry.message = `[PROC] ${entry.message}`;
      else if (entry.message.includes('pipeline') || entry.message.includes('Pipeline')) entry.message = `[PIPE] ${entry.message}`;
      else if (entry.message.includes('stage') || entry.message.includes('Stage')) entry.message = `[STAGE] ${entry.message}`;
      else if (entry.message.includes('search') || entry.message.includes('Search')) entry.message = `[SRCH] ${entry.message}`;
      else if (entry.message.includes('kol_monitoring')) {
        this.currentSearchType = 'kol';
        entry.message = `[KOL] ${entry.message.replace('kol_monitoring', '')}`;
      } else if (entry.message.includes('competitor_mentions')) {
        this.currentSearchType = 'mentions';
        entry.message = `[MENTIONS] ${entry.message.replace('competitor_mentions', '')}`;
      } else if (entry.message.includes('competitor_tweets')) {
        this.currentSearchType = 'tweets';
        entry.message = `[TWEETS] ${entry.message.replace('competitor_tweets', '')}`;
      }
      else if (entry.message.includes('valid') || entry.message.includes('Valid')) entry.message = `[VALD] ${entry.message}`;
    }
    
    const formatted = this.format === 'json' 
      ? JSON.stringify(entry)
      : this.formatText(entry);
    
    if (formatted === undefined) return; // Skip filtered messages
    
    switch (entry.level) {
      case 0: // ERROR
        console.error(formatted);
        break;
      case 1: // WARN
        console.warn(formatted);
        break;
      case 3: // DEBUG
        console.debug(formatted);
        break;
      default: // INFO and others
        console.log(formatted);
    }
  }
  
  flush(): Promise<void> {
    return Promise.resolve();
  }
  
  // Flush pending rejections and output a combined message
  private flushPendingRejections(): void {
    if (this.pendingRejections.size === 0) return;
    
    for (const [reason, data] of this.pendingRejections.entries()) {
      if (data.count > 0) {
        const usernames = data.usernames.slice(0, 3).join(', ');
        const additionalCount = data.usernames.length > 3 ? ` and ${data.usernames.length - 3} more` : '';
        
        // Format the combined rejection message
        const date = new Date();
        const timestamp = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        
        let message = `[${timestamp}] [Main] ${this.formatter.red('[REJECTED]')} ${data.count} tweets outside time window`;
        if (usernames) {
          message += ` from @${usernames}${additionalCount}`;
        }
        message += ` (${reason})`;
        
        console.log(message);
      }
    }
    
    // Clear the pending rejections
    this.pendingRejections.clear();
    
    // Clear the timeout ID
    this.flushTimeoutId = null;
  }
  
  // Helper method to add a tweet rejection to the pending list
  private addRejection(reason: string, username: string): void {
    if (!this.pendingRejections.has(reason)) {
      this.pendingRejections.set(reason, { count: 0, usernames: [] });
    }
    
    const data = this.pendingRejections.get(reason)!;
    data.count++;
    
    if (!data.usernames.includes(username) && data.usernames.length < 10) {
      data.usernames.push(username);
    }
    
    // Schedule a flush if not already scheduled
    if (!this.flushTimeoutId) {
      this.flushTimeoutId = setTimeout(() => {
        this.flushPendingRejections();
      }, 2000); // Flush after 2 seconds of inactivity
    }
  }
  
  // Get a colored tag based on the current search type
  private getSearchTypeTag(): string {
    switch (this.currentSearchType) {
      case 'kol':
        return this.formatter.green('[KOL]');
      case 'mentions':
        return this.formatter.yellow('[MENTIONS]');
      case 'tweets':
        return this.formatter.blue('[TWEETS]');
      default:
        return this.formatter.cyan('[SEARCH]');
    }
  }
  
  private formatText(entry: LogEntry): string | undefined {
    // Format timestamp as [MM-DD HH:mm:ss] with color
    const date = new Date(entry.timestamp);
    // Simplified timestamp format (HH:MM)
    const timestamp = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    // Skip detailed time window check messages
    if (entry.component === 'Main' && entry.message.includes('Time window check for tweet')) {
      return undefined;
    }
    
    // Skip "Future system date detected" messages
    if (entry.component === 'Main' && entry.message.includes('Future system date detected')) {
      return undefined;
    }
    
    // Skip "Found X tweets for account" messages as they're redundant
    if (entry.component === 'Main' && entry.message.match(/Found \d+ tweets for account/)) {
      return undefined;
    }
    
    // In quiet mode, only show important messages
    if (this.quietMode) {
      // Always show startup messages
      const isStartupMessage =
        entry.message.includes('Starting') ||
        entry.message.includes('Initializing') ||
        entry.message.includes('Configuration loaded') ||
        entry.message.includes('Connected to');
      
      // Always show cycle start/end messages
      const isCycleMessage =
        entry.message.includes('[CYCLE') ||
        entry.message.includes('cycle started') ||
        entry.message.includes('cycle completed');
      
      // Always show search execution messages
      const isSearchMessage =
        entry.message.includes('[SEARCH]') ||
        entry.message.includes('Searching');
      
      // Always show tweet found/not found messages
      const isTweetFoundMessage =
        entry.message.includes('[TWEET FOUND]') ||
        entry.message.includes('[TWEET PROCESSING SUCCESS]');
      
      // Always show rate limit messages
      const isRateLimitMessage =
        entry.message.includes('Rate limit') ||
        entry.message.includes('rate limit');
      
      // Always show error messages
      const isErrorMessage = entry.level === 0;
      
      // Skip messages that don't match our criteria in quiet mode
      if (!isStartupMessage && !isCycleMessage && !isSearchMessage &&
          !isTweetFoundMessage && !isRateLimitMessage && !isErrorMessage) {
        return undefined;
      }
    }
    
    const component = entry.component;
    const correlationId = entry.correlationId ? ` [${entry.correlationId}]` : '';
    
    // Special formatting for cycle completion messages
    if (entry.message.includes('[CYCLE COMPLETE]')) {
      // Extract the message part after the marker
      const markerIndex = entry.message.indexOf('[CYCLE COMPLETE]');
      const marker = entry.message.substring(markerIndex, markerIndex + 16); // '[CYCLE COMPLETE]'
      const baseMessage = entry.message.replace('[CYCLE COMPLETE]', '').trim();
      
      return this.formatter.formatLogComponents({
        timestamp: String(timestamp),
        component: String(component),
        message: `${this.formatter.cycleComplete(marker)} ${baseMessage}`
      });
    }
    
    // Filter out specific messages from TweetProcessor
    if (component === 'TweetProcessor') {
      if (entry.message.includes('Processing search window')) return undefined;
      // Filter out verbose tweet processing logs
      if (entry.message.includes('Processing tweet') && entry.message.includes('for topic')) return undefined;
      if (entry.message.includes('does not match filters for topic')) return undefined;
      if (entry.message.includes('is a duplicate')) return undefined;
    }
    
    // Filter out specific messages from TwitterNotifier
    if (component === 'TwitterNotifier') {
      if (entry.message.includes('Processing search window')) return undefined;
    }
    
    // Filter out verbose tweet search logs from TweetMonitor
    if (component === 'TweetMonitor') {
      if (entry.message.includes('Searching tweets for account:')) return undefined;
      if (entry.message.includes('Found') && entry.message.includes('tweets for account')) return undefined;
    }
    
    // Filter out verbose logs from Main component
    if (component === 'Main') {
      if (entry.message.includes('Processing tweet') && entry.message.includes('for topic')) return undefined;
      if (entry.message.includes('does not match filters for topic')) return undefined;
    }
    
    // Process tweet rejection messages
    if (component === 'Main' && entry.message.includes('[TWEET PROCESSING REJECTED]')) {
      const tweetIdMatch = entry.message.match(/Tweet (\d+) from @([^\s]+)/);
      if (tweetIdMatch) {
        const username = tweetIdMatch[2];
        this.addRejection('time window', username);
        return undefined; // Skip individual rejection messages
      }
    }
    
    // Special formatting for TelegramMessageSender logs
    if (component === 'TelegramMessageSender') {
      if (entry.message.includes('Message sent successfully')) return undefined;
      if (entry.message.includes('Processing cycle complete')) return undefined;
      if (entry.message.includes('Cleaned up')) return undefined;
      if (entry.message.includes('Attempting to send Telegram message')) return undefined;
      if (entry.message.includes('Processing message')) return undefined;
      if (entry.message.includes('Error details')) return undefined;
      if (entry.message.includes('Rate limit hit setting retry after')) return undefined;
      if (entry.message.includes('Rate limit hit Telegram suggests waiting')) return undefined;
      if (entry.message.includes('Increased message sending delay')) return undefined;
      if (entry.message.includes('Initializing rate-limited queue')) return undefined;
      if (entry.message.includes('Environment validation successful')) return undefined;
      if (entry.message.includes('Configuration loaded successfully')) return undefined;
      if (entry.message.includes('Initializing API keys')) return undefined;
      if (entry.message.includes('Rate limit updated with safety factor')) return undefined;
      if (entry.message.includes('Successfully initialized filters')) return undefined;
      if (entry.message.includes('System time validated')) return undefined;
      // Add filtering for additional verbose messages
      if (entry.message.includes('Processing search window')) return undefined;
      if (entry.message.includes('Processing cycle complete')) return undefined;
      if (entry.message.includes('Topic Configuration')) return undefined;
      if (entry.message.includes('duplicate_check passed')) return undefined;
      if (entry.message.includes('Rate limit calculation')) return undefined;

      if (entry.message.includes('Search window')) {
        const account = String(entry.data?.object?.account || '');
        const window = String(entry.data?.object?.window || '').replace(/\s*PM\s*-\s*/, ' - ');
        return this.formatter.formatLogComponents({
          timestamp: String(timestamp),
          component: String(component),
          message: `Searching: ${account} (${window})`.trim()
        });
      }

      if (entry.message.includes('📨 Tweet Routing')) {
        if (entry.data) {
          return this.formatter.formatLogComponents({
            timestamp: String(timestamp),
            component: String(component),
            message: `📨 ${entry.data.topicName} (${entry.data.topicId}): ${entry.data.author} - ${entry.data.tweetText || ''}`,
            details: entry.data.matchReason ? this.formatter.gray(`[${entry.data.matchReason}]`) : undefined,
            url: entry.data.url ? this.formatter.gray(`(${entry.data.url})`) : undefined
          });
        }
        return this.formatter.formatLogComponents({
          timestamp: String(timestamp),
          component: String(component),
          message: entry.message
        });
      }
    }
    
    // Color-code search-related messages
    if (entry.message && entry.message.includes('[SEARCH]')) {
      entry.message = entry.message.replace('[SEARCH]', this.getSearchTypeTag());
    }
    
    // Color-code search result messages
    if (entry.message && entry.message.includes('[SEARCH RESULT]')) {
      entry.message = entry.message.replace('[SEARCH RESULT]', this.getSearchTypeTag());
    }
    
    // Special formatting for tweet search summary
    if (entry.data && entry.message.includes('Found') && entry.message.includes('tweets in search') && entry.data.status === 'TWEETS_FOUND_SUMMARY') {
      const searchId = entry.data?.searchId || '';
      const ageDistribution = entry.data?.ageDistribution as Record<string, number> || {};
      
      // Format age distribution as a string
      const ageDistStr = Object.entries(ageDistribution)
        .sort(([a], [b]) => {
          const getMinutes = (category: string) => parseInt(category.split('-')[0]) || 0;
          return getMinutes(a) - getMinutes(b);
        })
        .map(([category, count]) => `${category}: ${count}`)
        .join(', ');
      
      return this.formatter.formatLogComponents({
        timestamp: String(timestamp),
        component: String(component),
        message: `${this.getSearchTypeTag()} ${entry.message} ${ageDistStr ? `(${ageDistStr})` : ''}`
      });
    }

    // Format error messages more concisely
    let errorInfo = '';
    if (entry.error) {
      const errorParts: string[] = [];
      
      if (entry.error.message.includes('TOO_MANY_REQUESTS')) {
        const retryTime = entry.data?.nextRetry as string;
        errorParts.push(this.formatter.red('Rate limit exceeded'));
        if (retryTime) {
          errorParts.push(this.formatter.gray(`(retry at ${String(retryTime)})`));
        }
      } else {
        errorParts.push(this.formatter.red(entry.error.message));
        if (entry.error.code && !entry.error.message.includes(String(entry.error.code))) {
          errorParts.push(this.formatter.gray(`(${entry.error.code})`));
        }
      }
      
      errorInfo = ` ${errorParts.join(' ')}`;
    }

    // Format the base message
    const levelMap = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const logLevel = entry.level !== 2 ? levelMap[entry.level] || 'INFO' : undefined;
    
    // Add visual indicators based on message content
    let messageWithIndicators = entry.message;
    
    // Add indentation for stage logs if they're part of a pipeline
    if (entry.message.includes('[STAGE') && !entry.message.includes('[BATCH')) {
      messageWithIndicators = `  ${messageWithIndicators}`;
    }
    
    // Add colors to status indicators
    messageWithIndicators = messageWithIndicators
      .replace(/\[✓\]/g, this.formatter.green('[✓]'))
      .replace(/\[✗\]/g, this.formatter.red('[✗]'))
      .replace(/\[⏩\]/g, this.formatter.blue('[⏩]'))
      .replace(/\[BATCH START\]/g, this.formatter.bold('[BATCH START]'))
      .replace(/\[BATCH END\]/g, this.formatter.bold('[BATCH END]'))
      .replace(/\[BATCH SUMMARY\]/g, this.formatter.bold('[BATCH SUMMARY]'))
      .replace(/\[PIPELINE START\]/g, this.formatter.bold('[PIPELINE START]'))
      .replace(/\[PIPELINE ✓\]/g, this.formatter.green('[PIPELINE ✓]'))
      .replace(/\[PIPELINE ✗\]/g, this.formatter.red('[PIPELINE ✗]'))
      .replace(/\[TWEET PROCESSING SUCCESS\]/g, this.formatter.green('[TWEET FOUND]'));

    const baseMessage = this.formatter.formatLogComponents({
      timestamp: String(timestamp),
      component: component !== 'TweetProcessor' ? String(component) : '',
      message: messageWithIndicators,
      level: logLevel
    });

    return baseMessage + errorInfo;
  }
}

/**
 * File Transport - Outputs logs to a file
 */
export class FileTransport implements LogTransport {
  private buffer: string[] = [];
  private readonly maxBufferSize: number;
  private readonly path: string;
  private readonly format: 'json' | 'text';
  private isFlushPending = false;
  private readonly fs: any; // Will be initialized in constructor
  
  constructor(options: { 
    path: string; 
    format?: 'json' | 'text';
    maxBufferSize?: number;
  }) {
    this.path = options.path;
    this.format = options.format ?? 'json';
    this.maxBufferSize = options.maxBufferSize ?? 100;
    
    // Dynamic import to avoid issues with browser environments
    try {
      this.fs = require('fs/promises');
    } catch (e) {
      console.error('FileTransport: fs/promises module not available');
      throw new Error('FileTransport requires Node.js environment with fs/promises support');
    }
    
    // Ensure the directory exists
    this.ensureDirectoryExists();
  }
  
  private async ensureDirectoryExists(): Promise<void> {
    const path = require('path');
    const directory = path.dirname(this.path);
    
    try {
      await this.fs.mkdir(directory, { recursive: true });
    } catch (error) {
      console.error(`FileTransport: Failed to create directory ${directory}`, error);
    }
  }
  
  log(entry: LogEntry): void {
    const formatted = this.format === 'json'
      ? JSON.stringify(entry) + '\n'
      : this.formatText(entry) + '\n';
    
    this.buffer.push(formatted);
    
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush().catch(error => {
        console.error('FileTransport: Failed to flush logs', error);
      });
    }
  }
  
  async flush(): Promise<void> {
    if (this.isFlushPending || this.buffer.length === 0) {
      return Promise.resolve();
    }
    
    this.isFlushPending = true;
    const bufferToFlush = [...this.buffer];
    this.buffer = [];
    
    try {
      await this.fs.appendFile(this.path, bufferToFlush.join(''));
    } catch (error) {
      console.error(`FileTransport: Failed to write to ${this.path}`, error);
      // Put the entries back in the buffer
      this.buffer = [...bufferToFlush, ...this.buffer];
    } finally {
      this.isFlushPending = false;
    }
  }
  
  private formatText(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = ['ERROR', 'WARN', 'INFO', 'DEBUG'][entry.level] || 'INFO';
    const component = entry.component;
    const correlationId = entry.correlationId ? ` [${entry.correlationId}]` : '';
    
    // Format the log message
    let message = `[${timestamp}] [${level}]${component !== 'TweetProcessor' ? ` [${component}]` : ''}${correlationId} ${entry.message}`;
    
    if (entry.data && Object.keys(entry.data).length > 0) {
      message += ` ${JSON.stringify(entry.data)}`;
    }
    
    if (entry.error) {
      message += ` Error: ${entry.error.message}`;
      if (entry.error.code) {
        message += ` (${String(entry.error.code)})`;
      }
      if (entry.error.stack) {
        message += `\n${entry.error.stack}`;
      }
    }
    
    return message;
  }
}

/**
 * HTTP Transport - Sends logs to an HTTP endpoint
 */
export class HttpTransport implements LogTransport {
  private buffer: LogEntry[] = [];
  private readonly maxBufferSize: number;
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly flushInterval: number;
  private isFlushPending = false;
  private flushTimer: NodeJS.Timeout | null = null;
  
  constructor(options: { 
    url: string; 
    headers?: Record<string, string>;
    maxBufferSize?: number;
    flushInterval?: number;
  }) {
    this.url = options.url;
    this.headers = options.headers ?? { 'Content-Type': 'application/json' };
    this.maxBufferSize = options.maxBufferSize ?? 50;
    this.flushInterval = options.flushInterval ?? 5000; // 5 seconds
    
    // Start the flush timer
    this.startFlushTimer();
  }
  
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        console.error('HttpTransport: Failed to flush logs', error);
      });
    }, this.flushInterval);
  }
  
  log(entry: LogEntry): void {
    this.buffer.push(entry);
    
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush().catch(error => {
        console.error('HttpTransport: Failed to flush logs', error);
      });
    }
  }
  
  async flush(): Promise<void> {
    if (this.isFlushPending || this.buffer.length === 0) {
      return Promise.resolve();
    }
    
    this.isFlushPending = true;
    const bufferToFlush = [...this.buffer];
    this.buffer = [];
    
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(bufferToFlush),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('HttpTransport: Failed to send logs', error);
      // Put the entries back in the buffer
      this.buffer = [...bufferToFlush, ...this.buffer];
      throw error;
    } finally {
      this.isFlushPending = false;
    }
  }
  
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    this.flush().catch(error => {
      console.error('HttpTransport: Failed to flush logs during disposal', error);
    });
  }
}