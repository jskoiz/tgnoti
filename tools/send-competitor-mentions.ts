#!/usr/bin/env tsx
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

// Load environment variables from tools/.env if it exists
const toolsEnvPath = path.join(process.cwd(), 'tools', '.env');
if (fs.existsSync(toolsEnvPath)) {
  dotenv.config({ path: toolsEnvPath });
  console.log(chalk.blue('Loaded environment variables from tools/.env'));
}

// Telegram credentials
const TELEGRAM_BOT_TOKEN = process.env.STAGING_TELEGRAM_BOT_TOKEN || '7590784859:AAEzgfFmMdhJESWEAr2dNjee_dahxFY-u9c';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID || '-1002379334714';

// Competitor data with type definition
interface Competitor {
  name: string;
  mentions: number;
  color: string;
  borderColor: string;
  backgroundColor: string;
  displayName?: string;
}

const competitors: Competitor[] = [
  { name: 'Photon', displayName: 'Photon', mentions: 5342, color: 'rgba(54, 162, 235, 1)', borderColor: 'rgba(54, 162, 235, 1)', backgroundColor: 'rgba(54, 162, 235, 0.2)' },
  { name: 'BullX', displayName: 'BullX', mentions: 6213, color: 'rgba(255, 159, 64, 1)', borderColor: 'rgba(255, 159, 64, 1)', backgroundColor: 'rgba(255, 159, 64, 0.2)' },
  { name: 'GMGN', displayName: 'GMGN', mentions: 3461, color: 'rgba(75, 192, 192, 1)', borderColor: 'rgba(75, 192, 192, 1)', backgroundColor: 'rgba(75, 192, 192, 0.2)' },
  { name: 'Nova', displayName: 'Nova', mentions: 6842, color: 'rgba(153, 102, 255, 1)', borderColor: 'rgba(153, 102, 255, 1)', backgroundColor: 'rgba(153, 102, 255, 0.2)' },
  { name: 'Trojan', displayName: 'Trojan', mentions: 411, color: 'rgba(75, 192, 75, 1)', borderColor: 'rgba(75, 192, 75, 1)', backgroundColor: 'rgba(75, 192, 75, 0.2)' },
  { name: 'Bonk', displayName: 'Bonk', mentions: 1050, color: 'rgba(255, 206, 86, 1)', borderColor: 'rgba(255, 206, 86, 1)', backgroundColor: 'rgba(255, 206, 86, 0.2)' },
  { name: 'Bloom', displayName: 'Bloom', mentions: 311, color: 'rgba(255, 99, 132, 1)', borderColor: 'rgba(255, 99, 132, 1)', backgroundColor: 'rgba(255, 99, 132, 0.2)' },
  { name: 'Maestro', displayName: 'Maestro', mentions: 329, color: 'rgba(128, 0, 128, 1)', borderColor: 'rgba(128, 0, 128, 1)', backgroundColor: 'rgba(128, 0, 128, 0.2)' }
];

// Date range
const dates = [
  'Mar 10', 'Mar 11', 'Mar 12', 'Mar 13', 'Mar 14', 'Mar 15', 'Mar 16'
];

// Sample data for the chart (7 days of data for each competitor)
// This is mock data that follows the pattern in the screenshot
interface MentionsData {
  [key: string]: number[];
}

const mentionsData: MentionsData = {
  'Photon': [271, 247, 291, 909, 2581, 978, 65],
  'BullX': [286, 295, 451, 1085, 2950, 1093, 53],
  'GMGN': [1006, 698, 594, 501, 411, 239, 12],
  'Nova': [43, 185, 634, 181, 2862, 2814, 123],
  'Trojan': [51, 30, 59, 165, 52, 50, 4],
  'Bonk': [147, 88, 325, 98, 293, 81, 18],
  'Bloom': [3, 162, 93, 15, 6, 19, 13],
  'Maestro': [6, 51, 54, 75, 92, 49, 2]
};

// Calculate grand total
const grandTotal = competitors.reduce((sum, comp) => sum + comp.mentions, 0);

/**
 * Generate a chart image using Chart.js
 */
async function generateChart(): Promise<Buffer> {
  // Create a canvas instance
  const width = 800;
  const height = 400;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: '#2c2c2c' });

  // Prepare datasets
  const datasets = competitors.map(competitor => ({
    label: competitor.displayName || competitor.name,
    data: mentionsData[competitor.name],
    borderColor: competitor.borderColor,
    backgroundColor: competitor.backgroundColor,
    fill: true,
    tension: 0.4,
    pointRadius: 5,
    pointHoverRadius: 7,
    borderWidth: 2
  }));

  // Chart configuration
  const configuration: ChartConfiguration = {
    type: 'line',
    data: {
      labels: dates,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        title: {
          display: true,
          text: '7-Day Competitor Mentions',
          color: 'white',
          font: {
            size: 18,
            weight: 'bold'
          }
        },
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: 'white',
            padding: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 10,
            font: {
              size: 10
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'white',
            font: {
              size: 12
            }
          }
        },
        y: {
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'white',
            font: {
              size: 12
            }
          }
        }
      }
    }
  };

  // Generate chart
  return await chartJSNodeCanvas.renderToBuffer(configuration);
}

