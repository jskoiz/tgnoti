/**
 * Interface for handling API/HTTP errors in responses
 */
export interface IErrorHandler {
  /**
   * Handle an error response from the Twitter API
   * @param error The error caught while making request to Twitter API
   * @returns void
   */
  handle(error: unknown): void;
}