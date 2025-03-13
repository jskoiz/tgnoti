## [1.0.1] - 2025-03-13
### Fixed
- Fixed KOL reply detection to properly identify and filter short reply tweets
- Enhanced reply detection to check both replyToTweet property and tweet text pattern
- Added regex pattern matching to identify tweets starting with @mentions as replies
- Ensures all reply tweets are properly subject to the 6 substantive words requirement
