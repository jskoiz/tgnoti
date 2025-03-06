# MongoDB Backup Tool

This tool provides functionality to backup and restore your MongoDB database, ensuring data safety and disaster recovery capabilities.

## Features

- Create compressed backups of the MongoDB database
- Restore from previous backups
- List available backups with timestamps and sizes
- Automatically clean up old backups
- Validate MongoDB connection before operations

## Prerequisites

- Node.js installed
- MongoDB connection string in `.env` file
- **MongoDB Database Tools** installed (`mongodump` and `mongorestore`)
- Required npm packages: `mongodb`, `dotenv`

## Important: MongoDB Database Tools Installation

This tool requires the MongoDB Database Tools (`mongodump` and `mongorestore`) to be installed on your system. These tools are **not** included with Node.js or the MongoDB Node.js driver and must be installed separately.

To install MongoDB tools on different platforms:

### macOS (using Homebrew)
```bash
brew tap mongodb/brew
brew install mongodb-database-tools
```

### Linux (Ubuntu/Debian)
```bash
wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2004-x86_64-100.6.1.deb
sudo apt install ./mongodb-database-tools-ubuntu2004-x86_64-100.6.1.deb
```

### Windows
1. Download the MongoDB Database Tools from the [official MongoDB website](https://www.mongodb.com/try/download/database-tools)
2. Extract the archive to a location on your computer
3. Add the bin directory to your PATH environment variable

### Verify Installation

After installation, verify that the tools are correctly installed by running:

```bash
mongodump --version
mongorestore --version
```

If you see version information, the tools are correctly installed.

## Usage

### Create a Backup

```bash
node tools/mongodb-backup.js backup
```

This will:
1. Connect to your MongoDB database
2. Create a backup using `mongodump`
3. Compress the backup into a `.tar.gz` file
4. Store it in the `backups` directory
5. Clean up old backups (keeping the 7 most recent by default)

### List Available Backups

```bash
node tools/mongodb-backup.js list
```

This will display all available backups with:
- Backup filename
- Creation date and time
- File size

### Restore from a Backup

```bash
node tools/mongodb-backup.js restore [backup-number]
```

For example, to restore the first backup in the list:
```bash
node tools/mongodb-backup.js restore 1
```

This will:
1. Extract the backup archive
2. Restore the database using `mongorestore`
3. Clean up temporary files

**Warning**: This will replace all data in the database. You will be prompted to confirm before proceeding.

### Clean Up Old Backups

```bash
node tools/mongodb-backup.js cleanup [keep-count]
```

For example, to keep only the 5 most recent backups:
```bash
node tools/mongodb-backup.js cleanup 5
```

## Backup Strategy Recommendations

### Frequency

- **Daily backups**: For production environments
- **Weekly backups**: For development environments
- **Before major updates**: Always backup before significant changes

### Retention

- Keep daily backups for 7 days
- Keep weekly backups for 4 weeks
- Keep monthly backups for 6 months

### Storage

- Store backups in multiple locations:
  - Local server
  - Cloud storage (AWS S3, Google Cloud Storage, etc.)
  - Offline storage for critical data

### Automation

Set up a cron job to run backups automatically:

```bash
# Example cron job for daily backups at 2 AM
0 2 * * * cd /path/to/project && node tools/mongodb-backup.js backup >> logs/backup.log 2>&1
```

## Troubleshooting

### Common Issues

1. **"mongodump: command not found"**
   - The MongoDB Database Tools are not installed or not in your PATH
   - Follow the installation instructions above to install the tools

2. **Authentication failures**
   - Verify your MongoDB connection string in the `.env` file
   - Ensure the user has appropriate permissions for backup and restore operations

3. **SSL/TLS connection issues**
   - For MongoDB Atlas, ensure you're using the `--ssl` flag (included by default)
   - Check if your MongoDB instance requires additional SSL/TLS options

### General Troubleshooting

1. Verify your MongoDB connection string in `.env`
2. Ensure MongoDB tools are installed and in your PATH
3. Check that you have sufficient disk space for backups
4. Verify that the MongoDB user has sufficient privileges
5. Check the error messages for specific issues

## Notes

- Backups are stored in the `backups` directory in the project root
- Each backup is timestamped for easy identification
- The tool automatically manages backup retention
- Restoration requires confirmation to prevent accidental data loss