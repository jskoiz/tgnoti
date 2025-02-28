import { AsyncLocalStorage } from 'async_hooks';

/**
 * CorrelationContext - Provides request-scoped context for correlation IDs and other metadata
 * 
 * This class uses AsyncLocalStorage to maintain context across asynchronous operations,
 * allowing correlation IDs and other metadata to be propagated throughout the request lifecycle.
 */
export class CorrelationContext {
  private static asyncLocalStorage = new AsyncLocalStorage<Map<string, any>>();
  
  /**
   * Run a callback with the provided context
   * 
   * @param context The context to be available during the callback execution
   * @param callback The function to execute within the context
   * @returns The result of the callback
   */
  static run<T>(context: Record<string, any>, callback: () => T): T {
    const contextMap = new Map(Object.entries(context));
    return this.asyncLocalStorage.run(contextMap, callback);
  }
  
  /**
   * Get the current context as a Record
   * 
   * @returns The current context or an empty object if no context exists
   */
  static getContext(): Record<string, any> {
    const store = this.asyncLocalStorage.getStore();
    if (!store) return {};
    return Object.fromEntries(store.entries());
  }
  
  /**
   * Set a value in the current context
   * 
   * @param key The key to set
   * @param value The value to set
   */
  static set(key: string, value: any): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      store.set(key, value);
    }
  }
  
  /**
   * Get a value from the current context
   * 
   * @param key The key to retrieve
   * @returns The value or undefined if not found
   */
  static get(key: string): any {
    const store = this.asyncLocalStorage.getStore();
    if (!store) return undefined;
    return store.get(key);
  }
  
  /**
   * Generate a new correlation ID
   * 
   * @returns A unique correlation ID
   */
  static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
  
  /**
   * Create a new context with a correlation ID
   * 
   * @param additionalContext Additional context to include
   * @returns A context object with a correlation ID
   */
  static createContext(additionalContext: Record<string, any> = {}): Record<string, any> {
    return {
      correlationId: this.generateCorrelationId(),
      timestamp: new Date().toISOString(),
      ...additionalContext
    };
  }
}