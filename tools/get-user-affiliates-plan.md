# Plan for User Affiliates Test Script

## Overview
This document outlines the plan for creating a script to test the new feature that gets all affiliated users of a specified Twitter account. The feature was added in [PR #693](https://github.com/Rishikant181/Rettiwt-API/pull/693/files).

## Script Requirements
- Create a TypeScript script that will use the Rettiwt API to fetch affiliates of a specified user
- Print the list of affiliates to the console in a readable format
- Handle errors gracefully
- Allow for optional parameters like count and cursor

## Implementation Details

### File Location
- Create a new file: `tools/get-user-affiliates.ts`

### Dependencies
The script will need to import:
- `dotenv` - To load environment variables
- `chalk` - For colored console output
- `Rettiwt` - From the Rettiwt-API package

### Script Structure

1. **Environment Setup**
   - Load environment variables from `.env`
   - Verify that `RETTIWT_API_KEY` is available

2. **Rettiwt Client Initialization**
   - Create a new Rettiwt client using the API key

3. **Command Line Arguments**
   - Parse command line arguments to get:
     - Username (required) - The Twitter username to fetch affiliates for
     - Count (optional) - Number of affiliates to fetch (default: 20, max: 100)
     - Cursor (optional) - Pagination cursor for fetching more results

4. **Fetch Affiliates Function**
   - Create a function that calls `rettiwt.user.affiliates()`
   - Pass the username, count, and cursor parameters
   - Handle the response and format the output

5. **Output Formatting**
   - Display the total number of affiliates found
   - For each affiliate, show:
     - Username
     - Display name
     - Follower count
     - Following count
     - Verification status

6. **Error Handling**
   - Handle API errors gracefully
   - Provide meaningful error messages

## Example Usage
```bash
# Fetch up to 20 affiliates for the user @trojanonsolana
npx tsx tools/get-user-affiliates.ts trojanonsolana

# Fetch up to 50 affiliates
npx tsx tools/get-user-affiliates.ts trojanonsolana 50

# Fetch with pagination cursor
npx tsx tools/get-user-affiliates.ts trojanonsolana 20 "cursor_value"
```

## Code Implementation (To be done in Code mode)

The script will follow this pseudocode structure:

```typescript
#!/usr/bin/env node
// Import dependencies
import dotenv from 'dotenv';
import chalk from 'chalk';
import { Rettiwt } from 'rettiwt-api';

// Load environment variables
dotenv.config();

// Check for API key
if (!process.env.RETTIWT_API_KEY) {
  console.error(chalk.red('Error: RETTIWT_API_KEY not found in .env file'));
  process.exit(1);
}

// Parse command line arguments
const username = process.argv[2]?.replace('@', '');
const count = parseInt(process.argv[3] || '20', 10);
const cursor = process.argv[4] || undefined;

// Validate arguments
if (!username) {
  console.error(chalk.red('Error: Username is required'));
  console.log(chalk.yellow('Usage: npx tsx tools/get-user-affiliates.ts <username> [count] [cursor]'));
  process.exit(1);
}

// Initialize Rettiwt client
const rettiwt = new Rettiwt({ apiKey: process.env.RETTIWT_API_KEY });

// Main function
async function main() {
  try {
    console.log(chalk.blue(`Fetching affiliates for @${username}...`));
    
    // Call the affiliates API
    const affiliates = await rettiwt.user.affiliates(username, count, cursor);
    
    // Display results
    console.log(chalk.green(`Found ${affiliates.length} affiliates:`));
    
    // Format and display each affiliate
    affiliates.forEach((user, index) => {
      console.log(chalk.cyan(`${index + 1}. @${user.userName} (${user.fullName})`));
      console.log(`   Followers: ${user.followersCount}, Following: ${user.followingCount}`);
      console.log(`   Verified: ${user.isVerified ? 'Yes' : 'No'}`);
      console.log('');
    });
    
    // Show pagination info if available
    if (affiliates.cursor) {
      console.log(chalk.yellow(`More results available. Use cursor: ${affiliates.cursor}`));
    }
    
  } catch (error) {
    console.error(chalk.red('Error fetching affiliates:'), error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
```

## Next Steps
1. Switch to Code mode to implement the actual script
2. Test the script with the specified account (@trojanonsolana)
3. Verify that the output is correct and formatted properly