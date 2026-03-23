// js/profile.js — Profile modal, avatar, password change, banner

import { state, emit } from './state.js';
import { auth, saveProfileToCloud, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from './firebase.js';
import { openModal, closeModal } from './ui.js';

// ── DOM refs ──
let profileModal, profileModalContent, profileNameInput, profileImageInput;
let profileAvatarPreview, profileAvatarPreviewText;
let greetingName, userProfileInitial, userProfileHeaderDisplay, userProfileBtn;

let tempProfileImage = null;

const ANIME_BACKGROUNDS = [
    'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219540/wall_-_2_siefa6.jpg',
    'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219538/wall_-_1_b4jgab.jpg',
    'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219537/wall_-_5_fy8da6.jpg',
    'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219536/wall_-_4_qflqyz.jpg',
    'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219535/wall_-_3_gdt9ub.jpg',
];

let lastBannerIdx = -1;

// ── Public API ──

export function updateProfileUI() {
    const firstName = state.userProfile.name.split(' ')[0] || 'User';
    greetingName.textContent = firstName;
    if (state.userProfile.avatar) {
        userProfileHeaderDisplay.style.backgroundImage = `url('${state.userProfile.avatar}')`;
        userProfileInitial.style.display = 'none';
    } else {
        userProfileHeaderDisplay.style.backgroundImage = 'none';
        userProfileInitial.style.display = 'block';
        userProfileInitial.textContent = state.userProfile.name.charAt(0).toUpperCase();
    }
}

function updateProfilePreview() {
    if (tempProfileImage) {
        profileAvatarPreview.style.backgroundImage = `url('${tempProfileImage}')`;
        profileAvatarPreviewText.style.display = 'none';
    } else {
        profileAvatarPreview.style.backgroundImage = 'none';
        profileAvatarPreviewText.style.display = 'block';
        profileAvatarPreviewText.textContent = (profileNameInput.value || 'U').charAt(0).toUpperCase();
    }
}

function setRandomProfileBanner() {
    const banner = document.querySelector('.profile-banner-anim');
    if (!banner) return;
    let idx;
    do { idx = Math.floor(Math.random() * ANIME_BACKGROUNDS.length); } while (idx === lastBannerIdx && ANIME_BACKGROUNDS.length > 1);
    lastBannerIdx = idx;
    const url = ANIME_BACKGROUNDS[idx];
    if (url && !url.includes('PASTE_IMAGE')) {
        banner.style.backgroundImage = `url('${url}')`;
        banner.style.backgroundSize = 'cover';
        banner.style.backgroundPosition = 'center';
        banner.style.animation = 'none';
    }
}

// ── Init ──
export function initProfile() {
    profileModal = document.getElementById('profile-modal');
    profileModalContent = document.getElementById('profile-modal-content');
    profileNameInput = document.getElementById('profile-name-input');
    profileImageInput = document.getElementById('profile-image-input');
    profileAvatarPreview = document.getElementById('profile-avatar-preview');
    profileAvatarPreviewText = document.getElementById('profile-avatar-preview-text');
    greetingName = document.getElementById('greeting-name');
    userProfileInitial = document.getElementById('user-profile-initial');
    userProfileHeaderDisplay = document.getElementById('user-profile-header-display');
    userProfileBtn = document.getElementById('user-profile-btn');

    // Preload anime backgrounds
    ANIME_BACKGROUNDS.forEach(url => {
        if (url && !url.includes('PASTE_IMAGE')) { const img = new Image(); img.src = url; }
    });

    userProfileBtn.addEventListener('click', () => {
        profileNameInput.value = state.userProfile.name;
        tempProfileImage = state.userProfile.avatar;
        const emailEl = document.getElementById('profile-email-display');
        if (emailEl && state.currentUser) emailEl.textContent = state.currentUser.email || '';
        const namePreview = document.getElementById('profile-display-name-preview');
        if (namePreview) namePreview.textContent = state.userProfile.name || 'User';
        setRandomProfileBanner();
        updateProfilePreview();
        openModal(profileModal, profileModalContent);
    });

    document.getElementById('close-profile-btn').addEventListener('click', () => closeModal(profileModal, profileModalContent));
    document.getElementById('cancel-profile-btn').addEventListener('click', () => closeModal(profileModal, profileModalContent));
    profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeModal(profileModal, profileModalContent); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !profileModal.classList.contains('hidden')) closeModal(profileModal, profileModalContent);
    });

    // Password accordion
    document.getElementById('toggle-password-section')?.addEventListener('click', () => {
        const section = document.getElementById('password-section');
        const chevron = document.getElementById('pw-chevron');
        const isHidden = section.classList.contains('hidden');
        section.classList.toggle('hidden', !isHidden);
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        if (isHidden) {
            ['current-password-input', 'new-password-input', 'confirm-password-input'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
            const statusEl = document.getElementById('password-status');
            if (statusEl) { statusEl.classList.add('hidden'); statusEl.textContent = ''; }
        }
    });

    // Change password
    document.getElementById('update-password-btn')?.addEventListener('click', async () => {
        const currentPw = document.getElementById('current-password-input')?.value;
        const newPw = document.getElementById('new-password-input')?.value;
        const confirmPw = document.getElementById('confirm-password-input')?.value;
        const statusEl = document.getElementById('password-status');
        const btn = document.getElementById('update-password-btn');

        function showStatus(msg, isError) {
            statusEl.textContent = msg;
            statusEl.className = `text-xs ${isError ? 'text-red-400' : 'text-green-400'}`;
            statusEl.classList.remove('hidden');
        }

        if (!currentPw || !newPw || !confirmPw) return showStatus('Please fill in all fields.', true);
        if (newPw.length < 6) return showStatus('New password must be at least 6 characters.', true);
        if (newPw !== confirmPw) return showStatus('New passwords do not match.', true);
        if (newPw === currentPw) return showStatus('New password must be different from current.', true);

        btn.textContent = 'Updating...';
        btn.disabled = true;
        try {
            const credential = EmailAuthProvider.credential(state.currentUser.email, currentPw);
            await reauthenticateWithCredential(state.currentUser, credential);
            await updatePassword(state.currentUser, newPw);
            showStatus('✓ Password updated successfully!', false);
            ['current-password-input', 'new-password-input', 'confirm-password-input'].forEach(id => {
                const el = document.getElementById(id); if (el) el.value = '';
            });
        } catch (err) {
            const msg = err.code === 'auth/wrong-password' ? 'Current password is incorrect.'
                : err.code === 'auth/too-many-requests' ? 'Too many attempts. Try again later.'
                    : 'Failed to update password. Try again.';
            showStatus(msg, true);
        } finally {
            btn.textContent = 'Update Password';
            btn.disabled = false;
        }
    });

    // Avatar file picker
    profileImageInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) { tempProfileImage = event.target.result; updateProfilePreview(); };
            reader.readAsDataURL(file);
        }
    });

    profileNameInput.addEventListener('input', updateProfilePreview);

    // Save profile
    document.getElementById('save-profile-btn').addEventListener('click', () => {
        state.userProfile.name = profileNameInput.value.trim() || 'User';
        state.userProfile.avatar = tempProfileImage;
        saveProfileToCloud(state.userProfile);
        updateProfileUI();
        emit('renderChatHistory');
        closeModal(profileModal, profileModalContent);
    });
}
