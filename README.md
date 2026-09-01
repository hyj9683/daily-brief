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

**두 탭은 역할이 다릅니다. 같은 기사를 양쪽에 넣지 마세요.**

| 탭 | 맡는 것 |
|---|---|
| `market` **시황 = 주식 소식** | 코스피·코스닥, 수급, 주요 종목, 미국 3대 지수, 환율·국채금리·유가 |
| `news` **뉴스 = 경제 소식** | 정책·부동산·산업·소비·글로벌 등 증시 밖 경제 기사, 경제 용어 |

히어로 헤드라인도 겹치면 안 됩니다. `ticker` 와 히어로 `kpis` 는 시황 탭에만 둡니다.

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

### 사진

`photos/` 에 주제별 사진 라이브러리가 있고, 무엇이 있는지는 `photos/index.json` 에 정리돼 있습니다
(각 사진의 `keywords` 로 그날 기사에 맞는 것을 고릅니다).

카드 섹션과 히어로에는 `image` 를, 본문 중간에는 `photo` 블록을 씁니다.

```jsonc
// 카드/히어로
"image": { "src": "photos/oil.jpg", "alt": "원유 채굴 현장", "caption": "미·이란 교전 재개로 WTI 가 2.83% 올랐다." }

// 본문 블록
{ "type": "photo", "src": "photos/nyse.jpg", "alt": "뉴욕증권거래소 건물 외관", "caption": "3대 지수가 일제히 내렸다." }
```

`src` 는 반드시 `photos/` 로 시작하는 저장소 안의 파일이어야 합니다. 파일이 없으면 앱이 그 사진만
조용히 걷어내고 나머지는 정상 표시하며, `publish.mjs` 가 발행 전에 누락을 경고합니다.

`credit` 은 `photos/index.json` 에서 가져와 넣습니다. CC 라이선스 사진은 저작자·라이선스 표기가
의무이므로 캡션 아래 작은 글씨로 반드시 함께 나가야 합니다.

#### 새 사진 구하기

`tools/fetch-photo.py` 가 위키미디어 공용에서 사진을 찾아 내려받고 라이선스·저작자까지 등록합니다.
공용은 API 키가 필요 없고 전부 자유 라이선스라 재배포할 수 있습니다.

```bash
# 후보만 먼저 훑어본다
python tools/fetch-photo.py --search "steel mill blast furnace" --list

# 마음에 드는 번호로 등록 (기본 1번)
python tools/fetch-photo.py --id steel --search "steel mill blast furnace" --pick 2     --alt "제철소의 쇳물" --keywords 철강 포스코 현대제철 조강 원자재
```

**받은 사진은 반드시 눈으로 확인하세요.** 공용 검색은 엉뚱한 걸 자주 물어옵니다 —
"Cheong Wa Dae"(청와대)로 모로코의 파란 골목이, "soju"로 길가 공병 더미가 나온 적이 있습니다.
주제와 맞지 않으면 `--pick` 을 바꾸거나 검색어를 다시 짜고, 그래도 안 맞으면 그 카드는 사진 없이 둡니다.
**틀린 사진을 붙이느니 없는 편이 낫습니다.**

### 본문에 쓸 수 있는 태그

`text` · `items` · `desc` · `footer` 안에서는 다음만 살아남고 나머지는 제거됩니다.

```
<b> <strong> <em> <i> <small> <br> <sup> <sub>
<span class="up|down|flat|num|muted">
```

---

## 폰에 설치하기

**안드로이드 APK** — 폰 브라우저에서 `https://hyj9683.github.io/daily-brief/app.apk` 를 열면 내려받아 설치할 수 있습니다.
카카오톡·Gmail 은 보안 정책상 `.apk` 전송을 막기 때문에 이 경로로 배포합니다.
APK 를 새로 빌드했다면 `daily-brief-android/app-release-signed.apk` 를 이 저장소의 `app.apk` 로 덮어쓰고 push 하세요.

**안드로이드 (Chrome, 설치 없이)** — 배포된 주소를 열고 ⋮ → **앱 설치** (또는 하단에 뜨는 "홈 화면에 추가" 배너의 설치 버튼).
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

### 공개 범위에 대해

저장소는 **Public** 입니다 (GitHub Pages 무료 조건). 공개되는 것은 앱 코드와 브리핑 내용뿐이고,
남이 읽을 수는 있어도 고치거나 push 할 수는 없습니다.

- 커밋 작성자 이메일은 GitHub `@users.noreply.github.com` 주소를 씁니다 — 실제 메일 주소는 노출되지 않습니다.
- `index.html` 의 `<meta name="robots" content="noindex">` 로 검색 엔진 색인을 막았습니다.
  주소를 아는 사람만 들어옵니다. (`robots.txt` 도 넣어 뒀지만, 프로젝트 Pages 에서는 크롤러가
  도메인 루트의 robots.txt 만 읽기 때문에 실제로 일하는 건 메타 태그 쪽입니다.)
- 저장소를 Private 으로 바꿔도 **배포된 사이트 주소 자체는 여전히 공개**입니다(유료 플랜 제외).
  즉 공개 범위 설정으로 사이트를 숨길 수는 없습니다.

---

## 앱 화면을 고쳤을 때

`index.html` · `app.js` · `styles.css` · `sw.js` 를 고쳤다면
`sw.js` 맨 위의 `SHELL_VERSION` 을 `shell-v2`, `shell-v3` … 으로 올려 주세요.
그래야 이미 설치된 폰이 옛 화면을 캐시에서 계속 쓰지 않고 새 화면을 받아갑니다.
`data/` 안의 브리핑 내용만 바뀔 때는 올릴 필요 없습니다.
