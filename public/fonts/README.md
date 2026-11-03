# 마루 부리 (MaruBuri)

출제자의 한마디에 쓰는 본문 명조체. 네이버가 만들어 SIL Open Font License 1.1
로 배포한다 — 상업적 이용과 재배포가 허용된다.

- 출처: npm `@kfonts/maruburi` (0.1.0), 원본은 <https://hangeul.naver.com/font>
- 라이선스: OFL-1.1
- 받아둔 굵기: Regular(400), Bold(700). ExtraLight·Light·SemiBold 는 쓰는 데가
  없어 뺐다 — 굵기 하나가 0.8 MB 라 앱 번들과 Capgo 업데이트 용량에 그대로
  얹힌다.

`.woff` 는 넣지 않았다. 이 앱은 iOS(WKWebView)와 최신 브라우저에서만 돌고
둘 다 `.woff2` 를 읽는다.

@font-face 선언은 `src/index.css`, 유틸리티 클래스는 `tailwind.config.js` 의
`font-maruburi` 에 있다.

# 나눔바른고딕 옛한글 (NanumBarunGothic YetHangul) — 옛한글 전용 대타

마루 부리에는 옛한글 자모(ᅀ·ᆞ·ᇫ …)가 한 자도 없어, 해설의 ‘ᄇᆞᅀᆞ다’ 같은
글자가 낱자로 흩어지거나 기기 글꼴로 섞여 깨져 보였다. 옛한글 구간만 이
글꼴에 맡긴다. 네이버 나눔글꼴, SIL Open Font License 1.1.

- 원본: `NanumBarunGothic-YetHangul.otf` (사용자 보관본, 2021-11)
- `NanumBarunGothic-YetHangul-sub.woff2` 는 원본에서 아래 구간만 잘라
  woff2 로 만든 것이다(3 MB → 270 KB). GSUB 의 ljmo/vjmo/tjmo 는 그대로 남아
  자모 조합(ᅀ+ᆞ → 한 글자)이 된다.
  - U+1100-11FF 한글 자모, U+A960-A97F 확장 A, U+D7B0-D7FF 확장 B
  - U+3165-318E 옛 호환 자모(ㅿ·ㆍ …), U+302E-302F 방점, U+25CC
- 다시 만들 때:
  `pyftsubset NanumBarunGothic-YetHangul.otf --unicodes="U+1100-11FF,U+A960-A97F,U+D7B0-D7FF,U+3165-318E,U+302E-302F,U+25CC" --layout-features='*' --flavor=woff2 --output-file=NanumBarunGothic-YetHangul-sub.woff2`
- TTF 판도 있지만 디자인이 같고, 잘랐을 때 OTF 쪽이 더 작아(270 KB vs 306 KB) OTF 를 골랐다.
