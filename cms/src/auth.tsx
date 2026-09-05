import { createContext, useContext, useState, type ReactNode } from "react"
import { login as apiLogin, ApiError } from "./api"

interface AuthContextValue {
  username: string | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = "peblo_cms_token"
const USER_KEY = "peblo_cms_user"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem(TOKEN_KEY)
  )
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem(USER_KEY)
  )

  const login = async (username: string, password: string) => {
    if (!username.trim() || !password.trim()) {
      throw new Error("Username and password are required")
    }
    let accessToken: string
    try {
      const res = await apiLogin(username.trim(), password)
      accessToken = res.access_token
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw new Error("Invalid username or password")
      }
      throw err
    }
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(USER_KEY, username.trim())
    setToken(accessToken)
    setUsername(username.trim())
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider
      value={{
        username,
        token,
        isAuthenticated: !!token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}