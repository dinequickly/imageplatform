import { ChatKit, useChatKit } from '@openai/chatkit-react'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useState } from 'react'

export default function ChatKitWidget({ workflowId }) {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [libReady, setLibReady] = useState(false)

  // Ensure the ChatKit browser script is available (some blockers can prevent it)
  useEffect(() => {
    function markReady() {
      setLibReady(true)
    }
    // If already present, mark ready
    if (window.ChatKit || window.OpenAIChatKit) markReady()
    // Otherwise, try to inject the script
    else {
      const existing = document.querySelector('script[data-chatkit-loader]')
      if (!existing) {
        const s = document.createElement('script')
        s.src = 'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js'
        s.async = true
        s.dataset.chatkitLoader = 'true'
        s.onload = markReady
        s.onerror = () => setError('Failed to load ChatKit library (blocked by network/extension?).')
        document.body.appendChild(s)
      }
      // Give it a moment in case it loads later
      const t = setTimeout(() => {
        if (window.ChatKit || window.OpenAIChatKit) markReady()
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [])
  const { control } = useChatKit({
    api: {
      async getClientSecret() {
        try {
          const res = await fetch('/api/chatkit/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workflowId, userId: user?.id }),
          })
          if (!res.ok) {
            const text = await res.text()
            setError(text || `Session error ${res.status}`)
            console.error('ChatKit session error:', res.status, text)
            return ''
          }
          const { client_secret } = await res.json()
          return client_secret
        } catch (e) {
          console.error('ChatKit session fetch failed:', e)
          setError(String(e))
          return ''
        }
      },
    },
  })

  return (
    <div className="border rounded">
      {error ? (
        <div className="p-3 text-sm text-red-600">
          Chat unavailable: {error.includes('OPENAI_API_KEY') ? 'Missing OPENAI_API_KEY on server.' : error}
        </div>
      ) : !libReady ? (
        <div className="p-3 text-sm text-gray-600">Loading chat… If it stays blank, ensure
          <a className="underline ml-1" href="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js" target="_blank" rel="noreferrer">chatkit.js</a>
          is reachable and not blocked by an extension.
        </div>
      ) : (
        <ChatKit control={control} className="h-[520px] w-full" />
      )}
    </div>
  )
}
