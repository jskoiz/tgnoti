/**
 * ANSI Color codes for terminal output
 */
export const Colors = {
  // Reset
  reset: '\x1b[0m',
  
  // Regular colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Background
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  
  // Bright colors
  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  
  // Styles
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m'
} as const;

/**
 * Color formatting utility class
 */
export class ColorFormatter {
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  /**
   * Enable or disable color output
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Wrap text in color codes
   */
  private wrap(color: string, text: string): string {
    return this.enabled ? `${color}${text}${Colors.reset}` : text;
  }

  // Color methods
  dim(text: string): string {
    return this.wrap(Colors.dim, text);
  }

  cyan(text: string): string {
    return this.wrap(Colors.cyan, text);
  }

  yellow(text: string): string {
    return this.wrap(Colors.yellow, text);
  }

  gray(text: string): string {
    return this.wrap(Colors.gray, text);
  }

  green(text: string): string {
    return this.wrap(Colors.green, text);
  }

  red(text: string): string {
    return this.wrap(Colors.red, text);
  }

  blue(text: string): string {
    return this.wrap(Colors.blue, text);
  }

  white(text: string): string {
    return this.wrap(Colors.white, text);
  }

  bold(text: string): string {
    return this.wrap(Colors.bold, text);
  }
  
  bgRed(text: string): string {
    return this.wrap(Colors.bgRed, text);
  }

  /**
   * Format log components with consistent colors
   */
  formatLogComponents(components: {
    timestamp: string;
    component: string;
    message: string;
    username?: string;
    tweetId?: string;
    filter?: string;
    details?: string;
    url?: string;
    level?: string;
  }): string {
    const parts: string[] = [
      this.dim(`[${components.timestamp}]`),
      components.level ? this.formatLevel(components.level) : '',
      this.cyan(`[${components.component}]`),
      this.white(components.message)
    ];

    // Add additional details if available
    if (components.details || components.url) {
      const metadata: string[] = [];
      
      if (components.details) {
        metadata.push(components.details);
      }
      
      if (components.url) {
        metadata.push(components.url);
      }

      parts.push(metadata.join(' '));
    }

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Format log level with appropriate color
   */
  private formatLevel(level: string): string {
    switch (level.toUpperCase()) {
      case 'ERROR':
        return this.red(`[${level}]`);
      case 'WARN':
        return this.yellow(`[${level}]`);
      case 'DEBUG':
        return this.blue(`[${level}]`);
      default:
        return '';
    }
  }
}

// Export a default instance
export const formatter = new ColorFormatter();