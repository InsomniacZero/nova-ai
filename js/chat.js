// js/chat.js — Chat state, streaming, message rendering, history sidebar

import { state, emit, on, DEFAULT_PERSONAS } from './state.js';
import { saveHistoryToCloud, deleteChatFromCloud, loadHistoryFromCloud, loadProfileFromCloud, saveProfileToCloud, loadPersonasFromCloud, savePersonasToCloud, uploadBase64ImagesInContent } from './firebase.js';
import { parseAIContent, getTimeString, showToast, copyToClipboard } from './utils.js';
import { setSendButtonState, updateModelBadge, handleInput, renderImagePreviews, scrollToBottom, uiConfirm, uiPrompt, getChatInput, getChatContainer, getChatInner, getImagePreviewContainer, getChatImageInput, getHeaderModelDisplay, openModal, closeModal } from './ui.js';
import { getActivePersona, updatePersonaUI, updateHeaderTitle, renderPersonaList } from './persona.js';
import { updateProfileUI } from './profile.js';

// ── DOM refs ──
let chatInput, chatContainer, chatInner, emptyState;
let imagePreviewContainer, chatImageInput, headerModelDisplay;
let currentChatMenuBtn;

// ── Public API ──

export function getActiveChat() {
    return state.chats.find(c => c.id === state.currentChatId);
}

export function saveHistory(chatId = null) {
    saveHistoryToCloud(chatId || state.currentChatId);
    renderHistorySidebar();
}

export function addMessageToHistory(msgObj) {
    if (!state.currentChatId) {
        state.currentChatId = 'chat-' + Date.now();
        let titleText = msgObj.content || (msgObj.images && msgObj.images.length > 0 ? "Image Upload" : "New Chat");
        let words = titleText.split(' ');
        let title = words.slice(0, 5).join(' ');
        if (words.length > 5) title += '...';
        state.chats.unshift({ id: state.currentChatId, title: title, messages: [], updatedAt: Date.now() });
        updateHeaderTitle();
    }
    const chatIndex = state.chats.findIndex(c => c.id === state.currentChatId);
    if (chatIndex > -1) {
        const chat = state.chats[chatIndex];
        chat.messages.push(msgObj);
        chat.updatedAt = Date.now();
        state.chats.splice(chatIndex, 1);
        state.chats.unshift(chat);
    }
    saveHistory();
}

export function renderHistorySidebar() {
    const historyList = document.getElementById('history-list');
    if (state.chats.length === 0) {
        historyList.innerHTML = '<p class="text-sm text-gray-500 px-2 italic mt-2">No recent chats</p>';
        return;
    }
    historyList.innerHTML = state.chats.map(chat => {
        const isActive = chat.id === state.currentChatId;
        const safeTitle = (chat.title || "New Chat").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `
                <div class="relative flex items-center group w-full mb-1">
                    <button class="chat-history-item flex-1 text-left flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-sm truncate pr-10 ${isActive ? 'bg-[#3f4145] text-white font-medium shadow-sm border border-[#505357]' : 'text-gray-300 hover:bg-[#2d2f31] hover:text-white border border-transparent'}" data-id="${chat.id}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-300'}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span class="truncate pointer-events-none">${safeTitle}</span>
                    </button>
                    <button class="chat-options-btn absolute right-2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#505357] opacity-0 group-hover:opacity-100 transition-all" data-id="${chat.id}" title="Options"></button>
                    <button class="chat-options-btn absolute right-2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#505357] opacity-0 group-hover:opacity-100 transition-all" data-id="${chat.id}" title="Options">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                    <div id="dropdown-${chat.id}" class="chat-dropdown hidden absolute right-2 top-10 w-32 bg-[#282a2c] border border-[#444749] rounded-xl shadow-xl z-50 py-1 flex flex-col">
                        <button class="rename-chat-btn w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-[#3f4145] hover:text-white transition-colors" data-id="${chat.id}">Rename</button>
                        <button class="delete-chat-btn w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-[#3f4145] hover:text-red-300 transition-colors" data-id="${chat.id}">Delete</button>
                    </div>
                </div>`;
    }).join('');
}

