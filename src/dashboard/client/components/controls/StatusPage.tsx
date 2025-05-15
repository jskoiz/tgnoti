import React, { useState } from 'react';
import { useDashboard } from '../../context/DashboardContext.js';
import './Controls.css';

/**
 * Status page component for displaying system status and circuit breaker controls
 */
const StatusPage: React.FC = () => {
  const { 
    status, 
    statusLoading, 
    statusError, 
    circuitBreakerResetting, 
    resetCircuitBreakers 
  } = useDashboard();
  
  const [resetError, setResetError] = useState<Error | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  if (statusLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading system status...</p>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="error-container">
        <h2>Error Loading System Status</h2>
        <p>{statusError.message}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="empty-container">
        <h2>No Status Data Available</h2>
        <p>There is no system status data available at this time.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Refresh
        </button>
      </div>
    );
  }

  const handleResetCircuitBreakers = async () => {
    setResetSuccess(false);
    setResetError(null);

    try {
      await resetCircuitBreakers();
      setResetSuccess(true);
    } catch (err) {
      setResetError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  // Format timestamp to readable date/time
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Get status indicator class based on status value
  const getStatusClass = (statusValue: string) => {
    switch (statusValue.toLowerCase()) {
      case 'online':
      case 'open':
      case 'healthy':
        return 'status-healthy';
      case 'degraded':
      case 'half-open':
        return 'status-warning';
      case 'offline':
      case 'closed':
      case 'error':
        return 'status-error';
      default:
        return 'status-unknown';
    }
  };

  return (
    <div className="status-page">
      <div className="page-header">
        <h2>System Status</h2>
        <div>
          <span className="last-updated">
            Last updated: {formatTimestamp(status.timestamp)}
          </span>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="status-container">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">Overall System Status</div>
              <div className="card-body">
                <div className="system-status">
                  <div className={`status-indicator ${getStatusClass(status.status)}`}>
                    {status.status}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-6">
            <div className="card">
              <div className="card-header">Twitter Service</div>
              <div className="card-body">
                <div className="service-status">
                  <div className="status-item">
                    <div className="status-label">Service Status:</div>
                    <div className={`status-value ${getStatusClass(status.services.twitter.status)}`}>
                      {status.services.twitter.status}
                    </div>
                  </div>
                  <div className="status-item">
                    <div className="status-label">Circuit Breaker:</div>
                    <div className={`status-value ${getStatusClass(status.services.twitter.circuitBreaker)}`}>
                      {status.services.twitter.circuitBreaker}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-6">
            <div className="card">
              <div className="card-header">Telegram Service</div>
              <div className="card-body">
                <div className="service-status">
                  <div className="status-item">
                    <div className="status-label">Service Status:</div>
                    <div className={`status-value ${getStatusClass(status.services.telegram.status)}`}>
                      {status.services.telegram.status}
                    </div>
                  </div>
                  <div className="status-item">
                    <div className="status-label">Circuit Breaker:</div>
                    <div className={`status-value ${getStatusClass(status.services.telegram.circuitBreaker)}`}>
                      {status.services.telegram.circuitBreaker}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header">Circuit Breaker Controls</div>
              <div className="card-body">
                <div className="circuit-breaker-controls">
                  <p>
                    If services are experiencing issues, you can reset the circuit breakers to attempt recovery.
                    This will reset all circuit breakers to their initial state.
                  </p>
                  <button
                    className="btn btn-danger"
                    onClick={handleResetCircuitBreakers}
                    disabled={circuitBreakerResetting}
                  >
                    {circuitBreakerResetting ? 'Resetting...' : 'Reset All Circuit Breakers'}
                  </button>

                  {resetSuccess && (
                    <div className="alert alert-success mt-3">
                      Circuit breakers have been successfully reset.
                    </div>
                  )}

                  {resetError && (
                    <div className="alert alert-danger mt-3">
                      Error resetting circuit breakers: {resetError.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusPage;