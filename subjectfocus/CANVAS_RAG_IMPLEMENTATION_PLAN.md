# Canvas RAG Integration - Implementation Plan

## 📋 Overview

Integrate Canvas vector store (`canvas_content_vectors`) with AI features to provide **context-aware responses** using Retrieval-Augmented Generation (RAG).

### Features to Integrate:
1. **Flashcard AI Chat** - Generate flashcards from course content
2. **Study Guide AI Panel** - Create study guides using course materials
3. **Podcast Creation** - Provide API for vector search (you manage integration)

---

## 🗃️ Current Setup (From Your n8n Workflow)

### Vector Store Table: `canvas_content_vectors`

**Metadata Structure:**
```json
{
  "canvas_item_id": "393998",
  "canvas_course_id": "23fae7ee-ebac-4a31-9659-14ff4fc5c640",
  "item_name": "Guidesheet",
  "item_type": "File",
  "chunk_index": 0,
  "loc": {
    "lines": { "from": 1, "to": 1 }
  },
  "line": 1,
  "source": "blob",
  "blobType": "application/json"
}
```

**Embedding Model:**
- OpenAI `text-embedding-3-small` (1536 dimensions)
- Batch size: 200 chunks

**Linking:**
- Study sets have `linked_canvas_courses` array
- Use these links to scope vector search to relevant courses

---

## 🎯 Implementation Steps

### Phase 1: Database Setup (code-executor)

**Task:** Verify/create `canvas_content_vectors` table with proper schema

```sql
CREATE TABLE IF NOT EXISTS canvas_content_vectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  canvas_course_id uuid REFERENCES canvas_courses(id) ON DELETE CASCADE,
  canvas_item_id text NOT NULL,
  item_name text,
  item_type text,
  chunk_index integer DEFAULT 0,
  chunk_text text NOT NULL,
  embedding vector(1536),  -- text-embedding-3-small
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_canvas_vectors_course ON canvas_content_vectors(canvas_course_id);
CREATE INDEX IF NOT EXISTS idx_canvas_vectors_user ON canvas_content_vectors(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_vectors_item ON canvas_content_vectors(canvas_item_id);

-- Vector similarity index (IVFFlat for speed)
CREATE INDEX IF NOT EXISTS idx_canvas_vectors_embedding
ON canvas_content_vectors
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**RLS Policies:**
```sql
-- Users can only see their own vectors
CREATE POLICY "Users can view their own canvas vectors"
ON canvas_content_vectors FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own canvas vectors"
ON canvas_content_vectors FOR INSERT
WITH CHECK (user_id = auth.uid());
```

---

### Phase 2: Vector Search Function (code-executor)

**Task:** Create PostgreSQL function for semantic search

```sql
CREATE OR REPLACE FUNCTION search_canvas_vectors(
  query_embedding vector(1536),
  course_ids uuid[],
  user_id_param uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  canvas_item_id text,
  item_name text,
  item_type text,
  chunk_text text,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cv.id,
    cv.canvas_item_id,
    cv.item_name,
    cv.item_type,
    cv.chunk_text,
    1 - (cv.embedding <=> query_embedding) AS similarity,
    cv.metadata
  FROM canvas_content_vectors cv
  WHERE
    cv.user_id = user_id_param
    AND cv.canvas_course_id = ANY(course_ids)
    AND 1 - (cv.embedding <=> query_embedding) > match_threshold
  ORDER BY cv.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

### Phase 3: Serverless API Endpoint (code-executor)

**Task:** Create `/api/vector-search` endpoint

**File:** `netlify/functions/vector-search.js` (or `api/vector-search/index.js` for Vercel)

```javascript
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const {
      query,
      study_set_id,
      user_id,
      match_count = 5,
      match_threshold = 0.7
    } = req.body

    // 1. Get linked canvas courses from study set
    const { data: studySet } = await supabase
      .from('study_sets')
      .select('linked_canvas_courses')
      .eq('id', study_set_id)
      .eq('user_id', user_id)
      .single()

    if (!studySet?.linked_canvas_courses?.length) {
      return res.json({ results: [], message: 'No linked Canvas courses' })
    }

    // 2. Generate embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // 3. Search vectors
    const { data: results, error } = await supabase.rpc('search_canvas_vectors', {
      query_embedding: queryEmbedding,
      course_ids: studySet.linked_canvas_courses,
      user_id_param: user_id,
      match_threshold,
      match_count
    })

    if (error) throw error

    return res.json({ results })

  } catch (error) {
    console.error('Vector search error:', error)
    return res.status(500).json({ error: error.message })
  }
}
```

---

### Phase 4: RAG Integration - Flashcard Chat (code-executor)

**Task:** Modify `server/openaiChat.js` to use vector search

**Current flow:**
1. User sends message
2. Context includes: study set title, subject, existing cards
3. OpenAI generates response

**New RAG flow:**
1. User sends message
2. **NEW:** Call vector search with message as query
3. Get top 5 relevant chunks from Canvas course
4. Add chunks to system prompt as context
5. OpenAI generates response using course content
6. Return flashcards + source citations

**Code changes:**

```javascript
// server/openaiChat.js

async function getCanvasContext(query, studySetId, userId) {
  try {
    const response = await fetch(`${process.env.API_BASE_URL}/api/vector-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        study_set_id: studySetId,
        user_id: userId,
        match_count: 5,
        match_threshold: 0.7
      })
    })

    const { results } = await response.json()
    return results || []
  } catch (error) {
    console.error('Failed to fetch canvas context:', error)
    return []
  }
}

