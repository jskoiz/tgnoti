export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, error?: Error | Record<string, unknown>): void;
  error(message: string, error?: Error | Record<string, unknown>): void;
  debug(message: string, ...args: any[]): void;
}