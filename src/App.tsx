import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CircleProvider, useCircle } from './context/CircleContext'
import { ToastProvider } from './context/ToastContext'
import { TrackerProvider } from './context/TrackerContext'
import { AppShell } from './components/AppShell'
import { FullScreenSpinner, Spinner } from './components/ui'
import { firebaseConfigured } from './lib/firebase'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Onboarding from './pages/Onboarding'
import CompleteProfile from './pages/CompleteProfile'
import MapPage from './pages/MapPage'
import type { UserProfile } from './lib/types'

const PlacesPage = lazy(() => import('./pages/PlacesPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const SharePage = lazy(() => import('./pages/SharePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const PublicShare = lazy(() => import('./pages/PublicShare'))

function ConfigMissing() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md rounded-2xl bg-white p-6 shadow ring-1 ring-slate-200">
        <h1 className="text-xl font-bold">Configuração do Firebase ausente</h1>
        <p className="mt-2 text-slate-600">
          Defina as variáveis <code className="rounded bg-slate-100 px-1">VITE_FIREBASE_*</code> no arquivo <code className="rounded bg-slate-100 px-1">.env</code> (local) ou em
          Vercel → Settings → Environment Variables, e faça o deploy de novo.
        </p>
      </div>
    </div>
  )
}

function SignedInApp({ profile }: { profile: UserProfile }) {
  return (
    <CircleProvider profile={profile}>
      <CircleGate profile={profile} />
    </CircleProvider>
  )
}

function CircleGate({ profile }: { profile: UserProfile }) {
  const { circle, places, me, ready } = useCircle()
  if (!ready) return <FullScreenSpinner label="Carregando sua família…" />
  if (!circle || !circle.members.includes(profile.uid)) return <Onboarding />

  return (
    <TrackerProvider profile={profile} circleId={circle.id} places={places} sharing={me?.sharing !== false}>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<MapPage />} />
            <Route path="lugares" element={<PlacesPage />} />
            <Route path="historico" element={<HistoryPage />} />
            <Route path="alertas" element={<AlertsPage />} />
            <Route path="compartilhar" element={<SharePage />} />
            <Route path="ajustes" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </TrackerProvider>
  )
}

function Root() {
  const { user, profile, loading } = useAuth()
  if (loading) return <FullScreenSpinner />

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (!profile) return <CompleteProfile />
  if (!profile.circleId) return <Onboarding />
  return <SignedInApp profile={profile} />
}

export default function App() {
  if (!firebaseConfigured) return <ConfigMissing />
  return (
    <BrowserRouter>
      <ToastProvider>
        <Suspense fallback={<FullScreenSpinner />}>
          <Routes>
            {/* Página pública do link temporário: funciona sem login */}
            <Route path="/s/:token" element={<PublicShare />} />
            <Route
              path="*"
              element={
                <AuthProvider>
                  <Root />
                </AuthProvider>
              }
            />
          </Routes>
        </Suspense>
      </ToastProvider>
    </BrowserRouter>
  )
}
