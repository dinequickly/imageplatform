import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function PodcastPlayer() {
  const { id, podcastId } = useParams() // study_set_id, podcast_id
  const navigate = useNavigate()
  const { user } = useAuth()
  const [podcast, setPodcast] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generationStarted, setGenerationStarted] = useState(false)

  useEffect(() => {
    fetchPodcast()
  }, [podcastId])

  // Redirect to interactive page for live-interactive podcasts
  useEffect(() => {
    if (podcast && podcast.type === 'live-interactive') {
      navigate(`/study-set/${id}/podcasts/${podcastId}/interactive`)
    }
  }, [podcast, id, podcastId, navigate])

  // Poll for status updates when generating
  useEffect(() => {
    if (!podcast || podcast.status !== 'generating') return

    const pollInterval = setInterval(async () => {
      const { data } = await supabase
        .from('podcasts')
        .select('status, audio_url')
        .eq('id', podcastId)
        .single()

      if (data && data.status !== 'generating') {
        setPodcast(prev => ({ ...prev, ...data }))
        clearInterval(pollInterval)
      }
    }, 3000) // Poll every 3 seconds

    return () => clearInterval(pollInterval)
  }, [podcast?.status, podcastId])

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

    // Trigger generation if status is 'generating' and we haven't started yet
    if (data.status === 'generating' && !generationStarted) {
      setGenerationStarted(true)
      startGeneration(data)
    }
  }

  async function startGeneration(podcastData) {
    try {
      console.log('Starting podcast generation...', podcastData)

      // Fetch flashcards from the study set
      const { data: flashcards } = await supabase
        .from('flashcards')
        .select('question, answer')
        .eq('study_set_id', id)
        .is('deleted_at', null)

      // Call our API route which forwards to n8n
      const response = await fetch('/api/generate-podcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          podcastId: podcastData.id,
          title: podcastData.title,
          type: podcastData.type,
          durationMinutes: podcastData.duration_minutes,
          userGoal: podcastData.user_goal,
          flashcards: flashcards || []
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start generation')
      }

      console.log('Generation started successfully')
    } catch (err) {
      console.error('Generation error:', err)
      // Update status to failed
      await supabase
        .from('podcasts')
        .update({ status: 'failed' })
        .eq('id', podcastId)

      setPodcast(prev => ({ ...prev, status: 'failed' }))
    }
  }

  async function deletePodcast() {
    if (!confirm('Delete this podcast?')) return

    const { error: deleteErr } = await supabase
      .from('podcasts')
      .delete()
      .eq('id', podcastId)

    if (deleteErr) {
      alert('Failed to delete: ' + deleteErr.message)
    } else {
      navigate(`/study-set/${id}/podcasts`)
    }
  }

  function getTypeLabel(type) {
    const labels = {
      'pre-recorded': 'Pre-Recorded',
      'live-tutor': 'Live Tutor',
      'live-interactive': 'Live Interactive'
    }
    return labels[type] || type
  }

  if (loading) return <div className="p-6">Loading podcast...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!podcast) return <div className="p-6">Podcast not found</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Top Bar */}
        <div className="bg-white border-b px-4 py-3 sticky top-0 z-10 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/study-set/${id}/podcasts`)}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <div>
                <h1 className="text-xl font-bold">{podcast.title}</h1>
                <div className="text-sm text-gray-500">
                  {getTypeLabel(podcast.type)} · {podcast.duration_minutes} min
                </div>
              </div>
            </div>
            <button
              onClick={deletePodcast}
              className="px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Player Area */}
        <div className="bg-white rounded-b-lg shadow-sm border border-t-0 p-6">
          {podcast.status === 'generating' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <h2 className="text-xl font-medium mb-2">Generating Podcast...</h2>
              <p className="text-gray-600">
                This may take a few moments. Your podcast is being created based on your preferences.
              </p>
              {podcast.user_goal && (
                <div className="mt-4 p-4 bg-gray-50 rounded max-w-md mx-auto text-left">
                  <div className="text-sm font-medium text-gray-700 mb-1">Your Goal:</div>
                  <div className="text-sm text-gray-600">{podcast.user_goal}</div>
                </div>
              )}
            </div>
          )}

          {podcast.status === 'ready' && podcast.audio_url && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-medium mb-2">Ready to Listen</h2>
                <p className="text-gray-600">Your podcast is ready!</p>
              </div>

              {/* Audio Player */}
              <div className="bg-gray-50 rounded-lg p-6">
                <audio
                  controls
                  className="w-full"
                  src={podcast.audio_url}
                >
                  Your browser does not support audio playback.
                </audio>
              </div>

              {podcast.user_goal && (
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm font-medium text-gray-700 mb-1">Your Goal:</div>
                  <div className="text-sm text-gray-600">{podcast.user_goal}</div>
                </div>
              )}
            </div>
          )}

          {podcast.status === 'failed' && (
            <div className="text-center py-12">
              <div className="text-red-600 text-6xl mb-4">⚠️</div>
              <h2 className="text-xl font-medium mb-2">Generation Failed</h2>
              <p className="text-gray-600 mb-6">
                Something went wrong while generating your podcast. Please try again.
              </p>
              <button
                onClick={() => navigate(`/study-set/${id}/podcasts/create`)}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Create New Podcast
              </button>
            </div>
          )}

          {/* Metadata */}
          <div className="mt-6 pt-6 border-t text-xs text-gray-500">
            <div>Created {new Date(podcast.created_at).toLocaleString()}</div>
            <div>Last updated {new Date(podcast.updated_at).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
