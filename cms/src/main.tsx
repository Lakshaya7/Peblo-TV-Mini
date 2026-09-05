import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "./App.css"
import { AuthProvider, useAuth } from "./auth"
import AppLayout from "./App"
import Login from "./components/Login"
import ShowList from "./components/ShowList"
import ShowDetail from "./components/ShowDetail"
import PublishPage from "./components/PublishPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function AuthGate() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Login />
  return <AppLayout />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AuthGate />}>
              <Route path="/" element={<ShowList />} />
              <Route path="/shows/:showId" element={<ShowDetail />} />
              <Route path="/publish" element={<PublishPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

const root = createRoot(document.getElementById("root")!)
root.render(
  <StrictMode>
    <App />
  </StrictMode>
)