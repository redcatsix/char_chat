# NebulaTalk 코드 분석 및 개선사항

## 분석 요약

- **프로젝트**: 캐릭터 채팅 웹앱 (Vanilla JS + Node.js + Firebase)
- **코드량**: ~4,400 LOC / 12 JS, 7 HTML, 3 CSS
- **기술 스택**: ES6 모듈, LocalStorage, DeepInfra API, Firebase Functions

---

## 🔴 P0 — 즉시 수정 필요 (보안 / 데이터 무결성)

### 1. server.js와 functions/index.js 간 코드 중복
- `buildSystemPrompt`, `validateStyle`, `getMaxTokens`, `getTemperature`, `normalizeChatMessage`, `sanitizeString` 등 핵심 로직이 두 파일에 **거의 동일하게 복사**되어 있음
- 한쪽만 수정하면 다른 쪽과 불일치 발생 → 보안 취약점으로 이어질 수 있음
- **개선**: 공유 모듈(`shared/chat-logic.js`)로 추출하여 양쪽에서 import

### 2. CORS 설정이 `*` (와일드카드)
- `functions/index.js:34-38` — `Access-Control-Allow-Origin: *`로 모든 도메인 허용
- 인증 없는 API이므로 CSRF/악의적 호출에 노출
- **개선**: 허용 도메인 화이트리스트로 제한 (Firebase Hosting 도메인만 허용)

### 3. API 키가 클라이언트 요청에 의존하는 구조
- 클라이언트가 `character`, `style`, `messages`를 전부 보내고 서버가 그대로 LLM에 전달
- system prompt가 클라이언트가 보낸 데이터로 구성되므로 **prompt injection** 가능
- **개선**: `personality`, `scenario` 필드에 대한 위험 패턴 필터링 추가, 서버 측 캐릭터 검증 강화

### 4. LocalStorage에 대용량 data URL 저장
- 커버 이미지를 `readFileAsDataUrl()`로 변환하여 LocalStorage에 저장 (`create.js:141`)
- LocalStorage 용량 한계(5MB)를 빠르게 소진 → 이후 모든 저장 실패
- **개선**: IndexedDB 사용 또는 이미지 압축/리사이즈 후 저장

---

## 🟠 P1 — 주요 개선 (성능 / 안정성)

### 5. 매 렌더링마다 전체 캐릭터 목록 재정렬
- `getAllCharacters()` 호출 시마다 `DEFAULT_CHARACTERS + custom`을 합친 후 매번 `sort()` 실행 (`storage.js:62`)
- 모든 페이지에서 빈번하게 호출됨 → 캐릭터 수 증가 시 성능 저하
- **개선**: 캐시 레이어 추가, 데이터 변경 시에만 재정렬

### 6. 대화 저장 시 전체 chats 객체를 매번 직렬화
- `setCharacterConversation()` → `getChats()` → 전체 수정 → `setStoredObject()` (storage.js:45-48)
- 모든 캐릭터의 대화를 하나의 키에 저장하므로, 대화가 쌓일수록 직렬화 비용 급증
- **개선**: 캐릭터별 독립 키로 분리 (`nebulaTalk:chat:{characterId}`)

### 7. innerHTML을 통한 DOM 조작
- `ui.js` 전체에서 HTML 문자열을 조합하여 `innerHTML`로 주입
- `escapeHtml()`로 XSS는 방어하나, 매번 전체 DOM 트리 재생성 → 성능 비효율
- 이벤트 리스너가 매 렌더링마다 재등록됨 (`wireFavoriteButtons` 등)
- **개선**: 가상 DOM 라이브러리(Preact 등) 도입 또는 DocumentFragment 활용

### 8. 에러 발생 시 무조건 mock reply 반환
- `api.js:115-121` — 네트워크 에러든, 429(레이트 리밋)든, 500이든 모두 동일하게 mock reply
- 사용자가 실제 API 오류를 인지하기 어려움
- **개선**: 에러 유형별 분기 처리 (재시도 가능한 에러 vs 치명적 에러)

