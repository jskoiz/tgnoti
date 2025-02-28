import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { TwitterEvent } from './EventTypes.js';

/**
 * Subscription options for event handlers
 */
export interface SubscriptionOptions {
  eventType?: string;
  priority?: number;
  id: string;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: TwitterEvent) => Promise<void>;

/**
 * Subscription information
 */
interface Subscription {
  handler: EventHandler;
  options: SubscriptionOptions;
}

/**
 * EventBus - Central event bus for the Twitter notification system
 * This is the core of the event-based architecture
 */
@injectable()
export class EventBus {
  private subscriptions: Subscription[] = [];
  private isProcessing = false;
  private eventQueue: TwitterEvent[] = [];

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler
  ) {
    this.logger.info('EventBus initialized');
  }

  /**
   * Subscribe to events
   * @param handler Event handler function
   * @param options Subscription options
   */
  subscribe(handler: EventHandler, options: SubscriptionOptions): void {
    this.subscriptions.push({ handler, options });
    
    // Sort subscriptions by priority (higher numbers run first)
    this.subscriptions.sort((a, b) => 
      (b.options.priority || 0) - (a.options.priority || 0)
    );
    
    this.logger.debug(`Subscription added: ${options.id}`, {
      eventType: options.eventType || 'all',
      priority: options.priority || 0
    });
  }

  /**
   * Unsubscribe from events
   * @param id Subscription ID to remove
   */
  unsubscribe(id: string): void {
    const initialCount = this.subscriptions.length;
    this.subscriptions = this.subscriptions.filter(sub => sub.options.id !== id);
    
    if (initialCount !== this.subscriptions.length) {
      this.logger.debug(`Subscription removed: ${id}`);
    }
  }

  /**
   * Publish an event to the bus
   * @param event Event to publish
   */
  async publish(event: TwitterEvent): Promise<void> {
    const startTime = Date.now();
    this.metrics.increment(`events.published.${event.type}`);
    
    this.logger.debug(`Event published: ${event.type}`, {
      eventId: event.id,
      timestamp: event.timestamp
    });
    
    // Add to queue and process if not already processing
    this.eventQueue.push(event);
    
    if (!this.isProcessing) {
      await this.processQueue();
    }
    
    this.metrics.timing('events.publish_time', Date.now() - startTime);
  }

  /**
   * Process the event queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;
        await this.processEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single event
   * @param event Event to process
   */
  private async processEvent(event: TwitterEvent): Promise<void> {
    const startTime = Date.now();
    const relevantSubscriptions = this.subscriptions.filter(sub => 
      !sub.options.eventType || sub.options.eventType === event.type
    );
    
    this.logger.debug(`Processing event: ${event.type}`, {
      eventId: event.id,
      handlerCount: relevantSubscriptions.length
    });
    
    for (const subscription of relevantSubscriptions) {
      const handlerStartTime = Date.now();
      
      try {
        await subscription.handler(event);
        this.metrics.timing(`events.handler.${subscription.options.id}`, Date.now() - handlerStartTime);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.errorHandler.handleError(err, `Event handler: ${subscription.options.id}`);
        this.metrics.increment(`events.handler.${subscription.options.id}.errors`);
      }
    }
    
    this.metrics.timing(`events.process_time.${event.type}`, Date.now() - startTime);
  }
}