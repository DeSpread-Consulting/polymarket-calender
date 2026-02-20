/**
 * Polymarket Admin - V1 Standalone
 * 별도 관리자 페이지 로직
 */

// Supabase 클라이언트
let supabaseClient = null;

// 상태
let adminEvents = [];
let currentPage = 1;
let totalCount = 0;
let editingEventId = null;
const PAGE_SIZE = 50;

// 필터 상태
let searchQuery = '';
let excludedCategories = [];
let translationFilter = '';
let hiddenFilter = '';
let sortField = 'volume';

// 카테고리 색상
const categoryColors = {
    'Sports': '#3b82f6',
    'Crypto': '#f59e0b',
    'Politics': '#ef4444',
    'Pop Culture': '#ec4899',
    'Science': '#10b981',
    'Business': '#8b5cf6',
    'Technology': '#06b6d4',
    'Gaming': '#f97316',
    'Finance': '#6366f1',
    'Music': '#d946ef',
    'Uncategorized': '#6b7280'
};

// ─── 초기화 ───

function initSupabase() {
    const url = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_URL : '';
    const key = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_ANON_KEY : '';
    if (!url || url === 'YOUR_SUPABASE_URL') {
        console.error('Supabase 설정이 없습니다. config.js를 확인하세요.');
        return;
    }
    supabaseClient = window.supabase.createClient(url, key);
}

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();
    if (!supabaseClient) return;

    setupEventListeners();
    await checkAuth();
});

async function checkAuth() {
    const session = await getAdminSession();
    if (session) {
        showDashboard();
    } else {
        showLoginGate();
    }

    onAdminAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') showDashboard();
        if (event === 'SIGNED_OUT') showLoginGate();
    });
}

function showLoginGate() {
    document.getElementById('loginGate').style.display = 'flex';
    document.getElementById('adminDashboard').style.display = 'none';
}

async function showDashboard() {
    document.getElementById('loginGate').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    await loadStats();
    await loadData();
}

// ─── 이벤트 리스너 ───

function setupEventListeners() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorEl = document.getElementById('loginError');
        errorEl.textContent = '';
        try {
            await adminSignIn(
                document.getElementById('adminEmail').value,
                document.getElementById('adminPassword').value
            );
        } catch (err) {
            errorEl.textContent = err.message;
        }
    });

    // Sign Out
    document.getElementById('signOutBtn').addEventListener('click', async () => {
        await adminSignOut();
    });

    // Search
    document.getElementById('adminSearch').addEventListener('input', debounce((e) => {
        searchQuery = e.target.value.trim();
        currentPage = 1;
        loadData();
    }, 300));

    // Category Chips 생성
    initCategoryChips();

    // Status / Hidden / Sort Chips 클릭 이벤트
    document.querySelectorAll('.admin-chip[data-filter="translation"]').forEach(chip => {
        chip.addEventListener('click', () => {
            translationFilter = chip.dataset.value;
            currentPage = 1;
            updateChipGroup('translation', chip);
            loadData();
        });
    });

    document.querySelectorAll('.admin-chip[data-filter="hidden"]').forEach(chip => {
        chip.addEventListener('click', () => {
            hiddenFilter = chip.dataset.value;
            currentPage = 1;
            updateChipGroup('hidden', chip);
            loadData();
        });
    });

    document.querySelectorAll('.admin-chip[data-filter="sort"]').forEach(chip => {
        chip.addEventListener('click', () => {
            sortField = chip.dataset.value;
            currentPage = 1;
            updateChipGroup('sort', chip);
            loadData();
        });
    });

    // Edit Modal
    document.getElementById('editModalOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeEditModal();
    });
    document.getElementById('editModalClose').addEventListener('click', closeEditModal);
    document.getElementById('editCancel').addEventListener('click', closeEditModal);
    document.getElementById('editSave').addEventListener('click', saveEdit);

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeEditModal();
    });
}

function initCategoryChips() {
    const container = document.getElementById('categoryChips');
    if (!container) return;

    // 각 카테고리 칩 (클릭 시 제외 토글)
    Object.keys(categoryColors).forEach(cat => {
        const color = categoryColors[cat];
        const chip = document.createElement('button');
        chip.className = 'admin-chip';
        chip.dataset.category = cat;
        chip.innerHTML = `<span class="chip-color-dot" style="background:${color};"></span>${cat}`;
        chip.addEventListener('click', () => {
            toggleCategoryExclusion(cat);
        });
        container.appendChild(chip);
    });
}

function toggleCategoryExclusion(category) {
    const idx = excludedCategories.indexOf(category);
    if (idx > -1) {
        excludedCategories.splice(idx, 1);
    } else {
        excludedCategories.push(category);
    }
    currentPage = 1;
    updateCategoryChipStyles();
    loadData();
}

