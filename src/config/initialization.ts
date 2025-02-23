import 'reflect-metadata';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Calculate base path to find .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePath = path.join(__dirname, '../..');

// Load environment variables from .env file
const result = config({ path: path.join(basePath, '.env') });

if (result.error) {
  throw new Error('Failed to load .env file');
}

// This file initializes reflect-metadata and loads environment variables
// It must be imported before any other files that use decorators or env vars