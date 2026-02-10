// Supabase Configuration (config.js에서 가져옴)
const SUPABASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_URL : '';
const SUPABASE_ANON_KEY = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_ANON_KEY : '';

// KST (Korea Standard Time) 변환 함수들

// UTC ISO 문자열을 KST 날짜 문자열 (YYYY-MM-DD)로 변환
function toKSTDateString(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    // toLocaleString을 사용하여 KST로 변환
    const kstString = date.toLocaleString('en-CA', { timeZone: 'Asia/Seoul' });
    // en-CA 로케일은 YYYY-MM-DD 형식 반환
    return kstString.split(',')[0];
}

// 현재 KST 날짜 문자열 (YYYY-MM-DD) 반환
function getKSTToday() {
    const now = new Date();
    // toLocaleString을 사용하여 KST로 변환
    const kstString = now.toLocaleString('en-CA', { timeZone: 'Asia/Seoul' });
    return kstString.split(',')[0];
}

// KST 기준 현재 Date 객체 반환 (시간 비교용)
function getKSTNow() {
    // 현재 시간을 그대로 반환 (Date 객체는 항상 UTC 기반)
    // 시간 비교는 UTC 기준으로 해도 결과는 동일
    return new Date();
}

// UTC 날짜를 KST 시간 (HH:MM) 문자열로 변환
function getKSTTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const kstString = date.toLocaleString('en-US', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    return kstString;
}

// 시간대별 클래스 반환 (dawn: 0-6시, day: 6-18시, night: 18-24시)
function getTimeClass(timeString) {
    const hour = parseInt(timeString.split(':')[0]);
    if (hour >= 0 && hour < 6) return 'dawn';
    if (hour >= 6 && hour < 18) return 'day';
    return 'night';
}

// 날짜에 일수 더하기
function addDays(dateStr, days) {
    const date = new Date(dateStr + 'T00:00:00');
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 주간 범위 계산 (시작일부터 N주)
function getWeekRange(startDate, weeks) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + (weeks * 7) - 1);
    return {
        start: toKSTDateString(start),
        end: toKSTDateString(end)
    };
}

// State
let supabaseClient = null;
let allEvents = [];
let currentDate = new Date();
let calendarOverviewStartWeek = 0; // 0 = Week View 직후부터, 1 = 1주 더 뒤, etc.
let isLoadingMore = false; // 추가 데이터 로딩 중 플래그

// Filter state (기본값: 거래량 $10K 이상, 스포츠 카테고리 제외)
let filters = {
    tags: [],
    excludedCategories: ['Sports'], // 기본적으로 스포츠 제외 (위법성 고려)
    timeRemaining: 'all',
    minVolume: 10000,
    minLiquidity: 0
};

// Temp filter state (for modal)
let tempFilters = { ...filters };

// All available tags with counts
let allTags = {};

// All available categories with counts
let allCategories = {};

// Category to Emoji mapping
const categoryEmojis = {
    'Sports': '⚽',
    'Crypto': '💰',
    'Politics': '🏛️',
    'Pop Culture': '🎬',
    'Science': '🔬',
    'Business': '💼',
    'Technology': '💻',
    'Gaming': '🎮',
    'Music': '🎵',
    'default': '📊'
};

// Category to Color mapping
const categoryColors = {
    'Sports': '#3b82f6',      // Blue
    'Crypto': '#f59e0b',      // Amber
    'Politics': '#ef4444',    // Red
    'Pop Culture': '#ec4899', // Pink
    'Science': '#10b981',     // Green
    'Business': '#8b5cf6',    // Purple
    'Technology': '#06b6d4',  // Cyan
    'Gaming': '#f97316',      // Orange
    'Finance': '#6366f1',     // Indigo
    'Music': '#d946ef',       // Fuchsia
    'Uncategorized': '#6b7280', // Gray
    'default': '#6b7280'      // Gray
};

// Tooltip element
let tooltipElement = null;
let tooltipTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 앱 시작');

    initTheme();
    initDensity();
    initLanguage();
    initSupabase();
    initQuickFilters();
    initTooltip();
    setupEventListeners();
    await loadData();
    updateActiveFiltersDisplay(); // 기본 필터 UI 표시
    renderCalendar();
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function initDensity() {
    const savedDensity = localStorage.getItem('density') || 'comfortable';
    document.documentElement.setAttribute('data-density', savedDensity);
}

function initSupabase() {
    if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
        console.warn('Supabase URL이 설정되지 않았습니다.');
        return;
    }
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase 클라이언트 생성 완료');
    } catch (e) {
        console.error('❌ Supabase 클라이언트 생성 실패:', e);
    }
}

function setupEventListeners() {
    // Density toggle
    const densityToggle = document.getElementById('densityToggle');
    if (densityToggle) {
        densityToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleDensity();
        });
    }

    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleRefresh();
        });
    }

    // Calendar Overview navigation
    document.getElementById('prevWeek').addEventListener('click', () => {
        if (calendarOverviewStartWeek > 0) {
            calendarOverviewStartWeek--;
            renderCalendar();
        }
    });

    document.getElementById('nextWeek').addEventListener('click', async () => {
        calendarOverviewStartWeek++;

        // 추가 데이터 필요 시 lazy loading
        const todayKST = getKSTToday();
        const requiredEndDate = addDays(todayKST, 5 + (calendarOverviewStartWeek + 1) * 7 + 21);
        const lastEventDate = allEvents.length > 0 ? toKSTDateString(allEvents[allEvents.length - 1].end_date) : '';

        if (requiredEndDate > lastEventDate) {
            await loadMoreData(requiredEndDate);
        }

        renderCalendar();
    });

    // Today button
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.dataset.view === 'today') {
                currentDate = new Date();
                renderCalendar();
            }
        });
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderCalendar(e.target.value);
    });

    // Filter row click -> open filter modal
    document.getElementById('filtersRow').addEventListener('click', (e) => {
        // clearFilters 버튼 클릭 시 모달 열지 않음
        if (e.target.closest('#clearFilters') || e.target.closest('.remove-tag')) {
            return;
        }
        openFilterModal();
    });

    // Filter modal events
    document.getElementById('filterModalClose').addEventListener('click', closeFilterModal);
    document.getElementById('filterModalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeFilterModal();
    });

    // Filter options
    setupFilterOptions('timeRemainingOptions', 'timeRemaining');
    setupFilterOptions('minVolumeOptions', 'minVolume');
    setupFilterOptions('minLiquidityOptions', 'minLiquidity');

    // Tag search
    document.getElementById('tagSearchInput').addEventListener('input', (e) => {
        renderFilterTags(e.target.value);
    });

    // Show less tags toggle
    document.getElementById('showLessTags').addEventListener('click', (e) => {
        e.stopPropagation();
        const tagsContainer = document.getElementById('filterTags');
        tagsContainer.classList.toggle('collapsed');
        const btn = document.getElementById('showLessTags');
        btn.textContent = tagsContainer.classList.contains('collapsed') ? 'Show More' : 'Show Less';
    });

    // Apply/Reset filters
    document.getElementById('applyFilters').addEventListener('click', applyFilters);
    document.getElementById('resetFilters').addEventListener('click', resetFilters);
    document.getElementById('clearFilters').addEventListener('click', (e) => {
        e.stopPropagation();
        clearAllFilters();
    });

    // Event modal
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            closeFilterModal();
        }
    });
}

