import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { TwitterAffiliateService } from './TwitterAffiliateService.js';
import { ITelegramMessageQueue } from '../types/telegram.js';
import { AffiliateChange } from '../types/affiliates.js';

@injectable()
export class AffiliateTrackingService {
  private readonly AFFILIATE_TOPIC_ID = 6545;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private configService: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TwitterAffiliateService) private twitterAffiliateService: TwitterAffiliateService,
    @inject(TYPES.TelegramMessageQueue) private telegramQueue: ITelegramMessageQueue
  ) {
    this.logger.setComponent('AffiliateTrackingService');
  }

  /**
   * Initialize the affiliate tracking service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing AffiliateTrackingService');
    // No specific initialization needed at this point
  }

  /**
   * Check for affiliate changes and report them to Telegram
   * This method is called during each monitoring interval
   */
  async checkAndReportAffiliateChanges(): Promise<void> {
    try {
      const startTime = Date.now();
      this.metrics.increment('affiliates.check.attempts');
      
      this.logger.info('Checking for affiliate changes');
      
      // Get changes for all tracked accounts
      const allChanges = await this.twitterAffiliateService.checkAllAffiliates();
      
      if (allChanges.size === 0) {
        this.logger.info('No affiliate changes detected');
        this.metrics.increment('affiliates.check.no_changes');
        return;
      }
      
      // Report changes to Telegram
      await this.reportChangesToTelegram(allChanges);
      
      this.metrics.timing('affiliates.check.duration', Date.now() - startTime);
      this.metrics.increment('affiliates.check.success');
    } catch (error) {
      this.metrics.increment('affiliates.check.errors');
      this.logger.error('Error checking affiliate changes:', error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Report affiliate changes to Telegram
   * @param changes Map of account names to affiliate changes
   */
  private async reportChangesToTelegram(changes: Map<string, AffiliateChange[]>): Promise<void> {
    try {
      let totalChanges = 0;
      
      for (const [account, accountChanges] of changes.entries()) {
        if (accountChanges.length === 0) continue;
        
        totalChanges += accountChanges.length;
        
        // Format changes into a message
        const message = this.formatAffiliateChanges(account, accountChanges);
        
        // Queue message to Telegram using the proper queue system
        const telegramConfig = this.configService.getTelegramConfig();
        await this.telegramQueue.queueMessage({
          chatId: parseInt(telegramConfig.api.groupId),
          threadId: this.AFFILIATE_TOPIC_ID,
          content: message,
          messageOptions: {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            disable_notification: false,
            protect_content: false
          },
          priority: 2 // Higher priority for affiliate changes
        });
        
        this.logger.info(`Reported ${accountChanges.length} affiliate changes for account ${account}`);
      }
      
      this.metrics.gauge('affiliates.changes.reported', totalChanges);
      this.logger.info(`Reported a total of ${totalChanges} affiliate changes to Telegram`);
    } catch (error) {
      this.logger.error('Error reporting affiliate changes to Telegram:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * Format affiliate changes into a message for Telegram
   * @param account The account name
   * @param changes The affiliate changes
   * @returns Formatted message
   */
  private formatAffiliateChanges(account: string, changes: AffiliateChange[]): string {
    // Group changes by type (added/removed)
    const added = changes.filter(c => c.type === 'added');
    const removed = changes.filter(c => c.type === 'removed');
    
    // Format the message header
    let message = `<b>🔄 Affiliate Changes for @${account}</b>\n\n`;
    
    // Format added affiliates
    if (added.length > 0) {
      message += `<b>➕ Added Affiliates (${added.length})</b>\n`;
      added.forEach(change => {
        const verifiedBadge = change.affiliate.isVerified ? '✓ ' : '';
        message += `• ${verifiedBadge}<a href="https://twitter.com/${change.affiliate.userName}">@${change.affiliate.userName}</a> (${change.affiliate.fullName})\n`;
      });
      message += '\n';
    }
    
    // Format removed affiliates
    if (removed.length > 0) {
      message += `<b>➖ Removed Affiliates (${removed.length})</b>\n`;
      removed.forEach(change => {
        const verifiedBadge = change.affiliate.isVerified ? '✓ ' : '';
        message += `• ${verifiedBadge}<a href="https://twitter.com/${change.affiliate.userName}">@${change.affiliate.userName}</a> (${change.affiliate.fullName})\n`;
      });
      message += '\n';
    }
    
    // Add timestamp
    message += `<i>Changes detected at ${new Date().toLocaleString()}</i>`;
    
    return message;
  }
  
  /**
   * Generate a summary of all tracked affiliates
   * Used for the /affiliates command
   */
  async generateAffiliateSummary(): Promise<string> {
    try {
      const { trackedAccounts } = this.configService.getAffiliateTrackingConfig();
      let message = '<b>📊 Affiliate Tracking Summary</b>\n\n';
      
      for (const account of trackedAccounts) {
        try {
          // Get user details
          const userDetails = await this.twitterAffiliateService.getUserAffiliatesByUsername(account);
          message += `<b>@${account}</b>: ${userDetails.length} affiliates\n`;
        } catch (error) {
          message += `<b>@${account}</b>: Unable to fetch affiliates\n`;
          this.logger.error(`Error fetching affiliates for ${account}:`, error instanceof Error ? error : new Error(String(error)));
        }
      }
      
      message += '\n<i>Use /account &lt;username&gt; to see details for a specific account</i>';
      
      return message;
    } catch (error) {
      this.logger.error('Error generating affiliate summary:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * Format affiliates list for a specific account
   * Used for the /account command
   */
  formatAffiliatesList(userName: string, affiliates: any[]): string {
    if (affiliates.length === 0) {
      return `<b>No affiliates found for @${userName}</b>`;
    }
    
    let message = `<b>🔍 Affiliates for @${userName}</b> (${affiliates.length})\n\n`;
    
    // Sort affiliates by followers count (descending)
    const sortedAffiliates = [...affiliates].sort((a, b) => b.followersCount - a.followersCount);
    
    sortedAffiliates.forEach((affiliate, index) => {
      const verifiedBadge = affiliate.isVerified ? '✓ ' : '';
      const followers = this.formatNumber(affiliate.followersCount);
      message += `${index + 1}. ${verifiedBadge}<a href="https://twitter.com/${affiliate.userName}">@${affiliate.userName}</a>\n`;
      message += `   ${affiliate.fullName} • ${followers} followers\n`;
    });
    
    return message;
  }
  
  /**
   * Format a number with commas for thousands
   */
  private formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
}