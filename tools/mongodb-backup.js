#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { promisify } from 'util';

// Load environment variables
dotenv.config();

// MongoDB connection string from environment variable
const MONGO_URI = process.env.MONGO_DB_STRING || '';
const DB_NAME = 'twitter_notifications';
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Promisify exec
const execAsync = promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`${colors.green}Created backup directory: ${BACKUP_DIR}${colors.reset}`);
}

// Function to create a backup using mongodump
async function createBackup() {
  if (!MONGO_URI) {
    throw new Error('MongoDB connection string not found in environment variables');
  }

  try {
    // Extract credentials and connection details from URI
    const uri = new URL(MONGO_URI);
    const username = uri.username ? encodeURIComponent(uri.username) : '';
    const password = uri.password ? encodeURIComponent(uri.password) : '';
    const host = uri.hostname;
    const port = uri.port || '27017';
    const authSource = uri.searchParams.get('authSource') || 'admin';
    
    // Create timestamp for backup filename
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupPath = path.join(BACKUP_DIR, `mongodb-backup-${timestamp}`);
    
    // Create backup directory
    if (!fs.existsSync(backupPath)) {
      fs.mkdirSync(backupPath, { recursive: true });
    }
    
    console.log(`${colors.cyan}Starting MongoDB backup...${colors.reset}`);
    
    // Build mongodump command
    let command = `mongodump --host ${host} --port ${port} --db ${DB_NAME} --out ${backupPath}`;
    
    // Add authentication if credentials exist
    if (username && password) {
      command += ` --username ${username} --password ${password} --authenticationDatabase ${authSource}`;
    }
    
    // Add SSL options if using MongoDB Atlas
    if (MONGO_URI.includes('mongodb+srv')) {
      command += ' --ssl';
    }
    
    // Execute mongodump
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('writing') && !stderr.includes('done dumping')) {
      console.error(`${colors.yellow}Warning during backup:${colors.reset}`, stderr);
    }
    
    console.log(`${colors.green}MongoDB backup completed successfully${colors.reset}`);
    console.log(`${colors.dim}Backup saved to: ${backupPath}${colors.reset}`);
    
    // Create a compressed archive of the backup
    console.log(`${colors.cyan}Compressing backup...${colors.reset}`);
    const archivePath = `${backupPath}.tar.gz`;
    const compressionCommand = `tar -czf ${archivePath} -C ${path.dirname(backupPath)} ${path.basename(backupPath)}`;
    
    await execAsync(compressionCommand);
    console.log(`${colors.green}Backup compressed successfully${colors.reset}`);
    console.log(`${colors.dim}Archive saved to: ${archivePath}${colors.reset}`);
    
    // Remove uncompressed backup directory
    fs.rmSync(backupPath, { recursive: true, force: true });
    console.log(`${colors.dim}Removed uncompressed backup directory${colors.reset}`);
    
    // Cleanup old backups (keep last 7 by default)
    await cleanupOldBackups(7);
    
    return archivePath;
  } catch (error) {
    // Check if the error is due to missing MongoDB tools
    if (error.message && error.message.includes('mongodump: command not found')) {
      console.error(`${colors.red}Backup failed: MongoDB Database Tools not installed${colors.reset}`);
      console.error(`\n${colors.red}${colors.bright}MongoDB Database Tools Not Installed${colors.reset}`);
      console.error(`${colors.yellow}The 'mongodump' command is required but not found in your PATH.${colors.reset}`);
      console.error(`\n${colors.cyan}Please install MongoDB Database Tools:${colors.reset}`);
      console.error(`\n${colors.bright}macOS:${colors.reset}`);
      console.error(`  brew tap mongodb/brew`);
      console.error(`  brew install mongodb-database-tools`);
      console.error(`\n${colors.bright}Linux:${colors.reset}`);
      console.error(`  wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2004-x86_64-100.6.1.deb`);
      console.error(`  sudo apt install ./mongodb-database-tools-ubuntu2004-x86_64-100.6.1.deb`);
      console.error(`\n${colors.bright}Windows:${colors.reset}`);
      console.error(`  Download from: https://www.mongodb.com/try/download/database-tools`);
      console.error(`\nSee README-mongodb-backup.md for detailed installation instructions.`);
    } else {
      // For other errors, show the full error
      console.error(`${colors.red}Restore failed:${colors.reset}`, error);
    }
    process.exit(1);
  }
}