function setupFilterOptions(containerId, filterKey) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.filter-option').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.filter-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tempFilters[filterKey] = btn.dataset.value === 'all' ? 'all' : parseInt(btn.dataset.value);
        });
    });
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function toggleDensity() {
    const html = document.documentElement;
    const currentDensity = html.getAttribute('data-density') || 'comfortable';

    // Cycle through: comfortable -> compact -> spacious -> comfortable
    let newDensity;
    if (currentDensity === 'comfortable') {
        newDensity = 'compact';
    } else if (currentDensity === 'compact') {
        newDensity = 'spacious';
    } else {
        newDensity = 'comfortable';
    }

    html.setAttribute('data-density', newDensity);
    localStorage.setItem('density', newDensity);
}

function handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');

    // Add rotation animation
    if (refreshBtn) {
        refreshBtn.classList.add('rotating');
    }

    // Re-render calendar to filter out past events
    const searchQuery = document.getElementById('searchInput').value;
    renderCalendar(searchQuery);

    // Remove rotation animation after 500ms
    setTimeout(() => {
        if (refreshBtn) {
            refreshBtn.classList.remove('rotating');
        }
    }, 500);
}

function initQuickFilters() {
    const quickFiltersContainer = document.getElementById('quickFilters');
    if (!quickFiltersContainer) return;

    // Clear existing content
    quickFiltersContainer.innerHTML = '';

    // Create category chips (exclude Uncategorized and default)
    const mainCategories = Object.keys(categoryColors).filter(cat =>
        cat !== 'default' && cat !== 'Uncategorized'
    );

    mainCategories.forEach(category => {
        const color = categoryColors[category];
        const chip = document.createElement('button');
        chip.className = 'category-chip';
        chip.dataset.category = category;

        // Check if category is excluded by default
        if (filters.excludedCategories.includes(category)) {
            chip.classList.add('excluded');
        }

        chip.innerHTML = `
            <span class="category-chip-color" style="background-color: ${color};"></span>
            <span>${category}</span>
        `;

        chip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleCategoryFilter(category);
        });

        quickFiltersContainer.appendChild(chip);
    });
}

function toggleCategoryFilter(category) {
    const index = filters.excludedCategories.indexOf(category);

    if (index > -1) {
        // Remove from excluded (show this category)
        filters.excludedCategories.splice(index, 1);
    } else {
        // Add to excluded (hide this category)
        filters.excludedCategories.push(category);
    }

    // Update UI
    updateQuickFilterChips();
    updateActiveFiltersDisplay();
    renderCalendar();
}

function updateQuickFilterChips() {
    const chips = document.querySelectorAll('.category-chip');
    chips.forEach(chip => {
        const category = chip.dataset.category;
        if (filters.excludedCategories.includes(category)) {
            chip.classList.add('excluded');
        } else {
            chip.classList.remove('excluded');
        }
    });
}

// Tooltip functions
function initTooltip() {
    // Create tooltip element
    tooltipElement = document.createElement('div');
    tooltipElement.className = 'event-tooltip';
    document.body.appendChild(tooltipElement);
}

function showEventTooltip(event, eventData) {
    if (!tooltipElement || !eventData) return;

    // Clear any existing timeout
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
    }

    // Get event details
    const prob = getMainProb(eventData);
    const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
    const volume = formatCurrency(eventData._totalVolume || eventData.volume || 0);
    const volume24hr = formatCurrency(eventData.volume_24hr || 0);
    const category = inferCategory(eventData);
    const categoryColor = categoryColors[category] || categoryColors['default'];

    // Get liquidity if available
    const liquidity = eventData.liquidity ? formatCurrency(eventData.liquidity) : 'N/A';

    // Build tooltip HTML
    const t = translations[currentLang];
    tooltipElement.innerHTML = `
        <div class="tooltip-title">${escapeHtml(eventData.title)}</div>
        <div class="tooltip-stats">
            <div class="tooltip-stat">
                <span class="tooltip-stat-label">${t.probability || 'Probability'}:</span>
                <span class="tooltip-stat-value prob ${probClass}">${prob}%</span>
            </div>
            <div class="tooltip-stat">
                <span class="tooltip-stat-label">${t.volume || 'Volume'}:</span>
                <span class="tooltip-stat-value">${volume}</span>
            </div>
            <div class="tooltip-stat">
                <span class="tooltip-stat-label">${t.volume24hr || '24hr Volume'}:</span>
                <span class="tooltip-stat-value">${volume24hr}</span>
            </div>
            ${liquidity !== 'N/A' ? `
            <div class="tooltip-stat">
                <span class="tooltip-stat-label">${t.liquidity || 'Liquidity'}:</span>
                <span class="tooltip-stat-value">${liquidity}</span>
            </div>
            ` : ''}
        </div>
        <div class="tooltip-category">
            <span class="tooltip-category-dot" style="background-color: ${categoryColor};"></span>
            ${category}
        </div>
    `;

    // Position tooltip near cursor
    positionTooltip(event);

    // Show tooltip with delay
    tooltipTimeout = setTimeout(() => {
        tooltipElement.classList.add('visible');
    }, 300);
}

function hideEventTooltip() {
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
    }
    if (tooltipElement) {
        tooltipElement.classList.remove('visible');
    }
}

function positionTooltip(event) {
    if (!tooltipElement) return;

    const padding = 10;
    const tooltipRect = tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = event.clientX + padding;
    let y = event.clientY + padding;

    // Adjust if tooltip goes off right edge
    if (x + tooltipRect.width > viewportWidth - padding) {
        x = event.clientX - tooltipRect.width - padding;
    }

    // Adjust if tooltip goes off bottom edge
    if (y + tooltipRect.height > viewportHeight - padding) {
        y = event.clientY - tooltipRect.height - padding;
    }

    // Ensure tooltip doesn't go off top or left edges
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    tooltipElement.style.left = x + 'px';
    tooltipElement.style.top = y + 'px';
}

