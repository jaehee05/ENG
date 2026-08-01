import { useAuth } from '../contexts/useAuth'
import { AdminVocabStudents } from './AdminVocabStudents'
import { VocabSeriesList } from './VocabSeriesList'

/**
 * 단어 탭 진입점. 관리자는 학생 목록으로, 학생은 교재 목록으로 간다.
 *
 * 예전에는 관리자도 "자기 시험지" 목록을 봤는데, 시험지는 학생에게만
 * 배정되므로 관리자 화면은 늘 비어 있었다.
 *
 * 학생 쪽은 DAY 시험지를 한 줄로 펼쳤다가 교재 목록으로 바꿨다 — 교재가
 * 여러 개면 수십 줄이 섞여 어디부터 풀지 알 수 없었다.
 */
export function VocabHome() {
  const { profile } = useAuth()
  return profile?.role === 'admin' ? <AdminVocabStudents /> : <VocabSeriesList />
}
