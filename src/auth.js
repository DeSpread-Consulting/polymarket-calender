import { supabaseClient } from './state.js';

export async function adminSignIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (error) throw error;
    return data;
}

export async function adminSignOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
}

export async function getAdminSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
}

export function onAdminAuthStateChange(callback) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}