export function renderChatHistory() {
    chatInner.querySelectorAll('.msg-container').forEach(m => m.remove());
    const activeChat = getActiveChat();
    updateHeaderTitle();

    if (!activeChat || activeChat.messages.length === 0) {
        emptyState.classList.remove('hidden');
        if (currentChatMenuBtn) currentChatMenuBtn.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        if (currentChatMenuBtn) currentChatMenuBtn.classList.remove('hidden');
        activeChat.messages.forEach((msg, idx) => {
            if (!msg || typeof msg !== 'object') return;
            if (!msg.content && msg.status !== 'cancelled' && (!msg.images || msg.images.length === 0)) return;
            if (msg.role === 'user' && msg.content.trim() === '' && (!msg.images || msg.images.length === 0)) return;
            if (msg.image && !msg.images) { msg.images = [msg.image]; }
            appendMessageUI(msg, idx, false);
        });
    }
    scrollToBottom();
}

export function appendMessageUI(msgObj, msgIndex, animate = true) {
    emptyState.classList.add('hidden');
    const timeStr = msgObj.timestamp || getTimeString();
    const safeContent = msgObj.content || '';
    const escapedContent = encodeURIComponent(safeContent);
    let html = '';

    if (msgObj.role === 'user') {
        const userFirstName = state.userProfile.name.split(' ')[0] || 'User';
        const textContent = safeContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        let avatarHtml = state.userProfile.avatar
            ? `<div class="w-8 h-8 shrink-0 user-glow-wrapper translate-y-1"><div class="user-glow-inner bg-cover bg-center" style="background-image: url('${state.userProfile.avatar}')"></div></div>`
            : `<div class="w-8 h-8 shrink-0 user-glow-wrapper translate-y-1"><div class="user-glow-inner bg-[#000000] text-white flex items-center justify-center text-xs font-bold">${userFirstName.charAt(0).toUpperCase()}</div></div>`;

        let imageHtml = '';
        if (msgObj.images && msgObj.images.length > 0) {
            const count = msgObj.images.length;
            let layoutClass = count === 1 ? "flex max-w-[280px]" : count === 2 ? "grid grid-cols-2 max-w-[380px]" : "grid grid-cols-2 sm:grid-cols-3 max-w-[450px]";
            let imgClass = count === 1 ? "max-h-[350px] w-auto object-cover rounded-2xl" : "aspect-square w-full object-cover rounded-xl hover:scale-[1.02] transition-transform";
            imageHtml = `<div class="${layoutClass} gap-2 mb-1.5 ml-auto">` + msgObj.images.map(img => `<img src="${img}" class="${imgClass} border border-[#333537]/80 shadow-sm" loading="lazy" decoding="async">`).join('') + `</div>`;
        }

        let filesHtml = '';
        if (msgObj.files && msgObj.files.length > 0) {
            filesHtml = `<div class="flex flex-wrap gap-2 mb-1.5 ml-auto justify-end">` +
                msgObj.files.map(f => `
                            <div class="flex items-center gap-2 bg-[#282a2c]/80 border border-[#444749]/50 rounded-lg px-3 py-2 shadow-sm">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                <span class="text-xs text-gray-200 font-mono truncate max-w-[150px]">${f.name}</span>
                            </div>
                        `).join('') + `</div>`;
        }

        html = `
                <div class="msg-container flex items-start gap-4 justify-end ${animate ? 'opacity-0 transition-opacity duration-300' : ''}">
                    <div class="flex-1 min-w-0 flex flex-col items-end pl-12 relative z-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs text-gray-600">${timeStr}</span>
                            <span class="text-sm text-gray-300 font-medium">${userFirstName}</span>
                        </div>
                        ${imageHtml || filesHtml ? `<div class="w-full flex flex-col items-end mb-1">${imageHtml}${filesHtml}</div>` : ''}
                        <div class="flex items-center gap-1.5">
                            <div class="flex items-center gap-0.5 msg-options">
                                <button class="copy-user-msg-btn w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-[#333537] transition-all" data-text="${escapedContent}" title="Copy message">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                </button>
                                <button class="edit-msg-btn w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-400 hover:bg-[#333537] transition-all" data-index="${msgIndex}" title="Edit message">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                </button>
                            </div>
                            ${textContent.trim() ? `
                            <div class="bg-[#1451b5] px-5 py-3.5 rounded-3xl rounded-tr-sm text-[15px] leading-relaxed text-white shadow-sm">
                                ${textContent.replace(/\n/g, '<br>')}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="mt-1 shrink-0">${avatarHtml}</div>
                </div>`;
    } else if (msgObj.role === 'ai') {
        const aiNameDisplay = msgObj.personaName || 'Nova';
        const hasInlineImage = /!\[.*?\]\((https?:\/\/[^\)]+|data:image\/[^;]+;base64,[^\)]+)\)/.test(safeContent);
        const dlBtnHtml = hasInlineImage ? `<button class="download-msg-btn w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-[#333537] transition-all" title="Download Image"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>` : '';

        const footerHtml = `
                    <div class="flex items-center gap-0.5 mt-3 pt-1">
                        <button class="copy-msg-btn w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-[#333537] transition-all" data-text="${escapedContent}" title="Copy response">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                        <button class="regen-btn w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-200 hover:bg-[#333537] transition-all" data-index="${msgIndex}" title="Regenerate response">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
                        </button>
                        ${dlBtnHtml}
                    </div>`;

        if (msgObj.status === 'cancelled') {
            html = `<div class="msg-container flex items-start gap-4 ${animate ? 'opacity-0 transition-opacity duration-300' : ''}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper"><div class="avatar-glow-inner"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${aiNameDisplay}</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="text-[15px] leading-relaxed text-gray-200 mt-2"><div class="inline-flex items-center gap-2 bg-[#282a2c] border border-[#333537] px-3 py-2 rounded-lg text-gray-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Response was cancelled</span></div>${footerHtml}</div></div></div>`;
        } else if (msgObj.status === 'error') {
            html = `<div class="msg-container flex items-start gap-4 ${animate ? 'opacity-0 transition-opacity duration-300' : ''}"><div class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-tr from-red-600 to-orange-500 mt-1"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-red-400 font-medium">System Error</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="text-[15px] leading-relaxed text-gray-200 mt-2 bg-red-900/20 border border-red-500/30 px-4 py-3 rounded-xl text-red-200">${safeContent}</div>${footerHtml}</div></div>`;
        } else {
            html = `<div class="msg-container flex items-start gap-4 group" id="${state.currentStreamingMsgId}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper"><div class="avatar-glow-inner"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div class="flex-1 min-w-0 pr-12 relative z-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${aiNameDisplay}</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="markdown-body text-[15px] leading-relaxed text-gray-200">${parseAIContent(safeContent)}</div>${footerHtml}</div></div>`;
        }
    }

    if (html) {
        chatInner.insertAdjacentHTML('beforeend', html);
        if (animate) {
            const newEl = chatInner.lastElementChild;
            void newEl.offsetWidth;
            setTimeout(() => newEl.classList.remove('opacity-0'), 10);
        }
    }
}

