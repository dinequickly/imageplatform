import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function StudyGuidesList() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [setData, setSetData] = useState(null)
  const [guides, setGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      // Fetch study set info
      const { data: setRow, error: setErr } = await supabase
        .from('study_sets')
        .select('id, title')
        .eq('id', id)
        .single()
      if (!mounted) return
      if (setErr) { setError(setErr.message); setLoading(false); return }
      setSetData(setRow)

      // Fetch study guides
      const { data: guidesData, error: guidesErr } = await supabase
        .from('generated_content')
        .select('id, title, content_text, created_at, updated_at, status')
        .eq('study_set_id', id)
        .eq('content_type', 'study_guide')
        .order('updated_at', { ascending: false })
      if (guidesErr) { setError(guidesErr.message); setLoading(false); return }
      setGuides(guidesData || [])
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [id])

  async function createNewGuide() {
    if (!user) return
    const { data, error } = await supabase
      .from('generated_content')
      .insert({
        user_id: user.id,
        study_set_id: id,
        content_type: 'study_guide',
        title: 'Untitled Study Guide',
        content_text: '',
        status: 'completed'
      })
      .select('id')
      .single()

    if (error) {
      setError(error.message)
    } else if (data) {
      navigate(`/study-set/${id}/guides/${data.id}/edit`)
    }
  }

  async function deleteGuide(guideId) {
    if (!confirm('Delete this study guide?')) return
    const { error } = await supabase
      .from('generated_content')
      .delete()
      .eq('id', guideId)
    if (error) {
      setError(error.message)
    } else {
      setGuides(guides.filter(g => g.id !== guideId))
    }
  }

  function getPreview(text) {
    if (!text) return 'No content yet'
    // Strip HTML tags and get first 100 characters
    const stripped = text.replace(/<[^>]*>/g, '').trim()
    return stripped.length > 100 ? stripped.slice(0, 100) + '...' : stripped
  }

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!setData) return <div className="p-6">Not found</div>

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(`/study-set/${id}`)}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            ← Back to {setData.title}
          </button>
          <h1 className="text-2xl font-semibold">Study Guides</h1>
        </div>
        <button
          onClick={createNewGuide}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          + New Guide
        </button>
      </div>

      {/* Guides List */}
      {guides.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 mb-4">No study guides yet.</p>
          <button
            onClick={createNewGuide}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Create Your First Guide
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {guides.map(guide => (
            <div
              key={guide.id}
              className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-lg mb-1">{guide.title || 'Untitled'}</h3>
                  <p className="text-sm text-gray-600 mb-2">{getPreview(guide.content_text)}</p>
                  <p className="text-xs text-gray-500">
                    Last updated: {formatDate(guide.updated_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/study-set/${id}/guides/${guide.id}`)}
                    className="px-3 py-1.5 border rounded text-sm hover:bg-gray-50"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => deleteGuide(guide.id)}
                    className="px-3 py-1.5 border rounded text-sm text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
