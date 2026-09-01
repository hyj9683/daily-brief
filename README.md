# 오늘의 경제 — 모바일 브리핑 앱

매일 아침 갱신되는 **시황**과 **경제 뉴스** 브리핑을 폰에 설치해서 보는 PWA입니다.
GitHub Pages로 배포하고, Chrome에서 "앱 설치"를 누르면 홈 화면 아이콘 · 전체화면 · 오프라인 열람이 됩니다.

```
index.html            앱 셸 (상단바 · 하단 탭 3개)
app.js                데이터를 읽어 화면을 그리는 렌더러
styles.css            디자인 (라이트/다크 자동)
sw.js                 서비스 워커 — 오프라인 캐시
manifest.webmanifest  설치 정보 (이름 · 아이콘 · 시작 화면)
publish.mjs           검사 → 지난 호 보관 → 목록 갱신 → 배포
data/
  latest.json         오늘의 브리핑  ← 매일 이 파일만 갈아끼우면 됩니다
  index.json          지난 호 목록 (publish.mjs가 자동 생성)
  archive/            날짜별 보관본 (publish.mjs가 자동 생성)
```

---

## 매일 아침 갱신하는 법

1. Claude에게 그날의 브리핑을 만들어 `data/latest.json` 으로 저장하게 합니다.
2. 아래 한 줄을 실행합니다.

```bash
cd ~/daily-brief && node publish.mjs --push
```

검사 → 지난 호 보관 → 목록 갱신 → GitHub push 까지 한 번에 끝납니다.
1분쯤 뒤 폰에서 앱을 열면 (또는 오른쪽 위 새로고침을 누르면) 새 브리핑이 나옵니다.

원고를 다른 파일로 받았다면 그 파일을 넘겨도 됩니다:

```bash
node publish.mjs 오늘원고.json --push
```

배포 없이 검사만 하려면 `--push` 를 빼고 실행하세요.

---

## 데이터 스키마

`data/latest.json` 한 파일이 앱 전체를 그립니다.

```jsonc
{
  "version": 1,
  "date": "2026-09-01",              // YYYY-MM-DD (필수 · 지난 호 파일명이 됩니다)
  "issueDate": "2026. 09. 01 (화) 조간",
  "updatedLabel": "8월 31일(월) 마감 기준",
  "headline": "…",                    // 지난 호 목록에 보일 한 줄
  "tabs": [ { "id": "market", … }, { "id": "news", … } ]
}
```

탭은 `id` 가 **`market`**(시황)과 **`news`**(뉴스) 두 개입니다.

```jsonc
{
  "id": "market",
  "kicker": "Market Board",          // 제목 위 영문 라벨
  "title": "시황판",
  "subtitle": "…",
  "stamp": ["2026. 09. 01 (화) 조간", "…"],   // 알약 모양 배지들
  "ticker": [                                  // 가로 스크롤 시세 (market 탭에서만 씀)
    { "label": "KOSPI", "value": "6,820.02", "delta": "▲ 0.46%", "dir": "up" }
  ],
  "hero": {
    "tier": "오늘의 한 줄",
    "headline": "…",
    "lead": "…",
    "kpis": [ { "label": "코스피", "value": "6,820.02", "delta": "+0.46%", "dir": "up" } ]
  },
  "sections": [ … ],
  "footer": ["<b>데이터 기준</b> …", "…"]
}
```

`dir` 은 `up`(빨강) · `down`(파랑) · 생략(회색). 국내 관행대로 상승이 빨강입니다.

### 섹션

```jsonc
{ "no": "01", "title": "오늘의 요약", "note": "우측 작은 글씨", "blocks": [ … ] }
```

`"style": "card"` 를 주면 뉴스 탭의 분야 카드가 됩니다.

```jsonc
{
  "style": "card",
  "accent": "c4",          // c1 파랑 · c2 주황 · c3 초록 · c4 보라 · c5 금색
  "tag": "금융 · 증권",
  "no": "ISSUE 01",
  "title": "…",
  "blocks": [ … ]
}
```

### 블록 종류

| type | 쓰임 | 필드 |
|---|---|---|
| `p` | 문단 | `text` |
| `bullets` | 글머리 목록 | `items[]` |
| `callout` | 강조 박스 | `text` |
| `kpis` | 2열 지표 카드 | `items[] {label,value,delta,dir}` |
| `stats` | 2열 통계 타일 | `items[] {label,value,delta,dir}` |
| `table` | 표 | `head[]`, `rows[][]`, `numeric[]`(우측정렬할 열 번호) |
| `hbar` | 가로 막대 | `caption`, `rows[] {label,value,magnitude\|pct,dir\|accent,fade}` |
| `timeline` | 세로 타임라인 | `items[] {when,what,done}` |
| `terms` | 용어 카드 묶음 | `items[] {word,desc,accent}` |
| `term` | 용어 한 개 | `word`, `desc` |
| `caption` | 출처 등 작은 글씨 | `text` |

`hbar` 는 `magnitude`(실제 값)를 주면 가장 큰 값을 100%로 잡아 알아서 비율을 냅니다.
직접 정하려면 `pct` 를 쓰세요. 등락과 무관한 지표는 `dir` 대신 `accent`로 분야 색을 씁니다.

표의 칸은 문자열이거나 `{ "text": "+1.75%", "dir": "up" }` 형태입니다.

### 본문에 쓸 수 있는 태그

`text` · `items` · `desc` · `footer` 안에서는 다음만 살아남고 나머지는 제거됩니다.

```
<b> <strong> <em> <i> <small> <br> <sup> <sub>
<span class="up|down|flat|num|muted">
```

---

## 폰에 설치하기

**안드로이드 (Chrome)** — 배포된 주소를 열고 ⋮ → **앱 설치** (또는 하단에 뜨는 "홈 화면에 추가" 배너의 설치 버튼).
**아이폰 (Safari)** — 공유 버튼 → **홈 화면에 추가**.

설치하면 주소창 없는 전체화면으로 뜨고, 비행기 모드에서도 마지막으로 받은 브리핑이 열립니다.

---

## 배포 (처음 한 번만)

```bash
cd ~/daily-brief
git init && git add -A && git commit -m "첫 배포"
git branch -M main
git remote add origin https://github.com/<아이디>/daily-brief.git
git push -u origin main
```

GitHub 저장소 → **Settings → Pages → Source: Deploy from a branch → main / (root)** 로 켜면
`https://<아이디>.github.io/daily-brief/` 에서 열립니다.

> 저장소를 Public으로 두면 브리핑 내용이 공개됩니다. Private 저장소는 GitHub Pages 사용에
> 유료 플랜이 필요하니, 공개해도 괜찮은 내용인지 한 번 확인하세요.

---

## 앱 화면을 고쳤을 때

`index.html` · `app.js` · `styles.css` · `sw.js` 를 고쳤다면
`sw.js` 맨 위의 `SHELL_VERSION` 을 `shell-v2`, `shell-v3` … 으로 올려 주세요.
그래야 이미 설치된 폰이 옛 화면을 캐시에서 계속 쓰지 않고 새 화면을 받아갑니다.
`data/` 안의 브리핑 내용만 바뀔 때는 올릴 필요 없습니다.