export function showTyping() {
    state.currentTypingId = `typing-${Date.now()}`;
    const aiNameDisplay = getActivePersona().name;
    const typingHtml = `<div class="msg-container flex items-start gap-4" id="${state.currentTypingId}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper"><div class="avatar-glow-inner"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${aiNameDisplay}</span></div><div class="flex items-center gap-1.5 h-6"><div class="w-1.5 h-1.5 bg-[#444749] rounded-full typing-dot"></div><div class="w-1.5 h-1.5 bg-[#444749] rounded-full typing-dot"></div><div class="w-1.5 h-1.5 bg-[#444749] rounded-full typing-dot"></div></div></div></div>`;
    chatInner.insertAdjacentHTML('beforeend', typingHtml);
    scrollToBottom();
}

export function removeTyping() {
    if (state.currentTypingId) {
        const el = document.getElementById(state.currentTypingId);
        if (el) el.remove();
        state.currentTypingId = null;
    }
}

export function regenerateMessage(aiMsgIndex) {
    if (state.isGenerating) return;
    const activeChat = getActiveChat();
    if (!activeChat) return;
    const userMsgIndex = aiMsgIndex - 1;
    if (userMsgIndex < 0 || activeChat.messages[userMsgIndex].role !== 'user') return;
    const userMsgToResend = activeChat.messages[userMsgIndex];
    const imagesToResend = userMsgToResend.images || [];
    const filesToResend = userMsgToResend.files || [];
    activeChat.messages = activeChat.messages.slice(0, aiMsgIndex);
    saveHistory();
    renderChatHistory();
    startMessageFlow(userMsgToResend.content, imagesToResend, filesToResend);
}