// 🎯 그룹화된 시장 통합 (예: Elon Musk 트윗 37개 옵션 → 1개 카드)
function groupSimilarMarkets(events) {
    const groups = new Map();

    events.forEach(event => {
        // slug 정규화 (openEventLink와 동일한 로직)
        let normalized = event.slug;

        // 패턴 1: 온도 시장 (연도-온도값[단위][옵션])
        const tempPattern = /-\d{4}-\d+-?\d*[cf](?:orhigher|orbelow)?$/;

        // 패턴 2: 숫자 범위 시장 (날짜-숫자범위)
        const numericPattern = /-\d+-\d+$/;

        // 패턴 2-1: 플러스 패턴 (예: 580+, 140+)
        const plusPattern = /-\d+plus$/;

        // 패턴 3: 가격 above/below
        const priceAboveBelow = /-(above|below)-[\d]+(?:pt\d+)?k?-on-/;

        // 패턴 4: 가격 between
        const priceBetween = /-be-between-\d+-\d+-on-/;

        if (tempPattern.test(normalized)) {
            // 온도 범위 부분 제거
            normalized = normalized.replace(tempPattern, '');
        } else if (priceAboveBelow.test(normalized)) {
            // 가격 above/below: 가격 숫자 제거
            normalized = normalized.replace(/-(above|below)-[\d]+(?:pt\d+)?k?-on-/, '-$1-on-');
        } else if (priceBetween.test(normalized)) {
            // 가격 between: 전체 구조 변경
            normalized = normalized.replace(/will-the-price-of-([^-]+)-be-between-\d+-\d+-on-(.+)/, '$1-price-on-$2');
        } else if (plusPattern.test(normalized)) {
            // 플러스 패턴 제거 (예: -580plus → '')
            normalized = normalized.replace(plusPattern, '');
        } else if (numericPattern.test(normalized) && !/-15m-\d+$/.test(normalized)) {
            // 숫자 범위 부분 제거 (타임스탬프 제외)
            normalized = normalized.replace(numericPattern, '');
        }

        // 그룹 키 = 정규화된 slug + 종료 시간
        const groupKey = `${normalized}|${event.end_date}`;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, []);
        }
        groups.get(groupKey).push(event);
    });

    // 각 그룹에서 가장 높은 확률을 가진 이벤트만 선택
    const deduplicated = [];
    let groupedCount = 0;

    groups.forEach(group => {
        if (group.length === 1) {
            // 단일 시장 → 그대로 표시
            deduplicated.push(group[0]);
        } else {
            // 그룹화된 시장 → Yes 확률이 가장 높은 옵션만 표시
            groupedCount++;
            const best = group.reduce((best, curr) => {
                // probs[0] = Yes 확률, probs[1] = No 확률
                const bestYesProb = parseFloat(best.probs[0]);
                const currYesProb = parseFloat(curr.probs[0]);
                return currYesProb > bestYesProb ? curr : best;
            });
            deduplicated.push(best);
        }
    });

    if (groupedCount > 0) {
        console.log(`🎯 ${groupedCount}개 그룹 통합됨 (${events.length}개 → ${deduplicated.length}개)`);
    }

    return deduplicated;
}

async function loadData() {
    console.log('📥 데이터 로드 시작');

    if (!supabaseClient) {
        console.log('⚠️ Supabase 없음 - 데모 데이터 사용');
        allEvents = generateDemoData();
        // 🎯 그룹화 적용
        allEvents = groupSimilarMarkets(allEvents);
        extractTags();
        extractCategories();
        return;
    }

    // 🚀 개선 3: 캐시 확인 (LocalStorage)
    const cacheKey = 'polymarket_events_cache';
    const cacheTimeKey = 'polymarket_cache_time';
    const CACHE_DURATION = 5 * 60 * 1000; // 5분

    try {
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheTimeKey);

        if (cachedData && cacheTime) {
            const age = Date.now() - parseInt(cacheTime);
            if (age < CACHE_DURATION) {
                console.log('✅ 캐시에서 로드 (', Math.round(age / 1000), '초 전)');
                allEvents = JSON.parse(cachedData);
                // 🎯 그룹화 적용
                allEvents = groupSimilarMarkets(allEvents);
                extractTags();
                extractCategories();
                return;
            } else {
                console.log('⚠️ 캐시 만료됨, 새로 로드');
            }
        }
    } catch (e) {
        console.log('⚠️ 캐시 로드 실패, 새로 로드');
    }

    try {
        const PAGE_SIZE = 1000; // 페이지 크기 증가 (요청 횟수 감소)
        let allData = [];
        let offset = 0;
        let hasMore = true;

        const now = new Date().toISOString();

        // 🚀 개선 1: Week View (5일) + Upcoming (3주) 전체 로드
        const upcomingWeeks = new Date();
        upcomingWeeks.setDate(upcomingWeeks.getDate() + 5 + 21); // Week View 5일 + Upcoming 3주
        const maxDate = upcomingWeeks.toISOString();

        while (hasMore) {
            const { data, error } = await supabaseClient
                .from('poly_events')
                // 🚀 개선 2: 필요한 필드만 선택 (전송량 60% 감소)
                .select('id, title, slug, end_date, volume, volume_24hr, probs, category, closed, image_url, tags')
                .gte('end_date', now)  // 현재 이후
                .lte('end_date', maxDate)  // 5일 이내
                .gte('volume', 10000)  // 서버 레벨 필터링 (거래량 $10K 이상)
                .order('end_date', { ascending: true })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allData = allData.concat(data);
                console.log(`📦 ${allData.length}건 로드됨...`);
                offset += PAGE_SIZE;
                hasMore = data.length === PAGE_SIZE;
            } else {
                hasMore = false;
            }
        }

        console.log('✅ 데이터 로드 성공:', allData.length, '건');
        allEvents = allData;

        // 🎯 그룹화 적용 (캐시 저장 전)
        allEvents = groupSimilarMarkets(allEvents);

        // 🚀 개선 3: 캐시에 저장
        try {
            localStorage.setItem(cacheKey, JSON.stringify(allEvents));
            localStorage.setItem(cacheTimeKey, Date.now().toString());
            console.log('💾 캐시에 저장 완료');
        } catch (e) {
            console.warn('⚠️ 캐시 저장 실패 (용량 초과 가능성):', e);
        }

        extractTags();
        extractCategories();
    } catch (error) {
        console.error('❌ 데이터 로드 실패:', error);
        allEvents = generateDemoData();
        // 🎯 그룹화 적용
        allEvents = groupSimilarMarkets(allEvents);
        extractTags();
    }
}

