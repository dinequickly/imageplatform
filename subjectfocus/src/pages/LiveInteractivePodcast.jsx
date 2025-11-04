import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Conversation } from '@elevenlabs/client'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function LiveInteractivePodcast() {
  const { setId, podcastId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [podcast, setPodcast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('disconnected') // disconnected, connecting, connected
  const [mode, setMode] = useState('listening') // listening or speaking
  const [conversation, setConversation] = useState(null)

  useEffect(() => {
    fetchPodcast()
  }, [podcastId])

  async function fetchPodcast() {
    setLoading(true)
    const { data, error: fetchErr } = await supabase
      .from('podcasts')
      .select('*')
      .eq('id', podcastId)
      .single()

    if (fetchErr) {
      setError(fetchErr.message)
      setLoading(false)
      return
    }

    setPodcast(data)
    setLoading(false)
  }

  function formatScript(script) {
    if (!script || !Array.isArray(script)) return ''
    return script
      .map(item => `${item.speaker}: ${item.text}`)
      .join('\n\n')
  }

  async function joinPodcast() {
    if (!podcast) return

    setConnectionStatus('connecting')
    setError('')

    try {
      const agentId = import.meta.env.VITE_INTERACTIVE_AGENT_ID

      if (!agentId) {
        throw new Error('Agent ID not configured')
      }

      const formattedScript = formatScript(podcast.script)

      const conv = await Conversation.startSession({
        agentId: agentId,
        overrides: {
          agent: {
            prompt: {
              variables: {
                topic: podcast.user_goal || podcast.title,
                script: formattedScript
              }
            }
          }
        },
        onConnect: () => {
          console.log('Connected to ElevenLabs')
          setConnectionStatus('connected')
        },
        onDisconnect: () => {
          console.log('Disconnected from ElevenLabs')
          setConnectionStatus('disconnected')
          setMode('listening')
        },
        onError: (error) => {
          console.error('ElevenLabs error:', error)
          setError(error.message || 'Connection error occurred')
          setConnectionStatus('disconnected')
        },
        onModeChange: (newMode) => {
          console.log('Mode changed to:', newMode.mode)
          setMode(newMode.mode)
        }
      })

      setConversation(conv)
    } catch (err) {
      console.error('Failed to start conversation:', err)
      setError(err.message || 'Failed to start conversation')
      setConnectionStatus('disconnected')
    }
  }

  async function leavePodcast() {
    if (conversation) {
      try {
        await conversation.endSession()
        setConversation(null)
        setConnectionStatus('disconnected')
        setMode('listening')
      } catch (err) {
        console.error('Failed to end session:', err)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading podcast...</div>
      </div>
    )
  }

  if (error && !podcast) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={() => navigate(`/study-set/${setId}/podcasts`)}
            className="text-indigo-600 hover:text-indigo-700"
          >
            ← Back to Podcasts
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(`/study-set/${setId}/podcasts`)}
            className="text-gray-600 hover:text-gray-900 mb-4 inline-flex items-center"
          >
            ← Back to Podcasts
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{podcast?.title}</h1>
          {podcast?.user_goal && (
            <p className="text-gray-600 mt-2">{podcast.user_goal}</p>
          )}
        </div>

        {/* Main Interactive Area */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          {/* Status Indicator */}
          <div className="bg-gray-50 border-b border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {connectionStatus === 'connected' && (
                  <>
                    {mode === 'speaking' ? (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-gray-700">
                          AI is speaking...
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-sm font-medium text-gray-700">
                          You can speak now
                        </span>
                      </div>
                    )}
                  </>
                )}
                {connectionStatus === 'connecting' && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium text-gray-700">
                      Connecting...
                    </span>
                  </div>
                )}
                {connectionStatus === 'disconnected' && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-700">
                      Not connected
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connection Controls */}
          <div className="p-8">
            <div className="text-center">
              {connectionStatus === 'disconnected' ? (
                <div>
                  <div className="mb-6">
                    <div className="w-24 h-24 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
                      <svg
                        className="w-12 h-12 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                      </svg>
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    Ready to Join the Podcast?
                  </h2>
                  <p className="text-gray-600 mb-6 max-w-lg mx-auto">
                    Click the button below to start an interactive conversation with our AI podcast host.
                    Make sure your microphone is enabled!
                  </p>
                  <button
                    onClick={joinPodcast}
                    disabled={connectionStatus === 'connecting'}
                    className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connectionStatus === 'connecting' ? 'Connecting...' : 'Join Podcast'}
                  </button>
                </div>
              ) : (
                <div>
                  <div className="mb-6">
                    <div className="w-32 h-32 mx-auto bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center animate-pulse">
                      <svg
                        className="w-16 h-16 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                        />
                      </svg>
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    You're Live!
                  </h2>
                  <p className="text-gray-600 mb-6">
                    {mode === 'speaking'
                      ? 'The AI is speaking. Listen carefully!'
                      : 'Speak naturally when you see the green light.'}
                  </p>
                  <button
                    onClick={leavePodcast}
                    className="px-8 py-4 bg-red-600 text-white font-semibold rounded-lg shadow-lg hover:bg-red-700 transition-all"
                  >
                    Leave Podcast
                  </button>
                </div>
              )}

              {error && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tips Section */}
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tips for the Best Experience</h3>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                <strong>Wait for the green light:</strong> Only speak when you see the green indicator. This means the AI is ready to listen.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                <strong>Use a quiet environment:</strong> Background noise can interfere with the conversation.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                <strong>Speak clearly:</strong> Articulate your questions and responses for better recognition.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                <strong>Allow microphone access:</strong> Your browser will request permission to use your microphone.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>
                <strong>Be patient:</strong> There may be a slight delay as the AI processes your speech and responds.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