function updateCategoryChipStyles() {
    document.querySelectorAll('#categoryChips .admin-chip').forEach(chip => {
        const cat = chip.dataset.category;
        chip.classList.toggle('excluded', excludedCategories.includes(cat));
    });
}

function updateChipGroup(filterName, activeChip) {
    document.querySelectorAll(`.admin-chip[data-filter="${filterName}"]`).forEach(chip => {
        chip.classList.toggle('active', chip === activeChip);
    });
}

// ─── 데이터 로드 ───

async function loadStats() {
    try {
        // 활성 시장만 (end_date >= now)
        const now = new Date().toISOString();

        const [totalRes, translatedRes, hiddenRes] = await Promise.all([
            supabaseClient.from('poly_events')
                .select('id', { count: 'exact', head: true })
                .gte('end_date', now)
                .eq('closed', false),
            supabaseClient.from('poly_events')
                .select('id', { count: 'exact', head: true })
                .gte('end_date', now)
                .eq('closed', false)
                .not('title_ko', 'is', null),
            supabaseClient.from('poly_events')
                .select('id', { count: 'exact', head: true })
                .gte('end_date', now)
                .eq('hidden', true),
        ]);

        const total = totalRes.count || 0;
        const translated = translatedRes.count || 0;
        const hidden = hiddenRes.count || 0;

        document.getElementById('statTotal').textContent = total.toLocaleString();
        document.getElementById('statTranslated').textContent = translated.toLocaleString();
        document.getElementById('statUntranslated').textContent = (total - translated).toLocaleString();
        document.getElementById('statHidden').textContent = hidden.toLocaleString();
    } catch (err) {
        console.error('Stats load error:', err);
    }
}

