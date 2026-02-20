/**
 * Admin Authentication Module
 * V1(admin/), V2(index.html) 공용 인증 모듈
 * Supabase Auth 기반 이메일/비밀번호 로그인
 */

async function adminSignIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (error) throw error;
    return data;
}

async function adminSignOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
}

async function getAdminSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
}

function onAdminAuthStateChange(callback) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}
