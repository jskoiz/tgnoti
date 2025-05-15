import React from 'react';
import { useDashboard } from '../../context/DashboardContext.js';
import MetricsOverview from './MetricsOverview.js';
import MetricsChart from './MetricsChart.js';
import TopicMetrics from './TopicMetrics.js';
import './Metrics.css';

/**
 * Metrics page component using the dashboard context
 */
const MetricsPage: React.FC = () => {
  const { 
    metrics, 
    topicMetrics, 
    metricsLoading, 
    metricsError, 
    refreshMetrics 
  } = useDashboard();

  if (metricsLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading metrics data...</p>
      </div>
    );
  }

  if (metricsError) {
    return (
      <div className="error-container">
        <h2>Error Loading Metrics</h2>
        <p>{metricsError.message}</p>
        <button className="btn btn-primary" onClick={refreshMetrics}>
          Retry
        </button>
      </div>
    );
  }

  if (!metrics || !topicMetrics) {
    return (
      <div className="empty-container">
        <h2>No Metrics Data Available</h2>
        <p>There is no metrics data available at this time.</p>
        <button className="btn btn-primary" onClick={refreshMetrics}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="metrics-page">
      <div className="page-header">
        <h2>System Metrics</h2>
        <button className="btn btn-primary" onClick={refreshMetrics}>
          Refresh
        </button>
      </div>

      <div className="metrics-container">
        <div className="row">
          <div className="col-12">
            <MetricsOverview metrics={metrics} />
          </div>
        </div>

        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">Metrics Over Time</div>
              <div className="card-body">
                <MetricsChart metrics={metrics} />
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-12">
            <TopicMetrics topicMetrics={topicMetrics} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsPage;