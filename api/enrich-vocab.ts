import type { VercelRequest, VercelResponse } from '@vercel/node'
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `당신은 한국 고등학생을 위한 영어 어휘 학습 자료 작성자입니다.
주어진 영어 단어 목록 각각에 학습용 보강 정보를 채워 submit_enriched 도구를 호출하세요.

각 단어별로 다음을 채웁니다.

- en, ko: 입력 그대로
- ipa: 미국식 IPA 발음 표기. 대괄호 없이. 예: "ǽdvent" (advent), "ɪˈmɜːrdʒ" (emerge)
- pos: 품사 토큰 한 개. n. / v. / adj. / adv. / prep. / conj. / int. 중 하나
- synonyms: 동의/유의어 2~4개의 영어 단어 배열. 한국어 뜻과 같은 의미군의 동의어. 예: ["arrival", "appearance", "emergence"]. 가능한 단일 단어, 숙어면 가능
- example: 그 단어가 자연스럽게 쓰인 한 문장의 영어 예문. 수능 지문 톤(중급, 12~22 단어). 단어를 그대로 또는 자연스러운 활용형으로 포함
- exampleKo: example의 한국어 번역. 자연스러운 한국어 한 문장
- definitionEn: 영영 정의(영어로 설명). 학습자 사전 스타일, 한 문장. 한국어 뜻과 일치하는 문맥의 의미.

ko에 여러 뜻이 쉼표로 묶여 있으면 가장 대표적인 의미 하나에 맞춰 synonyms/definitionEn/example을 작성하세요.`

interface InputWord {
  en: string
  ko: string
}

interface EnrichedWord {
  en: string
  ko: string
  ipa: string
  pos: string
  synonyms: string[]
  example: string
  exampleKo: string
  definitionEn: string
}

function isStr(x: unknown): x is string {
  return typeof x === 'string'
}

function normalizeWords(input: unknown): EnrichedWord[] {
  const obj = (input ?? {}) as { words?: unknown }
  const arr = Array.isArray(obj.words) ? obj.words : []
  const out: EnrichedWord[] = []
  for (const w of arr) {
    if (!w || typeof w !== 'object') continue
    const r = w as Record<string, unknown>
    const en = isStr(r.en) ? r.en.trim() : ''
    if (!en) continue
    const synonymsRaw = Array.isArray(r.synonyms) ? r.synonyms : []
    out.push({
      en,
      ko: isStr(r.ko) ? r.ko.trim() : '',
      ipa: isStr(r.ipa) ? r.ipa.trim() : '',
      pos: isStr(r.pos) ? r.pos.trim() : '',
      synonyms: synonymsRaw
        .map((s) => (isStr(s) ? s.trim() : ''))
        .filter((s) => s.length > 0),
      example: isStr(r.example) ? r.example.trim() : '',
      exampleKo: isStr(r.exampleKo) ? r.exampleKo.trim() : '',
      definitionEn: isStr(r.definitionEn) ? r.definitionEn.trim() : '',
    })
  }
  return out
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' })
    return
  }

  const { words } = (req.body ?? {}) as { words?: InputWord[] }
  if (!Array.isArray(words) || words.length === 0) {
    res.status(400).json({ error: 'words 배열이 필요합니다.' })
    return
  }

  const compact = words
    .filter((w) => w && typeof w.en === 'string' && w.en.trim())
    .map((w) => ({ en: w.en.trim(), ko: typeof w.ko === 'string' ? w.ko.trim() : '' }))

  const userText = [
    '다음 단어들에 보강 정보를 채워 submit_enriched 도구를 호출하세요.',
    JSON.stringify({ words: compact }),
  ].join('\n')

  const client = new Anthropic({ apiKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'submit_enriched',
          description: '단어별 학습 정보를 제출합니다.',
          input_schema: {
            type: 'object',
            properties: {
              words: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    en: { type: 'string' },
                    ko: { type: 'string' },
                    ipa: { type: 'string' },
                    pos: { type: 'string' },
                    synonyms: { type: 'array', items: { type: 'string' } },
                    example: { type: 'string' },
                    exampleKo: { type: 'string' },
                    definitionEn: { type: 'string' },
                  },
                  required: ['en'],
                },
              },
            },
            required: ['words'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_enriched' },
      messages: [{ role: 'user', content: userText }],
    })

    const toolUse = msg.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      res.status(502).json({ error: 'Claude 응답에 결과가 없습니다.' })
      return
    }
    res.status(200).json({ words: normalizeWords(toolUse.input) })
  } catch (err) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    res.status(500).json({ error: message })
  }
}
