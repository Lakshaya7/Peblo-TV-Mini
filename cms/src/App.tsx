import { NavLink, Outlet } from "react-router-dom"
import { useAuth } from "./auth"

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-blue-100 text-blue-700"
      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
  }`

export default function AppLayout() {
  const { username, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-gray-900 mr-4">
                Peblo TV CMS
              </span>
              <NavLink to="/" className={navLinkClass} end>
                Shows
              </NavLink>
              <NavLink to="/publish" className={navLinkClass}>
                Publish
              </NavLink>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                Signed in as <strong>{username}</strong>
              </span>
              <button
                onClick={logout}
                className="text-sm text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}