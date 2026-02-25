// ─── 중앙 상태 관리 ───

export let supabaseClient = null;
export let allEvents = [];
export let currentDate = new Date();
export let calendarOverviewStartWeek = 0;
export let isLoadingMore = false;

export let filters = {
    tags: [],
    excludedCategories: ['Sports'],
    timeRemaining: 'all',
    minVolume: 1000,
    minLiquidity: 0
};

export let tempFilters = { ...filters };

export let allTags = {};
export let allCategories = {};

export let tooltipElement = null;
export let tooltipTimeout = null;

export let isAdminMode = false;
export let v2EditingEventId = null;

// ─── Setters ───

export function setSupabaseClient(client) { supabaseClient = client; }
export function setAllEvents(events) { allEvents = events; }
export function setCurrentDate(date) { currentDate = date; }
export function setCalendarOverviewStartWeek(week) { calendarOverviewStartWeek = week; }
export function setIsLoadingMore(loading) { isLoadingMore = loading; }
export function setFilters(f) { filters = f; }
export function setTempFilters(f) { tempFilters = f; }
export function setAllTags(tags) { allTags = tags; }
export function setAllCategories(cats) { allCategories = cats; }
export function setTooltipElement(el) { tooltipElement = el; }
export function setTooltipTimeout(t) { tooltipTimeout = t; }
export function setIsAdminMode(mode) { isAdminMode = mode; }
export function setV2EditingEventId(id) { v2EditingEventId = id; }
