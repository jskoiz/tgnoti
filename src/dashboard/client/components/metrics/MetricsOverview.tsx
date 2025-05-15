import React from 'react';
import { MetricsData } from '../../services/api.js';

interface MetricsOverviewProps {
  metrics: MetricsData;
}

/**
 * Component that displays a summary of key metrics
 */
const MetricsOverview: React.FC<MetricsOverviewProps> = ({ metrics }) => {
  // Extract key metrics from the metrics data
  const tweetsProcessed = metrics.metrics['tweets_processed'] || 0;
  const tweetsFound = metrics.metrics['tweets_found'] || 0;
  const tweetsSent = metrics.metrics['tweets_sent'] || 0;
  const searchesExecuted = metrics.metrics['searches_executed'] || 0;
  const apiCalls = metrics.metrics['api_calls'] || 0;
  const rateLimitHits = metrics.metrics['rate_limit_hits'] || 0;
  const circuitBreakerTrips = metrics.metrics['circuit_breaker_trips'] || 0;
  const averageProcessingTime = metrics.metrics['avg_processing_time'] || 0;

  // Format the metrics for display
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  const formatTime = (ms: number): string => {
    return `${ms.toFixed(2)}ms`;
  };

  return (
    <div className="card">
      <div className="card-header">Key Metrics</div>
      <div className="card-body">
        <div className="metrics-overview">
          <div className="metric-card">
            <h3>Tweets Processed</h3>
            <div className="metric-value">{formatNumber(tweetsProcessed)}</div>
          </div>
          
          <div className="metric-card">
            <h3>Tweets Found</h3>
            <div className="metric-value">{formatNumber(tweetsFound)}</div>
          </div>
          
          <div className="metric-card">
            <h3>Tweets Sent</h3>
            <div className="metric-value">{formatNumber(tweetsSent)}</div>
          </div>
          
          <div className="metric-card">
            <h3>Searches Executed</h3>
            <div className="metric-value">{formatNumber(searchesExecuted)}</div>
          </div>
          
          <div className="metric-card">
            <h3>API Calls</h3>
            <div className="metric-value">{formatNumber(apiCalls)}</div>
          </div>
          
          <div className="metric-card">
            <h3>Rate Limit Hits</h3>
            <div className="metric-value">{formatNumber(rateLimitHits)}</div>
          </div>
          
          <div className="metric-card">
            <h3>Circuit Breaker Trips</h3>
            <div className="metric-value">{formatNumber(circuitBreakerTrips)}</div>
          </div>
          
          <div className="metric-card">
            <h3>Avg Processing Time</h3>
            <div className="metric-value">{formatTime(averageProcessingTime)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsOverview;