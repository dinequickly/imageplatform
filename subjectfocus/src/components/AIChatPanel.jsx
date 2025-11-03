import { useEffect, useMemo, useRef, useState } from 'react'

const WELCOME_MESSAGES = [
  'Need help turning notes into flashcards? Ask me!',
  'Describe a concept and I can draft flashcards for you.',
]

function initialGreeting(context) {
  const base = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
  if (context?.title) {
    return `${base} We are working on “${context.title}”.`
  }
  return base
}

export default function AIChatPanel({ context = {}, onFlashcard }) {
  const [messages, setMessages] = useState(() => ([
    { id: 'assistant-welcome', role: 'assistant', content: initialGreeting(context) },
  ]))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const listRef = useRef(null)
  const pendingIdRef = useRef(null)

  const trimmedContext = useMemo(() => {
    const cards = Array.isArray(context.cards)
      ? context.cards
          .filter(card => card.term && card.definition)
          .slice(-25)
          .map(card => ({ term: card.term, definition: card.definition }))
      : undefined
    return { ...context, cards }
  }, [context])

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  async function handleFlashcards(flashcards = []) {
    if (!Array.isArray(flashcards) || flashcards.length === 0 || typeof onFlashcard !== 'function') return
    for (const card of flashcards) {
      if (!card?.term || !card?.definition) continue
      try {
        await onFlashcard({ term: card.term, definition: card.definition })
        setMessages(prev => ([
          ...prev,
          {
            id: `system-card-${card.term}-${Date.now()}`,
            role: 'system',
            content: `Added flashcard: “${card.term}”.`,
          },
        ]))
      } catch (err) {
        setMessages(prev => ([
          ...prev,
          {
            id: `system-card-error-${Date.now()}`,
            role: 'system',
            content: `Could not save flashcard “${card.term}”: ${err.message || err}`,
            error: true,
          },
        ]))
      }
    }
  }

  async function sendMessage(e) {
    e?.preventDefault()
    if (sending) return
    const text = input.trim()
    if (!text) return

    setError('')
    setInput('')
    setSending(true)

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    }

    const assistantPlaceholder = {
      id: `assistant-pending-${Date.now()}`,
      role: 'assistant',
      content: 'Thinking…',
      pending: true,
    }
    pendingIdRef.current = assistantPlaceholder.id

    setMessages(prev => [...prev, userMessage, assistantPlaceholder])

    const history = [...messages, userMessage]
      .filter(msg => !msg.pending && (msg.role === 'user' || msg.role === 'assistant'))
      .map(msg => ({ role: msg.role, content: msg.content }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context: trimmedContext }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Request failed (${res.status})`)
      }

      const { message, flashcards } = await res.json()

      setMessages(prev => prev.filter(msg => msg.id !== pendingIdRef.current))
      const reply = message?.trim() ? message.trim() : 'Done!'
      setMessages(prev => ([
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: reply,
        },
      ]))

      await handleFlashcards(flashcards)
    } catch (err) {
      console.error('Chat send error', err)
      setError(err.message || 'Failed to contact assistant')
      setMessages(prev => prev.map(msg => (
        msg.id === pendingIdRef.current
          ? { ...msg, content: 'I had trouble replying. Please try again.', pending: false, error: true }
          : msg
      )))
    } finally {
      setSending(false)
      pendingIdRef.current = null
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="border rounded flex flex-col h-[520px]">
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
            <div
              className={[
                'max-w-[75%] rounded-lg px-3 py-2 whitespace-pre-wrap break-words',
                msg.role === 'user' && 'bg-indigo-600 text-white',
                msg.role === 'assistant' && 'bg-gray-100 text-gray-900',
                msg.role === 'system' && 'bg-transparent text-xs text-gray-500 italic shadow-none',
                msg.error && 'border border-red-300 text-red-700 bg-red-50',
              ].filter(Boolean).join(' ')}
            >
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-2 text-xs text-gray-500">
        Tips: Ask for concepts, summaries, or quiz questions. I can turn them into flashcards automatically.
      </div>
      <form onSubmit={sendMessage} className="border-t p-2 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          className="flex-1 border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ask a question or describe a concept…"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className={`px-4 py-2 rounded text-sm ${sending || !input.trim() ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white'}`}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error && <div className="px-3 pb-3 text-xs text-red-600">{error}</div>}
    </div>
  )
}
