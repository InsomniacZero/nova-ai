// js/auth.js — Authentication overlay, sign in/up/out, auth state listener

import { state, DEFAULT_PERSONAS, emit } from './state.js';
import {
    auth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    onAuthStateChanged, signOut, setPersistence,
    browserLocalPersistence, browserSessionPersistence
} from './firebase.js';

// ── DOM refs ──
let authOverlay, emailSigninBtn, emailSignupBtn, authEmail, authPassword, authErrorMsg, logoutBtn;

function showAuthError(message) {
    authErrorMsg.textContent = message;
    authErrorMsg.classList.remove('hidden');
}

// ── Init (called from app.js DOMContentLoaded) ──
export function initAuth() {
    authOverlay = document.getElementById('auth-overlay');
    emailSigninBtn = document.getElementById('email-signin-btn');
    emailSignupBtn = document.getElementById('email-signup-btn');
    authEmail = document.getElementById('auth-email');
    authPassword = document.getElementById('auth-password');
    authErrorMsg = document.getElementById('auth-error-msg');
    logoutBtn = document.getElementById('logout-btn');

    const rememberMeCheckbox = document.getElementById('remember-me-checkbox');

    // Sign In
    if (emailSigninBtn) {
        emailSigninBtn.addEventListener('click', async () => {
            const email = authEmail.value.trim();
            const password = authPassword.value.trim();
            if (!email || !password) return showAuthError("Please enter email and password.");
            try {
                emailSigninBtn.textContent = "Signing in...";
                const persistenceType = rememberMeCheckbox.checked ? browserLocalPersistence : browserSessionPersistence;
                await setPersistence(auth, persistenceType);
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Login failed:", error);
                emailSigninBtn.textContent = "Sign In";
                showAuthError("Invalid email or password.");
            }
        });
    }

    // Sign Up
    if (emailSignupBtn) {
        emailSignupBtn.addEventListener('click', async () => {
            const email = authEmail.value.trim();
            const password = authPassword.value.trim();
            if (!email || !password) return showAuthError("Please enter email and password.");
            if (password.length < 6) return showAuthError("Password must be at least 6 characters.");
            try {
                emailSignupBtn.textContent = "Creating...";
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error("Signup failed:", error);
                emailSignupBtn.textContent = "Create Account";
                if (error.code === 'auth/email-already-in-use') showAuthError("Email already in use. Try signing in.");
                else showAuthError("Failed to create account.");
            }
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // uiConfirm is emitted so app.js can handle it
            emit('logout');
        });
    }

    // Auth state listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.currentUser = user;
            if (authOverlay) {
                authOverlay.classList.add('opacity-0');
                setTimeout(() => {
                    authOverlay.classList.add('hidden');
                    authOverlay.classList.remove('flex');
                }, 500);
            }
            emit('authLogin');
        } else {
            state.currentUser = null;
            if (authOverlay) {
                authOverlay.classList.remove('hidden');
                authOverlay.classList.add('flex');
                setTimeout(() => authOverlay.classList.remove('opacity-0'), 10);
            }
        }
    });
}

// ── Called by app.js to reset auth UI after logout ──
export function resetAuthUI() {
    const email = document.getElementById('auth-email');
    const password = document.getElementById('auth-password');
    const errMsg = document.getElementById('auth-error-msg');
    const signinBtn = document.getElementById('email-signin-btn');
    const signupBtn = document.getElementById('email-signup-btn');
    if (email) email.value = '';
    if (password) password.value = '';
    if (errMsg) errMsg.classList.add('hidden');
    if (signinBtn) signinBtn.textContent = "Sign In";
    if (signupBtn) signupBtn.textContent = "Create Account";
}

export function doSignOut() {
    return signOut(auth);
}
