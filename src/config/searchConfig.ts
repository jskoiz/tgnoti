import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { twitterConfig } from './twitter.js';
import { IDateValidator } from '../types/dateValidator.js';

@injectable()
export class SearchConfig {
  private pastDays: number;
  private futureDays: number;
  private defaultWindow: number;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.DateValidator) private dateValidator: IDateValidator
  ) {
    const { searchWindow } = twitterConfig;
    this.pastDays = searchWindow.pastDays;
    this.futureDays = searchWindow.futureDays;
    this.defaultWindow = searchWindow.defaultWindow;
  }

  getPastDays(): number {
    return this.pastDays;
  }

  getFutureDays(): number {
    return this.futureDays;
  }

  getDefaultWindow(): number {
    return this.defaultWindow;
  }

  async createSearchWindow(): Promise<{ startDate: Date; endDate: Date }> {
    const now = await this.dateValidator.getCurrentTime();
    const endDate = now;
    const startDate = new Date(now.getTime() - (this.defaultWindow * 24 * 60 * 60 * 1000));
    return { startDate, endDate };
  }
}