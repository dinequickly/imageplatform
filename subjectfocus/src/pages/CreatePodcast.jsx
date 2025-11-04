import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function CreatePodcast() {
  const { id } = useParams() // study_set_id
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [formData, setFormData] = useState({
    title: '',
    type: searchParams.get('type') || 'pre-recorded',
    referenceSet: true,
    userGoal: '',
    durationMinutes: 10
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if (!formData.title.trim()) {
      setError('Please enter a title')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      // Create podcast record
      // For live-interactive, we need to fetch flashcards first to generate the script
      let script = null
      if (formData.type === 'live-interactive') {
        const { data: flashcards } = await supabase
          .from('flashcards')
          .select('question, answer')
          .eq('study_set_id', id)
          .is('deleted_at', null)
          .limit(10)

        // Generate a simple script from flashcards
        if (flashcards && flashcards.length > 0) {
          script = flashcards.map((card, index) => ({
            speaker: index % 2 === 0 ? 'Host' : 'Expert',
            text: `${card.question} ${card.answer}`
          }))
        }
      }

      const { data: podcast, error: insertErr } = await supabase
        .from('podcasts')
        .insert({
          study_set_id: id,
          user_id: user.id,
          title: formData.title.trim(),
          type: formData.type,
          duration_minutes: formData.durationMinutes,
          user_goal: formData.userGoal.trim() || null,
          status: formData.type === 'live-interactive' ? 'ready' : 'generating',
          script: script
        })
        .select()
        .single()

      if (insertErr) throw insertErr

      // Navigate based on podcast type
      if (formData.type === 'live-interactive') {
        navigate(`/study-set/${id}/podcasts/${podcast.id}/interactive`)
      } else {
        navigate(`/study-set/${id}/podcasts/${podcast.id}`)
      }
    } catch (err) {
      console.error('Create podcast error', err)
      setError(err.message || 'Failed to create podcast')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-6">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/study-set/${id}/podcasts`)}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h1 className="text-2xl font-bold mb-6">Create Podcast</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Podcast Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={e => updateField('title', e.target.value)}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., Civil War Overview"
                required
              />
            </div>

            {/* Reference Existing Set */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Reference Study Set
              </label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={formData.referenceSet === true}
                    onChange={() => updateField('referenceSet', true)}
                    className="mr-2"
                  />
                  <span>Yes, use flashcards from this set</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={formData.referenceSet === false}
                    onChange={() => updateField('referenceSet', false)}
                    className="mr-2"
                  />
                  <span>No, create from scratch</span>
                </label>
              </div>
            </div>

            {/* User Goal */}
            <div>
              <label className="block text-sm font-medium mb-2">
                What do you want to get from this podcast?
              </label>
              <textarea
                value={formData.userGoal}
                onChange={e => updateField('userGoal', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g., I want to understand the key battles and outcomes of the Civil War, focusing on strategic decisions..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Describe your learning goals, topics to cover, or specific questions you want answered
              </p>
            </div>

            {/* Type Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Podcast Type *
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => updateField('type', 'pre-recorded')}
                  className={`px-4 py-3 border rounded text-center ${
                    formData.type === 'pre-recorded'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">Pre-Recorded</div>
                  <div className="text-xs text-gray-500 mt-1">Listen only</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('type', 'live-tutor')}
                  className={`px-4 py-3 border rounded text-center ${
                    formData.type === 'live-tutor'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">Live Tutor</div>
                  <div className="text-xs text-gray-500 mt-1">Q&A session</div>
                </button>
                <button
                  type="button"
                  onClick={() => updateField('type', 'live-interactive')}
                  className={`px-4 py-3 border rounded text-center ${
                    formData.type === 'live-interactive'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">Live Interactive</div>
                  <div className="text-xs text-gray-500 mt-1">Discussion</div>
                </button>
              </div>
            </div>

            {/* Duration Slider */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Duration: {formData.durationMinutes} minutes
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={formData.durationMinutes}
                onChange={e => updateField('durationMinutes', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1 min</span>
                <span>20 min</span>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(`/study-set/${id}/podcasts`)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-300"
                disabled={submitting}
              >
                {submitting ? 'Creating...' : 'Create Podcast'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
