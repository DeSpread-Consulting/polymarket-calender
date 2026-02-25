import { initSupabase } from './supabase.js';
import { initTheme, initDensity, toggleTheme, toggleDensity } from './theme.js';
import { initLanguage, translations, currentLang } from './i18n.js';
import { initQuickFilters, openFilterModal, closeFilterModal, setupFilterOptions, applyFilters, resetFilters, clearAllFilters, renderFilterTags, updateActiveFiltersDisplay } from './filters.js';
import { loadData, loadMoreData } from './data.js';
import { renderCalendar } from './render/index.js';
import { initTooltip } from './render/tooltip.js';
import { closeModal } from './render/modal.js';
import { initV2Admin } from './admin.js';
import { calendarOverviewStartWeek, setCalendarOverviewStartWeek, setCurrentDate, allEvents } from './state.js';
import { getKSTToday, addDays, toKSTDateString } from './utils.js';

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
    updateActiveFiltersDisplay();
    renderCalendar();

    initV2Admin();
});

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
            setCalendarOverviewStartWeek(calendarOverviewStartWeek - 1);
            renderCalendar();
        }
    });

    document.getElementById('nextWeek').addEventListener('click', async () => {
        setCalendarOverviewStartWeek(calendarOverviewStartWeek + 1);

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
                setCurrentDate(new Date());
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
        const t = translations[currentLang];
        btn.textContent = tagsContainer.classList.contains('collapsed') ? t.showMore : t.showLess;
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

function handleRefresh() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.classList.add('rotating');

    const searchQuery = document.getElementById('searchInput').value;
    renderCalendar(searchQuery);

    setTimeout(() => {
        if (refreshBtn) refreshBtn.classList.remove('rotating');
    }, 500);
}
