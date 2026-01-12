/**
 * Logger Utility
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  enableTimestamp?: boolean;
  enableColors?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private enableTimestamp: boolean;
  private enableColors: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '[VNextSDK]';
    this.enableTimestamp = options.enableTimestamp ?? true;
    this.enableColors = options.enableColors ?? true;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private formatMessage(level: string, message: string, ...args: any[]): string[] {
    const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
    const prefix = this.prefix ? `${this.prefix} ` : '';
    const levelPrefix = `[${level}]`;
    
    const parts = [prefix, levelPrefix];
    if (timestamp) parts.push(`[${timestamp}]`);
    parts.push(message);
    
    return parts;
  }

  private getColor(level: LogLevel): string | null {
    if (!this.enableColors) return null;
    
    switch (level) {
      case LogLevel.DEBUG:
        return 'color: #888';
      case LogLevel.INFO:
        return 'color: #2196F3';
      case LogLevel.WARN:
        return 'color: #FF9800';
      case LogLevel.ERROR:
        return 'color: #F44336';
      default:
        return null;
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      const formatted = this.formatMessage('DEBUG', message, ...args);
      const color = this.getColor(LogLevel.DEBUG);
      if (color) {
        console.log(`%c${formatted.join(' ')}`, color, ...args);
      } else {
        console.log(...formatted, ...args);
      }
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      const formatted = this.formatMessage('INFO', message, ...args);
      const color = this.getColor(LogLevel.INFO);
      if (color) {
        console.log(`%c${formatted.join(' ')}`, color, ...args);
      } else {
        console.log(...formatted, ...args);
      }
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      const formatted = this.formatMessage('WARN', message, ...args);
      const color = this.getColor(LogLevel.WARN);
      if (color) {
        console.warn(`%c${formatted.join(' ')}`, color, ...args);
      } else {
        console.warn(...formatted, ...args);
      }
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      const formatted = this.formatMessage('ERROR', message, ...args);
      const color = this.getColor(LogLevel.ERROR);
      if (color) {
        console.error(`%c${formatted.join(' ')}`, color, ...args);
      } else {
        console.error(...formatted, ...args);
      }
    }
  }

  group(label: string): void {
    console.group(`%c${this.prefix} ${label}`, this.getColor(LogLevel.INFO) || '');
  }

  groupEnd(): void {
    console.groupEnd();
  }

  table(data: any): void {
    if (this.level <= LogLevel.DEBUG) {
      console.table(data);
    }
  }
}

// Default logger instance
export const logger = new Logger({
  level: LogLevel.INFO,
  prefix: '[VNextSDK]',
  enableTimestamp: true,
  enableColors: true,
});
