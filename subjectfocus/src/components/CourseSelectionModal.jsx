import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../supabaseClient'

export default function CourseSelectionModal({ isOpen, onClose, onCoursesSelected }) {
  const [courses, setCourses] = useState([])
  const [selectedCourses, setSelectedCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      fetchCanvasCourses()
    }
  }, [isOpen])

  const fetchCanvasCourses = async () => {
    setLoading(true)
    setError(null)

    try {
      // Get Canvas credentials from env
      const canvasToken = import.meta.env.VITE_CANVAS_TOKEN
      const canvasDomain = import.meta.env.VITE_CANVAS_DOMAIN

      if (!canvasToken || !canvasDomain) {
        throw new Error('Canvas credentials not configured')
      }

      // Fetch active courses via proxy
      const response = await fetch('/api/canvas-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: '/api/v1/courses?enrollment_state=active&per_page=100',
          method: 'GET',
          canvasToken,
          canvasDomain
        })
      })

      if (!response.ok) {
        throw new Error('Failed to fetch Canvas courses')
      }

      const data = await response.json()

      // Filter to only show courses with valid data
      const validCourses = data.filter(course =>
        course.id && course.name && course.enrollment_type !== 'observer'
      )

      setCourses(validCourses)
    } catch (err) {
      console.error('Error fetching Canvas courses:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const toggleCourse = (courseId) => {
    setSelectedCourses(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  const syncSelectedCourses = async () => {
    if (selectedCourses.length === 0) {
      return
    }

    setSyncing(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // For each selected course, create records and trigger webhook
      for (const canvasCourseId of selectedCourses) {
        const course = courses.find(c => c.id === canvasCourseId)
        if (!course) continue

        // Create study set for this course
        const { data: studySet, error: studySetError } = await supabase
          .from('study_sets')
          .insert({
            user_id: user.id,
            title: course.name,
            subject_area: `Canvas: ${course.course_code || 'Course'}`,
            description: `Imported from Canvas LMS`,
            is_public: false
          })
          .select()
          .single()

        if (studySetError) {
          console.error('Error creating study set:', studySetError)
          continue
        }

        // Create canvas_courses record with onboarding_status = 'pending'
        const { data: canvasCourse, error: canvasCourseError } = await supabase
          .from('canvas_courses')
          .insert({
            user_id: user.id,
            canvas_course_id: String(course.id),
            study_set_id: studySet.id,
            course_name: course.name,
            course_code: course.course_code || null,
            term: course.term?.name || null,
            onboarding_status: 'pending',
            auto_create_study_sets: false
          })
          .select()
          .single()

        if (canvasCourseError) {
          console.error('Error creating canvas course:', canvasCourseError)
          continue
        }

        // Update study set with linked canvas course
        await supabase
          .from('study_sets')
          .update({
            linked_canvas_courses: [canvasCourse.id]
          })
          .eq('id', studySet.id)

        // Fire webhook to sync course modules and categorize (fire and forget)
        setTimeout(() => {
          console.log('[CourseSelection] Firing webhook for course:', course.name, canvasCourse.id)
          fetch('https://maxipad.app.n8n.cloud/webhook/canvas-sync-course', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              course_id: canvasCourse.id,
              canvas_course_id: String(course.id),
              user_id: user.id,
              canvas_token: import.meta.env.VITE_CANVAS_TOKEN,
              canvas_domain: import.meta.env.VITE_CANVAS_DOMAIN
            })
          })
            .then(res => {
              console.log('[CourseSelection] Webhook response:', res.status, res.statusText)
              return res.json()
            })
            .then(data => console.log('[CourseSelection] Webhook data:', data))
            .catch(err => console.error('[CourseSelection] Webhook error:', err))
        }, 0)
      }

      // Notify parent and close modal
      onCoursesSelected(selectedCourses.length)
      onClose()
    } catch (err) {
      console.error('Error syncing courses:', err)
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Select Canvas Courses</h2>
          <button
            onClick={onClose}
            disabled={syncing}
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
              <span className="ml-3 text-gray-600">Loading courses...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">{error}</p>
              <button
                onClick={fetchCanvasCourses}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : courses.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600">No active Canvas courses found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {courses.map(course => (
                <label
                  key={course.id}
                  className="flex items-start p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedCourses.includes(course.id)}
                    onChange={() => toggleCourse(course.id)}
                    disabled={syncing}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <div className="ml-3 flex-1">
                    <div className="font-medium text-gray-900">{course.name}</div>
                    {course.course_code && (
                      <div className="text-sm text-gray-500">{course.course_code}</div>
                    )}
                    {course.term?.name && (
                      <div className="text-sm text-gray-400">{course.term.name}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-600">
            {selectedCourses.length > 0 && `${selectedCourses.length} course${selectedCourses.length !== 1 ? 's' : ''} selected`}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={syncing}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={syncSelectedCourses}
              disabled={syncing || selectedCourses.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Syncing...
                </>
              ) : (
                'Sync Selected Courses'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
