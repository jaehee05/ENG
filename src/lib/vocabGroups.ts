import { setsOfSeries } from './firestore'
import { isVisibleToStudent, type VocabSeries, type VocabSet } from './types'

/**
 * 이 학생 화면에 띄울 시험지만 남긴다.
 *
 * 두 가지를 건다 — 병합 전 옛 시험지에 남아 있는 소유자(studentUid)와,
 * 교재에서 지정한 공개 대상(studentUids). 둘 다 없으면 전체 공개다.
 */
export function visibleSetsFor(sets: VocabSet[], uid: string): VocabSet[] {
  return sets.filter(
    (s) => (!s.studentUid || s.studentUid === uid) && isVisibleToStudent(s, uid),
  )
}

export interface SeriesGroup {
  series: Pick<VocabSeries, 'id' | 'title'>
  /** DAY 오름차순. */
  days: { day: number; set: VocabSet }[]
}

/**
 * 시험지를 교재별로 묶는다. 어느 교재에도 안 붙는 시험지는 loose 로 뺀다 —
 * 교재가 생기기 전에 만든 시험지가 통째로 사라지면 안 된다.
 */
export function groupBySeries(
  series: VocabSeries[],
  sets: VocabSet[],
): { groups: SeriesGroup[]; loose: VocabSet[] } {
  const taken = new Set<string>()
  const groups: SeriesGroup[] = []
  // 제목으로 되짚는 옛 시험지(seriesId 없음)가 두 교재에 겹쳐 잡히는 걸 막는다.
  // firestore 의 findSeriesForSet 과 같은 규칙으로 제목이 긴 쪽이 가져간다.
  const ordered = [...series].sort((a, b) => b.title.length - a.title.length)
  for (const s of ordered) {
    const days = setsOfSeries(s, sets).filter((d) => !taken.has(d.set.id))
    if (days.length === 0) continue
    for (const d of days) taken.add(d.set.id)
    groups.push({ series: { id: s.id, title: s.title }, days })
  }
  // 화면 순서는 교재명 기준으로 되돌린다 — 위에서 제목 길이로 섞였다.
  groups.sort((a, b) =>
    a.series.title.localeCompare(b.series.title, 'ko', { numeric: true }),
  )
  return { groups, loose: sets.filter((s) => !taken.has(s.id)) }
}
