---
name: bluebubbles
description: BlueBubbles iMessage integration — send/receive messages, check Claude Code status, and handle requests via BlueBubbles HTTP API. Use when the user wants to communicate via iMessage, check CC status remotely, or manage iMessage conversations through BlueBubbles.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(curl *)
  - Bash(git *)
  - Bash(cat *)
  - Bash(jq *)
---

# /bluebubbles — BlueBubbles iMessage Integration

Integrates Claude Code with iMessage via the BlueBubbles HTTP REST API. Supports sending/receiving messages, checking CC status, and handling incoming requests.

Arguments passed: `$ARGUMENTS`

---

## Configuration

Environment variables (set in shell or `.env`):

| Variable | Required | Description |
|----------|----------|-------------|
| `BB_URL` | yes | BlueBubbles server URL (e.g. `http://localhost:1234`) |
| `BB_PASSWORD` | yes | BlueBubbles server password |
| `BB_DEFAULT_CHAT` | no | Default chat GUID for quick sends |

The base API path is `$BB_URL/api/v1`.

---

## Dispatch on arguments

Parse `$ARGUMENTS` (space-separated). If empty or unrecognized, show help.

### No args — help

Show available subcommands:
- `send <chatGuid|phone> <message>` — Send a text message
- `read [chatGuid] [limit]` — Read recent messages from a chat
- `chats [limit]` — List recent chats
- `status [chatGuid]` — Send current CC status to a chat
- `reply <chatGuid> <message>` — Reply to a specific chat
- `ping` — Test BlueBubbles server connectivity

### `ping`

Test connectivity to the BlueBubbles server:

```bash
curl -s "$BB_URL/api/v1/ping?password=$BB_PASSWORD" | jq .
```

Show the result. If it fails, suggest checking `BB_URL` and `BB_PASSWORD`.

### `send <target> <message>`

Send a text message. `<target>` can be:
- A full chat GUID: `iMessage;-;+15551234567`
- A phone number: `+15551234567` (auto-prefix with `iMessage;-;`)
- An email: `user@icloud.com` (auto-prefix with `iMessage;-;`)
- `default` — use `$BB_DEFAULT_CHAT`

Generate a unique `tempGuid` using `temp-$(date +%s%N)`.

```bash
curl -s -X POST "$BB_URL/api/v1/message/text?password=$BB_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "chatGuid": "<resolved_chat_guid>",
    "message": "<message_text>",
    "tempGuid": "temp-<timestamp>"
  }' | jq .
```

If target is a bare phone number (starts with `+`), wrap it as `iMessage;-;<phone>`.
If target is an email (contains `@`), wrap it as `iMessage;-;<email>`.

### `read [chatGuid] [limit]`

Read recent messages from a chat. Default limit: 10. If no chatGuid, use `$BB_DEFAULT_CHAT`.

```bash
curl -s "$BB_URL/api/v1/chat/<chatGuid>/message?password=$BB_PASSWORD&limit=<limit>&offset=0&sort=DESC" | jq '.data[] | {text, dateCreated, isFromMe, handle: .handle.address}'
```

Display messages in a readable format:
- Show sender (handle address or "Me")
- Show timestamp
- Show message text
- Most recent first

### `chats [limit]`

List recent chats. Default limit: 10.

```bash
curl -s -X POST "$BB_URL/api/v1/chat/query?password=$BB_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": <limit>,
    "offset": 0,
    "sort": "lastmessage",
    "with": ["lastMessage"]
  }' | jq '.data[] | {guid, displayName, chatIdentifier, lastMessage: .lastMessage.text}'
```

Display chats in a table format showing:
- Chat GUID (needed for send/read)
- Display name or chat identifier
- Last message preview

### `status [chatGuid]`

Gather current Claude Code / project status and send it via iMessage.

Collect:
1. `git status` — current branch, modified/untracked files
2. `git log --oneline -5` — recent commits
3. Current working directory
4. Any running background tasks (if applicable)

Format as a concise status report and send it to the chat using the `send` subcommand.

If no chatGuid provided, use `$BB_DEFAULT_CHAT`. If neither is available, just display the status locally.

Example status message format:
```
📊 Claude Code Status
Branch: main
Modified: 3 files
Last commit: feat: add new feature
Working on: <current task if any>
```

### `reply <chatGuid> <message>`

Alias for `send <chatGuid> <message>`. Exists for semantic clarity when responding to incoming messages.

---

## Handling incoming messages

When a message arrives from iMessage (via the existing iMessage MCP channel or polling), and the user asks to respond via BlueBubbles:

1. Parse the incoming message for intent
2. If it's a status check request (contains "状态", "status", "在干嘛"), auto-gather and send status
3. If it's a task/request, acknowledge receipt and inform the user
4. Always use BlueBubbles API to send the response

---

## Error handling

- If `BB_URL` or `BB_PASSWORD` is not set, tell the user to configure them:
  ```
  export BB_URL="http://localhost:1234"
  export BB_PASSWORD="your-password"
  ```
- If API returns non-200, show the error message from the response
- If connection refused, suggest checking if BlueBubbles server is running
- URL-encode chatGuid values that contain special characters (`;`, `+`) when used in URL paths

---

## Security notes

- Never log or display the full `BB_PASSWORD` — show only first 3 chars + `***`
- Chat GUIDs in URL paths must be URL-encoded (`;` → `%3B`, `+` → `%2B`)
- Don't auto-respond to messages without user confirmation unless explicitly configured
