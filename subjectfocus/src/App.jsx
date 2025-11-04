import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import CreateStudySet from './pages/CreateStudySet'
import StudySetDetail from './pages/StudySetDetail'
import PracticeMode from './pages/PracticeMode'
import StudyGuidesList from './pages/StudyGuidesList'
import StudyGuideView from './pages/StudyGuideView'
import StudyGuideEditor from './pages/StudyGuideEditor'
import PodcastsList from './pages/PodcastsList'
import CreatePodcast from './pages/CreatePodcast'
import PodcastPlayer from './pages/PodcastPlayer'
import LiveInteractivePodcast from './pages/LiveInteractivePodcast'

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <NavBar />
      <div className="flex-1">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/new"
            element={
              <ProtectedRoute>
                <CreateStudySet />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id"
            element={
              <ProtectedRoute>
                <StudySetDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/practice"
            element={
              <ProtectedRoute>
                <PracticeMode />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/guides"
            element={
              <ProtectedRoute>
                <StudyGuidesList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/guides/:guideId"
            element={
              <ProtectedRoute>
                <StudyGuideView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/guides/:guideId/edit"
            element={
              <ProtectedRoute>
                <StudyGuideEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/podcasts"
            element={
              <ProtectedRoute>
                <PodcastsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/podcasts/create"
            element={
              <ProtectedRoute>
                <CreatePodcast />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:id/podcasts/:podcastId"
            element={
              <ProtectedRoute>
                <PodcastPlayer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/study-set/:setId/podcasts/:podcastId/interactive"
            element={
              <ProtectedRoute>
                <LiveInteractivePodcast />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

