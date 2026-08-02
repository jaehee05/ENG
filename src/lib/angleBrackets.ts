/**
 * 부등호(< >)를 홑화살괄호(〈 〉)로.
 *
 * 국어 해설에서 꺾쇠는 거의 언제나 작품명에 두르는 홑화살괄호인데 키보드로
 * 바로 못 친다. 편집기는 치는 즉시 바꿔 넣고(RichTextEditor), 그 기능이 생기기
 * 전에 부등호로 적어 둔 해설은 아래 일괄 변환으로 손본다.
 */

/** 치는 즉시 바꿀 글자. */
export const AUTO_REPLACE: Record<string, string> = {
  '<': '〈',
  '>': '〉',
}

/** 평문에서 바꾼다. */
export function convertAngleInText(text: string): string {
  return text.replace(/</g, '〈').replace(/>/g, '〉')
}

/**
 * HTML에서 바꾼다. **글자만 손대고 태그는 건드리지 않는다.**
 *
 * 문자열 치환으로 하면 안 된다 — 저장된 HTML에서 사람이 친 꺾쇠는 `&lt;` 로
 * 들어가 있고 진짜 `<` 는 태그의 시작이다. 통째로 바꾸면 서식이 다 깨진다.
 * 그래서 파싱해서 글자 노드만 고른다(태그 안은 글자 노드가 아니다).
 *
 * 바뀐 게 없으면 원본 문자열을 그대로 돌려준다 — 다시 직렬화하면서 따옴표나
 * 빈 태그 모양이 달라지는 것을 막는다.
 */
export function convertAngleInHtml(html: string): string {
  if (!html) return html
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const texts: Text[] = []
    while (walker.nextNode()) texts.push(walker.currentNode as Text)

    let changed = false
    for (const node of texts) {
      const next = convertAngleInText(node.data)
      if (next !== node.data) {
        node.data = next
        changed = true
      }
    }
    return changed ? doc.body.innerHTML : html
  } catch {
    return html
  }
}
