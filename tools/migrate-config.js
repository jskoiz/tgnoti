import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../dist/config/unified.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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