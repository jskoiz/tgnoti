import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { MetricsData } from '../../services/api.js';

// Register Chart.js components
Chart.register(...registerables);

interface MetricsChartProps {
  metrics: MetricsData;
}

/**
 * Component that displays metrics data in a chart
 */
const MetricsChart: React.FC<MetricsChartProps> = ({ metrics }) => {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    // Destroy existing chart if it exists
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    // Create a new chart
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    // Mock data for demonstration purposes
    // In a real implementation, this would use historical data from the API
    const labels = Array.from({ length: 12 }, (_, i) => `${i * 5} min ago`).reverse();
    
    const tweetsProcessedData = Array.from({ length: 12 }, () => Math.floor(Math.random() * 100));
    const tweetsFoundData = Array.from({ length: 12 }, () => Math.floor(Math.random() * 50));
    const tweetsSentData = Array.from({ length: 12 }, () => Math.floor(Math.random() * 40));

    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tweets Processed',
            data: tweetsProcessedData,
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Tweets Found',
            data: tweetsFoundData,
            borderColor: '#28a745',
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            tension: 0.4,
            fill: true
          },
          {
            label: 'Tweets Sent',
            data: tweetsSentData,
            borderColor: '#17a2b8',
            backgroundColor: 'rgba(23, 162, 184, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Count'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Time'
            }
          }
        }
      }
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [metrics]);

  return (
    <div className="metrics-chart-container">
      <canvas ref={chartRef}></canvas>
    </div>
  );
};

export default MetricsChart;