// js/app.js — Entry point orchestrator
// All business logic lives in the individual modules.
// This file imports them, wires up DOMContentLoaded, sidebar, swipe, and global click delegation.

import { state, DEFAULT_PERSONAS, on, emit } from './state.js';
import { initMarked } from './utils.js';
import { copyToClipboard } from './utils.js';
import { initUI, openModal, closeModal, uiConfirm, handleInput, scrollToBottom, setSendButtonState, renderImagePreviews, getIsKeyboardOpen, getChatInput, getChatInner } from './ui.js';
import { initAuth, resetAuthUI, doSignOut } from './auth.js';
import { initPersonas, getActivePersona, updatePersonaUI, updateHeaderTitle, handleEditPersona, handleDeletePersona } from './persona.js';
import { initProfile, updateProfileUI } from './profile.js';
import { initChat, initCloudData, renderChatHistory, renderHistorySidebar, startMessageFlow, cancelGeneration, cancelEditMode, renameChat, deleteChat, regenerateMessage, getActiveChat, saveHistory } from './chat.js';
import { savePersonasToCloud, deleteChatFromCloud } from './firebase.js';

document.addEventListener('DOMContentLoaded', () => {

    // ── 1. Configure marked.js renderer ──
    initMarked();

    // ── 2. Init all modules (grabs DOM refs, sets up internal listeners) ──
    initUI();
    initPersonas();
    initProfile();
    initAuth();
    initChat();

    // ── 3. Wire up event bus callbacks ──
    on('authLogin', () => initCloudData());

    on('logout', () => {
        uiConfirm("Sign Out", "Are you sure you want to sign out?", "Sign Out", "bg-red-600 hover:bg-red-500", async () => {
            await doSignOut();
            state.chats = [];
            state.currentChatId = null;
            state.userProfile = { name: 'User', avatar: null };
            state.appPersonas = [...DEFAULT_PERSONAS];
            state.activePersonaId = 'nova_default';
            resetAuthUI();
            updatePersonaUI();
            renderHistorySidebar();
            renderChatHistory();
            updateProfileUI();
            const profileModal = document.getElementById('profile-modal');
            const profileModalContent = document.getElementById('profile-modal-content');
            closeModal(profileModal, profileModalContent);
        });
    });

    // ── 4. Settings Modal ──
    const settingsModal = document.getElementById('settings-modal');
    const settingsModalContent = document.getElementById('settings-modal-content');
    const settingsBtn = document.getElementById('settings-btn');
    const apiTextModelInput = document.getElementById('api-text-model-input');
    const apiVisionModelInput = document.getElementById('api-vision-model-input');
    const systemPromptInput = document.getElementById('system-prompt-input');

    apiTextModelInput.value = state.OR_TEXT_MODEL;
    apiVisionModelInput.value = state.OR_VISION_MODEL;

    settingsBtn.addEventListener('click', () => openModal(settingsModal, settingsModalContent));
    document.getElementById('close-settings-btn').addEventListener('click', () => closeModal(settingsModal, settingsModalContent));
    document.getElementById('cancel-settings-btn').addEventListener('click', () => closeModal(settingsModal, settingsModalContent));
    document.getElementById('save-settings-btn').addEventListener('click', () => {
        state.OR_TEXT_MODEL = apiTextModelInput.value.trim() || 'x-ai/grok-4-fast';
        state.OR_VISION_MODEL = apiVisionModelInput.value.trim() || 'x-ai/grok-4-fast';
        const active = getActivePersona();
        active.prompt = systemPromptInput.value.trim() || '';
        localStorage.setItem('or_text_model', state.OR_TEXT_MODEL);
        localStorage.setItem('or_vision_model', state.OR_VISION_MODEL);
        savePersonasToCloud(state.appPersonas, state.activePersonaId);
        closeModal(settingsModal, settingsModalContent);
    });

    // ── 5. New Chat / Clear History ──
    const sidebar = document.getElementById('sidebar');

    document.getElementById('new-chat-btn').addEventListener('click', () => {
        cancelEditMode(true);
        if (state.isGenerating) cancelGeneration();
        state.currentChatId = null;
        renderChatHistory();
        renderHistorySidebar();
        if (window.innerWidth < 768) {
            sidebar.classList.remove('show');
            const backdrop = document.getElementById('sidebar-backdrop');
            if (backdrop) backdrop.classList.remove('show');
        }
    });

    document.getElementById('clear-history-btn').addEventListener('click', () => {
        uiConfirm("Clear History", "Are you sure you want to permanently delete all chats?", "Clear All", "bg-red-600 hover:bg-red-500", () => {
            if (state.isGenerating) cancelGeneration();
            state.chats.forEach(chat => deleteChatFromCloud(chat.id));
            state.chats = [];
            state.currentChatId = null;
            saveHistory();
            renderChatHistory();
        });
    });

    // ── 6. Header Chat Options Dropdown ──
    const currentChatMenuBtn = document.getElementById('current-chat-menu-btn');
    const currentChatDropdown = document.getElementById('current-chat-dropdown');
    const headerRenameChatBtn = document.getElementById('header-rename-chat-btn');
    const headerDeleteChatBtn = document.getElementById('header-delete-chat-btn');

    currentChatMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); currentChatDropdown.classList.toggle('hidden'); });
    headerRenameChatBtn.addEventListener('click', (e) => { e.stopPropagation(); currentChatDropdown.classList.add('hidden'); if (state.currentChatId) renameChat(state.currentChatId); });
    headerDeleteChatBtn.addEventListener('click', (e) => { e.stopPropagation(); currentChatDropdown.classList.add('hidden'); if (state.currentChatId) deleteChat(state.currentChatId); });

    // ── 7. Cancel Edit Mode Button ──
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => cancelEditMode(true));

    // ── 8. Responsive Sidebar Toggle ──
    const headerMenuBtn = document.getElementById('header-menu-btn');
    const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');

    function toggleSidebar() {
        const backdrop = document.getElementById('sidebar-backdrop');
        if (window.innerWidth < 768) {
            const isShowing = sidebar.classList.toggle('show');
            if (isShowing) {
                sidebar.classList.add('absolute', 'z-50', 'shadow-2xl', 'bg-[#1e1f20]');
                if (backdrop) backdrop.classList.add('show');
            } else {
                if (backdrop) backdrop.classList.remove('show');
            }
        } else {
            sidebar.classList.toggle('collapsed');
            sidebar.classList.remove('absolute', 'z-50', 'shadow-2xl');
        }
    }
    headerMenuBtn.addEventListener('click', toggleSidebar);
    if (sidebarCollapseBtn) sidebarCollapseBtn.addEventListener('click', toggleSidebar);

    // ── 9. Mobile Swipe-to-open Sidebar ──
    let touchStartX = 0, touchEndX = 0, touchStartY = 0, touchEndY = 0, isEdgeSwipe = false;
    const swipeBackdrop = document.getElementById('sidebar-backdrop');

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isEdgeSwipe = touchStartX < 40;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        if (Math.abs(diffY) > 15 && Math.abs(diffY) > Math.abs(diffX)) return;
        if (window.innerWidth < 768) {
            if (diffX > 40 && isEdgeSwipe) {
                if (getIsKeyboardOpen()) getChatInput().blur();
                sidebar.classList.add('show');
                if (swipeBackdrop) swipeBackdrop.classList.add('show');
            }
            if (diffX < -40) {
                sidebar.classList.remove('show');
                if (swipeBackdrop) swipeBackdrop.classList.remove('show');
            }
        }
    }, { passive: true });

    // Close sidebar when clicking outside (mobile)
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 768 && !sidebar.contains(e.target) && !headerMenuBtn.contains(e.target)) {
            sidebar.classList.remove('show');
            const backdrop = document.getElementById('sidebar-backdrop');
            if (backdrop) backdrop.classList.remove('show');
        }
    });

    // ── 10. Mobile Long-Press Logic ──
    const chatInner = getChatInner();
    let longPressTimer, isLongPress = false, lpTouchStartX = 0, lpTouchStartY = 0;

    chatInner.addEventListener('touchstart', (e) => {
        const msgContainer = e.target.closest('.msg-container');
        if (!msgContainer || !msgContainer.querySelector('.msg-options')) return;
        isLongPress = false;
        lpTouchStartX = e.touches[0].clientX;
        lpTouchStartY = e.touches[0].clientY;
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            if (navigator.vibrate) navigator.vibrate(40);
            document.querySelectorAll('.msg-container.active-options').forEach(el => el.classList.remove('active-options'));
            msgContainer.classList.add('active-options');
        }, 500);
    }, { passive: true });

    chatInner.addEventListener('touchmove', (e) => {
        if (!longPressTimer) return;
        if (Math.abs(e.touches[0].clientX - lpTouchStartX) > 10 || Math.abs(e.touches[0].clientY - lpTouchStartY) > 10) {
            clearTimeout(longPressTimer); longPressTimer = null;
        }
    }, { passive: true });

    chatInner.addEventListener('touchend', () => { if (longPressTimer) clearTimeout(longPressTimer); });
    chatInner.addEventListener('touchcancel', () => { if (longPressTimer) clearTimeout(longPressTimer); });

    document.addEventListener('selectionchange', () => {
        if (longPressTimer && window.getSelection().toString().length > 0) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
    document.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.msg-options') && !isLongPress) {
            document.querySelectorAll('.msg-container.active-options').forEach(el => el.classList.remove('active-options'));
        }
    }, { passive: true });

    // ── 11. Global Click Delegation ──
    const personaMenu = document.getElementById('persona-dropdown-menu');
    const personaChevron = document.getElementById('header-persona-chevron');

    document.addEventListener('click', async (e) => {
        if (!e || !e.target) return;

        // Close header chat dropdown
        if (!e.target.closest('#current-chat-options-container') && currentChatDropdown && !currentChatDropdown.classList.contains('hidden')) {
            currentChatDropdown.classList.add('hidden');
        }

        if (e.target.closest('#sidebar') && !e.target.closest('.chat-history-item') && !e.target.closest('.chat-options-btn') && !e.target.closest('.rename-chat-btn') && !e.target.closest('.delete-chat-btn')) return;
        if (e.target.closest('#header-menu-btn')) return;

        const copyBtn = e.target.closest('.copy-block-btn') || e.target.closest('.copy-msg-btn') || e.target.closest('.copy-user-msg-btn');
        const copyCodeBtn = e.target.closest('.copy-code-btn');
        const downloadBtn = e.target.closest('.download-msg-btn');
        const regenBtn = e.target.closest('.regen-btn');
        const editMsgBtn = e.target.closest('.edit-msg-btn');
        const chatOptionsBtn = e.target.closest('.chat-options-btn');
        const renameChatBtn = e.target.closest('.rename-chat-btn');
        const deleteChatBtn = e.target.closest('.delete-chat-btn');
        const chatHistoryItem = e.target.closest('.chat-history-item');
        const editPersonaBtn = e.target.closest('.edit-persona-btn');
        const deletePersonaBtn = e.target.closest('.delete-persona-btn');

        // Close persona menu
        if (!e.target.closest('#persona-dropdown-container') && personaMenu && !personaMenu.classList.contains('hidden')) {
            personaMenu.classList.add('hidden');
            personaChevron.style.transform = 'rotate(0deg)';
        }

        if (!chatOptionsBtn) document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.add('hidden'));

        if (copyCodeBtn) {
            const rawCode = decodeURIComponent(copyCodeBtn.getAttribute('data-code') || '');
            copyToClipboard(rawCode, copyCodeBtn, "Code copied!");
            return;
        }

        if (copyBtn) {
            const msgContainer = copyBtn.closest('.msg-container');
            const imgElement = msgContainer ? msgContainer.querySelector('img[src^="data:image"]') : null;
            if (imgElement) {
                try {
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<span class="text-xs font-bold text-blue-400">Copying...</span>`;
                    const res = await fetch(imgElement.src);
                    const blob = await res.blob();
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                    copyBtn.innerHTML = `<span class="text-xs font-bold text-green-400">Image Copied!</span>`;
                    setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
                } catch (err) {
                    const text = decodeURIComponent(copyBtn.getAttribute('data-text') || '');
                    await copyToClipboard(text, copyBtn);
                }
            } else {
                const text = decodeURIComponent(copyBtn.getAttribute('data-text') || '');
                await copyToClipboard(text, copyBtn);
            }
        } else if (downloadBtn) {
            const msgContainer = downloadBtn.closest('.msg-container');
            const imgElement = msgContainer ? msgContainer.querySelector('img:not(.avatar-glow-wrapper img)') : null;
            if (imgElement) {
                const originalHTML = downloadBtn.innerHTML;
                downloadBtn.innerHTML = `<span class="text-xs font-bold text-green-400">Downloading...</span>`;
                try {
                    const res = await fetch(imgElement.src);
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const ext = blob.type.split('/')[1] || 'png';
                    const a = document.createElement('a');
                    a.href = blobUrl; a.download = `Nova_Image_${Date.now()}.${ext}`;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                    downloadBtn.innerHTML = `<span class="text-xs font-bold text-green-400">Done!</span>`;
                } catch (err) {
                    window.open(imgElement.src, '_blank');
                    downloadBtn.innerHTML = `<span class="text-xs font-bold text-yellow-400">Opened!</span>`;
                }
                setTimeout(() => downloadBtn.innerHTML = originalHTML, 2000);
            }
        } else if (regenBtn) {
            regenerateMessage(parseInt(regenBtn.dataset.index));
        } else if (editMsgBtn) {
            if (state.isGenerating) return;
            const idx = parseInt(editMsgBtn.dataset.index);
            const activeChat = getActiveChat();
            if (!activeChat) return;
            const msgToEdit = activeChat.messages[idx];
            if (msgToEdit && msgToEdit.role === 'user') {
                if (state.isEditingMode) activeChat.messages = state.chatSnapshotBeforeEdit;
                state.isEditingMode = true;
                state.chatSnapshotBeforeEdit = JSON.parse(JSON.stringify(activeChat.messages));
                const chatInput = getChatInput();
                chatInput.value = msgToEdit.content || '';
                state.currentSelectedImages = [...(msgToEdit.images || [])];
                renderImagePreviews();
                activeChat.messages = activeChat.messages.slice(0, idx);
                const banner = document.getElementById('edit-mode-banner');
                if (banner) { banner.classList.remove('hidden'); banner.classList.add('flex'); }
                renderChatHistory();
                handleInput();
                chatInput.focus();
            }
        } else if (editPersonaBtn) {
            e.stopPropagation();
            handleEditPersona(editPersonaBtn.dataset.id);
        } else if (deletePersonaBtn) {
            e.stopPropagation();
            handleDeletePersona(deletePersonaBtn.dataset.id);
        } else if (chatOptionsBtn) {
            e.stopPropagation();
            const id = chatOptionsBtn.dataset.id;
            const dropdown = document.getElementById(`dropdown-${id}`);
            if (dropdown) {
                document.querySelectorAll('.chat-dropdown').forEach(d => { if (d.id !== `dropdown-${id}`) d.classList.add('hidden'); });
                dropdown.classList.toggle('hidden');
            }
        } else if (renameChatBtn) {
            e.stopPropagation();
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.add('hidden'));
            renameChat(renameChatBtn.dataset.id);
        } else if (deleteChatBtn) {
            e.stopPropagation();
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.add('hidden'));
            deleteChat(deleteChatBtn.dataset.id);
        } else if (chatHistoryItem) {
            cancelEditMode(true);
            const targetId = chatHistoryItem.getAttribute('data-id');
            if (targetId === state.currentChatId) return;
            if (state.isGenerating) cancelGeneration();
            state.currentChatId = targetId;
            renderChatHistory();
            renderHistorySidebar();
            if (window.innerWidth < 768) {
                sidebar.classList.remove('show');
                const backdrop = document.getElementById('sidebar-backdrop');
                if (backdrop) backdrop.classList.remove('show');
            }
        }
    });

});