# ADR-002: Modern Front-End Dashboard Implementation for LLM Developer

## Status
Completed

## Context
The application currently has a terminal-based dashboard (`tools/show-dashboard.ts`) that displays metrics using blessed/blessed-contrib. We need a modern web-based dashboard that allows adjusting metrics, timing, intervals, filters, and channels from a simple interface.

## Decision
We will implement a modern front-end dashboard with the following characteristics:

1. **Technology Stack**:
   - React with TypeScript for the frontend
   - Integrated directly into the current Node.js application
   - No authentication required (trusted environment)

2. **Core Features**:
   - Real-time metrics visualization
   - Configuration management for system parameters
   - Topic and filter management
   - Circuit breaker status and controls

3. **Architecture Principles**:
   - Clear separation of concerns
   - Modular component structure
   - Minimal complexity
   - Straightforward data flow

## Consequences

### Positive
- Modern, intuitive interface for monitoring and configuration
- Configuration changes without code modification or restart
- Real-time visibility into system performance
- Leverages existing TypeScript codebase

### Negative
- Adds web server and frontend framework to the application
- Increases application resource usage
- Requires maintaining both backend and frontend code

## Technical Details

### Component Structure

```
src/
├── dashboard/
│   ├── server/              # Backend server components
│   │   ├── routes/          # API route handlers
│   │   │   ├── metrics.ts   # Metrics endpoints
│   │   │   ├── config.ts    # Configuration endpoints
│   │   │   └── control.ts   # Control endpoints
│   │   ├── services/        # Server-side services
│   │   │   └── dashboard.ts # Main dashboard service
│   │   └── index.ts         # Server setup
│   └── client/              # Frontend React components
│       ├── components/      # UI components
│       │   ├── layout/      # Layout components
│       │   ├── metrics/     # Metrics visualization
│       │   ├── config/      # Configuration forms
│       │   └── controls/    # Control components
│       ├── hooks/           # React hooks
│       ├── services/        # Client-side services
│       └── App.tsx          # Main application
```

### Data Flow

1. **Server-side**:
   - `DashboardService`: Central service that coordinates dashboard functionality
   - `API Routes`: Express routes that handle HTTP requests
   - `WebSocket`: Real-time updates for metrics and status

2. **Client-side**:
   - `API Service`: Handles communication with the server
   - `State Management`: React context for global state
   - `UI Components`: Modular, focused components

### API Design

#### Metrics API
- `GET /api/metrics` - Get current metrics
- `GET /api/metrics/topics` - Get metrics by topic

#### Configuration API
- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration
- `GET /api/config/topics` - Get topic configuration
- `PUT /api/config/topics` - Update topic configuration

#### Control API
- `POST /api/control/reset-circuit-breakers` - Reset circuit breakers
- `GET /api/status` - Get system status

### UI Component Breakdown

1. **Layout Components**:
   - `Dashboard`: Main layout container
   - `Sidebar`: Navigation and quick actions
   - `ContentArea`: Main content display

2. **Metrics Components**:
   - `MetricsOverview`: Summary of key metrics
   - `MetricsChart`: Visualization of metrics data
   - `TopicMetrics`: Metrics broken down by topic

3. **Configuration Components**:
   - `ConfigForm`: Form for editing configuration
   - `TopicConfig`: Topic configuration editor
   - `FilterConfig`: Filter management

4. **Control Components**:
   - `StatusPanel`: System status display
   - `CircuitBreakerControls`: Circuit breaker management
   - `ActionButtons`: Quick action buttons

## Implementation Steps

### 1. Server Setup
1. Create Express server in the Node.js application
2. Set up basic API routes structure
3. Implement WebSocket connection

### 2. API Implementation
1. Create metrics endpoints
2. Implement configuration endpoints
3. Add control endpoints

### 3. Client Foundation
1. Set up React application structure
2. Create API service for server communication
3. Implement state management

### 4. UI Components
1. Build layout components
2. Implement metrics visualization
3. Create configuration forms
4. Add control components

### 5. Integration
1. Connect client to server API
2. Set up WebSocket for real-time updates
3. Implement configuration persistence

