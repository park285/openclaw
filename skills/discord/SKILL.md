---
name: discord
description: Use when you need to control Discord from OpenClaw via the discord tool: send messages, react, post or upload stickers, upload emojis, run polls, manage threads/pins/search, create/edit/delete channels and categories, fetch permissions or member/role/channel info, set bot presence/activity, or handle moderation actions in Discord DMs or channels.
metadata: {"openclaw":{"emoji":"🎮","requires":{"config":["channels.discord"]}}}
---

# Discord Actions

## Quick Reference

| Action | Required | Optional | Notes |
|--------|----------|----------|-------|
| **Messages** | | | |
| sendMessage | to | content, mediaUrl, replyTo | to: "channel:ID" or "user:ID" |
| readMessages | channelId | limit | Default limit: 20 |
| fetchMessage | guildId, channelId, messageId OR messageLink | | Accepts URLs |
| editMessage | channelId, messageId | content | |
| deleteMessage | channelId, messageId | | |
| searchMessages | guildId, content | channelIds, limit | |
| **Reactions** | | | |
| react | channelId, messageId, emoji | | emoji: "✅" or custom |
| reactions | channelId, messageId | limit | Lists users who reacted |
| **Threads** | | | |
| threadCreate | channelId, name | messageId | |
| threadList | guildId | | |
| threadReply | channelId, content | | |
| **Pins** | | | |
| pinMessage | channelId, messageId | | |
| listPins | channelId | | |
| **Stickers/Emoji** | | | |
| sticker | to, stickerIds | content | Max 3 IDs |
| emojiList | guildId | | |
| emojiUpload | guildId, name, mediaUrl | roleIds | ≤256KB PNG/JPG/GIF |
| stickerUpload | guildId, name, description, tags, mediaUrl | | ≤512KB PNG/APNG/Lottie |
| **Polls** | | | |
| poll | to, question, answers | allowMultiselect, durationHours | 2-10 answers, max 32 days |
| **Info** | | | |
| permissions | channelId | | Bot permissions |
| memberInfo | guildId, userId | | |
| roleInfo | guildId | | |
| channelInfo | channelId | | |
| channelList | guildId | | |
| voiceStatus | guildId, userId | | |
| eventList | guildId | | |
| **Channels** (disabled by default) | | | Enable: `discord.actions.channels: true` |
| channelCreate | guildId, name, type | parentId, topic, position, nsfw | type: 0=text, 2=voice, 4=category |
| channelEdit | channelId | name, topic, position, parentId, nsfw, rateLimitPerUser | |
| channelMove | guildId, channelId | parentId, position | |
| channelDelete | channelId | | |
| categoryCreate | guildId, name | | |
| categoryEdit | categoryId | name | |
| categoryDelete | categoryId | | |
| **Roles** (disabled by default) | | | Enable: `discord.actions.roles: true` |
| roleAdd | guildId, userId, roleId | | |
| **Moderation** (disabled by default) | | | Enable: `discord.actions.moderation: true` |
| timeout | guildId, userId, durationMinutes | | |
| **Presence** (disabled by default) | | | Enable: `discord.actions.presence: true` |
| setPresence | | activityType, activityName, activityState, activityUrl, status | See below |

## Common Parameters

- **channelId**: Discord channel ID (used by most actions)
- **guildId**: Discord server (guild) ID
- **to**: `"channel:<id>"` or `"user:<id>"` (sendMessage/poll/sticker only)
- **mediaUrl**: `file:///path/to/file` or `https://...` for uploads/attachments

**Note**: Message context lines from OpenClaw include `discord message id` and `channel` fields you can reuse.

## Examples

### Send message with media
```json
{
  "action": "sendMessage",
  "to": "channel:123",
  "content": "Check this out!",
  "mediaUrl": "file:///tmp/screenshot.png"
}
```

### React to a message
```json
{
  "action": "react",
  "channelId": "123",
  "messageId": "456",
  "emoji": "✅"
}
```

### Create a poll
```json
{
  "action": "poll",
  "to": "channel:123",
  "question": "Lunch?",
  "answers": ["Pizza", "Sushi", "Salad"],
  "durationHours": 24
}
```

### Create a thread
```json
{
  "action": "threadCreate",
  "channelId": "123",
  "name": "Bug triage",
  "messageId": "456"
}
```

### Set bot presence (if enabled)

**Playing/Listening/Watching/Streaming/Competing**: `activityName` shown in sidebar, `activityState` in profile flyout.  
**Custom status**: `activityName` ignored, only `activityState` displayed.

```json
{
  "action": "setPresence",
  "activityType": "playing",
  "activityName": "with fire"
}
```

```json
{
  "action": "setPresence",
  "activityType": "custom",
  "activityState": "Vibing"
}
```

Status only (no activity):
```json
{
  "action": "setPresence",
  "status": "dnd"
}
```

**Params**: `activityType` (playing/streaming/listening/watching/competing/custom) · `activityName` (ignored for custom) · `activityState` (custom text or flyout) · `activityUrl` (streaming only) · `status` (online/dnd/idle/invisible)

## Action Gating

Via `discord.actions.*`: **Enabled**: reactions, stickers, polls, permissions, messages, threads, pins, search, emojiUploads, stickerUploads, memberInfo, roleInfo, channelInfo, voiceStatus, events. **Disabled**: roles, channels, moderation, presence.

## Discord Writing Style Guide

**Keep it conversational!** Discord is a chat platform, not documentation.

### Do
- Short, punchy messages (1-3 sentences ideal)
- Multiple quick replies > one wall of text
- Use emoji for tone/emphasis 🦞
- Lowercase casual style is fine
- Break up info into digestible chunks
- Match the energy of the conversation

### Don't
- No markdown tables (Discord renders them as ugly raw `| text |`)
- No `## Headers` for casual chat (use **bold** or CAPS for emphasis)
- Avoid multi-paragraph essays
- Don't over-explain simple things
- Skip the "I'd be happy to help!" fluff

### Formatting that works
- **bold** for emphasis
- `code` for technical terms
- Lists for multiple items
- > quotes for referencing
- Wrap multiple links in `<>` to suppress embeds

### Example

❌ Bad:
```
I'd be happy to help with that! Here's a comprehensive overview of the versioning strategies available:

## Semantic Versioning
Semver uses MAJOR.MINOR.PATCH format where...

## Calendar Versioning
CalVer uses date-based versions like...
```

✅ Good:
```
versioning options: semver (1.2.3), calver (2026.01.04), or yolo (`latest` forever). what fits your release cadence?
```