// In handleChat function (flashcard mode):
if (context.mode !== 'study_guide') {
  // Get relevant course content
  const canvasChunks = await getCanvasContext(
    messages[messages.length - 1].content,
    context.study_set_id,
    user_id
  )

  // Add to system prompt
  if (canvasChunks.length > 0) {
    const contextText = canvasChunks
      .map((chunk, i) => `[Source ${i + 1}: ${chunk.item_name}]\n${chunk.chunk_text}`)
      .join('\n\n---\n\n')

    systemPrompt += `\n\nRelevant course materials:\n${contextText}`
  }
}
```

---

### Phase 5: RAG Integration - Study Guides (code-executor)

**Task:** Modify `StudyGuideAIPanel.jsx` to use vector search

**Similar approach:**
1. When generating study guide section, search vectors
2. Include relevant chunks in context
3. AI generates guide using actual course content

```javascript
// In AIChatPanel.jsx or StudyGuideAIPanel.jsx

const handleSendMessage = async (message) => {
  // ... existing code ...

  // NEW: Fetch relevant canvas context
  const vectorResponse = await fetch('/api/vector-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: message,
      study_set_id: studySetId,
      user_id: user.id,
      match_count: 5
    })
  })

  const { results } = await vectorResponse.json()

  // Add results to context
  const contextWithVectors = {
    ...context,
    canvas_context: results
  }

  // Send to chat endpoint
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [...messages, { role: 'user', content: message }],
      context: contextWithVectors,
      user_id: user.id
    })
  })

  // ... rest of existing code ...
}
```

---

### Phase 6: Reusable Vector Search Hook (code-executor)

**Task:** Create React hook for vector search

**File:** `src/hooks/useCanvasVectorSearch.js`

```javascript
import { useState } from 'react'
import { useAuth } from './useAuth'

export function useCanvasVectorSearch() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const searchVectors = async (query, studySetId, options = {}) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          study_set_id: studySetId,
          user_id: user.id,
          match_count: options.matchCount || 5,
          match_threshold: options.matchThreshold || 0.7
        })
      })

      if (!response.ok) throw new Error('Vector search failed')

      const { results } = await response.json()
      return results

    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { searchVectors, loading, error }
}
```

**Usage:**
```javascript
const { searchVectors } = useCanvasVectorSearch()

const handleSearch = async () => {
  const results = await searchVectors('photosynthesis', studySetId)
  console.log('Found:', results)
}
```

---

### Phase 7: Podcast API (For You)

**Task:** Expose vector search for podcast creation

**You can call:**
```bash
POST /api/vector-search
{
  "query": "explain neural networks",
  "study_set_id": "uuid",
  "user_id": "uuid",
  "match_count": 10
}
```

**Returns:**
```json
{
  "results": [
    {
      "id": "uuid",
      "canvas_item_id": "393998",
      "item_name": "Neural Networks Lecture",
      "item_type": "File",
      "chunk_text": "Neural networks consist of...",
      "similarity": 0.89,
      "metadata": { "loc": {...} }
    }
  ]
}
```

---

## 🧪 Testing Plan

### Test 1: Vector Search Function
```sql
-- Generate test embedding (1536 dimensions of 0.1)
SELECT search_canvas_vectors(
  '[0.1, 0.1, ...]'::vector,
  ARRAY['course-uuid']::uuid[],
  'user-uuid'::uuid,
  0.5,
  5
);
```

### Test 2: API Endpoint
```bash
curl -X POST http://localhost:8888/api/vector-search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "what is photosynthesis",
    "study_set_id": "uuid",
    "user_id": "uuid"
  }'
```

### Test 3: End-to-End RAG
1. Open flashcard chat
2. Ask: "Create flashcards about neural networks"
3. **Expected:** AI uses actual lecture content from Canvas
4. Verify response includes relevant course material

---

## 📊 Success Metrics

- ✅ Vector search returns results in <500ms
- ✅ AI responses cite specific course materials
- ✅ Flashcards accurately reflect Canvas content
- ✅ Study guides pull from multiple course sources
- ✅ Similarity scores > 0.7 for relevant matches

---

## 🚨 Edge Cases

1. **No linked Canvas courses:**
   - Fallback to non-RAG mode
   - Show message: "Link a Canvas course for context-aware responses"

2. **No embeddings found:**
   - Vector search returns empty
   - AI generates generic flashcards

3. **Old embeddings (outdated content):**
   - Consider adding `updated_at` checks
   - Re-vectorize if course content changed

4. **User has multiple Canvas courses:**
   - Search across ALL linked courses
   - AI can pull from multiple sources

---

## 🔒 Security

- ✅ RLS policies ensure users only access their vectors
- ✅ Service role key only used server-side
- ✅ User ID validated on every request
- ✅ Study set ownership verified before vector search

---

## 📝 Next Steps After Implementation

1. **Add source citations** to AI responses
   - Show which Canvas files were used
   - Link back to original content

2. **Improve chunking strategy**
   - Experiment with chunk sizes
   - Add semantic chunking (split by topics)

3. **Hybrid search**
   - Combine vector search + keyword filters
   - Filter by `item_type` (only search assignments, etc.)

4. **Caching**
   - Cache frequent queries
   - Store embeddings for common questions

---

**Ready to implement?** Let's use the code-executor agent to build this! 🚀
