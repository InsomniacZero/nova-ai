// js/ui.js — Modal helpers, lightbox, scroll button, image previews, input handling

import { state, emit } from './state.js';
import { showToast } from './utils.js';

// ── DOM refs (set in init) ──
let chatInput, sendBtn, iconSend, iconStop, chatContainer, chatInner;
let imagePreviewContainer, imagePreviewList;
let chatImageInput, chatFileInput, uploadImageBtn, uploadFileBtn;
let headerModelDisplay, scrollToBottomBtn;
let confirmModal, confirmModalContent, renameModal, renameModalContent, renameChatInput;

let activeConfirmAction = null;
let activeRenameAction = null;
let isKeyboardOpen = false;

// ── Public API ──

export function openModal(modal, content) {
    if (!modal || !content) return;
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

export function closeModal(modal, content) {
    if (!modal || !content) return;
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 200);
}

export function uiConfirm(title, message, btnText, btnClass, actionCallback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const actionBtn = document.getElementById('action-confirm-btn');
    actionBtn.textContent = btnText;
    actionBtn.className = `px-4 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white transition-colors ${btnClass}`;
    activeConfirmAction = actionCallback;
    openModal(confirmModal, confirmModalContent);
}

export function uiPrompt(currentName, actionCallback) {
    renameChatInput.value = currentName;
    activeRenameAction = actionCallback;
    openModal(renameModal, renameModalContent);
    setTimeout(() => renameChatInput.focus(), 100);
}

export function setSendButtonState(s) {
    if (s === 'disabled') {
        sendBtn.className = 'p-2 bg-gray-200 dark:bg-[#333537] text-gray-600 dark:text-gray-400 rounded-full transition-all duration-200 cursor-not-allowed flex items-center justify-center w-10 h-10';
        sendBtn.setAttribute('disabled', 'true');
        iconSend.classList.remove('hidden'); iconStop.classList.add('hidden');
    } else if (s === 'ready') {
        sendBtn.className = 'p-2 bg-gray-800 dark:bg-white text-white dark:text-black hover:bg-gray-700 dark:hover:bg-gray-100 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center w-10 h-10';
        sendBtn.removeAttribute('disabled');
        iconSend.classList.remove('hidden'); iconStop.classList.add('hidden');
    } else if (s === 'generating') {
        sendBtn.className = 'p-2 bg-gray-200 dark:bg-[#333537] text-gray-900 dark:text-white hover:bg-[#444749] rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center w-10 h-10';
        sendBtn.removeAttribute('disabled');
        iconSend.classList.add('hidden'); iconStop.classList.remove('hidden');
    }
}

export function updateModelBadge() {
    if (headerModelDisplay && !state.isGenerating) {
        headerModelDisplay.textContent = state.currentSelectedImages.length > 0 ? "Vision" : "Writing";
    }
}

export function handleInput() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
    const hasText = chatInput.value.trim().length > 0;
    const hasImages = state.currentSelectedImages.length > 0;
    const hasFiles = state.currentSelectedFiles.length > 0;
    const tooManyImages = state.currentSelectedImages.length > 9;
    if (!state.isGenerating) {
        if ((hasText || hasImages || hasFiles) && !tooManyImages) setSendButtonState('ready');
        else setSendButtonState('disabled');
    }
}

export function handleKeydown(e) {
    if (window.innerWidth < 768 && e.key === 'Enter') return;
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if ((chatInput.value.trim().length > 0 || state.currentSelectedImages.length > 0) && !state.isGenerating) {
            emit('startMessageFlow');
        }
    }
}

export function handleBtnClick() {
    if (state.isGenerating) emit('cancelGeneration');
    else if (!sendBtn.hasAttribute('disabled')) emit('startMessageFlow');
}