function extractTags() {
    allTags = {};
    allEvents.forEach(event => {
        if (event.tags && Array.isArray(event.tags)) {
            event.tags.forEach(tag => {
                if (tag) {
                    allTags[tag] = (allTags[tag] || 0) + 1;
                }
            });
        }
    });

    // Sort by count
    const sortedTags = Object.entries(allTags)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});

    allTags = sortedTags;
    document.getElementById('tagCount').textContent = `(${Object.keys(allTags).length})`;
}

// 이벤트의 카테고리를 반환하는 함수 (API 데이터 직접 사용)
function inferCategory(event) {
    return event.category || 'Uncategorized';
}

function extractCategories() {
    allCategories = {};

    allEvents.forEach(event => {
        const category = inferCategory(event);
        allCategories[category] = (allCategories[category] || 0) + 1;
    });

    // Sort by count
    const sortedCategories = Object.entries(allCategories)
        .sort((a, b) => b[1] - a[1])
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});

    allCategories = sortedCategories;
}

// 추가 데이터 로딩 (Calendar Overview에서 스크롤 시)
async function loadMoreData(targetDate) {
    if (!supabaseClient || isLoadingMore) return;

    isLoadingMore = true;
    console.log('📥 추가 데이터 로딩 중...');

    try {
        const lastEvent = allEvents[allEvents.length - 1];
        const startDate = lastEvent ? lastEvent.end_date : new Date().toISOString();

        const { data, error } = await supabaseClient
            .from('poly_events')
            .select('id, title, slug, end_date, volume, volume_24hr, probs, category, closed, image_url, tags')
            .gte('end_date', startDate)
            .lte('end_date', targetDate)
            .gte('volume', 10000)
            .order('end_date', { ascending: true })
            .limit(1000);

        if (error) throw error;

        if (data && data.length > 0) {
            // 중복 제거
            const existingIds = new Set(allEvents.map(e => e.id));
            const newEvents = data.filter(e => !existingIds.has(e.id));

            allEvents = allEvents.concat(newEvents);
            console.log('✅ 추가 로드:', newEvents.length, '건');

            // 🎯 전체 데이터 재그룹화 (새 이벤트가 기존 그룹에 속할 수 있음)
            allEvents = groupSimilarMarkets(allEvents);

            // 캐시 업데이트
            try {
                localStorage.setItem('polymarket_events_cache', JSON.stringify(allEvents));
                localStorage.setItem('polymarket_cache_time', Date.now().toString());
            } catch (e) {
                console.warn('⚠️ 캐시 업데이트 실패');
            }

            extractTags();
            extractCategories();
        }
    } catch (error) {
        console.error('❌ 추가 데이터 로드 실패:', error);
    } finally {
        isLoadingMore = false;
    }
}

function generateDemoData() {
    const categories = ['Sports', 'Crypto', 'Politics', 'Pop Culture', 'Science', 'Business'];
    const demoTags = ['Sports', 'Games', 'Soccer', 'Politics', 'Basketball', 'Crypto', 'NCAA', 'Trump', 'Elections'];
    const demoEvents = [];
    const now = new Date();

    for (let i = 0; i < 500; i++) {
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 60) - 10);

        const prob = Math.random();
        const eventTags = [];
        const numTags = Math.floor(Math.random() * 3);
        for (let j = 0; j < numTags; j++) {
            eventTags.push(demoTags[Math.floor(Math.random() * demoTags.length)]);
        }

        demoEvents.push({
            id: `demo-${i}`,
            title: `Demo Market ${i + 1}`,
            slug: `demo-market-${i + 1}`,
            end_date: endDate.toISOString(),
            volume: Math.random() * 10000000,
            volume_24hr: Math.random() * 500000,
            probs: [prob.toFixed(2), (1 - prob).toFixed(2)],
            outcomes: ['Yes', 'No'],
            category: categories[Math.floor(Math.random() * categories.length)],
            tags: eventTags
        });
    }

    return demoEvents;
}


function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatCurrency(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toFixed(0);
}

// Filter Modal Functions
function openFilterModal() {
    tempFilters = JSON.parse(JSON.stringify(filters));
    renderFilterTags();
    renderFilterCategories();
    syncFilterUI();
    document.getElementById('filterModalOverlay').classList.add('active');
}

function closeFilterModal() {
    document.getElementById('filterModalOverlay').classList.remove('active');
}

function renderFilterTags(searchQuery = '') {
    const container = document.getElementById('filterTags');
    container.innerHTML = '';

    const query = searchQuery.toLowerCase();
    const filteredTags = Object.entries(allTags)
        .filter(([tag]) => tag.toLowerCase().includes(query));

    filteredTags.forEach(([tag, count]) => {
        const chip = document.createElement('button');
        chip.className = `tag-chip${tempFilters.tags.includes(tag) ? ' active' : ''}`;
        chip.innerHTML = `${tag} <span class="tag-count">${count}</span>`;
        chip.addEventListener('click', () => {
            if (tempFilters.tags.includes(tag)) {
                tempFilters.tags = tempFilters.tags.filter(t => t !== tag);
                chip.classList.remove('active');
            } else {
                tempFilters.tags.push(tag);
                chip.classList.add('active');
            }
        });
        container.appendChild(chip);
    });
}

function renderFilterCategories() {
    const container = document.getElementById('filterCategories');
    container.innerHTML = '';

    Object.entries(allCategories).forEach(([category, count]) => {
        const chip = document.createElement('button');
        chip.className = `tag-chip${tempFilters.excludedCategories.includes(category) ? ' excluded' : ''}`;
        chip.innerHTML = `${category} <span class="tag-count">${count}</span>`;
        chip.addEventListener('click', () => {
            if (tempFilters.excludedCategories.includes(category)) {
                tempFilters.excludedCategories = tempFilters.excludedCategories.filter(c => c !== category);
                chip.classList.remove('excluded');
            } else {
                tempFilters.excludedCategories.push(category);
                chip.classList.add('excluded');
            }
        });
        container.appendChild(chip);
    });
}

