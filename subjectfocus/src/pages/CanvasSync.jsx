import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'
import CourseSelectionModal from '../components/CourseSelectionModal'
import CourseOnboardingModal from '../components/CourseOnboardingModal'

export default function CanvasSync() {
  const { user } = useAuth()
  const [syncedCourses, setSyncedCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCourseSelection, setShowCourseSelection] = useState(false)
  const [selectedCourseForOnboarding, setSelectedCourseForOnboarding] = useState(null)
  const [polling, setPolling] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    if (!user) return
    loadSyncedCourses()
  }, [user])

  useEffect(() => {
    // Check if we need to poll for pending/in_progress courses
    const hasActiveCourses = syncedCourses.some(
      course => course.onboarding_status === 'pending' ||
                course.onboarding_status === 'in_progress' ||
                course.vectorization_status === 'in_progress'
    )

    if (hasActiveCourses && !polling) {
      console.log('[CanvasSync] Starting course status polling (active courses detected)')
      setPolling(true)
      const interval = setInterval(async () => {
        console.log('[CanvasSync] Polling for course updates...')
        await loadSyncedCourses()
      }, 3000) // Poll every 3 seconds

      return () => {
        console.log('[CanvasSync] Stopping course status polling')
        clearInterval(interval)
        setPolling(false)
      }
    } else if (!hasActiveCourses && polling) {
      // Stop polling when all courses are done
      console.log('[CanvasSync] All courses completed, stopping polling')
      setPolling(false)
    }
  }, [syncedCourses, polling])

  // Add Realtime subscription for live updates
  useEffect(() => {
    if (!user) return

    console.log('[CanvasSync] Setting up Realtime subscription')

    const channel = supabase
      .channel('canvas-courses-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'canvas_courses',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('[CanvasSync] Realtime update received:', payload.new)
          // Reload courses when any update happens
          loadSyncedCourses()
        }
      )
      .subscribe()

    return () => {
      console.log('[CanvasSync] Cleaning up Realtime subscription')
      supabase.removeChannel(channel)
    }
  }, [user])

  async function loadSyncedCourses() {
    try {
      const { data, error } = await supabase
        .from('canvas_courses')
        .select(`
          *,
          study_sets!canvas_courses_study_set_id_fkey (
            id,
            title,
            total_cards
          )
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('last_synced_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      setSyncedCourses(data || [])
    } catch (err) {
      console.error('Error loading synced courses:', err)
      setMessage({ type: 'error', text: 'Failed to load synced courses' })
    } finally {
      setLoading(false)
    }
  }

  function handleCoursesSelected(count) {
    setShowCourseSelection(false)
    setMessage({
      type: 'success',
      text: `${count} course${count !== 1 ? 's' : ''} synced! Click any course to complete setup.`
    })
    loadSyncedCourses()
  }

  function handleCourseClick(course) {
    if (course.onboarding_status === 'pending' || course.onboarding_status === 'in_progress') {
      setSelectedCourseForOnboarding(course)
    }
  }

  function handleOnboardingComplete() {
    setSelectedCourseForOnboarding(null)
    setMessage({
      type: 'success',
      text: 'Course setup complete! Your content is ready.'
    })
    loadSyncedCourses()
  }

  async function deleteCourse(courseId, courseName) {
    if (!confirm(`Remove "${courseName}" from synced courses?\n\nThis will hide the course and prevent it from syncing again. The study set will not be deleted.`)) {
      return
    }

    try {
      setMessage({ type: '', text: '' })

      // Soft delete the course
      const { error } = await supabase
        .from('canvas_courses')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', courseId)

      if (error) throw error

      setMessage({ type: 'success', text: `Removed ${courseName} from synced courses` })
      await loadSyncedCourses()
    } catch (err) {
      console.error('Delete error:', err)
      setMessage({ type: 'error', text: 'Failed to remove course' })
    }
  }

  async function markAsCompleted(courseId, courseName) {
    if (!confirm(`Mark "${courseName}" as ready?\n\nThis will mark the course as completed if vectorization has finished.`)) {
      return
    }

    try {
      setMessage({ type: '', text: '' })

      const { error } = await supabase
        .from('canvas_courses')
        .update({
          onboarding_status: 'completed',
          vectorization_status: 'completed'
        })
        .eq('id', courseId)

      if (error) throw error

      setMessage({ type: 'success', text: `${courseName} marked as ready!` })
      await loadSyncedCourses()
    } catch (err) {
      console.error('Mark complete error:', err)
      setMessage({ type: 'error', text: 'Failed to update course status' })
    }
  }

  function getStatusBadge(course) {
    if (course.onboarding_status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
          <CheckCircle size={12} />
          Ready
        </span>
      )
    } else if (course.onboarding_status === 'in_progress' || course.vectorization_status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
          <Loader2 size={12} className="animate-spin" />
          Processing
        </span>
      )
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
          <AlertCircle size={12} />
          Setup Required
        </span>
      )
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" size={32} />
          <span className="ml-3 text-gray-600">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Canvas Integration</h1>
        <p className="text-gray-600">
          Connect your Canvas courses and AI will automatically create study materials from your course content.
        </p>
      </div>

      {/* Connect Button */}
      <div className="mb-6">
        <button
          onClick={() => setShowCourseSelection(true)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          <BookOpen size={20} />
          Connect Canvas Courses
        </button>
      </div>

      {/* Messages */}
      {message.text && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Synced Courses List */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Courses</h2>
        {syncedCourses.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
            <BookOpen className="mx-auto text-gray-400 mb-3" size={48} />
            <p className="text-gray-600 mb-2">No courses connected yet</p>
            <p className="text-sm text-gray-500">
              Click "Connect Canvas Courses" to get started
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {syncedCourses.map((course) => {
              const isReady = course.onboarding_status === 'completed'
              const needsSetup = course.onboarding_status === 'pending' || course.onboarding_status === 'in_progress'

              return (
                <div
                  key={course.id}
                  className={`border rounded-lg p-5 bg-white hover:shadow-md transition-all ${
                    needsSetup ? 'cursor-pointer hover:border-blue-400' : ''
                  }`}
                  onClick={() => needsSetup && handleCourseClick(course)}
                >
                  {/* Header */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-lg text-gray-900 leading-tight">
                        {course.course_name}
                      </h3>
                      {getStatusBadge(course)}
                    </div>
                    {course.course_code && (
                      <p className="text-sm text-gray-600">{course.course_code}</p>
                    )}
                    {course.term && (
                      <p className="text-xs text-gray-500 mt-1">{course.term}</p>
                    )}
                  </div>

                  {/* Stats */}
                  {isReady ? (
                    <div className="mb-4 pb-4 border-b">
                      <div className="text-sm">
                        <span className="text-gray-600">Flashcards: </span>
                        <span className="font-medium text-gray-900">
                          {course.study_sets?.total_cards || 0}
                        </span>
                      </div>
                      {course.items_vectorized > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {course.items_vectorized} items vectorized
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Show progress for in-progress courses */
                    needsSetup && (course.items_vectorized > 0 || course.total_items_to_vectorize > 0) && (
                      <div className="mb-4 pb-4 border-b">
                        <div className="text-sm text-gray-600 mb-2">
                          Vectorizing content...
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full transition-all duration-300"
                              style={{
                                width: course.total_items_to_vectorize > 0
                                  ? `${(course.items_vectorized / course.total_items_to_vectorize) * 100}%`
                                  : '0%'
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {course.items_vectorized || 0} / {course.total_items_to_vectorize || 0}
                          </span>
                        </div>
                      </div>
                    )
                  )}

                  {/* Actions */}
                  <div className="space-y-2">
                    {isReady ? (
                      <>
                        {course.study_set_id && (
                          <Link
                            to={`/study-set/${course.study_set_id}`}
                            className="block px-4 py-2 text-sm text-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                          >
                            Open Study Set
                          </Link>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteCourse(course.id, course.course_name)
                          }}
                          className="w-full px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          Remove Course
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="text-center py-2">
                          <p className="text-sm text-gray-600">
                            {course.onboarding_status === 'in_progress' || course.vectorization_status === 'in_progress'
                              ? 'Setting up course...'
                              : 'Click to complete setup'}
                          </p>
                        </div>
                        {/* Show manual complete button if items are vectorized */}
                        {course.items_vectorized > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              markAsCompleted(course.id, course.course_name)
                            }}
                            className="w-full px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                          >
                            Mark as Ready
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <CourseSelectionModal
        isOpen={showCourseSelection}
        onClose={() => setShowCourseSelection(false)}
        onCoursesSelected={handleCoursesSelected}
      />

      <CourseOnboardingModal
        course={selectedCourseForOnboarding}
        isOpen={!!selectedCourseForOnboarding}
        onClose={() => setSelectedCourseForOnboarding(null)}
        onComplete={handleOnboardingComplete}
      />
    </div>
  )
}
