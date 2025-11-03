import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AIChatPanel from '../components/AIChatPanel'

const SUBJECTS = ['Biology','Chemistry','Physics','Math','History','English','Computer Science','Other']
const COLORS = ['#6366f1','#ef4444','#10b981','#f59e0b','#3b82f6','#8b5cf6']

export default function CreateStudySet() {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Inline flashcard inputs for first-time creation
  const [cards, setCards] = useState([{ id: 1, term: '', definition: '' }])
  const navigate = useNavigate()

  const chatContext = useMemo(() => ({
    title: title || undefined,
    subject: subject || undefined,
    description: description || undefined,
    cards: cards.map(card => ({ term: card.term, definition: card.definition })),
  }), [title, subject, description, cards])

  async function handleAIFlashcard({ term, definition }) {
    setCards(prev => ([
      ...prev,
      {
        id: (prev.at(-1)?.id ?? 0) + 1,
        term: term.trim(),
        definition: definition.trim(),
      },
    ]))
  }

  function updateCard(id, field, value) {
    setCards(cs => cs.map(c => (c.id === id ? { ...c, [field]: value } : c)))
  }

  function addCardRow() {
    setCards(cs => [...cs, { id: (cs.at(-1)?.id ?? 0) + 1, term: '', definition: '' }])
  }

  function removeCardRow(id) {
    setCards(cs => (cs.length === 1 ? cs : cs.filter(c => c.id !== id)))
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('study_sets')
      .insert({
        user_id: user.id,
        title: title.trim(),
        description: description || null,
        subject_area: subject || null,
        color_theme: color,
      })
      .select('id')
      .single()
    if (error) { setError(error.message); setSaving(false); return }

    // Insert initial flashcards if provided
    const rows = cards
      .map(({ term, definition }) => ({ term: term.trim(), definition: definition.trim() }))
      .filter(({ term, definition }) => term && definition)
      .map(({ term, definition }) => ({ study_set_id: data.id, question: term, answer: definition }))

    if (rows.length > 0) {
      const { error: cardErr } = await supabase.from('flashcards').insert(rows)
      if (cardErr) {
        // Do not block navigation; show message so user can edit on detail page
        setError(`Study set created but some cards failed to save: ${cardErr.message}`)
      }
    }

    setSaving(false)
    navigate(`/study-set/${data.id}`)
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          <h1 className="text-xl font-semibold">Create Study Set</h1>
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label className="block text-sm mb-1">Title</label>
              <input className="w-full border rounded px-3 py-2" value={title} onChange={e=>setTitle(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Description</label>
              <textarea className="w-full border rounded px-3 py-2" rows="4" value={description} onChange={e=>setDescription(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Subject area</label>
              <select className="w-full border rounded px-3 py-2" value={subject} onChange={e=>setSubject(e.target.value)}>
                <option value="">Select…</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Color theme</label>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded border ${color===c ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="border rounded p-4">
              <div className="font-medium mb-3">Enter Flashcards</div>
              <div className="space-y-2">
                {cards.map(row => (
                  <div key={row.id} className="grid gap-2 sm:grid-cols-2">
                    <input className="border rounded px-3 py-2" placeholder="Term" value={row.term} onChange={e=>updateCard(row.id, 'term', e.target.value)} />
                    <div className="flex gap-2">
                      <input className="flex-1 border rounded px-3 py-2" placeholder="Definition" value={row.definition} onChange={e=>updateCard(row.id, 'definition', e.target.value)} />
                      <button type="button" onClick={() => removeCardRow(row.id)} className="px-2 border rounded text-sm">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <button type="button" onClick={addCardRow} className="px-3 py-1.5 border rounded text-sm">Add another card</button>
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}
            <button disabled={saving} className="bg-indigo-600 text-white rounded px-4 py-2">{saving ? 'Creating…' : 'Create'}</button>
          </form>
        </div>
        <aside className="lg:col-span-5 space-y-4">
          <div className="border rounded p-4 space-y-3">
            <div className="font-medium">AI Flashcard Assistant</div>
            <p className="text-sm text-gray-600">Brainstorm ideas or paste notes and I’ll craft flashcards. Cards I create are added to your list automatically.</p>
            <AIChatPanel context={chatContext} onFlashcard={handleAIFlashcard} />
          </div>
        </aside>
      </div>
    </div>
  )
}
