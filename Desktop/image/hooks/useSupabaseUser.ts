'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

export function useSupabaseUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function ensureUser() {
      try {
        const { data, error: getUserError } = await supabase.auth.getUser()
        if (getUserError) throw getUserError

        if (data.user) {
          if (!mounted) return
          setUser(data.user)
          setLoading(false)
          return
        }

        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously()
        if (anonError) throw anonError

        if (!mounted) return
        setUser(anonData.user ?? null)
        setLoading(false)
      } catch (e: unknown) {
        if (!mounted) return
        setError(getErrorMessage(e) || 'Failed to initialize Supabase user')
        setLoading(false)
      }
    }

    ensureUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  return { user, loading, error }
}
