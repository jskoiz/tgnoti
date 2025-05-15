import React, { useState } from 'react';
import { TopicMetricsData } from '../../services/api.js';

interface TopicMetricsProps {
  topicMetrics: TopicMetricsData;
}

/**
 * Component that displays metrics broken down by topic
 */
const TopicMetrics: React.FC<TopicMetricsProps> = ({ topicMetrics }) => {
  const topics = Object.keys(topicMetrics.topicMetrics);
  const [activeTopic, setActiveTopic] = useState<string>(topics.length > 0 ? topics[0] : '');

  if (topics.length === 0) {
    return (
      <div className="card">
        <div className="card-header">Topic Metrics</div>
        <div className="card-body">
          <div className="empty-container">
            <p>No topic metrics available.</p>
          </div>
        </div>
      </div>
    );
  }

  // Get metrics for the active topic
  const activeTopicMetrics = activeTopic ? topicMetrics.topicMetrics[activeTopic] : {};
  const metricKeys = Object.keys(activeTopicMetrics);

  // Format the metrics for display
  const formatNumber = (num: number): string => {
    return num.toLocaleString();
  };

  return (
    <div className="card">
      <div className="card-header">Topic Metrics</div>
      <div className="card-body">
        <div className="topic-metrics-container">
          <div className="topic-metrics-tabs">
            {topics.map((topic) => (
              <div
                key={topic}
                className={`topic-tab ${topic === activeTopic ? 'active' : ''}`}
                onClick={() => setActiveTopic(topic)}
              >
                {topic}
              </div>
            ))}
          </div>
          
          <div className="topic-metrics-content">
            {metricKeys.length > 0 ? (
              <table className="topic-metrics-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {metricKeys.map((key) => (
                    <tr key={key}>
                      <td>{key.replace(/_/g, ' ')}</td>
                      <td>{formatNumber(activeTopicMetrics[key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-container">
                <p>No metrics available for this topic.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopicMetrics;