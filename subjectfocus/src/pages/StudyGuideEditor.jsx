import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { supabase } from '../supabaseClient'
import jsPDF from 'jspdf'
import TurndownService from 'turndown'

export default function StudyGuideEditor() {
  const { id, guideId } = useParams()
  const navigate = useNavigate()
  const [guide, setGuide] = useState(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)

  // TipTap Editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing your study guide...',
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      // Auto-save when content changes
      debouncedSave(editor.getHTML())
    },
  })

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
      setTitle(data.title || '')
      if (editor && data.content_text) {
        editor.commands.setContent(data.content_text)
      }
      setLoading(false)
    })()
    return () => { mounted = false }
  }, [guideId])

  // Debounced save function
  const debouncedSave = useCallback(
    debounce(async (content) => {
      if (!guide) return
      setSaving(true)
      const { error } = await supabase
        .from('generated_content')
        .update({
          content_text: content,
          updated_at: new Date().toISOString()
        })
        .eq('id', guideId)
      setSaving(false)
      if (!error) {
        setLastSaved(new Date())
      }
    }, 1500),
    [guide, guideId]
  )

  async function saveTitle() {
    if (!title.trim()) return
    const { error } = await supabase
      .from('generated_content')
      .update({ title: title.trim() })
      .eq('id', guideId)
    if (!error) {
      setGuide({ ...guide, title: title.trim() })
    }
  }

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

  async function deleteGuide() {
    if (!confirm('Delete this study guide?')) return
    const { error } = await supabase
      .from('generated_content')
      .delete()
      .eq('id', guideId)
    if (error) {
      setError(error.message)
    } else {
      navigate(`/study-set/${id}/guides`)
    }
  }

  function exportMarkdown() {
    if (!editor) return
    const turndownService = new TurndownService()
    const markdown = turndownService.turndown(editor.getHTML())
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'study-guide'}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    if (!editor) return
    const doc = new jsPDF()
    const content = editor.getText()
    const lines = doc.splitTextToSize(content, 180)

    doc.setFontSize(16)
    doc.text(title || 'Study Guide', 15, 15)

    doc.setFontSize(12)
    doc.text(lines, 15, 25)

    doc.save(`${title || 'study-guide'}.pdf`)
  }

  if (loading) return <div className="p-6">Loading...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!guide) return <div className="p-6">Not found</div>

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <button
              onClick={() => navigate(`/study-set/${id}/guides`)}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back
            </button>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              className="text-lg font-medium border-none outline-none focus:ring-2 focus:ring-indigo-200 rounded px-2 py-1"
              placeholder="Untitled Study Guide"
            />
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-sm text-gray-500">Saving...</span>}
            {lastSaved && !saving && (
              <span className="text-sm text-gray-500">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
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
            <button
              onClick={deleteGuide}
              className="px-3 py-1.5 border rounded text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Editor Toolbar */}
      {editor && (
        <div className="bg-white border-b px-4 py-2 sticky top-[57px] z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-2">
            <button
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={`px-3 py-1 rounded ${editor.isActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              <strong>B</strong>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={`px-3 py-1 rounded ${editor.isActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              <em>I</em>
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={`px-3 py-1 rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              H1
            </button>
            <button
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={`px-3 py-1 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              H2
            </button>
            <button
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={`px-3 py-1 rounded ${editor.isActive('bulletList') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              • List
            </button>
            <button
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={`px-3 py-1 rounded ${editor.isActive('orderedList') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              1. List
            </button>
            <button
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={`px-3 py-1 rounded ${editor.isActive('blockquote') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}
            >
              " Quote
            </button>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-sm border p-8 min-h-[600px]">
          <EditorContent editor={editor} className="prose max-w-none" />
        </div>
      </div>
    </div>
  )
}

// Simple debounce utility
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}