async function loadData() {
    const loading = document.getElementById('loadingIndicator');
    loading.style.display = 'block';

    try {
        const now = new Date().toISOString();

        let query = supabaseClient
            .from('poly_events')
            .select('id, title, title_ko, slug, event_slug, category, volume, end_date, hidden, description, description_ko, tags', { count: 'exact' })
            .gte('end_date', now)
            .eq('closed', false);

        // 필터 적용 (제외된 카테고리)
        if (excludedCategories.length > 0) {
            query = query.not('category', 'in', `(${excludedCategories.join(',')})`);
        }
        if (translationFilter === 'translated') {
            query = query.not('title_ko', 'is', null);
        } else if (translationFilter === 'untranslated') {
            query = query.is('title_ko', null);
        }
        if (hiddenFilter === 'visible') {
            query = query.eq('hidden', false);
        } else if (hiddenFilter === 'hidden') {
            query = query.eq('hidden', true);
        }

        // 텍스트 검색 (ilike)
        if (searchQuery) {
            query = query.or(`title.ilike.%${searchQuery}%,title_ko.ilike.%${searchQuery}%`);
        }

        // 정렬
        if (sortField === 'volume') {
            query = query.order('volume', { ascending: false });
        } else if (sortField === 'end_date') {
            query = query.order('end_date', { ascending: true });
        } else if (sortField === 'title') {
            query = query.order('title', { ascending: true });
        }

        // 페이지네이션
        const from = (currentPage - 1) * PAGE_SIZE;
        query = query.range(from, from + PAGE_SIZE - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        adminEvents = data || [];
        totalCount = count || 0;

        renderTable();
        renderPagination();
    } catch (err) {
        console.error('Data load error:', err);
        showToast('데이터 로드 실패: ' + err.message, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

// ─── 렌더링 ───

function renderTable() {
    const tbody = document.getElementById('marketTableBody');

    if (adminEvents.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">결과 없음</td></tr>`;
        return;
    }

    tbody.innerHTML = adminEvents.map(event => {
        const isHidden = event.hidden === true;
        const hasTranslation = !!event.title_ko;
        const volume = formatVolume(event.volume);
        const endDate = formatDate(event.end_date);

        return `
            <tr class="${isHidden ? 'row-hidden' : ''}">
                <td class="col-toggle" style="text-align:center;">
                    <label class="toggle-switch">
                        <input type="checkbox" ${!isHidden ? 'checked' : ''} onchange="toggleHidden('${event.id}', !this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td class="title-cell" title="${escapeHtml(event.title)}">${escapeHtml(event.title)}</td>
                <td class="title-ko-cell ${hasTranslation ? '' : 'empty'}" title="${escapeHtml(event.title_ko || '')}">
                    ${hasTranslation ? escapeHtml(event.title_ko) : '(미번역)'}
                </td>
                <td><span class="category-badge">${escapeHtml(event.category || '-')}</span></td>
                <td class="volume-cell">${volume}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${endDate}</td>
                <td style="text-align:center;">
                    <button class="btn-edit" onclick="openEditModal('${event.id}')">편집</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPagination() {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const el = document.getElementById('pagination');

    if (totalPages <= 1) {
        el.innerHTML = `<span class="page-info">${totalCount.toLocaleString()}개 시장</span>`;
        return;
    }

    let html = '';

    // Prev
    html += `<button class="page-btn" onclick="goToPage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>&laquo;</button>`;

    // Page numbers
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);

    if (start > 1) {
        html += `<button class="page-btn" onclick="goToPage(1)">1</button>`;
        if (start > 2) html += `<span class="page-info">...</span>`;
    }

    for (let i = start; i <= end; i++) {
        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (end < totalPages) {
        if (end < totalPages - 1) html += `<span class="page-info">...</span>`;
        html += `<button class="page-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // Next
    html += `<button class="page-btn" onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>&raquo;</button>`;

    html += `<span class="page-info">${totalCount.toLocaleString()}개 시장</span>`;

    el.innerHTML = html;
}

// ─── 액션 ───

async function toggleHidden(eventId, hidden) {
    try {
        const { error } = await supabaseClient
            .from('poly_events')
            .update({ hidden: hidden })
            .eq('id', eventId);

        if (error) throw error;

        // 로컬 상태 업데이트
        const event = adminEvents.find(e => e.id === eventId);
        if (event) event.hidden = hidden;
        renderTable();

        // 캘린더 캐시 무효화
        invalidateCalendarCache();

        showToast(hidden ? '시장이 숨김 처리되었습니다' : '시장이 노출되었습니다', 'success');
        loadStats();
    } catch (err) {
        showToast('오류: ' + err.message, 'error');
    }
}

function openEditModal(eventId) {
    const event = adminEvents.find(e => e.id === eventId);
    if (!event) return;

    editingEventId = eventId;

    document.getElementById('editTitleEn').textContent = event.title || '';
    document.getElementById('editTitleKo').value = event.title_ko || '';
    document.getElementById('editCategory').value = event.category || 'Uncategorized';
    document.getElementById('editDescription').textContent = event.description || '(설명 없음)';
    document.getElementById('editDescriptionKo').value = event.description_ko || '';

    // Polymarket 링크
    const linkEl = document.getElementById('editPolyLink');
    if (linkEl) {
        const slug = event.slug || '';
        if (slug) {
            linkEl.href = `https://polymarket.com/event/${slug}`;
            linkEl.style.display = 'inline';
        } else {
            linkEl.style.display = 'none';
        }
    }

    document.getElementById('editModalOverlay').classList.add('active');
}

function closeEditModal() {
    editingEventId = null;
    document.getElementById('editModalOverlay').classList.remove('active');
}

async function saveEdit() {
    if (!editingEventId) return;

    const saveBtn = document.getElementById('editSave');
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
        const updates = {
            title_ko: document.getElementById('editTitleKo').value.trim() || null,
            category: document.getElementById('editCategory').value,
            description_ko: document.getElementById('editDescriptionKo').value.trim() || null,
        };

        const { error } = await supabaseClient
            .from('poly_events')
            .update(updates)
            .eq('id', editingEventId);

        if (error) throw error;

        // 로컬 상태 업데이트
        const event = adminEvents.find(e => e.id === editingEventId);
        if (event) Object.assign(event, updates);

        renderTable();
        invalidateCalendarCache();
        closeEditModal();
        showToast('저장 완료', 'success');
        loadStats();
    } catch (err) {
        showToast('저장 실패: ' + err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
    }
}

// ─── 유틸리티 ───

function goToPage(page) {
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function formatVolume(vol) {
    const v = parseFloat(vol) || 0;
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const date = d.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'short',
        day: 'numeric',
    });
    const time = d.toLocaleTimeString('ko-KR', {
        timeZone: 'Asia/Seoul',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    return `${date} ${time}`;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `admin-toast ${type} show`;
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function invalidateCalendarCache() {
    try {
        localStorage.removeItem('polymarket_events_cache');
        localStorage.removeItem('polymarket_cache_time');
    } catch (e) {
        // 다른 origin에서는 접근 불가 — 무시
    }
    // 서버 캐시 버전 갱신 (다른 유저의 캐시 무효화)
    bumpCacheVersion();
}

async function bumpCacheVersion() {
    try {
        await supabaseClient
            .from('cache_meta')
            .update({ last_updated: new Date().toISOString() })
            .eq('id', 1);
    } catch (e) {
        console.warn('cache_meta 업데이트 실패:', e);
    }
}

// 전역 함수 노출 (onclick에서 사용)
window.toggleHidden = toggleHidden;
window.openEditModal = openEditModal;
window.goToPage = goToPage;
