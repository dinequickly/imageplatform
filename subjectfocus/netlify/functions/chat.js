import { runAssistantChat } from '../../server/openaiChat.js'

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: 'Missing OPENAI_API_KEY' }
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {}
    const { messages = [], context = {}, temperature } = body

    const { message, flashcards } = await runAssistantChat({
      apiKey,
      messages,
      context,
      temperature,
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, flashcards }),
    }
  } catch (error) {
    console.error('Chat function error', error)
    const status = error?.status || 500
    const payload = error?.body || { error: error.message || 'Failed to contact assistant' }
    return {
      statusCode: status,
      headers: { 'Content-Type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }
  }
}

