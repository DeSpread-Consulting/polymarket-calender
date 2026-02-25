import { initSupabase } from './supabase.ts';
import { initTheme, initDensity, toggleTheme, toggleDensity } from './theme.ts';
import { initLanguage, translations, currentLang } from './i18n.ts';
import { initQuickFilters, openFilterModal, closeFilterModal, setupFilterOptions, applyFilters, resetFilters, clearAllFilters, renderFilterTags, updateActiveFiltersDisplay } from './filters.ts';
import { loadData, loadMoreData } from './data.ts';
import { renderCalendar } from './render/index.ts';
import { initTooltip } from './render/tooltip.ts';
import { closeModal } from './render/modal.ts';
import { initV2Admin } from './admin.ts';
import { calendarOverviewStartWeek, setCalendarOverviewStartWeek, setCurrentDate, allEvents } from './state.ts';
import { getKSTToday, addDays, toKSTDateString } from './utils.ts';
import type { Filters } from './types.ts';

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

function setupEventListeners(): void {
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
    document.getElementById('prevWeek')!.addEventListener('click', () => {
        if (calendarOverviewStartWeek > 0) {
            setCalendarOverviewStartWeek(calendarOverviewStartWeek - 1);
            renderCalendar();
        }
    });

    document.getElementById('nextWeek')!.addEventListener('click', async () => {
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
            if ((e.target as HTMLElement).dataset.view === 'today') {
                setCurrentDate(new Date());
                renderCalendar();
            }
        });
    });

    // Search
    (document.getElementById('searchInput') as HTMLInputElement).addEventListener('input', (e) => {
        renderCalendar((e.target as HTMLInputElement).value);
    });

    // Filter row click -> open filter modal
    document.getElementById('filtersRow')!.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('#clearFilters') || (e.target as HTMLElement).closest('.remove-tag')) {
            return;
        }
        openFilterModal();
    });

    // Filter modal events
    document.getElementById('filterModalClose')!.addEventListener('click', closeFilterModal);
    document.getElementById('filterModalOverlay')!.addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeFilterModal();
    });

    // Filter options
    setupFilterOptions('timeRemainingOptions', 'timeRemaining' as keyof Filters);
    setupFilterOptions('minVolumeOptions', 'minVolume' as keyof Filters);
    setupFilterOptions('minLiquidityOptions', 'minLiquidity' as keyof Filters);

    // Tag search
    (document.getElementById('tagSearchInput') as HTMLInputElement).addEventListener('input', (e) => {
        renderFilterTags((e.target as HTMLInputElement).value);
    });

    // Show less tags toggle
    document.getElementById('showLessTags')!.addEventListener('click', (e) => {
        e.stopPropagation();
        const tagsContainer = document.getElementById('filterTags')!;
        tagsContainer.classList.toggle('collapsed');
        const btn = document.getElementById('showLessTags')!;
        const t = translations[currentLang];
        btn.textContent = tagsContainer.classList.contains('collapsed') ? t.showMore : t.showLess;
    });

    // Apply/Reset filters
    document.getElementById('applyFilters')!.addEventListener('click', applyFilters);
    document.getElementById('resetFilters')!.addEventListener('click', resetFilters);
    document.getElementById('clearFilters')!.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAllFilters();
    });

    // Event modal
    document.getElementById('modalClose')!.addEventListener('click', closeModal);
    document.getElementById('modalOverlay')!.addEventListener('click', (e) => {
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

function handleRefresh(): void {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.classList.add('rotating');

    const searchQuery = (document.getElementById('searchInput') as HTMLInputElement).value;
    renderCalendar(searchQuery);

    setTimeout(() => {
        if (refreshBtn) refreshBtn.classList.remove('rotating');
    }, 500);
}
