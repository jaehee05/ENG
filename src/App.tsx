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
import { VocabSheet } from './pages/VocabSheet'
import { VocabResult } from './pages/VocabResult'
import { ReadingList } from './pages/ReadingList'
import { ReadingNew } from './pages/ReadingNew'
import { ReadingEdit } from './pages/ReadingEdit'
import { ReadingImport } from './pages/ReadingImport'
import { ReadingDetail } from './pages/ReadingDetail'
import { ReadingTake } from './pages/ReadingTake'
import { ReadingResult } from './pages/ReadingResult'
import { ReadingSheet } from './pages/ReadingSheet'
import { Wordbook } from './pages/Wordbook'
import { WordbookTake } from './pages/WordbookTake'
import { WordbookResult } from './pages/WordbookResult'
import { Pending } from './pages/Pending'
import { Rejected } from './pages/Rejected'
import { AdminStudents } from './pages/AdminStudents'
import { AdminStudentDetail } from './pages/AdminStudentDetail'
import { AdminNotify } from './pages/AdminNotify'
import { AdminAnnounce } from './pages/AdminAnnounce'
import { AdminHub } from './pages/AdminHub'
import { MyHistory } from './pages/MyHistory'
import { Notifications } from './pages/Notifications'
import { Notice } from './pages/Notice'
import { Assignments } from './pages/Assignments'
import { CorporaList } from './pages/CorporaList'
import { CorpusNew } from './pages/CorpusNew'
import { CorpusDetail } from './pages/CorpusDetail'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/rejected" element={<Rejected />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />

              <Route path="/vocab" element={<VocabList />} />
              <Route path="/vocab/:id" element={<VocabDetail />} />
              <Route path="/vocab/:id/take" element={<VocabTake />} />
              <Route path="/vocab/:id/sheet" element={<VocabSheet />} />
              <Route path="/vocab/:id/result/:attemptId" element={<VocabResult />} />

              <Route path="/reading" element={<ReadingList />} />
              <Route path="/reading/:id" element={<ReadingDetail />} />
              <Route path="/reading/:id/take" element={<ReadingTake />} />
              <Route path="/reading/:id/sheet" element={<ReadingSheet />} />
              <Route path="/reading/:id/result/:attemptId" element={<ReadingResult />} />

              <Route path="/wordbook" element={<Wordbook />} />
              <Route path="/wordbook/take" element={<WordbookTake />} />
              <Route path="/wordbook/result/:attemptId" element={<WordbookResult />} />

              <Route path="/history" element={<MyHistory />} />
              <Route path="/assignments" element={<Assignments />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/notice" element={<Notice />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout />}>
              <Route path="/vocab/new" element={<VocabNew />} />
              <Route path="/vocab/corpora" element={<CorporaList />} />
              <Route path="/vocab/corpora/new" element={<CorpusNew />} />
              <Route path="/vocab/corpora/:id" element={<CorpusDetail />} />
              <Route path="/reading/new" element={<ReadingNew />} />
              <Route path="/reading/import" element={<ReadingImport />} />
              <Route path="/reading/:id/edit" element={<ReadingEdit />} />
              <Route path="/admin" element={<AdminHub />} />
              <Route path="/admin/students" element={<AdminStudents />} />
              <Route path="/admin/students/:id" element={<AdminStudentDetail />} />
              <Route path="/admin/notify" element={<AdminNotify />} />
              <Route path="/admin/announce" element={<AdminAnnounce />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
