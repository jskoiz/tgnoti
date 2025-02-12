export interface Logger {
  info(message: string): void;
  warn(message: string, error?: Error): void;
  error(message: string, error?: Error): void;
  debug(message: string): void;
}