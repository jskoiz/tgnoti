# Telegram Message Schema for Tweet Display

## Message Structure

The message follows a consistent format for displaying tweets in Telegram, with several distinct sections:

### 1. Header Section
```
🧑‍🚀 Username [Stats] [Refresh]
🗓️ Timestamp
💬 Comments 🔁 Retweets ❤️ Likes 👁️ Views
```

#### Components:
- User Info:
  - Emoji prefix (🧑‍🚀 astronaut or 🥷 ninja etc.)
  - Username as clickable link to Twitter profile
  - Stats in parentheses (e.g., follower count)
  - [♽] Refresh button as link
- Timestamp:
  - 🗓️ Calendar emoji prefix
  - Date and time in format: "MMM DD, YY @ HH:mm (time ago)"
- Engagement Metrics:
  - 💬 Comments count
  - 🔁 Retweets count
  - ❤️ Likes count
  - 👁️ Views count
  - Each metric shown with its count in monospace font

### 2. Content Section
```
[Tweet Text]

—
✍️ [Author] | [Index]
```

#### Components:
- Main tweet text preserved as-is
- Separator line ("—")
- Attribution line:
  - ✍️ Pen emoji prefix
  - Author name
  - Index number in brackets

### 3. Retweet/Quote Tweet Structure
When the tweet is a retweet or quote tweet, it includes a nested structure:
```
[Original Tweet Content]

<blockquote>
[Quoted Tweet Header]
🧑‍🚀 Username [Stats] [Refresh]
🗓️ Timestamp
💬 Comments 🔁 Retweets ❤️ Likes 👁️ Views

[Quoted Tweet Content]
📸 [Media Count] (if applicable)
</blockquote>
```

#### Retweet Components:
- Original tweet content above the quote
- Quoted tweet in a blockquote format
- Complete header section for quoted tweet
- Media indicators (📸) with count if present
- Maintains all engagement metrics for both tweets
- Visual separation between original and quoted content

### 4. Footer Section
- Horizontal rule (gradient line)
- Optional translation message (for non-English tweets)
- Quick reaction button (e.g., heart emoji)

### 5. Action Buttons
Two rows of buttons may be present:
```
[🪄 Summarize Tweet]
[🗑️] [🔗 View Tweet]
```
- Optional Summarize button (🪄)
- Delete button (🗑️)
- View Tweet button with link icon (🔗)

## Example Format

### Regular Tweet
```
🧑‍🚀 Username (Stats)
🗓️ Feb 19, 25 @ 08:56 PM (28m ago)
💬 0 🔁 0 ❤️ 3 👁️ 118

[Tweet Content]

─────────────────
[Quick Reaction] [Action Buttons]
```

### Retweet/Quote
```
🥷 Username (Stats) [♽]
🗓️ Feb 19, 25 @ 08:42 PM (49m ago)
💬 29 🔁 16 ❤️ 83 👁️ 5.1K

[Original Tweet Content]

<blockquote>
🧑‍🚀 Quoted Username (Stats)
🗓️ Feb 19, 25 @ 08:31 PM (59m ago)
💬 4 🔁 5 ❤️ 46 👁️ 7.0K

[Quoted Tweet Content]
📸 1
</blockquote>

─────────────────
[Quick Reaction] [Action Buttons]
```

## Styling Notes

1. **Text Formatting**
   - Usernames are bold when linked
   - Stats and timestamps are in italics
   - Metrics use monospace font for numbers
   - Gradient line for visual separation
   - Blockquotes for quoted content

2. **Interactive Elements**
   - Username links to Twitter profile
   - Refresh button (♽) links to update action
   - Action buttons at bottom
   - Quick reaction button for engagement
   - Summarize tweet option when available

3. **Visual Hierarchy**
   - Clear section separation
   - Consistent emoji usage for categories
   - Standardized spacing and alignment
   - Nested structure for retweets/quotes

## Implementation Details

1. **Required Fields**
   - Username
   - Tweet content
   - Timestamp
   - Engagement metrics
   - Attribution

2. **Optional Elements**
   - Translation
   - Media attachments
   - Quick reactions
   - Action buttons
   - Quoted tweet content
   - Summarize button

3. **Formatting Rules**
   - Preserve original tweet formatting
   - Maintain consistent emoji prefixes
   - Use standard date/time format
   - Include all engagement metrics even if 0
   - Properly nest quoted content
   - Handle media count indicators