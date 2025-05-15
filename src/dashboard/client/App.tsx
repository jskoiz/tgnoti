import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/layout/Dashboard.js';
import MetricsPage from './components/metrics/MetricsPage.js';
import ConfigPage from './components/config/ConfigPage.js';
import TopicConfigPage from './components/config/TopicConfigPage.js';
import StatusPage from './components/controls/StatusPage.js';
import { DashboardProvider } from './context/DashboardContext.js';

/**
 * Main application component
 */
const App: React.FC = () => {
  return (
    <DashboardProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />}>
            <Route index element={<Navigate to="/status" replace />} />
            <Route path="metrics" element={<MetricsPage />} />
            <Route path="config" element={<ConfigPage />} />
            <Route path="topics" element={<TopicConfigPage />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="overview" element={<Navigate to="/status" replace />} />
          </Route>
        </Routes>
      </Router>
    </DashboardProvider>
  );
};

export default App;