export function renderImagePreviews() {
    if (state.currentSelectedImages.length === 0 && state.currentSelectedFiles.length === 0) {
        imagePreviewContainer.classList.add('hidden');
        imagePreviewList.innerHTML = '';
        return;
    }
    imagePreviewContainer.classList.remove('hidden');
    let html = '';

    html += state.currentSelectedImages.map((img, idx) => `
                <div class="relative inline-block shrink-0">
                    <img src="${img}" class="h-16 w-16 object-cover rounded-lg border border-gray-300 dark:border-[#333537] shadow-sm">
                    <button class="remove-image-btn absolute -top-2 -right-2 bg-[#444749] text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:text-white rounded-full p-1 shadow-md transition-colors" data-index="${idx}" title="Remove image">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `).join('');

    html += state.currentSelectedFiles.map((file, idx) => `
                <div class="relative inline-flex items-center gap-2 bg-gray-100 dark:bg-[#282a2c] border border-gray-300 dark:border-[#333537] rounded-lg px-3 py-2 shrink-0 h-16 max-w-[180px]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-400 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    <span class="text-xs text-gray-700 dark:text-gray-300 truncate font-mono">${file.name}</span>
                    <button class="remove-file-btn absolute -top-2 -right-2 bg-[#444749] text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:text-white rounded-full p-1 shadow-md transition-colors" data-index="${idx}" title="Remove file">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            `).join('');

    imagePreviewList.innerHTML = html;
    updateModelBadge();
    setSendButtonState('ready');
    const oldCounters = imagePreviewContainer.querySelectorAll('.image-counter-label');
    oldCounters.forEach(c => c.remove());
}

export function processChatImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            let width = img.width, height = img.height;
            const MAX_DIMENSION = 1024;
            if (width > height) { if (width > MAX_DIMENSION) { height *= MAX_DIMENSION / width; width = MAX_DIMENSION; } }
            else { if (height > MAX_DIMENSION) { width *= MAX_DIMENSION / height; height = MAX_DIMENSION; } }
            canvas.width = width; canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            state.currentSelectedImages.push(canvas.toDataURL('image/jpeg', 0.8));
            renderImagePreviews();
            handleInput();
            // FIX: scroll AFTER preview is rendered, not before the async load completes
            imagePreviewList.scrollTo({ left: 10000, behavior: 'smooth' });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

export function processChatTextFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert(`File ${file.name} is too large. Limit is 5MB.`);
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        state.currentSelectedFiles.push({ name: file.name, content: e.target.result });
        renderImagePreviews();
        handleInput();
        // FIX: scroll AFTER preview is rendered
        imagePreviewList.scrollTo({ left: 10000, behavior: 'smooth' });
    };
    reader.readAsText(file);
}

