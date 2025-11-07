import { createClient } from '@supabase/supabase-js'

/**
 * Model + Supabase bootstrap
 */
const MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-5-mini'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8888'

const supabaseService = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null

/**
 * System prompts
 * Added: explicit “JSON only” instruction.
 */
const FLASHCARD_SYSTEM_PROMPT = `You are SubjectFocus, an assistant that helps students craft effective study materials.
Return ONLY a JSON object matching the response schema. Do not include markdown fences.

When responding, you should provide:
1. A helpful message to the user
2. Any flashcards you want to create (optional)

Your response must be valid JSON matching this structure:
{
  "message": "Your helpful response to the user",
  "flashcards": [
    {
      "term": "Front of card",
      "definition": "Back of card"
    }
  ]
}

Guidelines:
- Keep messages concise and practical
- Only create flashcards when you have enough information
- Each flashcard should have a clear term and accurate definition
- Don't repeat cards that already exist
- If you're not creating cards, just provide a message with an empty flashcards array`

const STUDY_GUIDE_SYSTEM_PROMPT = `You are SubjectFocus, an assistant that helps students create comprehensive study guides.
Return ONLY a JSON object matching the response schema. Do not include markdown fences.

CRITICAL: The "content" field MUST contain HTML study guide material. This is not optional.

Example response:
{
  "message": "Added section on photosynthesis",
  "content": "<h2>Photosynthesis</h2><p>Photosynthesis is the process by which plants convert light energy into chemical energy...</p><h3>Key Steps</h3><ul><li><strong>Light reactions:</strong> Occur in thylakoid membranes</li><li><strong>Calvin cycle:</strong> Produces glucose</li></ul>"
}

RULES:
1. MESSAGE: One brief sentence acknowledging what you created
2. CONTENT: HTML-formatted educational text 
   - Always start with <h2>Topic Name</h2>
   - Include multiple <p> paragraphs with detailed explanations
   - Use <h3> for subsections
   - Use <ul>/<ol> for lists, <strong> for key terms
   - Provide substantial educational content (3-5 paragraphs minimum)
   - NEVER return empty content - always write actual study material

The content will be automatically inserted into the user's document.`

/**
 * Utility: compact the context so it does not drown the model.
 */
function truncate(str, max) {
  if (!str || typeof str !== 'string') return str
  return str.length <= max ? str : str.slice(-max)
}

/**
 * Fetch Canvas content via vector search for RAG
 * Returns relevant chunks from linked Canvas courses
 */