### 9. Rate Limit 메모리 누수 가능성
- `server.js:25-38` — `setInterval`로 정리하지만, 동시 접속자 급증 시 `rateLimitMap`이 과도하게 성장
- **개선**: Map 크기 제한 추가 또는 LRU 캐시 사용

---

## 🟡 P2 — 코드 품질 / 유지보수성

### 10. 상수 중복 정의
- `STYLE_LABELS`, `MESSAGE_HISTORY_LIMIT` 등이 `server.js`, `functions/index.js`, `js/constants.js`에 각각 정의
- **개선**: P0 #1과 함께 공유 상수 모듈로 통합

### 11. `window.__pageState` 패턴
- `window.__chatState`, `window.__homeState`, `window.__exploreState` 등 전역 상태 사용 (`chat.js:32`, `home.js:14`, `explore.js:18`)
- 페이지 간 상태 오염 가능성, 디버깅 어려움
- **개선**: 모듈 스코프 변수 또는 간단한 Store 패턴으로 전환

### 12. `force` 파라미터의 이중 역할
- 모든 `initPage(force, refreshPage)` 함수에서 `force=false`면 이벤트 등록, `force=true`면 UI만 갱신
- 이벤트 등록과 렌더링이 하나의 함수에 혼재
- **개선**: `bindEvents()`와 `render()`를 분리하여 명확한 책임 분리

### 13. cryptoRandomId가 실제 crypto를 사용하지 않음
- `storage.js:123-125` — `Date.now() + Math.random()`은 충돌 가능성 존재
- 함수 이름과 구현이 불일치
- **개선**: `crypto.randomUUID()` 사용 (브라우저 호환성 충분) 또는 함수명 변경

### 14. create-form.js, create-page.js 미사용 파일
- 루트에 `create-form.js`와 `create-page.js`가 있으나 어디서도 import되지 않음
- `create-new.html`도 라우팅에 연결되지 않음
- **개선**: 사용하지 않는 파일 제거

---

## 🟢 P3 — 사용자 경험 / 기능 개선

### 15. 대화 내보내기/가져오기 불완전
- `mypage.js:60-77` — 내보내기만 존재, 가져오기(import) 기능 없음
- **개선**: JSON 가져오기 기능 추가 (데이터 유효성 검증 포함)

### 16. 접근성(a11y) 부족
- 모달(`showCharacterProfile`)에 키보드 트랩 없음
- `aria-label`이 일부만 적용, `role` 속성 부재
- Toast 알림에 `aria-live` 미적용
- **개선**: ARIA 속성 보완, 키보드 네비게이션, 포커스 관리 추가

### 17. 오프라인 지원 없음
- Service Worker 미적용, 네트워크 끊김 시 정적 페이지도 로드 불가
- **개선**: PWA 기본 구조 추가 (캐시 전략)

### 18. 대화 검색 기능 없음
- 과거 대화 내용을 검색할 방법이 없음
- **개선**: 대화 내 텍스트 검색 기능 추가

---

## 구현 권장 순서

| 순서 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| 1 | P0 #1 코드 중복 제거 | 중 | 높음 |
| 2 | P0 #2 CORS 제한 | 하 | 높음 |
| 3 | P0 #4 이미지 저장 개선 | 중 | 높음 |
| 4 | P1 #6 대화 저장 구조 개선 | 중 | 높음 |
| 5 | P1 #8 에러 처리 분기 | 하 | 중 |
| 6 | P2 #13 ID 생성 수정 | 하 | 중 |
| 7 | P2 #14 미사용 파일 제거 | 하 | 낮음 |
| 8 | P2 #11 전역 상태 제거 | 중 | 중 |
| 9 | P1 #5 캐릭터 목록 캐싱 | 중 | 중 |
| 10 | P3 #16 접근성 보완 | 중 | 중 |
