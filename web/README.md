# Twitter Notification Dashboard

A web front-end for the Twitter Notification system that monitors Twitter accounts and forwards tweets to Telegram groups/channels.

## Features

- **Dashboard**: View statistics and metrics about tweet processing
- **Tweet Browser**: Search and view tweets from the database
- **Filter Management**: Add, edit, and delete filters for topics
- **MongoDB Integration**: Seamless connection to the existing MongoDB database

## Technology Stack

- **Frontend**: Next.js, Tremor, Tailwind CSS, TypeScript
- **API Layer**: Next.js API routes
- **Data Fetching**: Server Components and Client-side fetching
- **Database**: MongoDB

## Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- MongoDB connection string

### Installation

1. Clone the repository
2. Navigate to the web directory
3. Install dependencies:

```bash
npm install
# or
pnpm install
```

4. Create a `.env.local` file with the following variables:

```
MONGO_DB_STRING=mongodb+srv://your-mongodb-connection-string
MONGODB_DB_NAME=tgnoti
NEXT_PUBLIC_API_URL=http://localhost:3000
```

5. Start the development server:

```bash
npm run dev
# or
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Available Scripts

- **dev**: Kills any process running on port 3000 and starts the development server
  ```bash
  npm run dev
  ```

- **build**: Builds the application for production
  ```bash
  npm run build
  ```

- **build:no-lint**: Builds the application without running linting checks
  ```bash
  npm run build:no-lint
  ```

- **start**: Starts the production server
  ```bash
  npm run start
  ```

- **lint**: Runs ESLint to check for code issues
  ```bash
  npm run lint
  ```

- **lint:fix**: Runs ESLint and automatically fixes issues when possible
  ```bash
  npm run lint:fix
  ```

- **generate**: Generates sample data for development
  ```bash
  npm run generate
  ```

## Project Structure

- `src/app`: Next.js App Router pages and layouts
- `src/app/api`: API routes for accessing MongoDB data
- `src/components`: UI components
- `src/lib`: Utility functions and MongoDB connection
- `src/services`: Service functions for data access
- `src/types`: TypeScript interfaces

## Implementation Phases

This project follows a phased implementation approach:

### Phase 1: Core Infrastructure & MongoDB Integration

- MongoDB connection utility
- API routes for accessing MongoDB data
- Data models and services
- Core layout and navigation

### Phase 2: Filter Management Interface

- Filter visualization
- Filter CRUD operations
- Filter management UI

### Phase 3: Statistics Dashboard

- Real-time statistics views
- Tweet metrics visualization
- Historical data analysis

## API Routes

- `/api/tweets`: Get tweets with filtering options
- `/api/tweets/[id]`: Get a single tweet by ID
- `/api/tweets/stats`: Get tweet statistics
- `/api/tweets/historical`: Get historical tweet data
- `/api/filters`: Get filters with filtering options
- `/api/filters/[topicId]`: Manage filters for a specific topic
- `/api/filters/stats`: Get filter statistics
- `/api/topics`: Get topics with filtering options
- `/api/topics/[id]`: Get a single topic by ID
- `/api/topics/stats`: Get topic statistics

## License

This project is licensed under the MIT License - see the LICENSE file for details.
