# 변경 이력

## 2026-01-29

### Python 3.9 호환성 수정
- `main.py`: `str | None` → `Optional[str]` 타입 힌트 변경 (Python 3.10+ 구문 → 3.9 호환)

---

## 2026-01-29 (Earlier)

### 1. 카테고리 필터 추가 (제목 기반 추론 + Supabase 저장)

#### 파일: `web/app.js`
**줄 번호**: 82, 331-355, 357-370, 409, 441-459, 707

**변경 내용**:
- 필터에 카테고리 제외 기능 추가
- Sports, Crypto 등 특정 카테고리 숨김 가능
- **Tags 기반 카테고리 자동 추론**: API에 category가 없어도 tags로 분류

**추가된 코드**:
```javascript
// 필터 상태에 excludedCategories 추가
let filters = {
    tags: [],
    excludedCategories: [], // 제외할 카테고리
    timeRemaining: 'all',
    minVolume: 10000,
    minLiquidity: 0
};

// 카테고리 추론 함수 (tags 기반)
const CATEGORY_RULES = {
    'Sports': ['Sports', 'NBA', 'NFL', 'Soccer', ...],
    'Crypto': ['Crypto', 'Bitcoin', 'Ethereum', ...],
    'Politics': ['Politics', 'Elections', 'Trump', ...],
    ...
};

function inferCategory(event) {
    if (event.category) return event.category;

    // tags에서 카테고리 추론
    if (event.tags && Array.isArray(event.tags)) {
        for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
            const hasMatch = event.tags.some(tag =>
                keywords.some(keyword => tag.toLowerCase().includes(keyword.toLowerCase()))
            );
            if (hasMatch) return category;
        }
    }

    return 'Uncategorized';
}

// 카테고리 필터링
if (filters.excludedCategories.length > 0) {
    filtered = filtered.filter(e =>
        !filters.excludedCategories.includes(inferCategory(e))
    );
}
```

**효과**:
- Tags 기반 자동 분류: 'NBA' 태그 → Sports 카테고리
- Sports, Crypto 등 민감한 카테고리 필터에서 제외 가능

---

#### 파일: `web/index.html`
**줄 번호**: 202-213

**추가된 HTML**:
```html
<!-- Categories Section -->
<div class="filter-section">
    <div class="filter-section-header">
        <svg>...</svg>
        Hide Categories:
    </div>
    <div class="filter-categories" id="filterCategories">
        <!-- Categories will be populated dynamically -->
    </div>
</div>
```

---

#### 파일: `web/style.css`
**줄 번호**: 1113-1119, 1137-1142

**추가된 CSS**:
```css
.tag-chip.excluded {
    background: var(--accent-red);
    border-color: var(--accent-red);
    color: white;
    opacity: 0.9;
}

.filter-categories {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 150px;
    overflow-y: auto;
}
```

**효과**:
- 제외된 카테고리는 빨간색으로 표시
- 클릭으로 제외/포함 토글

---

### 2. 링크 없는 이벤트 처리 개선

#### 파일: `web/app.js`
**줄 번호**: 929-947

**변경 내용**:
- Modal에서 링크 없는 이벤트 감지 및 처리
- `slug`와 `_searchQuery` 모두 없는 경우 비활성화

**추가된 코드**:
```javascript
const searchQuery = event._searchQuery ? escapeHtml(event._searchQuery) : '';
const slugSafe = escapeHtml(event.slug || '');
const hasLink = slugSafe || searchQuery;

const eventEl = document.createElement('div');
eventEl.className = `modal-event-item${!hasLink ? ' disabled' : ''}`;
if (hasLink) {
    eventEl.onclick = () => openEventLink(event.slug, event._searchQuery);
}
```

**효과**: 링크 없는 이벤트를 클릭해도 아무 일도 일어나지 않으며, 시각적으로 표시됨

---

#### 파일: `web/style.css`
**줄 번호**: 997-1003

**추가된 CSS**:
```css
.modal-event-item.disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.modal-event-item.disabled:hover {
    background: var(--bg-tertiary);
}
```

**효과**:
- 링크 없는 이벤트는 투명도 50%로 흐릿하게 표시
- 마우스 커서가 `not-allowed`로 변경
- hover 효과 비활성화

---

### 2. 시장별 로고 이미지 적용

#### 파일: `web/app.js`
**줄 번호**: 755, 845, 930

**변경 내용**:
- 카테고리 이모지 대신 폴리마켓 API에서 제공하는 실제 시장 이미지 표시
- Week View, Calendar Overview, Modal 모두 적용

**변경 전**:
```javascript
const emoji = categoryEmojis[event.category] || categoryEmojis.default;
// ...
<span class="week-event-emoji">${emoji}</span>
```

**변경 후**:
```javascript
const imageUrl = event.image_url || '';
// ...
<img src="${imageUrl}" class="week-event-image" alt="" onerror="this.style.display='none'">
```

**효과**: 각 시장의 실제 썸네일 이미지가 표시되어 시각적으로 더 명확함

---

#### 파일: `web/style.css`
**줄 번호**: 686-689, 854-857, 992-995

**변경 내용**:
- 이모지 폰트 스타일을 이미지 스타일로 교체
- 각 컴포넌트별 적절한 이미지 크기 설정

**추가된 CSS**:
```css
/* Week View 이미지 */
.week-event-image {
    width: 24px;
    height: 24px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
}

/* Calendar Overview 이미지 */
.overview-event-image {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    object-fit: cover;
    flex-shrink: 0;
}

/* Modal 이미지 */
.modal-event-image {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    object-fit: cover;
}
```

**효과**:
- Week View: 24x24px 썸네일
- Calendar Overview: 16x16px 썸네일
- Modal: 32x32px 썸네일
- 이미지 로드 실패 시 자동으로 숨김 처리

---

## 2026-01-28

### 1. Week View 가로 레이아웃 변경 및 5일로 축소

#### 파일: `web/app.js`
**줄 번호**: 671-675, 710-714

**변경 내용**:
- 7일 표시 → 5일 표시로 변경
- 날짜 범위 계산 조정

**변경 전**:
```javascript
// 이번 주 날짜 계산 (오늘 포함 7일)
const weekDates = [];
for (let i = 0; i < 7; i++) {
    weekDates.push(addDays(todayKST, i));
}

// Week range 업데이트
const weekEnd = new Date(addDays(todayKST, 6) + 'T00:00:00');
```

**변경 후**:
```javascript
// 이번 주 날짜 계산 (오늘 포함 5일)
const weekDates = [];
for (let i = 0; i < 5; i++) {
    weekDates.push(addDays(todayKST, i));
}

// Week range 업데이트
const weekEnd = new Date(addDays(todayKST, 4) + 'T00:00:00');
```

**효과**: 스크롤 없이 한 화면에 5일이 표시됨

---

#### 파일: `web/style.css`
**줄 번호**: 570-583

**변경 내용**:
- Week timeline의 overflow-x 제거
- Week day를 flex로 균등 분할

**변경 전**:
```css
.week-timeline {
    display: flex;
    gap: 0;
    overflow-x: auto;
    padding: 0;
}

.week-day {
    flex: 0 0 auto;
    min-width: 280px;
    max-width: 280px;
    border-right: 1px solid var(--border-color);
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
}
```

**변경 후**:
```css
.week-timeline {
    display: flex;
    gap: 0;
    padding: 0;
}

.week-day {
    flex: 1 1 0;
    min-width: 0;
    border-right: 1px solid var(--border-color);
    transition: background-color 0.3s;
    display: flex;
    flex-direction: column;
}
```

**효과**: 5개 컬럼이 균등하게 화면을 채움

---

### 2. 오늘 컬럼에 현재 시간 필터 적용

#### 파일: `web/app.js`
**줄 번호**: 668-701

**변경 내용**:
- 오늘 날짜의 경우 현재 KST 시간 이후 마감되는 이벤트만 표시
- 과거 이벤트는 표시하지 않음