function syncFilterUI() {
    // Time remaining
    document.querySelectorAll('#timeRemainingOptions .filter-option').forEach(btn => {
        const value = btn.dataset.value === 'all' ? 'all' : parseInt(btn.dataset.value);
        btn.classList.toggle('active', tempFilters.timeRemaining === value);
    });

    // Min Volume
    document.querySelectorAll('#minVolumeOptions .filter-option').forEach(btn => {
        const value = parseInt(btn.dataset.value);
        btn.classList.toggle('active', tempFilters.minVolume === value);
    });

    // Min Liquidity
    document.querySelectorAll('#minLiquidityOptions .filter-option').forEach(btn => {
        const value = parseInt(btn.dataset.value);
        btn.classList.toggle('active', tempFilters.minLiquidity === value);
    });
}

function applyFilters() {
    filters = JSON.parse(JSON.stringify(tempFilters));
    closeFilterModal();
    updateQuickFilterChips();
    updateActiveFiltersDisplay();
    renderCalendar();
}

function resetFilters() {
    tempFilters = {
        tags: [],
        excludedCategories: ['Sports'], // 기본적으로 스포츠 제외 유지
        timeRemaining: 'all',
        minVolume: 10000,
        minLiquidity: 0
    };
    renderFilterTags();
    renderFilterCategories();
    syncFilterUI();
}

function clearAllFilters() {
    filters = {
        tags: [],
        excludedCategories: ['Sports'], // 기본적으로 스포츠 제외 유지
        timeRemaining: 'all',
        minVolume: 10000,
        minLiquidity: 0
    };
    updateQuickFilterChips();
    updateActiveFiltersDisplay();
    renderCalendar();
}

function updateActiveFiltersDisplay() {
    const container = document.getElementById('activeFilters');
    const clearBtn = document.getElementById('clearFilters');
    container.innerHTML = '';

    let hasFilters = false;

    // Tags
    filters.tags.forEach(tag => {
        hasFilters = true;
        const tagEl = document.createElement('span');
        tagEl.className = 'filter-tag';
        tagEl.innerHTML = `${tag} <span class="remove-tag" data-type="tag" data-value="${tag}">×</span>`;
        container.appendChild(tagEl);
    });

    // Excluded Categories
    filters.excludedCategories.forEach(category => {
        hasFilters = true;
        const tagEl = document.createElement('span');
        tagEl.className = 'filter-tag excluded';
        tagEl.innerHTML = `🚫 ${category} <span class="remove-tag" data-type="excludedCategory" data-value="${category}">×</span>`;
        container.appendChild(tagEl);
    });

    // Time remaining
    if (filters.timeRemaining !== 'all') {
        hasFilters = true;
        const tagEl = document.createElement('span');
        tagEl.className = 'filter-tag';
        tagEl.innerHTML = `< ${filters.timeRemaining} days <span class="remove-tag" data-type="timeRemaining">×</span>`;
        container.appendChild(tagEl);
    }

    // Min Volume
    if (filters.minVolume > 0) {
        hasFilters = true;
        const tagEl = document.createElement('span');
        tagEl.className = 'filter-tag';
        tagEl.innerHTML = `Vol > $${formatCurrency(filters.minVolume)} <span class="remove-tag" data-type="minVolume">×</span>`;
        container.appendChild(tagEl);
    }

    // Min Liquidity
    if (filters.minLiquidity > 0) {
        hasFilters = true;
        const tagEl = document.createElement('span');
        tagEl.className = 'filter-tag';
        tagEl.innerHTML = `Liq > $${formatCurrency(filters.minLiquidity)} <span class="remove-tag" data-type="minLiquidity">×</span>`;
        container.appendChild(tagEl);
    }

    if (!hasFilters) {
        container.innerHTML = '<span class="filter-placeholder">Click to add filters</span>';
    }

    clearBtn.style.display = hasFilters ? 'block' : 'none';

    // Add remove handlers
    container.querySelectorAll('.remove-tag').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            const value = btn.dataset.value;

            if (type === 'tag') {
                filters.tags = filters.tags.filter(t => t !== value);
            } else if (type === 'excludedCategory') {
                filters.excludedCategories = filters.excludedCategories.filter(c => c !== value);
            } else if (type === 'timeRemaining') {
                filters.timeRemaining = 'all';
            } else if (type === 'minVolume') {
                filters.minVolume = 0;
            } else if (type === 'minLiquidity') {
                filters.minLiquidity = 0;
            }

            updateActiveFiltersDisplay();
            renderCalendar();
        });
    });
}

function getFilteredEvents(searchQuery = '') {
    let filtered = [...allEvents];
    const now = new Date();

    // Apply tag filter
    if (filters.tags.length > 0) {
        filtered = filtered.filter(e =>
            e.tags && filters.tags.some(tag => e.tags.includes(tag))
        );
    }

    // Apply category exclusion filter
    if (filters.excludedCategories.length > 0) {
        filtered = filtered.filter(e =>
            !filters.excludedCategories.includes(inferCategory(e))
        );
    }

    // 기본적으로 과거 이벤트 및 정산 완료 시장 제외 (항상 적용)
    filtered = filtered.filter(e => {
        const endDate = new Date(e.end_date);
        const isClosed = e.closed === true;
        return endDate >= now && !isClosed;  // 마감 전 + 미정산만
    });

    // Apply time remaining filter (추가 범위 제한)
    if (filters.timeRemaining !== 'all') {
        const days = parseInt(filters.timeRemaining);
        const maxDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(e => {
            const endDate = new Date(e.end_date);
            return endDate <= maxDate;
        });
    }

    // Apply min volume filter
    if (filters.minVolume > 0) {
        filtered = filtered.filter(e => parseFloat(e.volume) >= filters.minVolume);
    }

    // Apply min liquidity filter (using volume * 0.1 as approximate liquidity)
    if (filters.minLiquidity > 0) {
        filtered = filtered.filter(e => parseFloat(e.volume) * 0.1 >= filters.minLiquidity);
    }

    // Apply search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(e =>
            e.title?.toLowerCase().includes(query) ||
            e.category?.toLowerCase().includes(query)
        );
    }

    return filtered;
}

