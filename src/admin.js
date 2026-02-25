import { supabaseClient, allEvents, isAdminMode, v2EditingEventId, setIsAdminMode, setV2EditingEventId, setAllEvents } from './state.js';
import { CACHE_KEY, CACHE_TIME_KEY } from './constants.js';
import { adminSignIn, adminSignOut, getAdminSession, onAdminAuthStateChange } from './auth.js';
import { groupSimilarMarkets, extractTags, extractCategories, loadData } from './data.js';
import { renderCalendar } from './render/index.js';

// Admin 함수를 window에 등록 (render 모듈에서 호출하기 위해)
window.__v2OpenEditModal = v2OpenEditModal;
window.__v2ToggleHidden = v2ToggleHidden;

export async function initV2Admin() {
    if (!supabaseClient) return;

    const adminToggle = document.getElementById('adminToggle');
    if (!adminToggle) return;

    try {
        const session = await getAdminSession();
        if (session) v2EnterAdminMode();
    } catch (e) {
        // 무시
    }

    adminToggle.addEventListener('click', () => {
        if (isAdminMode) {
            v2ShowSignOutConfirm();
        } else {
            v2ShowLoginModal();
        }
    });

    const loginOverlay = document.getElementById('adminLoginOverlay');
    if (loginOverlay) {
        document.getElementById('adminLoginClose').addEventListener('click', v2CloseLoginModal);
        document.getElementById('v2LoginCancel').addEventListener('click', v2CloseLoginModal);
        loginOverlay.addEventListener('click', (e) => {
            if (e.target === loginOverlay) v2CloseLoginModal();
        });
        document.getElementById('v2LoginSubmit').addEventListener('click', v2HandleLogin);
        document.getElementById('v2AdminPassword').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') v2HandleLogin();
        });
    }

    const editOverlay = document.getElementById('v2EditOverlay');
    if (editOverlay) {
        document.getElementById('v2EditClose').addEventListener('click', v2CloseEditModal);
        document.getElementById('v2EditCancel').addEventListener('click', v2CloseEditModal);
        editOverlay.addEventListener('click', (e) => {
            if (e.target === editOverlay) v2CloseEditModal();
        });
        document.getElementById('v2EditSave').addEventListener('click', v2SaveEdit);
    }

    const signOutBtn = document.getElementById('v2SignOut');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', v2HandleSignOut);
    }

    onAdminAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') v2EnterAdminMode();
        if (event === 'SIGNED_OUT') v2ExitAdminMode();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('v2EditOverlay')?.classList.contains('active')) {
                v2CloseEditModal();
            } else if (document.getElementById('adminLoginOverlay')?.classList.contains('active')) {
                v2CloseLoginModal();
            }
        }
    });
}

function v2ShowLoginModal() {
    document.getElementById('adminLoginOverlay').classList.add('active');
    document.getElementById('v2AdminEmail').focus();
}

function v2CloseLoginModal() {
    document.getElementById('adminLoginOverlay').classList.remove('active');
    document.getElementById('v2LoginError').textContent = '';
    document.getElementById('v2AdminEmail').value = '';
    document.getElementById('v2AdminPassword').value = '';
}

