import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define client directory
const clientDir = path.join(__dirname, '../src/dashboard/client');

/**
 * Execute a shell command and return a promise.
 */
function execPromise(command: string, options: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = exec(command, { cwd: options.cwd }, (error, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    // Pipe output
    proc.stdout?.pipe(process.stdout);
    proc.stderr?.pipe(process.stderr);
  });
}

/**
 * Build the dashboard client using Vite.
 */
async function buildDashboardClient() {
  try {
    console.log('Installing client dependencies...');
    await execPromise('npm install --ignore-scripts', { cwd: clientDir });

    console.log('Running Vite build...');
    await execPromise('npx vite build', { cwd: clientDir });

    console.log('Dashboard client build completed successfully!');
  } catch (error) {
    console.error('Dashboard client build failed:', error);
    process.exit(1);
  }
}

// Execute the build
buildDashboardClient();
