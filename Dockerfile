FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies including dev dependencies for build
RUN npm ci

# Bundle app source
COPY . .

# Build TypeScript
RUN npm run build

# Clean up and install production dependencies
RUN rm -rf src node_modules && \
    npm ci --only=production

# Start the server
CMD [ "node", "dist/index.js" ]
