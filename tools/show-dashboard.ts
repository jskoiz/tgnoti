#!/usr/bin/env node
/**
 * Dashboard Display Utility
 * 
 * This script enables the dashboard display and runs the application
 * with the dashboard visible. It's a simple wrapper that sets the
 * SHOW_DASHBOARD environment variable to true.
 * 
 * Usage:
 *   npm run dashboard
 *   # or
 *   ts-node tools/show-dashboard.ts
 */

// Set environment variable to show dashboard
process.env.SHOW_DASHBOARD = 'true';

// Import and run the main application
import '../src/index.js';

console.log('Dashboard mode enabled. The dashboard will refresh every 10 seconds.');
console.log('Press Ctrl+C to exit.');