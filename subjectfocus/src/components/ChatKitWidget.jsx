import { ChatKit, useChatKit } from '@openai/chatkit-react'
import { useAuth } from '../hooks/useAuth'
import { useEffect, useState } from 'react'

export default function ChatKitWidget({ workflowId }) {
  const { user } = useAuth()
  const [error, setError] = useState('')
  const [libReady, setLibReady] = useState(false)

  // Ensure the ChatKit browser script is available (some blockers can prevent it)
  useEffect(() => {
    let cancelled = false
    const scriptSrc = 'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js'

    const isDefined = () => typeof window !== 'undefined' && !!window.customElements?.get('openai-chatkit')
    const markReady = () => {
      if (cancelled) return
      setError('')
      setLibReady(true)
    }
    const markFailure = () => {
      if (cancelled) return
      setError('Failed to load ChatKit library (blocked by network, CSP, or extension?)')
    }

    if (isDefined()) {
      markReady()
      return () => {
        cancelled = true
      }
    }

    // Wait for the custom element definition if the script loads later.
    const waitForDefinition = window.customElements?.whenDefined?.('openai-chatkit')
    waitForDefinition?.then(() => {
      if (isDefined()) markReady()
    }).catch(() => markFailure())

    const handleLoad = () => {
      if (isDefined()) markReady()
    }
    const handleError = () => {
      markFailure()
    }

    const selector = `script[src="${scriptSrc}"]`
    let script = document.querySelector(selector)
    if (!script) {
      script = document.createElement('script')
      script.src = scriptSrc
      script.async = true
      script.dataset.chatkitLoader = 'true'
      script.addEventListener('load', handleLoad, { once: true })
      script.addEventListener('error', handleError, { once: true })
      document.body.appendChild(script)
    } else {
      script.addEventListener('load', handleLoad, { once: true })
      script.addEventListener('error', handleError, { once: true })
    }

    const fallbackTimer = window.setTimeout(() => {
      if (!isDefined()) markFailure()
    }, 5000)

    return () => {
      cancelled = true
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
      clearTimeout(fallbackTimer)
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
