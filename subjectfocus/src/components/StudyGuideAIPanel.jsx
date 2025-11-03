import { useEffect, useMemo, useRef, useState } from 'react'

const WELCOME_MESSAGES = [
  'Need help writing your study guide? Ask me!',
  'I can help you expand sections, summarize concepts, or create outlines.',
]

function initialGreeting(context) {
  const base = WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)]
  if (context?.title) {
    return `${base} We are working on "${context.title}".`
  }
  return base
}

export default function StudyGuideAIPanel({ context = {}, onContentUpdate }) {
  const [messages, setMessages] = useState(() => ([
    { id: 'assistant-welcome', role: 'assistant', content: initialGreeting(context) },
  ]))
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const listRef = useRef(null)
  const pendingIdRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

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
      const payload = {
        messages: history,
        context: {
          ...context,
          mode: 'study_guide'
        }
      }
      if (context?.user_id) payload.user_id = context.user_id

      console.log('Sending payload to API:', payload)

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Request failed (${res.status})`)
      }

      const { message, content } = await res.json()
      console.log('AI Response:', { message, content })

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

      // If there's HTML content, auto-insert it
      if (content && content.trim() && typeof onContentUpdate === 'function') {
        console.log('Calling onContentUpdate with:', content)
        onContentUpdate(content)
        setMessages(prev => ([
          ...prev,
          {
            id: `system-inserted-${Date.now()}`,
            role: 'system',
            content: 'Content inserted into your guide!',
          },
        ]))
      } else {
        console.log('No content to insert or missing callback:', {
          content,
          contentLength: content?.length,
          hasCallback: typeof onContentUpdate === 'function'
        })
        if (!content || !content.trim()) {
          setMessages(prev => ([
            ...prev,
            {
              id: `system-no-content-${Date.now()}`,
              role: 'system',
              content: 'No content was generated. Try being more specific in your request.',
              error: true,
            },
          ]))
        }
      }
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
        Tips: Ask me to expand sections, create outlines, summarize concepts, or generate content.
      </div>
      <form onSubmit={sendMessage} className="border-t p-2 flex gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          className="flex-1 border rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ask for help with your study guide…"
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
