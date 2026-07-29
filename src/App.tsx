import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { Dashboard } from './pages/Dashboard'
import { VocabList } from './pages/VocabList'
import { VocabHome } from './pages/VocabHome'
import { AdminVocabStudent } from './pages/AdminVocabStudent'
import { VocabDetail } from './pages/VocabDetail'
import { VocabTake } from './pages/VocabTake'
import { VocabSheet } from './pages/VocabSheet'
import { VocabResult } from './pages/VocabResult'
import { ReadingResult } from './pages/ReadingResult'
import { Wordbook } from './pages/Wordbook'
import { WordbookTake } from './pages/WordbookTake'
import { WordbookResult } from './pages/WordbookResult'
import { Pending } from './pages/Pending'
import { Rejected } from './pages/Rejected'
import { AdminStudents } from './pages/AdminStudents'
import { AdminStudentDetail } from './pages/AdminStudentDetail'
import { AdminNotify } from './pages/AdminNotify'
import { AdminAnnounce } from './pages/AdminAnnounce'
import { AdminCategories } from './pages/AdminCategories'
import { AdminHub } from './pages/AdminHub'
import { MyHistory } from './pages/MyHistory'
import { Notifications } from './pages/Notifications'
import { Notice } from './pages/Notice'
import { Assignments } from './pages/Assignments'
import { CorporaList } from './pages/CorporaList'
import { CorpusNew } from './pages/CorpusNew'
import { CorpusDetail } from './pages/CorpusDetail'
import { KoreanMockList } from './pages/KoreanMockList'
import { KoreanMockNew } from './pages/KoreanMockNew'
import { KoreanMockDetail } from './pages/KoreanMockDetail'
import { KoreanMockTake } from './pages/KoreanMockTake'
import { KoreanMockResult } from './pages/KoreanMockResult'
import { StudentSchedule } from './pages/StudentSchedule'
import { AdminPayments } from './pages/AdminPayments'
import { AdminAvailability } from './pages/AdminAvailability'
import { More } from './pages/More'
import { Profile } from './pages/Profile'

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

              <Route path="/vocab" element={<VocabHome />} />
              <Route path="/vocab/:id" element={<VocabDetail />} />
              <Route path="/vocab/:id/take" element={<VocabTake />} />
              <Route path="/vocab/:id/sheet" element={<VocabSheet />} />
              <Route path="/vocab/:id/result/:attemptId" element={<VocabResult />} />

              <Route path="/reading/:id/result/:attemptId" element={<ReadingResult />} />

              <Route path="/wordbook" element={<Wordbook />} />
              <Route path="/wordbook/take" element={<WordbookTake />} />
              <Route path="/wordbook/result/:attemptId" element={<WordbookResult />} />

              <Route path="/korean-mocks" element={<KoreanMockList />} />
              <Route path="/korean-mocks/:id" element={<KoreanMockDetail />} />
              <Route path="/korean-mocks/:id/take" element={<KoreanMockTake />} />
              <Route path="/korean-mocks/:id/result/:attemptId" element={<KoreanMockResult />} />

              <Route path="/history" element={<MyHistory />} />
              <Route path="/assignments" element={<Assignments />} />
              <Route path="/schedule" element={<StudentSchedule />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/more" element={<More />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/notice" element={<Notice />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute adminOnly />}>
            <Route element={<Layout />}>
              {/* /vocab/:id 보다 세그먼트가 하나 많아 라우터가 이쪽을 먼저 고른다 */}
              <Route path="/vocab/student/:uid" element={<AdminVocabStudent />} />
              <Route path="/vocab/corpora" element={<CorporaList />} />
              <Route path="/vocab/corpora/new" element={<CorpusNew />} />
              <Route path="/vocab/corpora/:id" element={<CorpusDetail />} />
              <Route path="/admin" element={<AdminHub />} />
              <Route path="/admin/vocab" element={<VocabList manage />} />
              <Route path="/admin/korean-mocks" element={<KoreanMockList manage />} />
              <Route path="/admin/korean-mocks/new" element={<KoreanMockNew />} />
              <Route path="/admin/students" element={<AdminStudents />} />
              <Route path="/admin/students/:id" element={<AdminStudentDetail />} />
              <Route path="/admin/notify" element={<AdminNotify />} />
              <Route path="/admin/announce" element={<AdminAnnounce />} />
              <Route path="/admin/categories" element={<AdminCategories />} />
              <Route path="/admin/payments" element={<AdminPayments />} />
              <Route path="/admin/availability" element={<AdminAvailability />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