// Week View 렌더링 (현재 주 7일간 상세 타임라인)
function renderWeekView(searchQuery = '') {
    const todayKST = getKSTToday();
    const filtered = getFilteredEvents(searchQuery);

    // 현재 KST 시간 (시간 비교용)
    const nowKST = new Date();

    // 이번 주 날짜 계산 (오늘 포함 5일)
    const weekDates = [];
    for (let i = 0; i < 5; i++) {
        weekDates.push(addDays(todayKST, i));
    }

    // 이벤트를 날짜별로 그룹화
    const eventsByDate = {};
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

    // 각 날짜의 이벤트를 시간순으로 정렬
    Object.keys(eventsByDate).forEach(dateKey => {
        eventsByDate[dateKey].sort((a, b) => {
            return new Date(a.end_date).getTime() - new Date(b.end_date).getTime();
        });
    });

    // Week range 업데이트
    const weekStart = new Date(todayKST + 'T00:00:00');
    const weekEnd = new Date(addDays(todayKST, 4) + 'T00:00:00');
    const weekRangeText = `${weekStart.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })} - ${weekEnd.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}`;
    document.getElementById('weekRange').textContent = weekRangeText;

    // Week timeline 렌더링
    const timeline = document.getElementById('weekTimeline');
    timeline.innerHTML = '';

    weekDates.forEach(dateKey => {
        const dayEvents = eventsByDate[dateKey] || [];
        const date = new Date(dateKey + 'T00:00:00');
        const isToday = dateKey === todayKST;

        const dayEl = document.createElement('div');
        dayEl.className = `week-day${isToday ? ' today' : ''}`;

        // 날짜 헤더
        const dayName = date.toLocaleDateString(getLocale(), { weekday: 'short', timeZone: 'Asia/Seoul' });
        const dayNumber = date.getDate();
        const monthName = date.toLocaleDateString(getLocale(), { month: 'short', timeZone: 'Asia/Seoul' });
        const dayDateText = currentLang === 'ko' ? `${monthName} ${dayNumber}일` : `${monthName} ${dayNumber}`;

        dayEl.innerHTML = `
            <div class="week-day-header">
                <div class="week-day-name">${dayName}</div>
                <div class="week-day-date">${dayDateText}</div>
                ${dayEvents.length > 0 ? `<div class="week-event-count">${dayEvents.length}${translations[currentLang].events}</div>` : ''}
            </div>
            <div class="week-day-events" id="week-${dateKey}"></div>
        `;

        timeline.appendChild(dayEl);

        // 이벤트 렌더링
        const eventsContainer = document.getElementById(`week-${dateKey}`);
        if (dayEvents.length === 0) {
            eventsContainer.innerHTML = `<div class="week-no-events">${translations[currentLang].noEvents}</div>`;
        } else {
            dayEvents.forEach(event => {
                renderWeekEventCard(eventsContainer, event);
            });
        }
    });
}

// Week View 개별 이벤트 카드 렌더링
function renderWeekEventCard(container, event) {
    const time = getKSTTime(event.end_date);
    const timeClass = getTimeClass(time);
    const imageUrl = event.image_url || '';
    const prob = getMainProb(event);
    const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
    const volume = formatCurrency(event.volume);
    const slugSafe = escapeHtml(event.slug || '');
    const category = inferCategory(event);
    const categoryColor = categoryColors[category] || categoryColors['default'];

    const eventEl = document.createElement('div');
    eventEl.className = 'week-event';
    eventEl.style.borderLeftColor = categoryColor;
    eventEl.setAttribute('data-category', category);
    eventEl.onclick = () => openEventLink(slugSafe, '');

    eventEl.addEventListener('mouseenter', (e) => showEventTooltip(e, event));
    eventEl.addEventListener('mousemove', (e) => positionTooltip(e));
    eventEl.addEventListener('mouseleave', hideEventTooltip);

    eventEl.innerHTML = `
        <div class="week-event-time ${timeClass}">${time}</div>
        <div class="week-event-content">
            <div class="week-event-header">
                <img src="${imageUrl}" class="week-event-image" alt="" onerror="this.style.display='none'">
                <span class="week-event-title">${event.title}</span>
                <button class="event-link-btn" onclick="event.stopPropagation(); window.open('https://polymarket.com/event/${slugSafe}', '_blank');" title="Open in Polymarket">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
            </div>
            <div class="week-event-meta">
                <span class="week-event-prob ${probClass}">${prob}%</span>
                <span class="week-event-volume">Vol: $${volume}</span>
            </div>
        </div>
    `;

    container.appendChild(eventEl);
}

// Calendar Overview 렌더링 (3주간 개요)
function renderCalendarOverview(searchQuery = '') {
    const todayKST = getKSTToday();
    const filtered = getFilteredEvents(searchQuery);

    // 시작 날짜 계산 (Week View 끝난 다음날부터 + 추가 주)
    const startDate = addDays(todayKST, 5 + (calendarOverviewStartWeek * 7));

    // 3주간 날짜 계산
    const weekDates = [];
    for (let i = 0; i < 21; i++) {
        weekDates.push(addDays(startDate, i));
    }

    // 이벤트를 날짜별로 그룹화
    const eventsByDate = {};
    filtered.forEach(event => {
        if (event.end_date) {
            const dateKey = toKSTDateString(event.end_date);
            if (weekDates.includes(dateKey)) {
                if (!eventsByDate[dateKey]) {
                    eventsByDate[dateKey] = [];
                }
                eventsByDate[dateKey].push(event);
            }
        }
    });

    // Calendar range 업데이트
    const rangeStart = new Date(startDate + 'T00:00:00');
    const rangeEnd = new Date(addDays(startDate, 20) + 'T00:00:00');
    const rangeText = `${rangeStart.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })} - ${rangeEnd.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}`;
    document.getElementById('calendarRange').textContent = rangeText;

    // Calendar days 렌더링
    const daysContainer = document.getElementById('calendarOverviewDays');
    daysContainer.innerHTML = '';

    let previousMonth = null;
    weekDates.forEach(dateKey => {
        const dayEvents = eventsByDate[dateKey] || [];
        const date = new Date(dateKey + 'T00:00:00');
        const isToday = dateKey === todayKST;

        const dayEl = document.createElement('div');
        dayEl.className = `calendar-overview-day${isToday ? ' today' : ''}`;

        const dayNumber = date.getDate();
        const currentMonth = date.getMonth();

        // 월이 바뀌는지 확인 (1일이거나 이전 월과 다를 때)
        const isNewMonth = previousMonth !== null && previousMonth !== currentMonth;
        previousMonth = currentMonth;

        // 월 정보 생성 (월이 바뀔 때만)
        let monthLabel = '';
        if (isNewMonth || dayNumber === 1) {
            const monthName = date.toLocaleDateString(getLocale(), { month: 'short', timeZone: 'Asia/Seoul' });
            monthLabel = `<div class="calendar-overview-month-label">${monthName}</div>`;
        }

        // 거래량 기준 상위 3개 선택
        const sortedEvents = [...dayEvents].sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
        const topEvents = sortedEvents.slice(0, 3);

        // Build day element
        dayEl.innerHTML = `
            ${monthLabel}
            <div class="calendar-overview-day-number">${dayNumber}</div>
            ${topEvents.length > 0 ? '<div class="calendar-overview-events"></div>' : ''}
            ${dayEvents.length > 3 ? `<div class="calendar-overview-more-link" onclick="showDayEvents('${dateKey}')">+${dayEvents.length - 3} ${translations[currentLang].more}</div>` : ''}
        `;

        daysContainer.appendChild(dayEl);

        // 이벤트 렌더링
        if (topEvents.length > 0) {
            const eventsContainer = dayEl.querySelector('.calendar-overview-events');
            topEvents.forEach(event => {
                renderOverviewEventItem(eventsContainer, event);
            });
        }
    });
}