export function renameChat(id) {
    const chat = state.chats.find(c => c.id === id);
    if (!chat) return;
    uiPrompt(chat.title, (newTitle) => {
        chat.title = newTitle;
        saveHistory(id);
        updateHeaderTitle();
    });
}

export function deleteChat(id) {
    uiConfirm("Delete Chat", "Are you sure you want to delete this conversation?", "Delete", "bg-red-600 hover:bg-red-500", () => {
        deleteChatFromCloud(id);
        state.chats = state.chats.filter(c => c.id !== id);
        if (state.currentChatId === id) {
            if (state.isGenerating) cancelGeneration();
            state.currentChatId = null;
            renderChatHistory();
        }
        saveHistory();
    });
}

export function cancelEditMode(restoreHistory = true) {
    if (!state.isEditingMode) return;
    if (restoreHistory) {
        const activeChat = getActiveChat();
        if (activeChat && state.chatSnapshotBeforeEdit) activeChat.messages = state.chatSnapshotBeforeEdit;
    }
    state.isEditingMode = false;
    state.chatSnapshotBeforeEdit = null;
    chatInput.value = '';
    state.currentSelectedImages = [];
    state.currentSelectedFiles = [];
    renderImagePreviews();
    handleInput();
    const banner = document.getElementById('edit-mode-banner');
    if (banner) { banner.classList.add('hidden'); banner.classList.remove('flex'); }
    if (restoreHistory) { renderChatHistory(); scrollToBottom(); }
}