**추가된 코드**:
```javascript
// 현재 KST 시간 (시간 비교용)
const nowKST = new Date();

// 이벤트를 날짜별로 그룹화
filtered.forEach(event => {
    if (event.end_date) {
        const dateKey = toKSTDateString(event.end_date);
        if (weekDates.includes(dateKey)) {
            // 오늘 날짜인 경우, 현재 시간보다 미래인 이벤트만 포함
            if (dateKey === todayKST) {
                const eventEndTime = new Date(event.end_date);
                if (eventEndTime > nowKST) {
                    if (!eventsByDate[dateKey]) {
                        eventsByDate[dateKey] = [];
                    }
                    eventsByDate[dateKey].push(event);
                }
            } else {
                // 오늘이 아닌 날짜는 모두 포함
                if (!eventsByDate[dateKey]) {
                    eventsByDate[dateKey] = [];
                }
                eventsByDate[dateKey].push(event);
            }
        }
    }
});
```

**효과**: 오늘(가장 왼쪽) 컬럼에 유효한 시장만 표시되어 혼동 방지

---

### 3. Calendar Overview에 상위 이벤트 표시

#### 파일: `web/app.js`
**줄 번호**: 832-858

**변경 내용**:
- 점 표시 대신 거래량 상위 3개 이벤트를 카드로 표시
- 이모지, 제목(25자 축약), 확률 표시

**변경 전**:
```javascript
// 이벤트 수에 따라 dot 개수 결정 (최대 3개)
const dotCount = Math.min(eventCount, 3);
let dotsHtml = '';
if (eventCount > 0) {
    dotsHtml = '<div class="calendar-overview-dots">';
    for (let i = 0; i < dotCount; i++) {
        dotsHtml += '<div class="calendar-overview-dot"></div>';
    }
    dotsHtml += '</div>';
}

dayEl.innerHTML = `
    <div class="calendar-overview-day-number">${dayNumber}</div>
    ${dotsHtml}
    ${eventCount > 3 ? `<div class="calendar-overview-more">+${eventCount - 3}</div>` : ''}
`;
```

**변경 후**:
```javascript
// 거래량 기준으로 정렬하여 상위 3개 선택
const topEvents = [...dayEvents]
    .sort((a, b) => (parseFloat(b._totalVolume || b.volume) || 0) - (parseFloat(a._totalVolume || a.volume) || 0))
    .slice(0, 3);

// HTML 생성
let eventsHtml = '';
if (topEvents.length > 0) {
    eventsHtml = '<div class="calendar-overview-events">';
    topEvents.forEach(event => {
        const emoji = categoryEmojis[event.category] || categoryEmojis.default;
        const prob = getMainProb(event);
        const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
        const title = truncate(event.title, 25);
        const searchQuery = event._searchQuery ? escapeHtml(event._searchQuery) : '';
        const slugSafe = escapeHtml(event.slug || '');

        eventsHtml += `
            <div class="calendar-overview-event" onclick="event.stopPropagation(); openEventLink('${slugSafe}', '${searchQuery}');" title="${escapeHtml(event.title)}">
                <span class="overview-event-emoji">${emoji}</span>
                <span class="overview-event-title">${title}</span>
                <span class="overview-event-prob ${probClass}">${prob}%</span>
            </div>
        `;
    });
    eventsHtml += '</div>';
}

dayEl.innerHTML = `
    <div class="calendar-overview-day-number">${dayNumber}</div>
    ${eventsHtml}
    ${eventCount > 3 ? `<div class="calendar-overview-more-link" onclick="showDayEvents('${dateKey}')">+${eventCount - 3} more</div>` : ''}
`;
```

**효과**: 날짜별로 중요한 이벤트를 한눈에 파악 가능

---

#### 파일: `web/style.css`
**줄 번호**: 797-892

**변경 내용**:
- 이벤트 카드 스타일 추가
- 점(dot) 스타일 제거

**추가된 CSS**:
```css
.calendar-overview-day {
    min-height: 120px;
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    padding: 8px;
    background: var(--bg-secondary);
    position: relative;
    transition: background-color 0.2s;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.calendar-overview-events {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
}

.calendar-overview-event {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.2s;
    min-width: 0;
}

.calendar-overview-event:hover {
    background: var(--bg-card);
}

.overview-event-emoji {
    font-size: 12px;
    flex-shrink: 0;
}

.overview-event-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    font-size: 10px;
}

.overview-event-prob {
    font-size: 11px;
    font-weight: 600;
    flex-shrink: 0;
}

.overview-event-prob.low {
    color: var(--accent-red);
}

.overview-event-prob.mid {
    color: var(--accent-yellow);
}

.calendar-overview-more-link {
    font-size: 10px;
    color: var(--accent-blue);
    cursor: pointer;
    margin-top: 4px;
    padding: 2px 4px;
}

.calendar-overview-more-link:hover {
    text-decoration: underline;
}
```

