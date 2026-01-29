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

// Filter state (기본값: 거래량 $10K 이상만 표시)
let filters = {
    tags: [],
    excludedCategories: [], // 제외할 카테고리 리스트
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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 앱 시작');

    initTheme();
    initSupabase();
    setupEventListeners();
    await loadData();
    updateActiveFiltersDisplay(); // 기본 필터 UI 표시
    renderCalendar();
});

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
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
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleTheme();
        });
    }

    // Calendar Overview navigation
    document.getElementById('prevWeek').addEventListener('click', () => {
        if (calendarOverviewStartWeek > 0) {
            calendarOverviewStartWeek--;
            renderCalendar();
        }
    });

    document.getElementById('nextWeek').addEventListener('click', () => {
        calendarOverviewStartWeek++;
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

async function loadData() {
    console.log('📥 데이터 로드 시작');

    if (!supabaseClient) {
        console.log('⚠️ Supabase 없음 - 데모 데이터 사용');
        allEvents = generateDemoData();
        extractTags();
        extractCategories();
        updateStats();
        return;
    }

    try {
        const PAGE_SIZE = 1000;
        let allData = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabaseClient
                .from('poly_events')
                .select('*')
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
        extractTags();
        extractCategories();
        updateStats();
    } catch (error) {
        console.error('❌ 데이터 로드 실패:', error);
        allEvents = generateDemoData();
        extractTags();
        updateStats();
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

// 카테고리 매핑 규칙 (전역 상수)
const CATEGORY_RULES = {
    'Sports': ['Sports', 'NBA', 'NFL', 'NHL', 'Soccer', 'Basketball', 'Football', 'Baseball', 'Hockey', 'NCAA', 'Games', 'Esports', 'Cricket', 'Tennis'],
    'Crypto': ['Crypto', 'Bitcoin', 'Ethereum', 'BTC', 'ETH', 'Blockchain', 'DeFi', 'NFT', 'Solana', 'XRP', 'Ripple'],
    'Politics': ['Politics', 'Elections', 'Trump', 'Biden', 'Congress', 'Senate', 'President', 'Primaries', 'Republican', 'Democrat', 'Geopolitics'],
    'Pop Culture': ['Pop Culture', 'Culture', 'Entertainment', 'Movies', 'Music', 'Celebrity', 'Awards', 'Oscars', 'Grammys'],
    'Finance': ['Finance', 'Stocks', 'Economy', 'Market', 'Trading', 'Investment', 'GDP', 'Inflation'],
    'Science': ['Science', 'Technology', 'Tech', 'AI', 'Space', 'Climate', 'Research']
};

// 이벤트의 카테고리를 반환하는 함수
function inferCategory(event) {
    // Supabase에 저장된 추론된 카테고리 사용
    return event.inferred_category || event.category || 'Uncategorized';
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

function updateStats() {
    const activeMarkets = allEvents.length;
    const totalVolume = allEvents.reduce((sum, e) => sum + (parseFloat(e.volume) || 0), 0);
    const volume24hr = allEvents.reduce((sum, e) => sum + (parseFloat(e.volume_24hr) || 0), 0);

    document.getElementById('activeMarkets').textContent = formatNumber(activeMarkets);
    document.getElementById('totalVolume').textContent = formatCurrency(totalVolume);
    document.getElementById('volume24hr').textContent = formatCurrency(volume24hr);
    document.getElementById('totalLiquidity').textContent = formatCurrency(totalVolume * 0.1);
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
    updateActiveFiltersDisplay();
    renderCalendar();
}

function resetFilters() {
    tempFilters = {
        tags: [],
        timeRemaining: 'all',
        minVolume: 10000,
        minLiquidity: 0
    };
    renderFilterTags();
    syncFilterUI();
}

function clearAllFilters() {
    filters = {
        tags: [],
        timeRemaining: 'all',
        minVolume: 10000,
        minLiquidity: 0
    };
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

// 제목에서 숫자/금액을 제거하여 이벤트 그룹 식별자 추출
function extractEventGroupKey(title) {
    if (!title) return '';

    // 숫자 패턴들을 정규화하여 같은 토픽의 마켓들을 그룹화
    let normalized = title
        // "at least 25", "at least 27" -> "at least X"
        .replace(/at least \d+(\.\d+)?/gi, 'at least X')
        // "over 100", "under 50" -> "over X", "under X"
        .replace(/(over|under|above|below|more than|less than)\s*\d+(\.\d+)?/gi, '$1 X')
        // "$1,000", "$10K", "$1M" -> "$X"
        .replace(/\$[\d,]+(\.\d+)?[KMB]?/gi, '$X')
        // "25%", "30%" -> "X%"
        .replace(/\d+(\.\d+)?%/g, 'X%')
        // 날짜 패턴 "1/27", "01/27/2026"
        .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, 'DATE')
        // 순수 숫자 (남은 것들) "round 1", "week 5"
        .replace(/\b\d+(\.\d+)?\b/g, 'X')
        .trim()
        .toLowerCase();

    return normalized;
}

// 제목 기준으로 이벤트 그룹화 - 가장 거래량 높은 마켓만 선택
function groupEventsBySlug(events) {
    const titleGroups = {};

    events.forEach(event => {
        // 제목에서 그룹 키 추출 (숫자 제거)
        const groupKey = extractEventGroupKey(event.title);
        if (!titleGroups[groupKey]) {
            titleGroups[groupKey] = [];
        }
        titleGroups[groupKey].push(event);
    });

    // 각 그룹에서 가장 거래량이 높은 마켓 선택
    const groupedEvents = [];
    Object.entries(titleGroups).forEach(([groupKey, markets]) => {
        if (markets.length === 1) {
            // 마켓이 1개면 그대로 사용
            groupedEvents.push(markets[0]);
        } else {
            // 여러 마켓이 있으면 거래량 기준 정렬 후 가장 높은 것 선택
            markets.sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
            const topMarket = { ...markets[0] };
            // 그룹 내 마켓 수 표시용
            topMarket._marketCount = markets.length;
            // 그룹 전체 거래량 합산
            topMarket._totalVolume = markets.reduce((sum, m) => sum + (parseFloat(m.volume) || 0), 0);
            // 검색용 키워드 저장 (그룹화된 제목에서 공통 부분 추출)
            topMarket._searchQuery = extractSearchQuery(markets[0].title);
            groupedEvents.push(topMarket);
        }
    });

    return groupedEvents;
}

// 검색 쿼리용 제목 추출 (핵심 키워드만)
function extractSearchQuery(title) {
    if (!title) return '';
    // "Will X score at least Y" -> "X"
    // 질문 형식에서 핵심 주제 추출
    let query = title
        .replace(/^(will|does|is|are|can|has|have|do)\s+/i, '')
        .replace(/\s+(score|reach|hit|get|be|have|win|lose).*/i, '')
        .replace(/\?.*$/, '')
        .trim();

    // 너무 짧으면 원본 제목 일부 사용
    if (query.length < 5) {
        query = title.substring(0, 50);
    }

    return query;
}

function getFilteredEvents(searchQuery = '', applyGrouping = true) {
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

    // 기본적으로 과거 이벤트 제외 (항상 적용)
    filtered = filtered.filter(e => {
        const endDate = new Date(e.end_date);
        return endDate >= now;
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

    // slug 기준 그룹화 적용
    if (applyGrouping) {
        filtered = groupEventsBySlug(filtered);
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
    const weekRangeText = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}`;
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
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Seoul' });
        const dayNumber = date.getDate();
        const monthName = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'Asia/Seoul' });

        dayEl.innerHTML = `
            <div class="week-day-header">
                <div class="week-day-name">${dayName}</div>
                <div class="week-day-date">${monthName} ${dayNumber}</div>
                ${dayEvents.length > 0 ? `<div class="week-event-count">${dayEvents.length} events</div>` : ''}
            </div>
            <div class="week-day-events" id="week-${dateKey}"></div>
        `;

        timeline.appendChild(dayEl);

        // 이벤트 렌더링
        const eventsContainer = document.getElementById(`week-${dateKey}`);
        if (dayEvents.length === 0) {
            eventsContainer.innerHTML = '<div class="week-no-events">No events</div>';
        } else {
            dayEvents.forEach(event => {
                const time = getKSTTime(event.end_date);
                const timeClass = getTimeClass(time);
                const imageUrl = event.image_url || '';
                const prob = getMainProb(event);
                const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
                const volume = formatCurrency(event._totalVolume || event.volume);
                const marketCount = event._marketCount || 1;
                const marketCountBadge = marketCount > 1 ? `<span class="market-count-badge">${marketCount}</span>` : '';
                const searchQuery = event._searchQuery ? escapeHtml(event._searchQuery) : '';
                const slugSafe = escapeHtml(event.slug || '');

                const eventEl = document.createElement('div');
                eventEl.className = 'week-event';
                eventEl.onclick = () => openEventLink(slugSafe, searchQuery);
                eventEl.innerHTML = `
                    <div class="week-event-time ${timeClass}">${time}</div>
                    <div class="week-event-content">
                        <div class="week-event-header">
                            <img src="${imageUrl}" class="week-event-image" alt="" onerror="this.style.display='none'">
                            <span class="week-event-title">${event.title}${marketCountBadge}</span>
                        </div>
                        <div class="week-event-meta">
                            <span class="week-event-prob ${probClass}">${prob}%</span>
                            <span class="week-event-volume">Vol: $${volume}</span>
                        </div>
                    </div>
                `;
                eventsContainer.appendChild(eventEl);
            });
        }
    });
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
    const rangeText = `${rangeStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })} - ${rangeEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' })}`;
    document.getElementById('calendarRange').textContent = rangeText;

    // Calendar days 렌더링
    const daysContainer = document.getElementById('calendarOverviewDays');
    daysContainer.innerHTML = '';

    weekDates.forEach(dateKey => {
        const dayEvents = eventsByDate[dateKey] || [];
        const date = new Date(dateKey + 'T00:00:00');
        const isToday = dateKey === todayKST;

        const dayEl = document.createElement('div');
        dayEl.className = `calendar-overview-day${isToday ? ' today' : ''}`;

        const dayNumber = date.getDate();
        const eventCount = dayEvents.length;

        // 거래량 기준으로 정렬하여 상위 3개 선택
        const topEvents = [...dayEvents]
            .sort((a, b) => (parseFloat(b._totalVolume || b.volume) || 0) - (parseFloat(a._totalVolume || a.volume) || 0))
            .slice(0, 3);

        // HTML 생성
        let eventsHtml = '';
        if (topEvents.length > 0) {
            eventsHtml = '<div class="calendar-overview-events">';
            topEvents.forEach(event => {
                const imageUrl = event.image_url || '';
                const prob = getMainProb(event);
                const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
                const title = truncate(event.title, 25);
                const searchQuery = event._searchQuery ? escapeHtml(event._searchQuery) : '';
                const slugSafe = escapeHtml(event.slug || '');

                eventsHtml += `
                    <div class="calendar-overview-event" onclick="event.stopPropagation(); openEventLink('${slugSafe}', '${searchQuery}');" title="${escapeHtml(event.title)}">
                        <img src="${imageUrl}" class="overview-event-image" alt="" onerror="this.style.display='none'">
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

        daysContainer.appendChild(dayEl);
    });
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

function openEventLink(slug, searchQuery) {
    if (searchQuery) {
        // 그룹화된 이벤트는 검색 페이지로 이동
        const encoded = encodeURIComponent(searchQuery);
        window.open(`https://polymarket.com/markets?_q=${encoded}`, '_blank');
    } else if (slug) {
        // 단일 마켓은 직접 링크
        window.open(`https://polymarket.com/event/${slug}`, '_blank');
    }
}

function showDayEvents(dateKey) {
    const filtered = getFilteredEvents(document.getElementById('searchInput').value);
    // KST 기준으로 해당 날짜의 이벤트 필터링
    const dayEvents = filtered.filter(e => toKSTDateString(e.end_date) === dateKey);

    const date = new Date(dateKey + 'T00:00:00');
    const dateStr = date.toLocaleDateString('ko-KR', {
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
        const imageUrl = event.image_url || '';
        const prob = getMainProb(event);
        const probClass = prob < 30 ? 'low' : prob < 70 ? 'mid' : '';
        const marketCount = event._marketCount || 1;
        const searchQuery = event._searchQuery ? escapeHtml(event._searchQuery) : '';
        const slugSafe = escapeHtml(event.slug || '');
        const hasLink = slugSafe || searchQuery;

        const eventEl = document.createElement('div');
        eventEl.className = `modal-event-item${!hasLink ? ' disabled' : ''}`;
        if (hasLink) {
            eventEl.onclick = () => openEventLink(event.slug, event._searchQuery);
        }
        eventEl.innerHTML = `
            <img src="${imageUrl}" class="modal-event-image" alt="" onerror="this.style.display='none'">
            <div class="modal-event-content">
                <div class="modal-event-title">${event.title}</div>
                <div class="modal-event-category">${event.category || 'Uncategorized'}${marketCount > 1 ? ` · ${marketCount} markets` : ''}</div>
            </div>
            <span class="modal-event-prob ${probClass}">${prob}%</span>
        `;
        modalBody.appendChild(eventEl);
    });

    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

// Global functions for onclick handlers
window.openEventLink = openEventLink;
window.showDayEvents = showDayEvents;
