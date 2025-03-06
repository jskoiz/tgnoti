import fs from 'fs/promises';
import path from 'path';
import { loadConfig } from '../src/config/unified.js';

async function migrateConfig() {
  try {
    console.log('Loading unified configuration...');
    const config = loadConfig();
    
    console.log('Writing unified configuration to config.unified.json...');
    await fs.writeFile(
      path.join(process.cwd(), 'config.unified.json'),
      JSON.stringify(config, null, 2)
    );
    
    console.log('Configuration migration complete!');
    console.log('Please review config.unified.json and update your .env file as needed.');
  } catch (error) {
    console.error('Error migrating configuration:', error);
  }
}

migrateConfig();