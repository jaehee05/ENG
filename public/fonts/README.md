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