// Function to restore from a backup
async function restoreBackup(backupPath) {
  if (!MONGO_URI) {
    throw new Error('MongoDB connection string not found in environment variables');
  }
  
  if (!backupPath) {
    throw new Error('Backup path is required');
  }
  
  try {
    // Extract credentials and connection details from URI
    const uri = new URL(MONGO_URI);
    const username = uri.username ? encodeURIComponent(uri.username) : '';
    const password = uri.password ? encodeURIComponent(uri.password) : '';
    const host = uri.hostname;
    const port = uri.port || '27017';
    const authSource = uri.searchParams.get('authSource') || 'admin';
    
    console.log(`${colors.cyan}Starting MongoDB restore...${colors.reset}`);
    
    // If the backup is compressed, extract it first
    let extractedPath = backupPath;
    if (backupPath.endsWith('.tar.gz')) {
      const extractDir = path.join(BACKUP_DIR, 'temp-extract');
      
      // Create extraction directory
      if (!fs.existsSync(extractDir)) {
        fs.mkdirSync(extractDir, { recursive: true });
      }
      
      // Extract the archive
      console.log(`${colors.cyan}Extracting backup archive...${colors.reset}`);
      await execAsync(`tar -xzf ${backupPath} -C ${extractDir}`);
      
      // Find the extracted directory
      const files = fs.readdirSync(extractDir);
      if (files.length === 0) {
        throw new Error('Extracted backup is empty');
      }
      
      extractedPath = path.join(extractDir, files[0]);
      console.log(`${colors.green}Backup extracted to: ${extractedPath}${colors.reset}`);
    }
    
    // Build mongorestore command
    let command = `mongorestore --host ${host} --port ${port} --db ${DB_NAME} --drop ${extractedPath}/${DB_NAME}`;
    
    // Add authentication if credentials exist
    if (username && password) {
      command += ` --username ${username} --password ${password} --authenticationDatabase ${authSource}`;
    }
    
    // Add SSL options if using MongoDB Atlas
    if (MONGO_URI.includes('mongodb+srv')) {
      command += ' --ssl';
    }
    
    // Execute mongorestore
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('restoring') && !stderr.includes('done restoring')) {
      console.error(`${colors.yellow}Warning during restore:${colors.reset}`, stderr);
    }
    
    console.log(`${colors.green}MongoDB restore completed successfully${colors.reset}`);
    
    // Clean up temporary extraction directory if we extracted an archive
    if (backupPath.endsWith('.tar.gz')) {
      fs.rmSync(path.join(BACKUP_DIR, 'temp-extract'), { recursive: true, force: true });
      console.log(`${colors.dim}Removed temporary extraction directory${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    // Check if the error is due to missing MongoDB tools
    if (error.message && error.message.includes('mongorestore: command not found')) {
      console.error(`${colors.red}Restore failed: MongoDB Database Tools not installed${colors.reset}`);
      console.error(`\n${colors.red}${colors.bright}MongoDB Database Tools Not Installed${colors.reset}`);
      console.error(`${colors.yellow}The 'mongorestore' command is required but not found in your PATH.${colors.reset}`);
      console.error(`\n${colors.cyan}Please install MongoDB Database Tools:${colors.reset}`);
      console.error(`\n${colors.bright}macOS:${colors.reset}`);
      console.error(`  brew tap mongodb/brew`);
      console.error(`  brew install mongodb-database-tools`);
      console.error(`\n${colors.bright}Linux:${colors.reset}`);
      console.error(`  wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2004-x86_64-100.6.1.deb`);
      console.error(`  sudo apt install ./mongodb-database-tools-ubuntu2004-x86_64-100.6.1.deb`);
      console.error(`\n${colors.bright}Windows:${colors.reset}`);
      console.error(`  Download from: https://www.mongodb.com/try/download/database-tools`);
      console.error(`\nSee README-mongodb-backup.md for detailed installation instructions.`);
    } else {
      // For other errors, show the full error
      console.error(`${colors.red}Backup failed:${colors.reset}`, error);
    }
    
    process.exit(1);
  }
}

// Function to list available backups
function listBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('mongodb-backup-') && file.endsWith('.tar.gz'))
      .sort()
      .reverse(); // Newest first
    
    if (files.length === 0) {
      console.log(`${colors.yellow}No backups found${colors.reset}`);
      return [];
    }
    
    console.log(`${colors.cyan}Available backups:${colors.reset}`);
    files.forEach((file, index) => {
      const stats = fs.statSync(path.join(BACKUP_DIR, file));
      const timestamp = file.replace('mongodb-backup-', '').replace('.tar.gz', '');
      const date = new Date(timestamp).toLocaleString();
      const size = (stats.size / (1024 * 1024)).toFixed(2); // Size in MB
      
      console.log(`${index + 1}. ${colors.bright}${file}${colors.reset}`);
      console.log(`   ${colors.dim}Date: ${date}${colors.reset}`);
      console.log(`   ${colors.dim}Size: ${size} MB${colors.reset}`);
    });
    
    return files.map(file => path.join(BACKUP_DIR, file));
  } catch (error) {
    console.error(`${colors.red}Error listing backups:${colors.reset}`, error);
    return [];
  }
}

