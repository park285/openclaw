---
name: notion
description: Notion API for creating and managing pages, databases, and blocks.
homepage: https://developers.notion.com
metadata:
  {
    "openclaw":
      { "emoji": "📝", "requires": { "env": ["NOTION_API_KEY"] }, "primaryEnv": "NOTION_API_KEY" },
  }
---

# notion

Use the Notion API to create/read/update pages, data sources (databases), and blocks.

## Setup

1. Create integration at https://notion.so/my-integrations
2. Copy the API key (starts with `ntn_` or `secret_`)
3. Store it: `mkdir -p ~/.config/notion && echo "ntn_your_key_here" > ~/.config/notion/api_key`
4. Share target pages/databases with your integration (click "..." → "Connect to")

## API Setup

```bash
NOTION_KEY=$(cat ~/.config/notion/api_key)
HEADERS=(-H "Authorization: Bearer $NOTION_KEY" -H "Notion-Version: 2025-09-03" -H "Content-Type: application/json")
```

> **Note:** The `Notion-Version` header is **required**. This skill uses `2025-09-03` (latest). In this version, databases are called "data sources" in the API.

## Endpoints

| Action | Method | Endpoint | Body |
|--------|--------|----------|------|
| Search | POST | `/v1/search` | `{"query": "..."}` |
| Get page | GET | `/v1/pages/{page_id}` | - |
| Get page content | GET | `/v1/blocks/{page_id}/children` | - |
| Create page | POST | `/v1/pages` | `{"parent": {"database_id": "..."}, "properties": {...}}` |
| Query data source | POST | `/v1/data_sources/{id}/query` | `{"filter": {...}, "sorts": [...]}` |
| Create data source | POST | `/v1/data_sources` | `{"parent": {"page_id": "..."}, "title": [...], "properties": {...}}` |
| Update page | PATCH | `/v1/pages/{page_id}` | `{"properties": {...}}` |
| Add blocks | PATCH | `/v1/blocks/{page_id}/children` | `{"children": [...]}` |

## Examples

**Search for pages and data sources:**

```bash
curl -X POST "https://api.notion.com/v1/search" "${HEADERS[@]}" \
  -d '{"query": "page title"}'
```

**Create page in a data source:**

```bash
curl -X POST "https://api.notion.com/v1/pages" "${HEADERS[@]}" \
  -d '{
    "parent": {"database_id": "xxx"},
    "properties": {
      "Name": {"title": [{"text": {"content": "New Item"}}]},
      "Status": {"select": {"name": "Todo"}}
    }
  }'
```

## Property Types

Common property formats for database items:

- **Title:** `{"title": [{"text": {"content": "..."}}]}`
- **Rich text:** `{"rich_text": [{"text": {"content": "..."}}]}`
- **Select:** `{"select": {"name": "Option"}}`
- **Multi-select:** `{"multi_select": [{"name": "A"}, {"name": "B"}]}`
- **Date:** `{"date": {"start": "2024-01-15", "end": "2024-01-16"}}`
- **Checkbox:** `{"checkbox": true}`
- **Number:** `{"number": 42}`
- **URL:** `{"url": "https://..."}`
- **Email:** `{"email": "a@b.com"}`
- **Relation:** `{"relation": [{"id": "page_id"}]}`

## Key Differences in 2025-09-03

- **Databases → Data Sources:** Use `/data_sources/` endpoints for queries and retrieval
- **Two IDs:** Each database now has both a `database_id` and a `data_source_id`
  - Use `database_id` when creating pages (`parent: {"database_id": "..."}`)
  - Use `data_source_id` when querying (`POST /v1/data_sources/{id}/query`)
- **Search results:** Databases return as `"object": "data_source"` with their `data_source_id`
- **Parent in responses:** Pages show `parent.data_source_id` alongside `parent.database_id`
- **Finding the data_source_id:** Search for the database, or call `GET /v1/data_sources/{data_source_id}`

## Notes

- Page/database IDs are UUIDs (with or without dashes)
- The API cannot set database view filters — that's UI-only
- Rate limit: ~3 requests/second average
- Use `is_inline: true` when creating data sources to embed them in pages
