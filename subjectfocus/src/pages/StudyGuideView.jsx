import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import jsPDF from 'jspdf'
import TurndownService from 'turndown'

export default function StudyGuideView() {
  const { id, guideId } = useParams()
  const navigate = useNavigate()
  const [guide, setGuide] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data, error: fetchErr } = await supabase
        .from('generated_content')
        .select('*')
        .eq('id', guideId)
        .single()
      if (!mounted) return
      if (fetchErr) { setError(fetchErr.message); setLoading(false); return }
      setGuide(data)
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [guideId])

  async function toggleStar() {
    const newStarred = !guide.is_starred
    const { error } = await supabase
      .from('generated_content')
      .update({ is_starred: newStarred })
      .eq('id', guideId)
    if (!error) {
      setGuide({ ...guide, is_starred: newStarred })
    }
  }

  function exportMarkdown() {
    if (!guide.content_text) return
    const turndownService = new TurndownService()
    const markdown = turndownService.turndown(guide.content_text)
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${guide.title || 'study-guide'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    if (!guide.content_text) return
    const doc = new jsPDF()
    // Strip HTML tags for plain text
    const plainText = guide.content_text.replace(/<[^>]*>/g, '').trim()
    const lines = doc.splitTextToSize(plainText, 180)

    doc.setFontSize(16)
    doc.text(guide.title || 'Study Guide', 15, 15)

    doc.setFontSize(12)
    doc.text(lines, 15, 25)

    doc.save(`${guide.title || 'study-guide'}.pdf`)
  }

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!guide) return <div className="p-6">Not found</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(`/study-set/${id}/guides`)}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Guides
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/study-set/${id}/guides/${guideId}/edit`)}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Edit
            </button>
            <button
              onClick={toggleStar}
              className="px-3 py-1.5 border rounded hover:bg-gray-50"
              title={guide.is_starred ? 'Unstar' : 'Star'}
            >
              {guide.is_starred ? '⭐' : '☆'}
            </button>
            <div className="relative group">
              <button className="px-3 py-1.5 border rounded hover:bg-gray-50">
                Export ▾
              </button>
              <div className="absolute right-0 mt-1 w-32 bg-white border rounded shadow-lg hidden group-hover:block">
                <button
                  onClick={exportMarkdown}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  Markdown
                </button>
                <button
                  onClick={exportPDF}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                >
                  PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border p-8">
          {/* Header */}
          <div className="mb-6 pb-4 border-b">
            <h1 className="text-3xl font-bold mb-2">
              {guide.title || 'Untitled Study Guide'}
            </h1>
            <p className="text-sm text-gray-500">
              Last updated: {formatDate(guide.updated_at)}
            </p>
          </div>

          {/* Content */}
          {guide.content_text ? (
            <div
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: guide.content_text }}
            />
          ) : (
            <p className="text-gray-500 italic">No content yet. Click Edit to start writing.</p>
          )}
        </div>
      </div>
    </div>
  )
}
