import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { Logger } from '../../types/logger.js';
import { MongoDBService } from '../../services/MongoDBService.js';
import { runTweetAnalysis, TweetAnalysisResults } from '../../../tools/tweet-analysis-module.js';
import TelegramBotApi from 'node-telegram-bot-api';

@injectable()
export class StatsCommandHandler {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MongoDBService) private mongoDBService: MongoDBService
  ) {
    this.logger.setComponent('StatsCommandHandler');
  }

  async handleStatsCommand(telegramBot: TelegramBotApi, msg: any): Promise<void> {
    try {
      this.logger.info('Processing /stats command');
      
      // Send "processing" message
      const processingMsg = await telegramBot.sendMessage(
        msg.chat.id,
        '📊 <b>Processing tweet statistics...</b>\n\nThis may take a moment as we analyze the database.',
        { 
          parse_mode: 'HTML',
          message_thread_id: msg.message_thread_id 
        }
      );

      // Run analysis
      const analysisResults = await runTweetAnalysis(this.mongoDBService);
      
      // Format results for Telegram
      const formattedResults = this.formatStatsForTelegram(analysisResults);
      
      // Send results
      await telegramBot.editMessageText(
        formattedResults,
        {
          chat_id: msg.chat.id,
          message_id: processingMsg.message_id,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
      
      this.logger.info('Stats command processed successfully');
    } catch (error) {
      this.logger.error('Failed to process stats command:', error as Error);
      
      try {
        await telegramBot.sendMessage(
          msg.chat.id,
          '❌ <b>Error processing tweet statistics</b>\n\nThere was a problem connecting to the database or analyzing the tweets. Please try again later.',
          { 
            parse_mode: 'HTML',
            message_thread_id: msg.message_thread_id 
          }
        );
      } catch (sendError) {
        this.logger.error('Failed to send error message:', sendError as Error);
      }
    }
  }

  private formatStatsForTelegram(results: TweetAnalysisResults): string {
    // Format the results for Telegram using HTML formatting
    const sections: string[] = [];
    
    // Header
    sections.push('📊 <b>Tweet Statistics Report</b>');
    sections.push(`<i>Total tweets analyzed: ${results.totalTweets.toLocaleString()}</i>`);
    sections.push('');
    
    // Topic breakdown
    if (results.topicBreakdown.length > 0) {
      sections.push('📑 <b>Breakdown by Topic</b>');
      
      for (const topic of results.topicBreakdown) {
        sections.push(
          `• <b>${topic.topicName}</b>: ${topic.count.toLocaleString()} tweets <i>(${topic.percentage.toFixed(1)}%)</i>`
        );
      }
      
      sections.push('');
    }
    
    // User breakdown
    if (results.userBreakdown.length > 0) {
      sections.push('👤 <b>Top Users by Tweet Count</b>');
      
      for (const user of results.userBreakdown) {
        sections.push(
          `• <b>@${user.username}</b>: ${user.count.toLocaleString()} tweets <i>(${user.percentage.toFixed(1)}%)</i>`
        );
      }
      
      sections.push('');
    }
    
    // Month breakdown
    if (results.monthBreakdown.length > 0) {
      sections.push('📅 <b>Tweet Count by Month</b>');
      
      for (const month of results.monthBreakdown) {
        sections.push(
          `• <b>${month.month} ${month.year}</b>: ${month.count.toLocaleString()} tweets <i>(${month.percentage.toFixed(1)}%)</i>`
        );
      }
      
      sections.push('');
    }
    
    // Sentiment breakdown
    if (results.sentimentBreakdown && results.sentimentBreakdown.length > 0) {
      sections.push('😊 <b>Sentiment Breakdown</b>');
      
      for (const sentiment of results.sentimentBreakdown) {
        let emoji = '🔵'; // Default for neutral
        
        // Add emoji based on sentiment
        if (sentiment.label.toLowerCase() === 'positive') {
          emoji = '🟢';
        } else if (sentiment.label.toLowerCase() === 'negative') {
          emoji = '🔴';
        }
        
        sections.push(
          `• ${emoji} <b>${this.capitalizeFirstLetter(sentiment.label)}</b>: ${sentiment.count.toLocaleString()} tweets <i>(${sentiment.percentage.toFixed(1)}%)</i>`
        );
      }
      
      sections.push('');
    }
    
    // Competitor stats
    if (results.competitorStats.length > 0) {
      sections.push('🏆 <b>Competitor Account Statistics</b>');
      
      for (const stat of results.competitorStats) {
        const typeEmoji = stat.type === 'FROM' ? '📣' : '🔍';
        const typeLabel = stat.type === 'FROM' ? 'Tweets from' : 'Mentions of';
        
        sections.push(
          `• ${typeEmoji} <b>${typeLabel} @${stat.account}</b>: ${stat.count.toLocaleString()} <i>(${stat.percentage.toFixed(1)}%)</i>`
        );
      }
      
      sections.push('');
    }
    
    // Footer
    const now = new Date();
    sections.push(`<i>Report generated on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}</i>`);
    
    return sections.join('\n');
  }
  
  private capitalizeFirstLetter(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
}