// ── OPENROUTER API INTEGRATION ──
export async function startMessageFlow(regenText = null, regenImages = null, regenFiles = null) {
    const isRegen = regenText !== null;
    const text = isRegen ? regenText : chatInput.value.trim();
    const imagesToUse = isRegen ? regenImages : [...state.currentSelectedImages];
    if (!text && imagesToUse.length === 0 && state.currentSelectedFiles.length === 0) return;

    const hasImageInCurrentInput = imagesToUse.length > 0;

    if (!isRegen) {
        if (state.isEditingMode) {
            state.isEditingMode = false;
            state.chatSnapshotBeforeEdit = null;
            const banner = document.getElementById('edit-mode-banner');
            if (banner) { banner.classList.add('hidden'); banner.classList.remove('flex'); }
            saveHistory();
            state.currentSelectedFiles = [];
        }
        const filesToUse = isRegen ? regenFiles : [...state.currentSelectedFiles];
        const userMsg = { role: 'user', content: text, images: imagesToUse, files: filesToUse, timestamp: getTimeString() };
        addMessageToHistory(userMsg);
        appendMessageUI(userMsg, getActiveChat().messages.length - 1);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        state.currentSelectedImages = [];
        imagePreviewContainer.classList.add('hidden');
        chatImageInput.value = '';
    }

    state.isGenerating = true;
    setSendButtonState('generating');
    scrollToBottom();

    state.currentStreamingMsgId = `stream-${Date.now()}`;
    const timeStr = getTimeString();
    const msgIndex = getActiveChat() ? getActiveChat().messages.length : 0;

    const footerHtml = `<div class="flex items-center gap-2 mt-3 pt-2 text-gray-500"><button class="copy-msg-btn flex items-center gap-1.5 p-1.5 hover:bg-[#333537] rounded-md text-gray-400 hover:text-gray-200 transition-colors" data-text="" title="Copy response" id="live-copy-${state.currentStreamingMsgId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button><button class="regen-btn flex items-center gap-1.5 p-1.5 hover:bg-[#333537] rounded-md text-gray-400 hover:text-gray-200 transition-colors" data-index="${msgIndex}" title="Regenerate response"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg></button></div>`;
    const streamHtml = `<div class="msg-container flex items-start gap-4 group transition-opacity duration-300" id="${state.currentStreamingMsgId}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper" id="avatar-${state.currentStreamingMsgId}"><div class="avatar-glow-inner flex justify-center items-center h-full w-full rounded-full animate-pulse-ring shadow-[0_0_15px_rgba(59,130,246,0.3)]"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div class="flex-1 min-w-0 pr-12 relative z-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${getActivePersona().name}</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="markdown-body text-[15px] leading-relaxed text-gray-200" id="content-${state.currentStreamingMsgId}"><span class="text-blue-400/80 animate-pulse tracking-wide font-medium">Thinking...</span></div><div id="footer-${state.currentStreamingMsgId}" class="hidden opacity-0 transition-opacity duration-300">${footerHtml}</div></div></div>`;
    chatInner.insertAdjacentHTML('beforeend', streamHtml);
    scrollToBottom();

    const MODEL_TO_USE = hasImageInCurrentInput ? state.OR_VISION_MODEL : state.OR_TEXT_MODEL;
    if (headerModelDisplay) headerModelDisplay.textContent = hasImageInCurrentInput ? "Vision" : "Writing";

    const activeChat = getActiveChat();
    let apiMessages = [];
    if (activeChat) {
        apiMessages = activeChat.messages
            .filter(msg => msg.status !== 'error' && msg.status !== 'cancelled')
            .map((msg, index, array) => {
                const isLastMessage = index === array.length - 1;
                let cleanContent = msg.content || "";
                cleanContent = cleanContent.replace(/!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/g, "[High-Res Image generated by Nova]");
                if (msg.role === 'user' && msg.files && msg.files.length > 0) {
                    const fileContext = msg.files.map(f => `\n\n--- Attached File: ${f.name} ---\n\`\`\`\n${f.content}\n\`\`\`\n`).join('');
                    cleanContent += fileContext;
                }
                if (isLastMessage && msg.role === 'user' && msg.images && msg.images.length > 0) {
                    const textToSend = cleanContent.trim() !== "" ? cleanContent : "Describe this image.";
                    const contentArray = [{ type: 'text', text: textToSend }];
                    msg.images.forEach(img => contentArray.push({ type: 'image_url', image_url: { url: img } }));
                    return { role: 'user', content: contentArray };
                } else {
                    return { role: msg.role === 'ai' ? 'assistant' : 'user', content: cleanContent };
                }
            });
    }

    const activePersona = getActivePersona();
    const appCapabilities = `
[APP CAPABILITIES & RULES]
You are operating inside 'Nova AI', a custom app with built-in image processing tools. 
1. BACKGROUND REMOVAL: If the user asks if you can remove a background, say YES. Tell them to upload the image and include the words "remove background".
2. IMAGE UPSCALING: If the user asks if you can upscale, enhance, or fix low quality images, say YES. Tell them to upload the image and include the word "upscale".
3. VISION: You can see images. If they upload an image and ask a question about it, you can view and analyze it.
CRITICAL RULE: NEVER say you cannot process or edit images. Your app backend automatically intercepts those commands and processes them for you. Always assure the user you can do these tasks.
`;
    apiMessages.unshift({ role: "system", content: `${activePersona.prompt}\n\n${appCapabilities}\n\nThe user's name is ${state.userProfile.name}.` });

    state.currentAbortController = new AbortController();

    try {
        const response = await fetch(`${state.PYTHON_SERVER_URL}/api/chat`, {
            method: "POST",
            headers: { "Authorization": "Bearer local-proxy-managed", "HTTP-Referer": window.location.href, "X-Title": "Nova UI", "Content-Type": "application/json" },
            body: JSON.stringify({ "model": MODEL_TO_USE, "messages": apiMessages, "stream": true, "reasoning": { "enabled": true } }),
            signal: state.currentAbortController.signal
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `HTTP ${response.status}: Failed to fetch response`);
        }

        const streamContentBox = document.getElementById(`content-${state.currentStreamingMsgId}`);
        const liveCopyBtn = document.getElementById(`live-copy-${state.currentStreamingMsgId}`);
        const avatarGlowInner = document.querySelector(`#avatar-${state.currentStreamingMsgId} .avatar-glow-inner`);
        if (avatarGlowInner) avatarGlowInner.classList.remove('animate-pulse-ring', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]');

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let streamBuffer = "";
        let isRawJsonError = false;
        let rawJsonBuffer = "";
        let lastRenderTime = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (isRawJsonError && rawJsonBuffer) {
                    try {
                        const data = JSON.parse(rawJsonBuffer);
                        if (data.error) {
                            fullText += `\n\n**API Error:** ${data.error.message || "Unknown error"}`;
                            const mdContainer = document.querySelector(`#${state.currentStreamingMsgId} .markdown-body`);
                            if (mdContainer) mdContainer.innerHTML = DOMPurify.sanitize(marked.parse(fullText));
                        }
                    } catch (e) { }
                }
                break;
            }

            const chunkString = decoder.decode(value, { stream: true });
            if (streamBuffer === "" && rawJsonBuffer === "" && chunkString.trimStart().startsWith("{")) isRawJsonError = true;
            if (isRawJsonError) { rawJsonBuffer += chunkString; continue; }

            streamBuffer += chunkString;
            const lines = streamBuffer.split("\n");
            streamBuffer = lines.pop();
            let contentUpdated = false;

            for (let line of lines) {
                line = line.trim();
                if (!line || !line.startsWith("data:")) continue;
                const jsonStr = line.substring(5).trim();
                if (jsonStr === "[DONE]") continue;
                try {
                    const data = JSON.parse(jsonStr);
                    const delta = data.choices?.[0]?.delta;
                    if (delta) {
                        const content = delta.content || "";
                        const reasoning = delta.reasoning || "";
                        if (reasoning) {
                            if (!fullText.includes("<think>")) fullText += "<think>\n";
                            fullText += reasoning;
                            contentUpdated = true;
                        } else if (content) {
                            if (fullText.includes("<think>") && !fullText.includes("</think>")) fullText += "\n</think>\n\n";
                            fullText += content;
                            contentUpdated = true;
                        }
                    }
                } catch (err) { continue; }
            }

            if (contentUpdated) {
                const now = Date.now();
                if (now - lastRenderTime > 50) {
                    const isAtBottom = Math.abs((chatContainer.scrollHeight - chatContainer.scrollTop) - chatContainer.clientHeight) < 100;
                    if (streamContentBox) streamContentBox.innerHTML = parseAIContent(fullText);
                    if (liveCopyBtn) liveCopyBtn.setAttribute('data-text', encodeURIComponent(fullText));
                    if (isAtBottom) chatContainer.scrollTop = chatContainer.scrollHeight;
                    lastRenderTime = now;
                }
            }
        }

        const footerEl = document.getElementById(`footer-${state.currentStreamingMsgId}`);
        if (footerEl) { footerEl.classList.remove("hidden"); void footerEl.offsetWidth; footerEl.classList.remove("opacity-0"); }
        completeGeneration(fullText);

    } catch (error) {
        if (error.name === 'AbortError') console.log('Generation aborted by user switch/stop');
        else {
            console.error('Fetch error:', error);
            removeTyping();
            state.isGenerating = false;
            setSendButtonState((chatInput.value.trim() || state.currentSelectedImages.length > 0) ? 'ready' : 'disabled');
            appendMessageUI({ role: 'ai', status: 'error', content: error.message, timestamp: getTimeString(), personaName: getActivePersona().name }, 0);
            if (headerModelDisplay) headerModelDisplay.textContent = "Writing";
        }
    }
}

