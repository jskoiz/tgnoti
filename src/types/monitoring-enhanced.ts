// Define the base circuit breaker configuration
export interface CircuitBreakerConfig {
  threshold: number;
  resetTimeout: number;
  testInterval: number;
}

// Enhanced monitoring types

export interface MonitorState {
  lastPollTimes: Record<string, string>; // Topic ID -> ISO date string
  circuitBreakerStates?: Record<string, CircuitBreakerState>;
  adaptivePollingIntervals?: Record<string, number>; // Topic ID -> polling interval in ms
}

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  lastTest: number;
}

export interface AccountBatch {
  accounts: string[];
  topicId: number;
  topicName: string;
}

export interface EnhancedCircuitBreakerConfig extends CircuitBreakerConfig {
  monitorInterval: number; // How often to check circuit state in ms
}

export interface MetricsSnapshot {
  timestamp: number;
  metrics: Record<string, number>;
  topicMetrics?: Record<string, Record<string, number>>;
  accountMetrics?: Record<string, Record<string, number>>;
  createdAt?: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  metrics: Record<string, number>;
  circuitBreakers: Record<string, {
    isOpen: boolean;
    failures: number;
    halfOpen: boolean;
  }>;
  lastPollTimes: Record<string, string>;
  version: string;
}

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}