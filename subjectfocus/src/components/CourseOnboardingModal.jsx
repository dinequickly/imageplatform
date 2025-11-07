import { useState, useEffect } from 'react'
import { X, CheckCircle } from 'lucide-react'
import { supabase } from '../supabaseClient'
import AIBenefitsPreviewModal from './AIBenefitsPreviewModal'

const CATEGORY_LABELS = {
  'exercises_assignments': 'Exercises & Assignments',
  'lecture_slides': 'Lecture Slides',
  'administrative': 'Administrative',
  'past_exams': 'Past Exams',
  'readings': 'Readings',
  'videos': 'Videos',
  'discussion': 'Discussion',
  'other': 'Other'
}

const RECOMMENDED_CATEGORIES = ['exercises_assignments']

export default function CourseOnboardingModal({ course, isOpen, onClose, onComplete }) {
  const [step, setStep] = useState('preview') // 'preview' or 'setup'
  const [categoryCounts, setCategoryCounts] = useState({})
  const [selectedCategories, setSelectedCategories] = useState(['exercises_assignments'])
  const [loading, setLoading] = useState(true)
  const [vectorizing, setVectorizing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen && course) {
      setStep('preview') // Reset to preview when modal opens
      loadCategoryCounts()
    }
  }, [isOpen, course])

  const handleContinueFromPreview = () => {
    setStep('setup')
  }

  const handleClosePreview = () => {
    setStep('preview') // Reset step
    onClose()
  }

  useEffect(() => {
    if (vectorizing) {
      console.log('[CourseOnboarding] Starting progress polling...')
      // Poll for vectorization progress
      const interval = setInterval(async () => {
        const { data } = await supabase
          .from('canvas_courses')
          .select('items_vectorized, total_items_to_vectorize, vectorization_status, onboarding_status')
          .eq('id', course.id)
          .single()

        if (data) {
          console.log('[CourseOnboarding] Progress update:', {
            vectorized: data.items_vectorized,
            total: data.total_items_to_vectorize,
            vectorization_status: data.vectorization_status,
            onboarding_status: data.onboarding_status
          })

          setProgress({
            current: data.items_vectorized || 0,
            total: data.total_items_to_vectorize || 0
          })

          // Check both vectorization_status and onboarding_status
          if (data.vectorization_status === 'completed' || data.onboarding_status === 'completed') {
            console.log('[CourseOnboarding] ✓ Course setup completed!')
            setVectorizing(false)

            // Update onboarding_status to completed if not already
            if (data.onboarding_status !== 'completed') {
              await supabase
                .from('canvas_courses')
                .update({ onboarding_status: 'completed' })
                .eq('id', course.id)
            }

            onComplete()
          } else if (data.vectorization_status === 'failed') {
            console.error('[CourseOnboarding] ✗ Vectorization failed')
            setVectorizing(false)
            setError('Vectorization failed. Please try again.')
          }
        }
      }, 2000) // Poll every 2 seconds

      return () => {
        console.log('[CourseOnboarding] Stopping progress polling')
        clearInterval(interval)
      }
    }
  }, [vectorizing, course?.id])

  // Add Realtime subscription for live updates
  useEffect(() => {
    if (!isOpen || !course) return

    console.log('[CourseOnboarding] Setting up Realtime subscription for course:', course.id)

    const channel = supabase
      .channel(`course-${course.id}-onboarding`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'canvas_courses',
          filter: `id=eq.${course.id}`
        },
        (payload) => {
          console.log('[CourseOnboarding] Realtime update received:', payload.new)

          const newData = payload.new

          // Update progress
          if (newData.items_vectorized !== undefined || newData.total_items_to_vectorize !== undefined) {
            setProgress({
              current: newData.items_vectorized || 0,
              total: newData.total_items_to_vectorize || 0
            })
          }

          // Check if completed
          if (newData.onboarding_status === 'completed' || newData.vectorization_status === 'completed') {
            console.log('[CourseOnboarding] ✓ Course completed via Realtime!')
            setVectorizing(false)
            onComplete()
          }
        }
      )
      .subscribe()

    return () => {
      console.log('[CourseOnboarding] Cleaning up Realtime subscription')
      supabase.removeChannel(channel)
    }
  }, [isOpen, course?.id])

  const loadCategoryCounts = async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch modules and items for this course
      const { data: modules, error: modulesError } = await supabase
        .from('canvas_modules')
        .select('id, category')
        .eq('canvas_course_id', course.id)

      if (modulesError) throw modulesError

      const moduleIds = modules.map(m => m.id)

      if (moduleIds.length === 0) {
        setCategoryCounts({})
        setLoading(false)
        return
      }

      // Fetch items for these modules
      const { data: items, error: itemsError } = await supabase
        .from('canvas_items')
        .select('category')
        .in('canvas_module_id', moduleIds)

      if (itemsError) throw itemsError

      // Count items by category
      const counts = {}
      items.forEach(item => {
        if (item.category) {
          counts[item.category] = (counts[item.category] || 0) + 1
        }
      })

      setCategoryCounts(counts)
    } catch (err) {
      console.error('Error loading category counts:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const startVectorization = async () => {
    if (selectedCategories.length === 0) return

    setVectorizing(true)
    setError(null)

    try {
      // Update canvas_courses with selected categories
      await supabase
        .from('canvas_courses')
        .update({
          selected_categories: selectedCategories,
          vectorization_status: 'in_progress'
        })
        .eq('id', course.id)

      // Calculate total items to vectorize
      const totalItems = selectedCategories.reduce(
        (sum, cat) => sum + (categoryCounts[cat] || 0),
        0
      )

      await supabase
        .from('canvas_courses')
        .update({ total_items_to_vectorize: totalItems })
        .eq('id', course.id)

      setProgress({ current: 0, total: totalItems })

      // Fire webhook to start vectorization (fire and forget)
      setTimeout(() => {
        console.log('[CourseOnboarding] Firing vectorize webhook:', {
          course_id: course.id,
          course_name: course.course_name,
          selected_categories: selectedCategories,
          total_items: totalItems
        })
        fetch('https://maxipad.app.n8n.cloud/webhook/vectorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_id: course.id,
            selected_categories: selectedCategories,
            canvas_token: import.meta.env.VITE_CANVAS_TOKEN,
            canvas_domain: import.meta.env.VITE_CANVAS_DOMAIN
          })
        })
          .then(res => {
            console.log('[CourseOnboarding] Webhook response:', res.status, res.statusText)
            return res.json()
          })
          .then(data => console.log('[CourseOnboarding] Webhook data:', data))
          .catch(err => console.error('[CourseOnboarding] Webhook error:', err))
      }, 0)

      // Start polling for progress
    } catch (err) {
      console.error('Error starting vectorization:', err)
      setError(err.message)
      setVectorizing(false)
    }
  }

  if (!isOpen || !course) return null

  // Show preview modal first
  if (step === 'preview') {
    return (
      <AIBenefitsPreviewModal
        course={course}
        isOpen={isOpen}
        onClose={handleClosePreview}
        onContinue={handleContinueFromPreview}
      />
    )
  }

  // Then show setup modal
  const totalSelectedItems = selectedCategories.reduce(
    (sum, cat) => sum + (categoryCounts[cat] || 0),
    0
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Course Setup</h2>
            <p className="text-sm text-gray-600 mt-1">{course.course_name}</p>
          </div>
          <button
            onClick={() => {
              setStep('preview')
              onClose()
            }}
            disabled={vectorizing}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="ml-3 text-gray-600">Loading content...</span>
            </div>
          ) : vectorizing ? (
            <div className="py-12">
              <div className="text-center mb-6">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">Vectorizing content...</p>
                <p className="text-sm text-gray-600 mt-2">
                  {progress.current} of {progress.total} items processed
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{
                    width: progress.total > 0
                      ? `${(progress.current / progress.total) * 100}%`
                      : '0%'
                  }}
                />
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={loadCategoryCounts}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : Object.keys(categoryCounts).length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No content found in this course yet.</p>
              <p className="text-sm text-gray-500 mt-2">The course may still be syncing.</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-700 mb-6">
                I found these types of content in your course. Select what you'd like to include:
              </p>
              <div className="space-y-2">
                {Object.entries(categoryCounts)
                  .sort((a, b) => b[1] - a[1]) // Sort by count descending
                  .map(([category, count]) => (
                    <label
                      key={category}
                      className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category)}
                        onChange={() => toggleCategory(category)}
                        disabled={vectorizing}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <div className="ml-3 flex-1 flex items-center justify-between">
                        <div>
                          <span className="font-medium text-gray-900">
                            {CATEGORY_LABELS[category] || category}
                          </span>
                          {RECOMMENDED_CATEGORIES.includes(category) && (
                            <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                              RECOMMENDED
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">
                          {count} item{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !vectorizing && Object.keys(categoryCounts).length > 0 && (
          <div className="flex items-center justify-between p-6 border-t bg-gray-50">
            <div className="text-sm text-gray-600">
              {selectedCategories.length > 0 &&
                `${totalSelectedItems} item${totalSelectedItems !== 1 ? 's' : ''} selected`}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('preview')
                  onClose()
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={startVectorization}
                disabled={selectedCategories.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Vectorize Selected Content
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