function completeGeneration(content) {
    state.isGenerating = false;
    let cleanContent = content.replace(/<think>[\s\S]*?<\/think>[\n\s]*/g, '');

    if (state.currentStreamingMsgId) {
        document.getElementById(state.currentStreamingMsgId)?.remove();
        state.currentStreamingMsgId = null;
    }

    const aiMsg = { role: 'ai', content: cleanContent, timestamp: getTimeString(), personaName: getActivePersona().name };
    addMessageToHistory(aiMsg);
    appendMessageUI(aiMsg, getActiveChat().messages.length - 1);
    setSendButtonState((chatInput.value.trim() || state.currentSelectedImages.length > 0) ? 'ready' : 'disabled');
    scrollToBottom();
    if (headerModelDisplay) headerModelDisplay.textContent = "Writing";

    const base64Check = /!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/;
    if (base64Check.test(cleanContent)) {
        (async () => {
            try {
                const chat = getActiveChat();
                if (!chat) return;
                const msgIdx = chat.messages.length - 1;
                const updatedContent = await uploadBase64ImagesInContent(cleanContent);
                if (updatedContent !== cleanContent) {
                    chat.messages[msgIdx].content = updatedContent;
                    saveHistory();
                    console.log('☁️ AI image(s) uploaded to Cloudinary and saved.');
                }
            } catch (e) { console.error('Cloudinary background upload failed:', e); }
        })();
    }
}

