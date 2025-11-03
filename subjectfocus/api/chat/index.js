import { runAssistantChat } from '../../server/openaiChat.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      res.status(500).json({ error: 'Missing OPENAI_API_KEY' })
      return
    }

    const { messages = [], context = {}, temperature } = req.body || {}

    const { message, flashcards } = await runAssistantChat({
      apiKey,
      messages,
      context,
      temperature,
    })
    res.status(200).json({ message, flashcards })
  } catch (error) {
    console.error('Chat handler error', error)
    const status = error?.status || 500
    const body = error?.body || { error: error.message || 'Failed to contact assistant' }
    res.status(status).json(body)
  }
}
