import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../../utils/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { EnhancedMessageFormatter } from '../../../bot/messageFormatter.js';
import { TweetMessageConfig } from '../../../types/telegram.js';

@injectable()
export class FormatStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'format';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TweetFormatter) private formatter: EnhancedMessageFormatter
  ) {}

  /**
   * Execute the format stage
   */
  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();
    this.logger.debug('Starting format stage', {
      topicId: context.topicId,
      tweetId: context.tweet.id
    });

    try {
      // Create message config
      const messageConfig: TweetMessageConfig = {
        tweet: context.tweet,
        quotedTweet: context.tweet.quotedTweet,
        showSummarizeButton: context.tweet.text.length > 280
      };

      // Format the tweet message
      const formattedMessage = this.formatter.formatMessage(messageConfig);
      
      if (!formattedMessage) {
        return {
          success: false,
          data: context,
          error: new Error('Failed to format tweet message'),
          metadata: {
            reason: 'format_error',
            tweetId: context.tweet.id
          }
        };
      }

      // Handle media attachments if present
      const mediaAttachments = await this.formatMediaAttachments(context);

      // Create message buttons
      const messageButtons = this.formatter.createMessageButtons(context.tweet, messageConfig);

      // Create formatted context with message and media
      const updatedContext: TweetContext = {
        ...context,
        formatted: true,
        metadata: {
          ...context.metadata,
          formatDurationMs: Date.now() - startTime,
          formattedMessage,
          mediaAttachments,
          messageButtons,
          messageLength: formattedMessage.length,
          hasMedia: mediaAttachments.length > 0
        }
      };

      this.recordMetrics(startTime, true, {
        messageLength: formattedMessage.length,
        mediaCount: mediaAttachments.length
      });

      return {
        success: true,
        data: updatedContext,
        metadata: {
          formatDurationMs: Date.now() - startTime,
          messageLength: formattedMessage.length,
          mediaCount: mediaAttachments.length
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Format stage');
      this.recordMetrics(startTime, false);
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          formatDurationMs: Date.now() - startTime,
          errorType: err.name,
          errorMessage: err.message
        }
      };
    }
  }

  /**
   * Format media attachments
   */
  private async formatMediaAttachments(context: TweetContext): Promise<Array<{
    type: 'photo' | 'video' | 'gif';
    url: string;
  }>> {
    const { tweet } = context;
    const attachments = [];

    if (tweet.media?.length) {
      for (const media of tweet.media) {
        attachments.push({
          type: media.type,
          url: media.url
        });
      }
    }

    // Handle quoted tweet media if present
    if (tweet.quotedTweet?.media?.length) {
      for (const media of tweet.quotedTweet.media) {
        attachments.push({
          type: media.type,
          url: media.url
        });
      }
    }

    return attachments;
  }

  /**
   * Record format metrics
   */
  private recordMetrics(
    startTime: number,
    success: boolean,
    data?: { messageLength: number; mediaCount: number }
  ): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.format.duration', duration);
    this.metrics.increment(`pipeline.format.${success ? 'success' : 'failure'}`);

    if (data) {
      this.metrics.gauge('pipeline.format.message_length', data.messageLength);
      this.metrics.gauge('pipeline.format.media_count', data.mediaCount);
    }
  }
}