// Function to clean up old backups
async function cleanupOldBackups(keepCount = 7) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(file => file.startsWith('mongodb-backup-') && file.endsWith('.tar.gz'))
      .sort(); // Oldest first
    
    if (files.length <= keepCount) {
      return;
    }
    
    const filesToDelete = files.slice(0, files.length - keepCount);
    
    console.log(`${colors.yellow}Cleaning up old backups...${colors.reset}`);
    
    filesToDelete.forEach(file => {
      const filePath = path.join(BACKUP_DIR, file);
      fs.unlinkSync(filePath);
      console.log(`${colors.dim}Deleted: ${file}${colors.reset}`);
    });
    
    console.log(`${colors.green}Cleanup completed. Keeping ${keepCount} most recent backups.${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error cleaning up old backups:${colors.reset}`, error);
  }
}

// Function to validate MongoDB connection
async function validateConnection() {
  if (!MONGO_URI) {
    throw new Error('MongoDB connection string not found in environment variables');
  }
  
  let client;
  try {
    console.log(`${colors.cyan}Validating MongoDB connection...${colors.reset}`);
    
    client = await MongoClient.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      directConnection: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    
    const db = client.db(DB_NAME);
    const collections = await db.listCollections().toArray();
    
    console.log(`${colors.green}MongoDB connection successful${colors.reset}`);
    console.log(`${colors.dim}Database: ${DB_NAME}${colors.reset}`);
    console.log(`${colors.dim}Collections: ${collections.length}${colors.reset}`);
    
    return true;
  } catch (error) {
    console.error(`${colors.red}MongoDB connection failed:${colors.reset}`, error);
    return false;
  } finally {
    if (client) {
      await client.close();
    }
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  
  try {
    switch (command) {
      case 'backup':
        await validateConnection();
        await createBackup();
        break;
        
      case 'restore':
        await validateConnection();
        const backups = listBackups();
        
        if (backups.length === 0) {
          console.log(`${colors.yellow}No backups available to restore${colors.reset}`);
          break;
        }
        
        // If a specific backup is specified
        if (args[1]) {
          const backupIndex = parseInt(args[1], 10);
          if (isNaN(backupIndex) || backupIndex < 1 || backupIndex > backups.length) {
            console.error(`${colors.red}Invalid backup index. Please specify a number between 1 and ${backups.length}${colors.reset}`);
            break;
          }
          
          const backupPath = backups[backupIndex - 1];
          console.log(`${colors.cyan}Selected backup: ${path.basename(backupPath)}${colors.reset}`);
          
          // Confirm restore
          console.log(`${colors.yellow}WARNING: This will replace all data in the ${DB_NAME} database.${colors.reset}`);
          console.log(`${colors.yellow}Type 'yes' to confirm:${colors.reset}`);
          
          process.stdin.resume();
          process.stdin.setEncoding('utf8');
          
          process.stdin.on('data', async (data) => {
            const input = data.toString().trim().toLowerCase();
            
            if (input === 'yes') {
              await restoreBackup(backupPath);
              process.exit(0);
            } else {
              console.log(`${colors.yellow}Restore cancelled${colors.reset}`);
              process.exit(0);
            }
          });
        } else {
          console.log(`${colors.yellow}Please specify a backup to restore:${colors.reset}`);
          console.log(`${colors.dim}Usage: node mongodb-backup.js restore [backup-number]${colors.reset}`);
        }
        break;
        
      case 'list':
        listBackups();
        break;
        
      case 'cleanup':
        const keepCount = args[1] ? parseInt(args[1], 10) : 7;
        if (isNaN(keepCount) || keepCount < 1) {
          console.error(`${colors.red}Invalid keep count. Please specify a positive number.${colors.reset}`);
          break;
        }
        
        await cleanupOldBackups(keepCount);
        break;
        
      default:
        console.log(`${colors.cyan}MongoDB Backup Tool${colors.reset}`);
        console.log(`${colors.dim}Usage:${colors.reset}`);
        console.log(`  ${colors.bright}node mongodb-backup.js backup${colors.reset} - Create a new backup`);
        console.log(`  ${colors.bright}node mongodb-backup.js restore [backup-number]${colors.reset} - Restore from a backup`);
        console.log(`  ${colors.bright}node mongodb-backup.js list${colors.reset} - List available backups`);
        console.log(`  ${colors.bright}node mongodb-backup.js cleanup [keep-count]${colors.reset} - Clean up old backups`);
    }
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error);
    if (!error.message || (!error.message.includes('mongodump: command not found') && !error.message.includes('mongorestore: command not found'))) {
      process.exit(1);
    }
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
});