// Calendar Overview 개별 이벤트 아이템
function renderOverviewEventItem(container, event) {
    const imageUrl = event.image_url || '';
    const prob = getMainProb(event);
    const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
    const title = truncate(event.title, 25);
    const slugSafe = escapeHtml(event.slug || '');
    const category = inferCategory(event);
    const categoryColor = categoryColors[category] || categoryColors['default'];

    const eventEl = document.createElement('div');
    eventEl.className = 'calendar-overview-event';
    eventEl.dataset.category = category;
    eventEl.style.borderLeftColor = categoryColor;
    eventEl.onclick = (e) => { e.stopPropagation(); openEventLink(slugSafe, ''); };

    eventEl.addEventListener('mouseenter', (e) => showEventTooltip(e, event));
    eventEl.addEventListener('mousemove', (e) => positionTooltip(e));
    eventEl.addEventListener('mouseleave', hideEventTooltip);

    eventEl.innerHTML = `
        <img src="${imageUrl}" class="overview-event-image" alt="" onerror="this.style.display='none'">
        <span class="overview-event-title">${title}</span>
        <span class="overview-event-prob ${probClass}">${prob}%</span>
    `;

    container.appendChild(eventEl);
}

function renderCalendar(searchQuery = '') {
    renderWeekView(searchQuery);
    renderCalendarOverview(searchQuery);
}