/**
 * Format the message with HTML for Telegram
 */
function formatMessage(): string {
  // Date range
  const startDate = 'Mar 10, 2025';
  const endDate = 'Mar 16, 2025';

  // Create the message with header
  let message = `<b>Forwarded from:</b> ❌ X NOTIFICATIONS (STAGING)\n\n`;
  
  // Add chart title and date range
  message += `<b>📊 7-Day Competitor Mentions</b>\n`;
  message += `<i>${startDate} - ${endDate}</i>\n\n`;
  
  message += `<b>Total Mentions:</b>\n`;
  
  // Sort competitors by mentions in descending order
  const sortedCompetitors = [...competitors].sort((a, b) => b.mentions - a.mentions);
  
  // Create a simple table with shorter names
  let tableContent = `Account   Mentions   %\n`;
  tableContent += `---------------------\n`;
  
  // Add competitor mentions with proper formatting in table-like structure
  for (const competitor of sortedCompetitors) {
    const percentage = ((competitor.mentions / grandTotal) * 100).toFixed(1);
    const accountPadded = competitor.name.padEnd(9);
    const mentionsPadded = competitor.mentions.toString().padStart(8);
    
    tableContent += `${accountPadded}${mentionsPadded}   ${percentage}%\n`;
  }
  
  // Add the table as a single pre block
  message += `<pre>${tableContent}</pre>\n`;
  
  message += `\n<b>7 Day Total:</b> ${grandTotal} mentions`;
  
  return message;
}

/**
 * Generate individual trend charts for each competitor
 * This is for demonstration purposes only - in a real implementation,
 * you would use actual trend data from your database or API
 */
async function generateTrendCharts(): Promise<Buffer[]> {
  const width = 300;
  const height = 100;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'transparent' });
  
  const trendCharts: Buffer[] = [];
  
  // Sample trend patterns based on the Radar screenshots
  const trendPatterns: Record<string, number[]> = {
    // Photon - bell curve with peak toward right
    'Photon': [10, 20, 30, 50, 70, 90, 100, 80, 50],
    // BullX - bell curve with peak toward right
    'BullX': [5, 10, 20, 40, 60, 80, 100, 80, 50],
    // GMGN - peak then gradual decline
    'GMGN': [30, 50, 80, 100, 90, 70, 50, 30, 20],
    // Nova - small bump then large peak at end
    'Nova': [10, 20, 30, 40, 30, 50, 70, 90, 100],
    // Trojan - double peak pattern
    'Trojan': [20, 40, 60, 50, 30, 50, 100, 80, 60],
    // Bonk - double peak pattern
    'Bonk': [30, 50, 70, 60, 40, 60, 90, 100, 80],
    // Bloom - sharp peak then valley then rise
    'Bloom': [100, 70, 40, 20, 10, 30, 60, 80, 70],
    // Maestro - gradual rise to peak at end
    'Maestro': [10, 20, 30, 40, 50, 60, 70, 90, 100]
  };
  
  for (const competitor of competitors) {
    const data = trendPatterns[competitor.name] || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    const configuration: ChartConfiguration = {
      type: 'line',
      data: {
        labels: Array(data.length).fill(''),  // Empty labels for cleaner look
        datasets: [{
          data,
          borderColor: competitor.borderColor,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false
          }
        }
      }
    };
    
    const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
    trendCharts.push(buffer);
  }
  
  return trendCharts;
}

/**
 * Send the message with chart to Telegram
 */
async function sendTelegramMessage(chartBuffer: Buffer, message: string): Promise<void> {
  try {
    console.log(chalk.blue('Initializing Telegram bot...'));
    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    
    console.log(chalk.blue('Sending message to Telegram...'));
    
    // Save chart to temporary file
    const tempFilePath = path.join(process.cwd(), 'temp-chart.png');
    fs.writeFileSync(tempFilePath, chartBuffer);
    
    // Send photo with caption
    await bot.sendPhoto(TELEGRAM_GROUP_ID, tempFilePath, {
      caption: message,
      parse_mode: 'HTML'
    });
    
    // Clean up temporary file
    fs.unlinkSync(tempFilePath);
    
    console.log(chalk.green('Message sent successfully!'));
    
    // Note: In a real implementation, you might want to send individual trend charts
    // as separate messages or combine them into a single image. For this example,
    // we're just generating them to demonstrate the capability.
    console.log(chalk.blue('Note: Individual trend charts for each competitor can be generated'));
    console.log(chalk.blue('but are not being sent in this demo to avoid spamming the channel.'));
  } catch (error) {
    console.error(chalk.red('Error sending message to Telegram:'), error);
    throw error;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    console.log(chalk.blue('Generating competitor mentions chart...'));
    
    // Generate main chart
    const chartBuffer = await generateChart();
    
    // Generate trend charts (not being sent in this demo)
    await generateTrendCharts();
    
    // Format message
    const message = formatMessage();
    
    // Send to Telegram
    await sendTelegramMessage(chartBuffer, message);
    
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
