import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function NavBar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const showCreate = user && location.pathname === '/'

  return (
    <div className="border-b">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/" className="font-semibold">SubjectFocus</Link>
        <div className="flex items-center gap-3">
          {showCreate && (
            <Link to="/study-set/new" className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm">Create Study Set</Link>
          )}
          {user && (
            <Link to="/canvas/sync" className="px-3 py-1.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">
              Canvas Sync
            </Link>
          )}
          {user ? (
            <>
              <span className="text-sm text-gray-600">{user.email}</span>
              <button onClick={handleLogout} className="text-sm text-gray-700 underline">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm">Login</Link>
              <Link to="/signup" className="text-sm">Sign Up</Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

