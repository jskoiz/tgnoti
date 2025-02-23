import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { TYPES } from '../types/di.js';

type FilterFunction = (message: any) => Promise<boolean>;

@injectable()
export class FilterPipeline {
  private filters: Map<string, FilterFunction>;

  constructor(
    @inject(TYPES.Logger)
    private logger: Logger,
    @inject(TYPES.MetricsManager)
    private metrics: MetricsManager
  ) {
    this.filters = new Map();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing filter pipeline');
  }

  addFilter(name: string, filter: FilterFunction): void {
    this.filters.set(name, filter);
    this.logger.debug(`Added filter: ${name}`);
  }

  removeFilter(name: string): void {
    this.filters.delete(name);
    this.logger.debug(`Removed filter: ${name}`);
  }

  async apply(message: any): Promise<boolean> {
    for (const [name, filter] of this.filters) {
      try {
        const result = await filter(message);
        if (!result) {
          this.metrics.increment(`filter.${name}.rejected`);
          this.logger.debug(`Message rejected by filter: ${name}`);
          return false;
        }
        this.metrics.increment(`filter.${name}.passed`);
      } catch (error) {
        this.logger.error(`Filter ${name} error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        this.metrics.increment(`filter.${name}.errors`);
        return false;
      }
    }
    return true;
  }

  getFilters(): string[] {
    return Array.from(this.filters.keys());
  }

  clearFilters(): void {
    this.filters.clear();
    this.logger.debug('All filters cleared');
  }
}