async function getCanvasContext(query, studySetId, userId) {
  try {
    if (!studySetId || !userId) {
      console.log('Skipping canvas context: missing studySetId or userId')
      return []
    }

    console.log('Fetching canvas context for query:', query)
    const endpoint = `${API_BASE_URL}/api/vector-search`
    console.log('Calling vector search endpoint:', endpoint)

    const response = await fetch(endpoint, {
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

    if (!response.ok) {
      console.error('Vector search response error:', response.status, response.statusText)
      return []
    }

    const { results } = await response.json()
    console.log('Canvas context results:', results?.length || 0)
    return results || []
  } catch (error) {
    console.error('Failed to fetch canvas context:', error?.message || error)
    return []
  }
}

function formatContext(context = {}, canvasChunks = []) {
  const MAX_CTX = 15000 // chars to keep for currentContent
  const parts = []
  const isStudyGuide = context.mode === 'study_guide'

  if (context.study_set_id) parts.push(`Study set ID: ${context.study_set_id}`)
  if (context.title) parts.push(`Title: ${truncate(String(context.title), 300)}`)
  if (context.subject) parts.push(`Subject area: ${truncate(String(context.subject), 300)}`)
  if (context.description) parts.push(`Description: ${truncate(String(context.description), 1000)}`)

  if (isStudyGuide) {
    if (context.currentContent) {
      parts.push(`Current guide content:\n${truncate(String(context.currentContent), MAX_CTX)}`)
    }
    if (Array.isArray(context.cards) && context.cards.length > 0) {
      const sample = context.cards
        .slice(-10)
        .map(card => `- ${card.term || card.question}: ${card.definition || card.answer}`)
        .join('\n')
      parts.push(`Available flashcards for reference:\n${sample}`)
    }
  } else {
    if (Array.isArray(context.cards) && context.cards.length > 0) {
      const sample = context.cards
        .slice(-10)
        .map(card => `- ${card.term || card.question}: ${card.definition || card.answer}`)
        .join('\n')
      parts.push(`Existing flashcards:\n${sample}`)
    }
  }

  // Add Canvas course materials if available
  if (Array.isArray(canvasChunks) && canvasChunks.length > 0) {
    const courseContent = canvasChunks
      .map((chunk, i) => `[Source ${i + 1}: ${chunk.item_name} (${chunk.item_type})]\n${truncate(chunk.chunk_text, 1000)}`)
      .join('\n\n---\n\n')
    parts.push(`Relevant course materials from Canvas:\n${courseContent}`)
  }

  if (!parts.length) return ''
  return `

Context about the current study set:
${parts.join('\n')}`
}

/**
 * Main entry. Added optional maxTokens argument and strict schema for study guide.
 */
export async function runAssistantChat({
  apiKey,
  messages,
  context = {},
  temperature,
  user_id,            // kept for compatibility; unused here
  maxTokens           // optional cap for output tokens
}) {
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  const isStudyGuide = context.mode === 'study_guide'
  const systemPrompt = isStudyGuide ? STUDY_GUIDE_SYSTEM_PROMPT : FLASHCARD_SYSTEM_PROMPT

  // Fetch Canvas content for RAG (for both flashcard and study guide modes)
  let canvasChunks = []
  if (messages && messages.length > 0 && context.study_set_id && user_id) {
    // Get the user's latest message as the query
    const lastUserMessage = messages[messages.length - 1]?.content
    if (lastUserMessage) {
      canvasChunks = await getCanvasContext(lastUserMessage, context.study_set_id, user_id)
    }
  }

  const systemMessage = systemPrompt + formatContext(context, canvasChunks)

  // Define response schema based on mode
  const responseSchema = isStudyGuide
    ? {
        name: 'study_guide_response',
        strict: true, // enforce required fields
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Response message to the user'
            },
            content: {
              type: 'string',
              description: 'HTML formatted study guide content to insert - MUST be populated with actual content',
              minLength: 200
            }
          },
          required: ['message', 'content'],
          additionalProperties: false
        }
      }
    : {
        name: 'flashcard_response',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Response message to the user'
            },
            flashcards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  term: { type: 'string' },
                  definition: { type: 'string' }
                },
                required: ['term', 'definition'],
                additionalProperties: false
              }
            }
          },
          required: ['message', 'flashcards'],
          additionalProperties: false
        }
      }

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemMessage },
      ...(messages || []).map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }))
    ],
    response_format: {
      type: 'json_schema',
      json_schema: responseSchema
    }
  }

  if (typeof temperature === 'number') payload.temperature = temperature
  if (typeof maxTokens === 'number') payload.max_tokens = maxTokens

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  })

  const data = await response.json()

  // Debug log for observability
  try {
    // Avoid logging huge content in production if needed
    console.log('=== OPENAI RESPONSE ===')
    console.log(JSON.stringify({
      id: data?.id,
      model: data?.model,
      usage: data?.usage,
      status: response.status
    }, null, 2))
  } catch {}

  if (!response.ok) {
    const error = new Error('OpenAI request failed')
    error.status = response.status
    error.body = data
    throw error
  }

  // Parse the structured JSON output
  let result
  try {
    const content = data?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('Empty content from model')
    }
    result = JSON.parse(content)
  } catch (err) {
    console.error('Failed to parse OpenAI response', err)
    throw new Error('Invalid response format from OpenAI')
  }

  // Validate presence of required fields at runtime as an extra guard
  if (isStudyGuide) {
    const ok = result
      && typeof result.message === 'string'
      && typeof result.content === 'string'
      && result.content.trim().length >= 1
    if (!ok) {
      throw new Error('Model did not return required "content" HTML')
    }
    return {
      message: result.message || '',
      content: result.content || ''
    }
  }

  // Flashcard mode: persist to Supabase if possible
  const executed = []
  const cards = Array.isArray(result.flashcards) ? result.flashcards : []
  if (supabaseService && cards.length > 0) {
    const targetId = context.study_set_id
    for (const card of cards) {
      if (!targetId) {
        executed.push({ ...card, error: 'Missing study_set_id' })
        continue
      }
      try {
        const { data: inserted, error } = await supabaseService
          .from('flashcards')
          .insert({
            study_set_id: targetId,
            question: card.term,
            answer: card.definition
          })
          .select('id, question, answer')
          .single()

        if (error) throw error
        executed.push({
          id: inserted.id,
          term: card.term,
          definition: card.definition,
          study_set_id: targetId
        })
      } catch (err) {
        console.error('Failed to persist flashcard', err)
        executed.push({ ...card, study_set_id: targetId, error: String(err?.message || err) })
      }
    }
  } else {
    executed.push(...cards)
  }

  return {
    message: result.message || '',
    flashcards: executed
  }
}