function getMainProb(event) {
    if (!event.probs || !Array.isArray(event.probs)) return 50;
    const prob = parseFloat(event.probs[0]);
    return Math.round(prob * 100);
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function highlightSearchTerm(text, searchTerm) {
    if (!text || !searchTerm || searchTerm.trim() === '') {
        return escapeHtml(text);
    }

    const escapedText = escapeHtml(text);
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
    const regex = new RegExp(`(${escapedTerm})`, 'gi');

    return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
}

function openEventLink(slug, searchQuery) {
    if (searchQuery) {
        // 그룹화된 이벤트는 검색 페이지로 이동
        const encoded = encodeURIComponent(searchQuery);
        window.open(`https://polymarket.com/markets?_q=${encoded}`, '_blank');
    } else if (slug) {
        // 그룹 이벤트의 개별 옵션이 slug에 포함된 경우 정규화
        // 예1: "highest-temperature-in-seattle-on-february-10-2026-41forbelow"
        //   → "highest-temperature-in-seattle-on-february-10-2026"
        // 예2: "elon-musk-of-tweets-february-3-february-10-380-399"
        //   → "elon-musk-of-tweets-february-3-february-10"
        let normalizedSlug = slug;

        // 패턴 1: 온도 시장 (연도-온도값[단위][옵션])
        // Fahrenheit: -2026-41forbelow, -2026-42-43f, -2026-52forhigher
        // Celsius: -2026-0c, -2026-1c, -2026-14corhigher, -2026-35corbelow
        const tempRangePattern = /-(\d{4})-\d+-?\d*[cf](?:orhigher|orbelow)?$/;

        // 패턴 2: 숫자 범위 시장 (날짜-숫자범위)
        // 예: -february-10-380-399, -december-16-260-279
        const numericRangePattern = /-(\d+-\d+)$/;

        // 패턴 2-1: 플러스 패턴 (예: 580+, 140+)
        // 예: elon-musk-of-tweets-february-6-february-13-580plus
        const plusPattern = /-\d+plus$/;

        // 패턴 3: 가격 above/below (coin-above-price-on-date)
        // 예: ethereum-above-2600-on-february-10 → ethereum-above-on-february-10
        // 소수점 표기: xrp-above-1pt5-on → xrp-above-on
        const priceAboveBelowPattern = /-(above|below)-[\d]+(?:pt\d+)?k?-on-/;

        // 패턴 4: 가격 between (be-between-price1-price2)
        // 예: bitcoin-be-between-74000-76000-on → bitcoin-price-on
        const priceBetweenPattern = /-be-between-\d+-\d+-on-/;

        if (tempRangePattern.test(slug)) {
            // 온도 범위 부분 제거 (연도까지만 유지)
            normalizedSlug = slug.replace(tempRangePattern, '-$1');
        } else if (priceAboveBelowPattern.test(slug)) {
            // 가격 above/below: 가격 숫자 제거 (소수점 포함)
            normalizedSlug = slug.replace(/-(above|below)-[\d]+(?:pt\d+)?k?-on-/, '-$1-on-');
        } else if (priceBetweenPattern.test(slug)) {
            // 가격 between: 전체 구조 변경
            normalizedSlug = slug.replace(/will-the-price-of-([^-]+)-be-between-\d+-\d+-on-(.+)/, '$1-price-on-$2');
        } else if (plusPattern.test(slug)) {
            // 플러스 패턴 제거 (예: -580plus → '')
            normalizedSlug = slug.replace(plusPattern, '');
        } else if (numericRangePattern.test(slug)) {
            // 숫자 범위 부분 제거 (트윗 수 등)
            // 단, 타임스탬프 패턴은 제외 (updown-15m-숫자)
            if (!/-15m-\d+$/.test(slug)) {
                normalizedSlug = slug.replace(numericRangePattern, '');
            }
        }

        // 단일 마켓은 직접 링크
        window.open(`https://polymarket.com/event/${normalizedSlug}`, '_blank');
    }
}

function showDayEvents(dateKey) {
    const filtered = getFilteredEvents(document.getElementById('searchInput').value);
    // KST 기준으로 해당 날짜의 이벤트 필터링
    const dayEvents = filtered.filter(e => toKSTDateString(e.end_date) === dateKey);

    const date = new Date(dateKey + 'T00:00:00');
    const dateStr = date.toLocaleDateString(getLocale(), {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Seoul'
    });

    document.getElementById('modalDate').textContent = `${dateStr} 만료 예정`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = '';

    dayEvents.forEach(event => {
        renderModalEventItem(modalBody, event);
    });

    document.getElementById('modalOverlay').classList.add('active');
}

// 모달 개별 이벤트 아이템
function renderModalEventItem(container, event) {
    const imageUrl = event.image_url || '';
    const prob = getMainProb(event);
    const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
    const slugSafe = escapeHtml(event.slug || '');

    const eventEl = document.createElement('div');
    eventEl.className = `modal-event-item${!slugSafe ? ' disabled' : ''}`;
    if (slugSafe) {
        eventEl.onclick = () => openEventLink(event.slug, '');
    }
    eventEl.innerHTML = `
        <img src="${imageUrl}" class="modal-event-image" alt="" onerror="this.style.display='none'">
        <div class="modal-event-content">
            <div class="modal-event-title">${event.title}</div>
            <div class="modal-event-category">${event.category || 'Uncategorized'}</div>
        </div>
        <span class="modal-event-prob ${probClass}">${prob}%</span>
    `;
    container.appendChild(eventEl);
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

// Global functions for onclick handlers
window.openEventLink = openEventLink;

// ============================================================================
// Language Toggle (한국어/English)
// ============================================================================

const translations = {
    ko: {
        search: '시장 검색...',
        filters: '필터',
        clickToAdd: '클릭하여 필터 추가',
        hideCategories: '카테고리 숨기기',
        timeRemaining: '남은 시간',
        minVolume: '최소 거래량',
        minLiquidity: '최소 유동성',
        all: '전체',
        days: '일',
        dataRangeInfo: '앞으로 30일 이내 이벤트만 표시',
        refreshTooltip: '과거 이벤트 숨기기',
        categories: {
            'Sports': '스포츠',
            'Crypto': '암호화폐',
            'Politics': '정치',
            'Finance': '금융',
            'Pop Culture': '대중문화',
            'Science': '과학',
            'Uncategorized': '미분류'
        },
        markets: '개 시장',
        events: '개 이벤트',
        noEvents: '이벤트 없음',
        more: '더보기',
        loading: '로딩 중...',
        noResults: '결과 없음',
        volume: '거래량',
        volume24hr: '24시간 거래량',
        liquidity: '유동성',
        probability: '확률',
        activeMarkets: '활성 시장',
        activeMarketsDesc: '현재 활성화된 시장',
        totalLiquidity: '총 유동성',
        totalLiquidityDesc: '모든 활성 시장의 유동성',
        totalVolume: '총 거래량',
        totalVolumeDesc: '모든 활성 시장의 거래량',
        avgLiquidity: '평균 유동성',
        avgLiquidityDesc: '시장당 평균 유동성'
    },
    en: {
        search: 'Search markets...',
        filters: 'Filters',
        clickToAdd: 'Click to add filters',
        hideCategories: 'Hide Categories',
        timeRemaining: 'Time remaining',
        minVolume: 'Min Volume',
        minLiquidity: 'Min Liquidity',
        all: 'All',
        days: 'd',
        dataRangeInfo: 'Showing events within the next 30 days',
        refreshTooltip: 'Hide past events',
        categories: {
            'Sports': 'Sports',
            'Crypto': 'Crypto',
            'Politics': 'Politics',
            'Finance': 'Finance',
            'Pop Culture': 'Pop Culture',
            'Science': 'Science',
            'Uncategorized': 'Uncategorized'
        },
        markets: ' markets',
        events: ' events',
        noEvents: 'No events',
        more: 'more',
        loading: 'Loading...',
        noResults: 'No results',
        volume: 'Volume',
        volume24hr: '24hr Volume',
        liquidity: 'Liquidity',
        probability: 'Probability',
        activeMarkets: 'Active Markets',
        activeMarketsDesc: 'Currently active markets',
        totalLiquidity: 'Total Liquidity',
        totalLiquidityDesc: 'Liquidity across all active markets',
        totalVolume: 'Total Volume',
        totalVolumeDesc: 'Volume across all active markets',
        avgLiquidity: 'Avg Liquidity',
        avgLiquidityDesc: 'Average liquidity per market'
    }
};

let currentLang = localStorage.getItem('language') || 'ko';

function translatePage() {
    const t = translations[currentLang];

    // Search placeholder
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.placeholder = t.search;
    }

    // Data range info banner
    const dataRangeInfo = document.getElementById('dataRangeInfo');
    if (dataRangeInfo) {
        dataRangeInfo.textContent = t.dataRangeInfo;
    }

    // Refresh button tooltip
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.setAttribute('title', t.refreshTooltip);
    }

    // Filter label
    const filterLabels = document.querySelectorAll('.filter-label');
    filterLabels.forEach(label => {
        if (label.textContent.trim().includes('Filter')) {
            const svg = label.querySelector('svg');
            label.textContent = t.filters;
            if (svg) label.prepend(svg);
        }
    });

    // Filter placeholder
    const filterPlaceholder = document.querySelector('.filter-placeholder');
    if (filterPlaceholder) {
        filterPlaceholder.textContent = t.clickToAdd;
    }

    // Update category names in calendar
    document.querySelectorAll('.category-label').forEach(el => {
        const originalCategory = el.getAttribute('data-category');
        if (originalCategory && t.categories[originalCategory]) {
            el.textContent = t.categories[originalCategory];
        }
    });

    // Update language toggle button
    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.querySelector('.lang-text').textContent = currentLang.toUpperCase();
    }

    // Note: Quick filter chips are intentionally kept in English only
    // They are not translated to maintain consistency across languages

    // Re-render calendar to update translated categories
    if (typeof renderCalendar === 'function') {
        renderCalendar();
    }
}

function getLocale() {
    return currentLang === 'ko' ? 'ko-KR' : 'en-US';
}

function toggleLanguage() {
    currentLang = currentLang === 'ko' ? 'en' : 'ko';
    localStorage.setItem('language', currentLang);
    translatePage();
}

// Initialize language
function initLanguage() {
    translatePage();

    const langToggle = document.getElementById('langToggle');
    if (langToggle) {
        langToggle.addEventListener('click', toggleLanguage);
    }
}

// Helper function to get translated category name
function getTranslatedCategory(category) {
    const t = translations[currentLang];
    return t.categories[category] || category;
}

// Export for use in rendering functions
window.getCurrentLang = () => currentLang;
window.getTranslation = (key) => translations[currentLang][key] || key;
window.getTranslatedCategory = getTranslatedCategory;
window.showDayEvents = showDayEvents;
