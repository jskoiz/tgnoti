#!/usr/bin/env node
import { spawn } from 'child_process';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Migration steps
const migrationSteps = [
  {
    name: 'Initialize MongoDB Config',
    script: 'tools/init-mongodb-config.ts',
    description: 'Initializes the MongoDB config collection with data from environment variables'
  },
  {
    name: 'Migrate Topic Filters',
    script: 'tools/migrate-topic-filters.ts',
    description: 'Migrates topic filters from SQLite to MongoDB'
  },
  {
    name: 'Migrate Tracked Tweets',
    script: 'tools/migrate-tracked-tweets.ts',
    description: 'Migrates tracked tweets from SQLite to MongoDB'
  }
];

async function runMigration() {
  console.log('Starting migration to MongoDB...');
  console.log('This script will run the following steps:');
  
  migrationSteps.forEach((step, index) => {
    console.log(`${index + 1}. ${step.name}: ${step.description}`);
  });
  
  console.log('\n');
  
  // Run each migration step
  for (let i = 0; i < migrationSteps.length; i++) {
    const step = migrationSteps[i];
    console.log(`\n[${i + 1}/${migrationSteps.length}] Running ${step.name}...`);
    
    try {
      await runScript(step.script);
      console.log(`✓ ${step.name} completed successfully`);
    } catch (error) {
      console.error(`✗ ${step.name} failed:`, error);
      console.error('Migration aborted');
      process.exit(1);
    }
  }
  
  console.log('\nMigration completed successfully!');
  console.log('\nYou can now run the following command to test the migration:');
  console.log('node --loader ts-node/esm tools/simple-mongodb-test.ts');
  
  console.log('\nTo verify the application works with MongoDB:');
  console.log('1. Make sure your .env file has the MONGO_DB_STRING set');
  console.log('2. Run the application with:');
  console.log('   npm start');
}

// Helper function to run a script
function runScript(scriptPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fullPath = path.resolve(process.cwd(), scriptPath);
    console.log(`Executing: node --loader ts-node/esm ${fullPath}`);
    
    const child = spawn('node', ['--loader', 'ts-node/esm', fullPath], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

// Run the migration
runMigration().catch(console.error);