export function cancelGeneration() {
    if (!state.isGenerating) return;
    if (state.currentAbortController) { state.currentAbortController.abort(); state.currentAbortController = null; }
    document.getElementById('ai-thinking-indicator')?.remove();
    const activeChat = getActiveChat();
    if (activeChat && activeChat.messages.length > 0) {
        const lastMsg = activeChat.messages[activeChat.messages.length - 1];
        if (lastMsg.role === 'ai') { lastMsg.status = 'cancelled'; saveHistory(); }
    }
    removeTyping();
    state.isGenerating = false;
    if (state.currentStreamingMsgId) { document.getElementById(state.currentStreamingMsgId)?.remove(); state.currentStreamingMsgId = null; }
    const cancelMsg = { role: 'ai', status: 'cancelled', timestamp: getTimeString(), personaName: getActivePersona().name };
    addMessageToHistory(cancelMsg);
    appendMessageUI(cancelMsg, getActiveChat().messages.length - 1);
    setSendButtonState((chatInput.value.trim() || state.currentSelectedImages.length > 0) ? 'ready' : 'disabled');
    scrollToBottom();
    if (headerModelDisplay) headerModelDisplay.textContent = "Writing";
}

// ── Cloud Initialization ──
export async function initCloudData() {
    try {
        const cloudProfile = await loadProfileFromCloud();
        if (cloudProfile) state.userProfile = cloudProfile;
        else {
            state.userProfile = { name: state.currentUser.displayName || 'User', avatar: state.currentUser.photoURL || null };
            await saveProfileToCloud(state.userProfile);
        }
        updateProfileUI();

        const cloudPersonas = await loadPersonasFromCloud();
        if (cloudPersonas && cloudPersonas.list) {
            state.appPersonas = cloudPersonas.list;
            state.activePersonaId = cloudPersonas.activeId || 'nova_default';
        } else {
            state.appPersonas = [...DEFAULT_PERSONAS];
            state.activePersonaId = 'nova_default';
            await savePersonasToCloud(state.appPersonas, state.activePersonaId);
        }
        updatePersonaUI();

        const cloudChats = await loadHistoryFromCloud();
        if (cloudChats && cloudChats.length > 0) state.chats = cloudChats;
        else state.chats = [];
        state.currentChatId = null;
    } catch (e) {
        console.error("Cloud Init Failed:", e);
        state.chats = [];
        state.currentChatId = null;
    }
    renderHistorySidebar();
    renderChatHistory();
}

// ── Init (called from app.js) ──
export function initChat() {
    chatInput = getChatInput();
    chatContainer = getChatContainer();
    chatInner = getChatInner();
    emptyState = document.getElementById('empty-state');
    imagePreviewContainer = getImagePreviewContainer();
    chatImageInput = getChatImageInput();
    headerModelDisplay = getHeaderModelDisplay();
    currentChatMenuBtn = document.getElementById('current-chat-menu-btn');

    // Register event bus handlers
    on('startMessageFlow', () => startMessageFlow());
    on('cancelGeneration', () => cancelGeneration());
    on('renderChatHistory', () => renderChatHistory());
}
