import { createClient } from '@supabase/supabase-js'

const MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1-mini'
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseService = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null

const SYSTEM_PROMPT = `You are SubjectFocus, an assistant that helps students craft effective study materials.
- Keep replies concise and practical.
- When you have enough information for a flashcard, call the create_flashcard tool with a clear term and definition.
- Always include study_set_id (from the provided context) when calling create_flashcard. If you do not know it, ask for it instead of guessing.
- Only generate cards that are accurate and useful.
- Do not repeat cards that already exist in the provided context.`

function formatContext(context = {}) {
  const parts = []
  if (context.study_set_id) parts.push(`Study set ID: ${context.study_set_id}`)
  if (context.title) parts.push(`Title: ${context.title}`)
  if (context.subject) parts.push(`Subject area: ${context.subject}`)
  if (context.description) parts.push(`Description: ${context.description}`)
  if (Array.isArray(context.cards) && context.cards.length > 0) {
    const sample = context.cards
      .slice(-10)
      .map(card => `- ${card.term || card.question}: ${card.definition || card.answer}`)
      .join('\n')
    parts.push(`Existing flashcards:\n${sample}`)
  }
  if (!parts.length) return ''
  return `Context about the current study set:\n${parts.join('\n')}`
}

function toResponseInput(messages = []) {
  return messages
    .filter(msg => typeof msg?.content === 'string' && msg.content.trim())
    .map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: [{
        type: msg.role === 'assistant' ? 'output_text' : 'input_text',
        text: msg.content.trim(),
      }],
    }))
}

function parseAssistantOutput(data) {
  const flashcards = []
  const textParts = []

  const handleToolCall = (rawCall) => {
    if (!rawCall) return
    const call = rawCall.tool_call || rawCall.function_call || rawCall
    const name = call?.name || call?.function?.name
    if (name !== 'create_flashcard') return

    const args = call?.arguments ?? call?.function?.arguments
    if (!args) return

    try {
      const parsed = typeof args === 'string' ? JSON.parse(args) : args
      const term = parsed?.term || parsed?.question
      const definition = parsed?.definition || parsed?.answer
      const studySetId = parsed?.study_set_id || parsed?.studySetId
      if (term && definition) {
        flashcards.push({ term: term.trim(), definition: definition.trim(), study_set_id: studySetId })
      }
    } catch (err) {
      console.error('Failed to parse tool call arguments', err)
    }
  }

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type === 'message') {
        for (const piece of item.content || []) {
          if (piece.type === 'output_text' && piece.text) {
            textParts.push(piece.text)
          }
          if (piece.type === 'tool_call') {
            handleToolCall(piece.tool_call || piece)
          }
        }
      } else if (item?.type === 'tool_call' || item?.type === 'tool_call_output') {
        handleToolCall(item)
      }
    }
  }

  let message = textParts.join('').trim() || data?.output_text?.trim() || ''
  if (!message && flashcards.length > 0) {
    const count = flashcards.length
    message = `Added ${count} flashcard${count === 1 ? '' : 's'}.`
  }
  return { message, flashcards }
}

export async function runAssistantChat({ apiKey, messages, context = {}, temperature, user_id }) {
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY')

  const instructions = [SYSTEM_PROMPT, formatContext(context)].filter(Boolean).join('\n\n')

  const payload = {
    model: MODEL,
    instructions,
    input: toResponseInput(messages),
    tools: [
      {
        name: 'create_flashcard',
        type: 'function',
        function: {
          name: 'create_flashcard',
          description: 'Create a concise flashcard with a term and definition.',
          strict: true,
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['study_set_id', 'term', 'definition'],
            properties: {
              study_set_id: {
                type: 'string',
                description: 'The UUID of the target study set.',
              },
              term: {
                type: 'string',
                description: 'A short phrase for the front of the flashcard.',
              },
              definition: {
                type: 'string',
                description: 'An accurate, student-friendly explanation for the back of the flashcard.',
              },
            },
          },
        },
      },
    ],
  }

  if (typeof temperature === 'number') payload.temperature = temperature

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Beta': 'assistants=v2',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json()
  if (!response.ok) {
    const error = new Error('OpenAI request failed')
    error.status = response.status
    error.body = data
    throw error
  }

  const result = parseAssistantOutput(data)

  // Execute tool calls on the server if possible
  const executed = []
  if (supabaseService && result.flashcards.length > 0) {
    for (const card of result.flashcards) {
      const targetId = card.study_set_id || context.study_set_id
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
            answer: card.definition,
            user_id,
          })
          .select('id, question, answer')
          .single()

        if (error) throw error
        executed.push({ ...card, study_set_id: targetId, id: inserted.id })
      } catch (err) {
        console.error('Failed to persist flashcard', err)
        executed.push({ ...card, study_set_id: targetId, error: String(err.message || err) })
      }
    }
  } else {
    executed.push(...result.flashcards)
  }

  return { message: result.message, flashcards: executed }
}

export { parseAssistantOutput }
