const MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-4.1-mini'

const SYSTEM_PROMPT = `You are SubjectFocus, an assistant that helps students craft effective study materials.
- Keep replies concise and practical.
- When you have enough information for a flashcard, call the create_flashcard tool with a clear term and definition.
- Only generate cards that are accurate and useful.
- Do not repeat cards that already exist in the provided context.`

function formatContext(context = {}) {
  const parts = []
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

  const handleToolCall = (toolCall) => {
    if (!toolCall || toolCall.name !== 'create_flashcard') return
    try {
      const parsed = typeof toolCall.arguments === 'string'
        ? JSON.parse(toolCall.arguments)
        : toolCall.arguments
      const term = parsed?.term || parsed?.question
      const definition = parsed?.definition || parsed?.answer
      if (term && definition) {
        flashcards.push({ term, definition })
      }
    } catch (err) {
      console.error('Failed to parse tool call arguments', err)
    }
  }

  if (Array.isArray(data?.output)) {
    for (const item of data.output) {
      if (item?.type === 'message') {
        for (const piece of item.content || []) {
          if (piece.type === 'output_text' && piece.text) textParts.push(piece.text)
          if (piece.type === 'tool_call') handleToolCall(piece)
        }
      } else if (item?.type === 'tool_call') {
        handleToolCall(item)
      }
    }
  }

  const message = textParts.join('').trim() || data?.output_text?.trim() || ''
  return { message, flashcards }
}

export async function runAssistantChat({ apiKey, messages, context = {}, temperature }) {
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
          parameters: {
            type: 'object',
            required: ['term', 'definition'],
            properties: {
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

  return parseAssistantOutput(data)
}

export { parseAssistantOutput }