**효과**: 깔끔한 이벤트 카드 UI 제공

---

### 4. Calendar Overview 시작 날짜 조정

#### 파일: `web/app.js`
**줄 번호**: 78, 149-154, 789

**변경 내용**:
- Calendar Overview가 Week View 종료일 다음날(Feb 2)부터 시작
- Navigation 조건 수정

**변경 전**:
```javascript
let calendarOverviewStartWeek = 1; // 0 = current week, 1 = next week, etc.

// Calendar Overview navigation
document.getElementById('prevWeek').addEventListener('click', () => {
    if (calendarOverviewStartWeek > 1) {
        calendarOverviewStartWeek--;
        renderCalendar();
    }
});

// 시작 날짜 계산 (calendarOverviewStartWeek에 따라)
const startDate = addDays(todayKST, calendarOverviewStartWeek * 7);
```

**변경 후**:
```javascript
let calendarOverviewStartWeek = 0; // 0 = Week View 직후부터, 1 = 1주 더 뒤, etc.

// Calendar Overview navigation
document.getElementById('prevWeek').addEventListener('click', () => {
    if (calendarOverviewStartWeek > 0) {
        calendarOverviewStartWeek--;
        renderCalendar();
    }
});

// 시작 날짜 계산 (Week View 끝난 다음날부터 + 추가 주)
const startDate = addDays(todayKST, 5 + (calendarOverviewStartWeek * 7));
```

**효과**:
- Week View: Jan 28 ~ Feb 1 (5일)
- Calendar Overview: Feb 2 ~ (3주, 21일)
- 날짜가 끊김 없이 연결됨

---

### 5. 토요일 컬럼 이벤트 오버플로우 수정

#### 파일: `web/style.css`
**줄 번호**: 797-808, 837-848

**변경 내용**:
- Calendar day 셀에 overflow: hidden 추가
- 이벤트 카드에 min-width: 0 추가

**변경 전**:
```css
.calendar-overview-day {
    min-height: 120px;
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    padding: 8px;
    background: var(--bg-secondary);
    position: relative;
    transition: background-color 0.2s;
    display: flex;
    flex-direction: column;
}

.calendar-overview-event {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.2s;
}
```

**변경 후**:
```css
.calendar-overview-day {
    min-height: 120px;
    border-right: 1px solid var(--border-color);
    border-bottom: 1px solid var(--border-color);
    padding: 8px;
    background: var(--bg-secondary);
    position: relative;
    transition: background-color 0.2s;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.calendar-overview-event {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.2s;
    min-width: 0;
}
```

**효과**:
- 8, 15, 22일(토요일 컬럼)의 이벤트가 셀 밖으로 삐져나오지 않음
- 긴 제목은 "..."로 축약되어 표시

---

## 요약

### 주요 변경사항
1. **Week View 개선**: 7일 → 5일 가로 레이아웃으로 변경하여 한 화면에 표시
2. **오늘 컬럼 필터링**: 현재 시간 이후 마감되는 시장만 표시
3. **Calendar Overview UI 개선**: 점 대신 상위 3개 이벤트 카드 표시
4. **날짜 범위 연결**: Week View(5일) + Calendar Overview(3주)가 끊김 없이 연결
5. **오버플로우 수정**: 토요일 컬럼 이벤트 짤림 해결

### 변경된 파일
- `web/app.js`: Week View, Calendar Overview 렌더링 로직
- `web/style.css`: Week View, Calendar Overview 스타일

### 다음 개선 사항 (제안)
- 모바일 반응형 디자인 최적화
- 이벤트 카드에 시간 표시 추가 (Calendar Overview)
- 필터 프리셋 저장 기능
