import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function CanvasSync() {
  const { user } = useAuth()
  const [syncedCourses, setSyncedCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, currentCourse: '' })
  const [message, setMessage] = useState({ type: '', text: '' })

  const CANVAS_TOKEN = import.meta.env.VITE_CANVAS_TOKEN
  const CANVAS_DOMAIN = import.meta.env.VITE_CANVAS_DOMAIN

  useEffect(() => {
    if (!user) return
    loadSyncedCourses()
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
        .order('last_synced_at', { ascending: false })

      if (error) throw error
      setSyncedCourses(data || [])
    } catch (err) {
      console.error('Error loading synced courses:', err)
      setMessage({ type: 'error', text: 'Failed to load synced courses' })
    } finally {
      setLoading(false)
    }
  }

  async function syncAllCourses() {
    if (!CANVAS_TOKEN || !CANVAS_DOMAIN) {
      setMessage({ type: 'error', text: 'Canvas credentials not configured. Please check environment variables.' })
      return
    }

    setSyncing(true)
    setMessage({ type: '', text: '' })

    let totalCourses = 0
    let totalAssignments = 0
    let totalFlashcardSets = 0

    try {
      // Step 1: Fetch all active courses
      setSyncProgress({ current: 0, total: 0, currentCourse: 'Fetching courses from Canvas...' })

      const coursesResponse = await fetch(
        `https://${CANVAS_DOMAIN}/api/v1/courses?enrollment_state=active&per_page=100`,
        {
          headers: {
            'Authorization': `Bearer ${CANVAS_TOKEN}`
          }
        }
      )

      if (!coursesResponse.ok) {
        if (coursesResponse.status === 401) {
          throw new Error('Canvas token is invalid or expired. Please check your credentials.')
        }
        throw new Error(`Canvas API error: ${coursesResponse.statusText}`)
      }

      const courses = await coursesResponse.json()
      totalCourses = courses.length
      setSyncProgress({ current: 0, total: totalCourses, currentCourse: 'Processing courses...' })

      // Step 2: Process each course
      for (let i = 0; i < courses.length; i++) {
        const course = courses[i]
        setSyncProgress({
          current: i + 1,
          total: totalCourses,
          currentCourse: `Processing: ${course.name}`
        })

        try {
          // A. Check if course already exists
          const { data: existingCourse } = await supabase
            .from('canvas_courses')
            .select('id, study_set_id')
            .eq('user_id', user.id)
            .eq('canvas_course_id', course.id.toString())
            .single()

          let studySetId
          let canvasCourseId

          if (existingCourse) {
            // Update existing course
            studySetId = existingCourse.study_set_id
            canvasCourseId = existingCourse.id

            await supabase
              .from('canvas_courses')
              .update({
                course_name: course.name,
                course_code: course.course_code,
                last_synced_at: new Date().toISOString()
              })
              .eq('id', existingCourse.id)
          } else {
            // B. Create new study set
            const { data: studySet, error: studySetError } = await supabase
              .from('study_sets')
              .insert({
                user_id: user.id,
                title: course.name,
                subject_area: course.course_code || 'Canvas Import',
                description: `Imported from Canvas: ${course.name}`
              })
              .select()
              .single()

            if (studySetError) throw studySetError
            studySetId = studySet.id

            // C. Save course to database
            const { data: canvasCourse, error: courseError } = await supabase
              .from('canvas_courses')
              .insert({
                user_id: user.id,
                canvas_course_id: course.id.toString(),
                course_name: course.name,
                course_code: course.course_code,
                start_date: course.start_at,
                end_date: course.end_at,
                study_set_id: studySetId,
                last_synced_at: new Date().toISOString()
              })
              .select()
              .single()

            if (courseError) throw courseError
            canvasCourseId = canvasCourse.id
          }

          // D. Fetch assignments for the course
          const assignmentsResponse = await fetch(
            `https://${CANVAS_DOMAIN}/api/v1/courses/${course.id}/assignments?per_page=100`,
            {
              headers: {
                'Authorization': `Bearer ${CANVAS_TOKEN}`
              }
            }
          )

          if (assignmentsResponse.ok) {
            const assignments = await assignmentsResponse.json()
            totalAssignments += assignments.length

            // E. Process each assignment
            for (const assignment of assignments) {
              // Check if assignment already exists
              const { data: existingAssignment } = await supabase
                .from('canvas_assignments')
                .select('id')
                .eq('canvas_assignment_id', assignment.id.toString())
                .eq('canvas_course_id', canvasCourseId)
                .single()

              if (!existingAssignment) {
                // Save new assignment to database
                await supabase
                  .from('canvas_assignments')
                  .insert({
                    canvas_course_id: canvasCourseId,
                    canvas_assignment_id: assignment.id.toString(),
                    assignment_name: assignment.name,
                    assignment_description: assignment.description,
                    due_date: assignment.due_at,
                    points_possible: assignment.points_possible,
                    flashcards_generated: false
                  })

                // F. If assignment has description, generate flashcards
                if (assignment.description && assignment.description.trim().length > 50) {
                  totalFlashcardSets++
                  // Fire webhook asynchronously (fire-and-forget)
                  setTimeout(() => {
                    fetch('https://maxipad.app.n8n.cloud/webhook/generate-flashcards-from-canvas', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        study_set_id: studySetId,
                        assignment_name: assignment.name,
                        assignment_description: assignment.description,
                        due_date: assignment.due_at
                      })
                    }).catch(err => console.error('Webhook error:', err))
                  }, 0)
                }
              }
            }
          }
        } catch (courseError) {
          console.error(`Error processing course ${course.name}:`, courseError)
          // Continue with next course
        }
      }

      setMessage({
        type: 'success',
        text: `Successfully synced ${totalCourses} courses, ${totalAssignments} assignments, and initiated ${totalFlashcardSets} flashcard generations.`
      })

      // Reload synced courses
      await loadSyncedCourses()

    } catch (err) {
      console.error('Sync error:', err)
      setMessage({ type: 'error', text: err.message || 'Failed to sync courses' })
    } finally {
      setSyncing(false)
      setSyncProgress({ current: 0, total: 0, currentCourse: '' })
    }
  }

  async function resyncCourse(courseId, canvasCourseId) {
    try {
      setMessage({ type: '', text: '' })

      // Fetch course details
      const courseResponse = await fetch(
        `https://${CANVAS_DOMAIN}/api/v1/courses/${canvasCourseId}`,
        {
          headers: {
            'Authorization': `Bearer ${CANVAS_TOKEN}`
          }
        }
      )

      if (!courseResponse.ok) throw new Error('Failed to fetch course details')
      const course = await courseResponse.json()

      // Update last synced timestamp
      await supabase
        .from('canvas_courses')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', courseId)

      // Fetch and process assignments (same logic as above)
      const assignmentsResponse = await fetch(
        `https://${CANVAS_DOMAIN}/api/v1/courses/${canvasCourseId}/assignments?per_page=100`,
        {
          headers: {
            'Authorization': `Bearer ${CANVAS_TOKEN}`
          }
        }
      )

      if (assignmentsResponse.ok) {
        const assignments = await assignmentsResponse.json()
        const { data: canvasCourse } = await supabase
          .from('canvas_courses')
          .select('study_set_id')
          .eq('id', courseId)
          .single()

        for (const assignment of assignments) {
          const { data: existingAssignment } = await supabase
            .from('canvas_assignments')
            .select('id')
            .eq('canvas_assignment_id', assignment.id.toString())
            .eq('canvas_course_id', courseId)
            .single()

          if (!existingAssignment && assignment.description && assignment.description.trim().length > 50) {
            await supabase
              .from('canvas_assignments')
              .insert({
                canvas_course_id: courseId,
                canvas_assignment_id: assignment.id.toString(),
                assignment_name: assignment.name,
                assignment_description: assignment.description,
                due_date: assignment.due_at,
                points_possible: assignment.points_possible,
                flashcards_generated: false
              })

            // Fire webhook
            setTimeout(() => {
              fetch('https://maxipad.app.n8n.cloud/webhook/generate-flashcards-from-canvas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  study_set_id: canvasCourse.study_set_id,
                  assignment_name: assignment.name,
                  assignment_description: assignment.description,
                  due_date: assignment.due_at
                })
              }).catch(err => console.error('Webhook error:', err))
            }, 0)
          }
        }
      }

      setMessage({ type: 'success', text: `Re-synced ${course.name}` })
      await loadSyncedCourses()
    } catch (err) {
      console.error('Re-sync error:', err)
      setMessage({ type: 'error', text: 'Failed to re-sync course' })
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Canvas Integration</h1>
        <p className="text-gray-600">Sync your Canvas courses and automatically generate study materials from assignments.</p>
      </div>

      {/* Sync Button */}
      <div className="mb-6">
        <button
          onClick={syncAllCourses}
          disabled={syncing}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {syncing ? 'Syncing...' : 'Sync Canvas Courses'}
        </button>
      </div>

      {/* Progress Indicator */}
      {syncing && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <div className="mb-2">
            <div className="text-sm font-medium text-blue-900">
              {syncProgress.currentCourse}
            </div>
            {syncProgress.total > 0 && (
              <div className="text-xs text-blue-700">
                Progress: {syncProgress.current} / {syncProgress.total} courses
              </div>
            )}
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{
                width: syncProgress.total > 0
                  ? `${(syncProgress.current / syncProgress.total) * 100}%`
                  : '0%'
              }}
            />
          </div>
        </div>
      )}

      {/* Messages */}
      {message.text && (
        <div
          className={`mb-6 p-4 rounded ${
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
        <h2 className="text-xl font-semibold mb-4">Synced Courses</h2>
        {syncedCourses.length === 0 ? (
          <div className="text-center py-8 border rounded bg-gray-50">
            <p className="text-gray-600">No courses synced yet. Click "Sync Canvas Courses" to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {syncedCourses.map((course) => (
              <div key={course.id} className="border rounded p-4 bg-white hover:shadow-md transition-shadow">
                <div className="mb-3">
                  <h3 className="font-semibold text-lg">{course.course_name}</h3>
                  <p className="text-sm text-gray-600">{course.course_code}</p>
                </div>

                <div className="mb-3 space-y-1">
                  <div className="text-sm">
                    <span className="text-gray-600">Cards: </span>
                    <span className="font-medium">{course.study_sets?.total_cards || 0}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Last synced: {new Date(course.last_synced_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  {course.study_set_id && (
                    <Link
                      to={`/study-set/${course.study_set_id}`}
                      className="flex-1 px-3 py-1.5 text-sm text-center bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      View Study Set
                    </Link>
                  )}
                  <button
                    onClick={() => resyncCourse(course.id, course.canvas_course_id)}
                    className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Re-sync
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
