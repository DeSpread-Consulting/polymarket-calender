# Polymarket Community 보안 감사 보고서

작성일: 2026-02-20  
대상 경로: `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티`  
범위: 프론트엔드(`app.js`, `index.html`), 관리자 페이지(`admin/admin.js`), 설정/운영 파일

## 요약
- `상`: 2건
- `중`: 2건
- `하`: 1건
- 핵심 리스크: `RLS`가 약하면 클라이언트만으로 데이터 변경 가능, DOM XSS 가능 구간 존재

## 심각도 기준
- `상`: 계정 탈취/데이터 무결성 훼손/대규모 악용 가능
- `중`: 보안 우회 또는 서비스 장애 가능, 직접 침해는 조건부
- `하`: 운영 보안/하드닝 이슈, 즉시 침해 가능성 낮음

## 상세 취약점

### F-01. 관리자 권한 검증을 클라이언트에 의존 (`상`)
위치:
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:2208`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:2242`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/admin/admin.js:402`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/admin/admin.js:472`

설명:
- 클라이언트 코드가 `poly_events`, `cache_meta` 업데이트를 직접 수행함.
- `RLS` 정책이 느슨하거나 누락되면, UI 우회 요청으로 일반 사용자도 데이터 수정 가능.

최악 시나리오:
- 공격자가 이벤트 제목/설명/숨김값을 대량 변조해 서비스 신뢰도 붕괴.
- 악성 문자열 주입과 결합 시 저장형 XSS로 관리자 세션 탈취.

권장 조치:
- `poly_events`, `cache_meta` 테이블에 관리자 전용 `UPDATE`/`INSERT`/`DELETE` 정책 강제.
- 쓰기 동작은 가능하면 Supabase Edge Function(서버측)으로 이동.
- 익명/일반 사용자 role의 write 권한 전면 차단.

---

### F-02. 태그/카테고리 렌더링 구간의 DOM XSS 가능성 (`상`)
위치:
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:896`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:917`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:997`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:1006`

설명:
- 외부 데이터(태그/카테고리)가 `innerHTML`로 삽입됨.
- 데이터가 신뢰 불가일 경우 스크립트 실행 벡터가 됨.

최악 시나리오:
- 저장형 XSS 발생 시 방문자 브라우저에서 악성 JS 실행.
- 관리자 계정 탈취, 임의 API 호출, 피싱 리다이렉트 가능.

권장 조치:
- `innerHTML` 대신 `textContent` + `createElement` 사용.
- `data-*` 속성도 값 검증/인코딩 처리.
- `CSP` 병행 적용(아래 F-04).

---

### F-03. 관리자 카테고리 필터 쿼리 구성 취약 (`중`)
위치:
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/admin/admin.js:253`

설명:
- `.not('category', 'in', \`(${excludedCategories.join(',')})\`)` 형태로 문자열 결합.
- 카테고리 값에 특수문자가 포함되면 필터 오작동/예상치 못한 쿼리 발생 가능.

최악 시나리오:
- 관리자 화면 필터 우회 또는 데이터 조회 오류 지속.
- 직접 침해보다 무결성/가시성 저하 리스크.

권장 조치:
- 값별 escape 후 quoted list(`("A","B")`)로 안전 구성.
- 가능하면 서버측에서 enum 검증된 값만 허용.

---

### F-04. CSP/보안 헤더 부재 (`중`)
위치:
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/index.html:1`

설명:
- `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` 등 보안 헤더 적용 근거가 없음.
- 단일 XSS 발생 시 방어선이 약함.

최악 시나리오:
- XSS 성공 시 피해 범위 확대(외부 스크립트 로딩, 데이터 유출).

권장 조치:
- 우선 `CSP-Report-Only`로 배포 후 위반 로그 수집.
- 이후 `Content-Security-Policy` 강제 적용.
- 최소 헤더: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

---

### F-05. 운영 비밀값 노출 관리 이슈 (`하`)
위치:
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/.mcp.json`
- `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/.env`

설명:
- 로컬에는 민감 토큰 존재(정상)하나, 화면 공유/스크린샷 시 노출 가능.
- `.gitignore`로 추적 제외는 되어 있으나 운영 절차상 로테이션 정책 필요.

최악 시나리오:
- 노출된 토큰으로 프로젝트 조회/조작(권한 범위 내) 가능.

권장 조치:
- 이미 노출된 토큰 즉시 폐기/재발급.
- 운영 문서에 토큰 회전 주기 및 유출 대응 절차 명시.

## 확인된 개선 항목(반영됨)
- 이미지 URL 주입 XSS 완화 코드 반영:
  - `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:1463`
  - `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:1275`
  - `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:1431`
  - `/Users/despreadworker4/Desktop/폴리마켓 커뮤니티/app.js:1690`

## 우선순위 실행 계획
### 24시간 이내
1. `RLS` 정책 점검 및 write 차단(F-01).
2. 태그/카테고리 `innerHTML` 제거(F-02).
3. 노출 가능 토큰 폐기/재발급(F-05).

### 7일 이내
1. 관리자 쿼리 필터 문자열 결합 제거(F-03).
2. `CSP-Report-Only` 적용 후 강제 전환(F-04).

