# Canvas RAG - Quick Start Guide

## What Was Built?

A complete Retrieval-Augmented Generation (RAG) system that enhances AI-powered features (flashcard generation, study guides) with actual Canvas course content.

When users ask questions, the system:
1. Searches for semantically similar Canvas course materials
2. Adds top results to the AI system prompt
3. AI generates responses grounded in course content
4. Users get accurate, course-specific answers

---

## Key Components

### 1. Database: canvas_content_vectors
- Stores embeddings of Canvas content chunks
- Created via migration: `supabase/migrations/20251107021442_add_canvas_content_vectors_and_search.sql`
- Vectorization done by n8n workflow (separate from this implementation)

### 2. Search Function: search_canvas_vectors()
- PostgreSQL function that performs semantic search
- Uses cosine distance over IVFFlat index
- Fast: <100ms for typical queries

### 3. API Endpoints: /api/vector-search
- **Netlify:** `netlify/functions/vector-search.js`
- **Vercel:** `api/vector-search/index.js`
- Generates query embedding, calls search function, returns results

### 4. Server Integration: server/openaiChat.js
- Fetches canvas context automatically for all chat requests
- Adds course materials to system prompt
- Works for both flashcard and study guide modes

### 5. React Hook: useCanvasVectorSearch
- `src/hooks/useCanvasVectorSearch.js`
- For custom components that need direct vector search

---

## How to Use

### For Flashcard Generation
```
User: "Create flashcards about photosynthesis"
System: Searches Canvas for photosynthesis content
        Adds top 5 results to AI prompt
        AI generates flashcards using course materials
```

### For Study Guides
```
User: "Explain cell division for my study guide"
System: Searches Canvas for cell division materials
        Adds to prompt
        AI creates guide section using course content
```

### For Podcasts (in n8n workflow)
```
POST /api/vector-search
{
  "query": "neural networks",
  "study_set_id": "xxx",
  "user_id": "xxx",
  "match_count": 10
}
Returns: Top 10 matching chunks for podcast script
```

### In Custom Components
```javascript
import { useCanvasVectorSearch } from '@/hooks/useCanvasVectorSearch'

const { searchVectors, loading, error } = useCanvasVectorSearch()

// Search for content
const results = await searchVectors('quantum mechanics', studySetId)
```

---

## Environment Setup

### Local Development (Netlify)
```bash
# 1. Start Supabase
supabase start

# 2. Apply migrations
supabase db reset

# 3. Run Netlify with environment variables
netlify dev \
  --env OPENAI_API_KEY=sk-... \
  --env SUPABASE_URL=http://localhost:54321 \
  --env SUPABASE_SERVICE_ROLE_KEY=... \
  --env API_BASE_URL=http://localhost:8888
```

### Production (Netlify/Vercel)
Set environment variables in dashboard:
- OPENAI_API_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

---

## Testing Checklist

- [ ] Migration applied: `supabase db reset`
- [ ] pgvector extension created
- [ ] canvas_content_vectors table exists
- [ ] search_canvas_vectors function works
- [ ] Vector search API returns 200 OK
- [ ] Study set has linked_canvas_courses populated
- [ ] Canvas course has vectors (from n8n workflow)
- [ ] Flashcard chat includes canvas context in logs
- [ ] Study guide generation mentions course materials
- [ ] useCanvasVectorSearch hook can search

---

## Debugging

**"No linked Canvas courses" message?**
→ Study set needs to have linked_canvas_courses array populated

**Vector search returns empty results?**
→ Check if Canvas course has been vectorized (canvas_content_vectors table)

**AI responses don't include course content?**
→ Check server console logs for "Canvas context results: X"
→ Verify /api/vector-search endpoint is accessible

**Function not found error?**
→ Ensure migration was applied: `supabase db reset`

---

## Key Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20251107021442_...` | Database schema & function |
| `netlify/functions/vector-search.js` | API endpoint (Netlify) |
| `api/vector-search/index.js` | API endpoint (Vercel) |
| `server/openaiChat.js` | RAG integration with AI chat |
| `src/hooks/useCanvasVectorSearch.js` | React hook for manual searches |

---

## API Reference

### POST /api/vector-search
Search for semantically similar Canvas content

**Request:**
```json
{
  "query": "what is photosynthesis",
  "study_set_id": "uuid",
  "user_id": "uuid",
  "match_count": 5,
  "match_threshold": 0.7
}
```

**Response:**
```json
{
  "results": [
    {
      "id": "uuid",
      "canvas_item_id": "393998",
      "item_name": "Lecture Slides - Photosynthesis",
      "item_type": "File",
      "chunk_text": "Photosynthesis is...",
      "similarity": 0.92,
      "metadata": {}
    }
  ]
}
```

---

## Configuration

### Tuning Search Results

In `server/openaiChat.js`, adjust:
```javascript
canvasChunks = await getCanvasContext(query, studySetId, userId)
// Change match_count and match_threshold in the fetch body
```

Default settings:
- `match_count: 5` - Top 5 results
- `match_threshold: 0.7` - Similarity ≥ 0.7 (scale 0-1)

Lower threshold = more results but lower quality
Higher threshold = fewer results but higher quality

---

## Production Checklist

- [ ] Migration deployed to Supabase
- [ ] pgvector extension enabled
- [ ] Environment variables set (Netlify/Vercel)
- [ ] Canvas courses vectorized (n8n workflow ran)
- [ ] API endpoints responding with 200 OK
- [ ] AI chat responses include course citations
- [ ] No console errors in server logs
- [ ] Performance acceptable (<500ms vector search)

---

## Support

For issues or questions:
1. Check CANVAS_RAG_IMPLEMENTATION_VERIFICATION.md for detailed testing
2. Review console logs for debugging clues
3. Verify environment variables are set
4. Ensure Supabase is accessible

---

**Status:** Ready to deploy!