async function v2HandleLogin() {
    const errorEl = document.getElementById('v2LoginError');
    errorEl.textContent = '';
    try {
        await adminSignIn(
            document.getElementById('v2AdminEmail').value,
            document.getElementById('v2AdminPassword').value
        );
        v2CloseLoginModal();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

async function v2EnterAdminMode() {
    setIsAdminMode(true);
    document.body.classList.add('admin-mode');
    document.getElementById('adminStatsBanner').style.display = 'block';
    await v2LoadStats();
    await v2ReloadWithHidden();
}

function v2ExitAdminMode() {
    setIsAdminMode(false);
    document.body.classList.remove('admin-mode');
    document.getElementById('adminStatsBanner').style.display = 'none';

    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_TIME_KEY);
    loadData().then(() => renderCalendar());
}

function v2ShowSignOutConfirm() {
    if (confirm('관리자 모드를 종료하시겠습니까?')) {
        v2HandleSignOut();
    }
}

async function v2HandleSignOut() {
    await adminSignOut();
}

async function v2LoadStats() {
    try {
        const now = new Date().toISOString();
        const [totalRes, translatedRes, hiddenRes] = await Promise.all([
            supabaseClient.from('poly_events')
                .select('id', { count: 'exact', head: true })
                .gte('end_date', now).eq('closed', false),
            supabaseClient.from('poly_events')
                .select('id', { count: 'exact', head: true })
                .gte('end_date', now).eq('closed', false)
                .not('title_ko', 'is', null),
            supabaseClient.from('poly_events')
                .select('id', { count: 'exact', head: true })
                .gte('end_date', now).eq('hidden', true),
        ]);
        const total = totalRes.count || 0;
        const translated = translatedRes.count || 0;
        const hidden = hiddenRes.count || 0;
        document.getElementById('v2StatInfo').textContent =
            `전체 ${total.toLocaleString()} | 번역 ${translated.toLocaleString()} | 미번역 ${(total - translated).toLocaleString()} | 숨김 ${hidden.toLocaleString()}`;
    } catch (e) {
        console.error('Admin stats error:', e);
    }
}

async function v2ReloadWithHidden() {
    if (!supabaseClient) return;
    try {
        const now = new Date().toISOString();
        const upcomingWeeks = new Date();
        upcomingWeeks.setDate(upcomingWeeks.getDate() + 5 + 21);
        const maxDate = upcomingWeeks.toISOString();

        let allData = [];
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const { data, error } = await supabaseClient
                .from('poly_events')
                .select('id, title, title_ko, slug, event_slug, end_date, volume, volume_24hr, probs, category, closed, image_url, tags, hidden, description, description_ko')
                .gte('end_date', now)
                .lte('end_date', maxDate)
                .gte('volume', 1000)
                .order('end_date', { ascending: true })
                .range(offset, offset + 999);

            if (error) throw error;
            if (data && data.length > 0) {
                allData = allData.concat(data);
                offset += 1000;
                hasMore = data.length === 1000;
            } else {
                hasMore = false;
            }
        }

        setAllEvents(groupSimilarMarkets(allData));
        extractTags();
        extractCategories();
        renderCalendar();
    } catch (e) {
        console.error('Admin reload error:', e);
    }
}

function v2OpenEditModal(eventId) {
    const event = allEvents.find(e => e.id === eventId);
    if (!event) return;

    setV2EditingEventId(eventId);
    document.getElementById('v2EditTitleEn').textContent = event.title || '';
    document.getElementById('v2EditTitleKo').value = event.title_ko || '';
    document.getElementById('v2EditCategory').value = event.category || 'Uncategorized';
    document.getElementById('v2EditDescription').textContent = event.description || '(설명 없음)';
    document.getElementById('v2EditDescriptionKo').value = event.description_ko || '';

    const linkEl = document.getElementById('v2EditPolyLink');
    if (linkEl) {
        const slug = event.event_slug || event.slug || '';
        if (slug) {
            linkEl.href = `https://polymarket.com/event/${slug}`;
            linkEl.style.display = 'inline-flex';
        } else {
            linkEl.style.display = 'none';
        }
    }

    document.getElementById('v2EditOverlay').classList.add('active');
}

function v2CloseEditModal() {
    setV2EditingEventId(null);
    document.getElementById('v2EditOverlay').classList.remove('active');
}

async function v2SaveEdit() {
    if (!v2EditingEventId) return;
    const saveBtn = document.getElementById('v2EditSave');
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
        const updates = {
            title_ko: document.getElementById('v2EditTitleKo').value.trim() || null,
            category: document.getElementById('v2EditCategory').value,
            description_ko: document.getElementById('v2EditDescriptionKo').value.trim() || null,
        };

        const { error } = await supabaseClient
            .from('poly_events')
            .update(updates)
            .eq('id', v2EditingEventId);

        if (error) throw error;

        const event = allEvents.find(e => e.id === v2EditingEventId);
        if (event) Object.assign(event, updates);

        renderCalendar();
        v2CloseEditModal();
        v2ShowToast('저장 완료', 'success');
        v2LoadStats();

        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
        bumpCacheVersion();
    } catch (err) {
        v2ShowToast('저장 실패: ' + err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
    }
}

async function v2ToggleHidden(eventId) {
    const event = allEvents.find(e => e.id === eventId);
    if (!event) return;

    const newHidden = !event.hidden;
    try {
        const { error } = await supabaseClient
            .from('poly_events')
            .update({ hidden: newHidden })
            .eq('id', eventId);

        if (error) throw error;

        event.hidden = newHidden;
        renderCalendar();
        v2ShowToast(newHidden ? '숨김 처리됨' : '노출됨', 'success');
        v2LoadStats();

        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
        bumpCacheVersion();
    } catch (err) {
        v2ShowToast('오류: ' + err.message, 'error');
    }
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

function v2ShowToast(message, type = 'success') {
    const toast = document.getElementById('v2Toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `v2-toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}
