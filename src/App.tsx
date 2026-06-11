import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { VocabList } from './pages/VocabList'
import { VocabNew } from './pages/VocabNew'
import { VocabDetail } from './pages/VocabDetail'
import { VocabTake } from './pages/VocabTake'
import { VocabResult } from './pages/VocabResult'
import { ReadingList } from './pages/ReadingList'
import { ReadingNew } from './pages/ReadingNew'
import { ReadingDetail } from './pages/ReadingDetail'
import { ReadingTake } from './pages/ReadingTake'
import { ReadingResult } from './pages/ReadingResult'
import { ReadingSheet } from './pages/ReadingSheet'
import { Wordbook } from './pages/Wordbook'
import { WordbookTake } from './pages/WordbookTake'
import { WordbookResult } from './pages/WordbookResult'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />

              <Route path="/vocab" element={<VocabList />} />
              <Route path="/vocab/:id" element={<VocabDetail />} />
              <Route path="/vocab/:id/take" element={<VocabTake />} />
              <Route path="/vocab/:id/result/:attemptId" element={<VocabResult />} />

              <Route path="/reading" element={<ReadingList />} />
              <Route path="/reading/:id" element={<ReadingDetail />} />
              <Route path="/reading/:id/take" element={<ReadingTake />} />
              <Route path="/reading/:id/sheet" element={<ReadingSheet />} />
              <Route path="/reading/:id/result/:attemptId" element={<ReadingResult />} />

              <Route path="/wordbook" element={<Wordbook />} />
              <Route path="/wordbook/take" element={<WordbookTake />} />
              <Route path="/wordbook/result/:attemptId" element={<WordbookResult />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout />}>
              <Route path="/vocab/new" element={<VocabNew />} />
              <Route path="/reading/new" element={<ReadingNew />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