export function scrollToBottom() {
    chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

// ── Getters for DOM refs that other modules need ──
export function getChatInput() { return chatInput; }
export function getChatContainer() { return chatContainer; }
export function getChatInner() { return chatInner; }
export function getImagePreviewContainer() { return imagePreviewContainer; }
export function getChatImageInput() { return chatImageInput; }
export function getHeaderModelDisplay() { return headerModelDisplay; }
export function getIsKeyboardOpen() { return isKeyboardOpen; }

// ── Init (called inside DOMContentLoaded from app.js) ──
export function initUI() {
    chatInput = document.getElementById('chat-input');
    sendBtn = document.getElementById('send-btn');
    iconSend = document.getElementById('icon-send');
    iconStop = document.getElementById('icon-stop');
    chatContainer = document.getElementById('chat-container');
    chatInner = document.getElementById('chat-inner');
    imagePreviewContainer = document.getElementById('image-preview-container');
    imagePreviewList = document.getElementById('image-preview-list');
    chatImageInput = document.getElementById('chat-image-input');
    chatFileInput = document.getElementById('chat-file-input');
    uploadImageBtn = document.getElementById('upload-image-btn');
    uploadFileBtn = document.getElementById('upload-file-btn');
    headerModelDisplay = document.getElementById('header-model-display');
    scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');

    confirmModal = document.getElementById('confirm-modal');
    confirmModalContent = document.getElementById('confirm-modal-content');
    renameModal = document.getElementById('rename-modal');
    renameModalContent = document.getElementById('rename-modal-content');
    renameChatInput = document.getElementById('rename-chat-input');

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.checked = localStorage.theme === 'light';
        themeToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                document.documentElement.classList.remove('dark');
                localStorage.theme = 'light';
            } else {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
            }
        });
    }

    // Confirm modal buttons
    document.getElementById('cancel-confirm-btn').addEventListener('click', () => closeModal(confirmModal, confirmModalContent));
    document.getElementById('action-confirm-btn').addEventListener('click', () => {
        if (activeConfirmAction) activeConfirmAction();
        closeModal(confirmModal, confirmModalContent);
    });

    // Rename modal
    document.getElementById('cancel-rename-btn').addEventListener('click', () => closeModal(renameModal, renameModalContent));
    function handleRenameSave() {
        const newTitle = renameChatInput.value.trim();
        if (newTitle && activeRenameAction) activeRenameAction(newTitle);
        closeModal(renameModal, renameModalContent);
    }
    document.getElementById('save-rename-btn').addEventListener('click', handleRenameSave);
    renameChatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRenameSave(); });

    // Input
    chatInput.addEventListener('input', handleInput);
    chatInput.addEventListener('keydown', handleKeydown);
    sendBtn.addEventListener('click', () => handleBtnClick());
    updateModelBadge();

    // File upload buttons
    chatFileInput.addEventListener('click', function (e) { e.stopPropagation(); this.value = null; });
    uploadFileBtn.addEventListener('click', (e) => { e.preventDefault(); chatFileInput.click(); });
    chatFileInput.addEventListener('change', (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        Array.from(e.target.files).forEach(file => processChatTextFile(file));
    });

    // Image upload buttons
    chatImageInput.addEventListener('click', function (e) { e.stopPropagation(); this.value = null; });
    uploadImageBtn.addEventListener('click', (e) => { e.preventDefault(); chatImageInput.click(); });
    chatImageInput.addEventListener('change', (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const availableSlots = 9 - state.currentSelectedImages.length;
        const filesToProcess = Array.from(e.target.files).slice(0, availableSlots);
        if (e.target.files.length > availableSlots) alert(`Limit reached! Only added ${availableSlots} image(s).`);
        filesToProcess.forEach(file => processChatImageFile(file));
    });

    // Remove image/file
    imagePreviewContainer.addEventListener('click', (e) => {
        const removeImgBtn = e.target.closest('.remove-image-btn');
        const removeFileBtn = e.target.closest('.remove-file-btn');
        if (removeImgBtn) {
            state.currentSelectedImages.splice(parseInt(removeImgBtn.dataset.index), 1);
            renderImagePreviews(); handleInput(); updateModelBadge();
        }
        if (removeFileBtn) {
            state.currentSelectedFiles.splice(parseInt(removeFileBtn.dataset.index), 1);
            renderImagePreviews(); handleInput();
        }
    });

    // Paste images
    chatInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let imageFound = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                processChatImageFile(items[i].getAsFile());
                imageFound = true;
            }
        }
        if (imageFound) e.preventDefault();
    });

    // Scroll-to-bottom button
    let scrollBtnTimeout;
    chatContainer.addEventListener('scroll', () => {
        const btn = scrollToBottomBtn;
        if (!btn) return;
        const maxScroll = chatContainer.scrollHeight - chatContainer.clientHeight;
        const isNearBottom = (maxScroll - chatContainer.scrollTop) <= 300;
        if (!isNearBottom) {
            clearTimeout(scrollBtnTimeout);
            btn.classList.remove('hidden');
            requestAnimationFrame(() => { requestAnimationFrame(() => { btn.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none'); }); });
        } else {
            if (!btn.classList.contains('translate-y-20')) {
                btn.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
                clearTimeout(scrollBtnTimeout);
                scrollBtnTimeout = setTimeout(() => btn.classList.add('hidden'), 300);
            }
        }
    }, { passive: true });
    scrollToBottomBtn?.addEventListener('click', () => chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' }));

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.querySelector('span.text-sm').textContent;
            chatInput.value = text;
            handleInput();
            handleBtnClick();
        });
    });

    // ── Mobile keyboard detection ──
    const vv = window.visualViewport;
    if (vv) {
        vv.addEventListener('resize', () => {
            isKeyboardOpen = vv.height < window.innerHeight * 0.75;
        });
    }

    // ── Image Lightbox ──
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxFilename = document.getElementById('lightbox-filename');

    function openLightbox(src, filename) {
        lightboxImg.src = src;
        lightboxFilename.textContent = filename || 'image.jpg';
        lightbox.classList.remove('hidden');
        lightbox.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }
    function closeLightbox() {
        lightbox.classList.add('hidden');
        lightbox.classList.remove('flex');
        document.body.style.overflow = '';
        lightboxImg.src = '';
    }

    chatInner.addEventListener('click', (e) => {
        const img = e.target.closest('img');
        if (!img) return;
        if (img.closest('.avatar-glow-wrapper') || img.closest('.user-glow-wrapper')) return;
        const src = img.src;
        let filename = 'image.jpg';
        if (img.alt && img.alt.trim()) filename = img.alt.trim();
        else if (src.startsWith('data:image/')) filename = `image.${src.split(';')[0].split('/')[1] || 'jpg'}`;
        else filename = src.split('/').pop().split('?')[0] || 'image.jpg';
        openLightbox(src, filename);
    });

    document.getElementById('lightbox-close-btn')?.addEventListener('click', closeLightbox);
    document.getElementById('lightbox-backdrop')?.addEventListener('click', (e) => { if (e.target === document.getElementById('lightbox-backdrop')) closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox(); });
}
