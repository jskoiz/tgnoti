export interface IDateValidator {
  getCurrentTime(): Promise<Date>;
  validateSystemTime(): Promise<void>;
  validateSearchWindow(startDate: Date, endDate: Date): Promise<void>;
  validateTweetDate(tweet: any): Promise<boolean>;
}