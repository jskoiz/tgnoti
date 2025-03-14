## [1.0.2] - 2025-03-13
### Added
- Added rejected tweet tracking and analysis functionality
- Modified MongoDB schema to track whether tweets are sent to Telegram
- Added sentToTelegram flag and rejectionReason field to tweet metadata
- Created analyze-rejected-tweets.ts tool for analyzing rejected tweets
- Added detailed rejection reason tracking (duplicate, outside_time_window, validation_failed, filter_mismatch)
- Added MongoDB indexes for efficient querying of rejected tweets
- Added npm script for running the analysis tool

## [1.0.1] - 2025-03-13
### Fixed
- Fixed KOL reply detection to properly identify and filter short reply tweets
- Enhanced reply detection to check both replyToTweet property and tweet text pattern
- Added regex pattern matching to identify tweets starting with @mentions as replies
- Ensures all reply tweets are properly subject to the 6 substantive words requirement
