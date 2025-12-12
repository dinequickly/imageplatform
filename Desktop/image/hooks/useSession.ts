import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabaseClient'

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function initSession() {
      const storedSessionId = localStorage.getItem('image_platform_session_id')

      if (storedSessionId) {
        setSessionId(storedSessionId)
      } else {
        // Create new session
        // Generate UUID client-side to be safe
        const newId = uuidv4()
        
        const { error: insertError } = await supabase
          .from('sessions')
          .insert({ id: newId })
        
        if (insertError) {
          console.error('Error creating session:', JSON.stringify(insertError, null, 2))
          setError(`Failed to create session: ${insertError.message || JSON.stringify(insertError)}`)
        } else {
            localStorage.setItem('image_platform_session_id', newId)
            setSessionId(newId)
        }
      }
      setLoading(false)
    }

    initSession()
  }, [])

  return { sessionId, loading, error }
}
