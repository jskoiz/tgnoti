import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import './Dashboard.css';

/**
 * Main dashboard layout component
 */
const Dashboard: React.FC = () => {
  const location = useLocation();
  
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>LLM Developer Dashboard</h1>
      </header>
      
      <div className="dashboard-container">
        <aside className="dashboard-sidebar">
          <nav>
            <ul>
              <li className={location.pathname === '/' || location.pathname === '/metrics' ? 'active' : ''}>
                <Link to="/metrics">Metrics</Link>
              </li>
              <li className={location.pathname === '/config' ? 'active' : ''}>
                <Link to="/config">Configuration</Link>
              </li>
              <li className={location.pathname === '/topics' ? 'active' : ''}>
                <Link to="/topics">Topics</Link>
              </li>
              <li className={location.pathname === '/status' ? 'active' : ''}>
                <Link to="/status">System Status</Link>
              </li>
            </ul>
          </nav>
        </aside>
        
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Dashboard;