## Implementation Guidelines for LLM

1. **Keep Components Focused**: Each component should have a single responsibility
   ```tsx
   // Example of a focused component
   const MetricsChart: React.FC<{data: MetricsData}> = ({data}) => {
     // Only responsible for rendering a chart with the provided data
     return <div className="chart-container">{/* Chart rendering logic */}</div>;
   };
   ```

2. **Separate Data Fetching from Rendering**:
   ```tsx
   // Data fetching hook
   const useMetrics = () => {
     const [metrics, setMetrics] = useState<MetricsData | null>(null);
     
     useEffect(() => {
       // Fetch metrics logic
     }, []);
     
     return metrics;
   };
   
   // Component using the hook
   const MetricsDisplay: React.FC = () => {
     const metrics = useMetrics();
     return metrics ? <MetricsChart data={metrics} /> : <Loading />;
   };
   ```

3. **Use TypeScript Interfaces for Data Structures**:
   ```tsx
   interface MetricsData {
     timestamp: number;
     metrics: Record<string, number>;
     topicMetrics?: Record<string, Record<string, number>>;
   }
   ```

4. **Implement Clear API Services**:
   ```tsx
   // API service example
   const api = {
     getMetrics: async (): Promise<MetricsData> => {
       const response = await fetch('/api/metrics');
       return response.json();
     },
     
     updateConfig: async (config: ConfigData): Promise<void> => {
       await fetch('/api/config', {
         method: 'PUT',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify(config)
       });
     }
   };
   ```

## Dependencies

- Express.js for API server
- Socket.io for WebSocket communication
- React and TypeScript for frontend
- Chart.js for data visualization
- React Hook Form for form handling

## Implementation Progress

As of May 3, 2025, the following components have been implemented:

### 1. Server Setup (Completed)
- Created the directory structure for the dashboard
- Implemented the DashboardService that coordinates dashboard functionality
- Created API routes for metrics, configuration, and control endpoints
- Set up the Express server with WebSocket support for real-time updates

### 2. Client Foundation (Completed)
- Set up the React application structure
- Created API service for server communication
- Implemented WebSocket service for real-time updates
- Created React hooks for metrics, configuration, and system status

### 3. UI Components (Completed)
- Implemented the main Dashboard layout component with navigation
- Created comprehensive CSS styles for the dashboard
- Implemented MetricsPage, MetricsOverview, and MetricsChart components
- Implemented TopicMetrics component for displaying metrics by topic
- Created configuration forms (ConfigPage and TopicConfigPage)
- Implemented control components (StatusPage)

### 4. Build and Deployment (Completed)
- Created build script for compiling the dashboard client
- Created server script for running the dashboard
- Updated package.json with new npm commands for building and running the dashboard

### 5. Implementation Completion
All items required by the ADR have been implemented:
- **React Context for Global State**: Implemented a comprehensive DashboardContext provider that centralizes all state management
- **React Hook Form**: Integrated React Hook Form for form handling in ConfigPage and TopicConfigPage components
- **Testing**: Added Jest tests for components and integration, with proper configuration

### 6. Additional Improvements
- Comprehensive test coverage across all components
- Enhanced error handling and edge cases
- Performance optimizations for large datasets

The implementation follows the architecture principles outlined in this ADR, with clear separation of concerns, modular component structure, and straightforward data flow between the server and client components.

## Usage Instructions

To start and access the dashboard:

1. **Build and Start the Dashboard**:
   ```bash
   npm run web-dashboard
   ```
   This command will:
   - Build the dashboard client (compile TypeScript to JavaScript)
   - Start the dashboard server

2. **Access the Dashboard**:
   Open your web browser and navigate to:
   ```
   http://localhost:3000
   ```

The dashboard provides a modern interface with:
- Real-time metrics visualization
- Configuration management for system parameters
- Topic and filter management
- Circuit breaker status and controls

You can customize the port by setting the `DASHBOARD_PORT` environment variable:
```bash
DASHBOARD_PORT=8080 npm run web-dashboard
```

The dashboard server runs independently from the main application, so you can have both running simultaneously.