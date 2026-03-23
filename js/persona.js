// js/persona.js — Persona state, dropdown, CRUD

import { state, DEFAULT_PERSONAS } from './state.js';
import { savePersonasToCloud } from './firebase.js';
import { openModal, closeModal, uiConfirm } from './ui.js';

// ── DOM refs (set in init) ──
let personaToggle, personaMenu, personaChevron, personaListContainer, headerPersonaTitle;
let createPersonaModal, createPersonaContent, newPersonaName, newPersonaPrompt, personaModalTitle, editPersonaIdInput;
let systemPromptInput, settingsPersonaNameLabel;

// ── Public API ──

export function getActivePersona() {
    return state.appPersonas.find(p => p.id === state.activePersonaId) || state.appPersonas[0] || DEFAULT_PERSONAS[0];
}

export function updateHeaderTitle() {
    const activePersona = getActivePersona();
    const activeChat = state.chats.find(c => c.id === state.currentChatId);
    headerPersonaTitle.textContent = activePersona.name;
    const centerTitleEl = document.getElementById('header-chat-title');
    if (centerTitleEl) {
        centerTitleEl.textContent = (activeChat && activeChat.title) ? activeChat.title : '';
    }
}

export function updatePersonaUI() {
    const active = getActivePersona();
    updateHeaderTitle();
    systemPromptInput.value = active.prompt;
    settingsPersonaNameLabel.textContent = active.name;
    renderPersonaList();
}

export function renderPersonaList() {
    personaListContainer.innerHTML = state.appPersonas.map(p => `
                <div class="relative group persona-item-wrapper">
                    <button class="persona-item w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between pr-14 ${p.id === state.activePersonaId ? 'bg-[#333537] text-white' : 'text-gray-300 hover:bg-[#333537]'}" data-id="${p.id}">
                        <span class="truncate pointer-events-none">${p.name}</span>
                        ${p.id === state.activePersonaId ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400 shrink-0 pointer-events-none"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                    </button>
                    <div class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="edit-persona-btn p-1 text-gray-400 hover:text-blue-400 transition-colors" data-id="${p.id}" title="Edit Persona">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        ${p.id !== 'nova_default' ? `
                        <button class="delete-persona-btn p-1 text-gray-400 hover:text-red-400 transition-colors" data-id="${p.id}" title="Delete Persona">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>` : ''}
                    </div>
                </div>
            `).join('');

    document.querySelectorAll('.persona-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            state.activePersonaId = e.currentTarget.dataset.id;
            savePersonasToCloud(state.appPersonas, state.activePersonaId);
            updatePersonaUI();
            personaMenu.classList.add('hidden');
            personaChevron.style.transform = 'rotate(0deg)';
        });
    });
}

export function handleEditPersona(id) {
    const p = state.appPersonas.find(x => x.id === id);
    if (p) {
        personaMenu.classList.add('hidden');
        personaChevron.style.transform = 'rotate(0deg)';
        personaModalTitle.textContent = "Edit Persona";
        editPersonaIdInput.value = p.id;
        newPersonaName.value = p.name;
        newPersonaPrompt.value = p.prompt;
        openModal(createPersonaModal, createPersonaContent);
    }
}

export function handleDeletePersona(id) {
    if (id !== 'nova_default') {
        uiConfirm("Delete Persona", "Are you sure you want to delete this custom persona?", "Delete", "bg-red-600 hover:bg-red-500", () => {
            state.appPersonas = state.appPersonas.filter(x => x.id !== id);
            if (state.activePersonaId === id) state.activePersonaId = 'nova_default';
            savePersonasToCloud(state.appPersonas, state.activePersonaId);
            updatePersonaUI();
        });
    }
}

// ── Init ──
export function initPersonas() {
    personaToggle = document.getElementById('header-persona-toggle');
    personaMenu = document.getElementById('persona-dropdown-menu');
    personaChevron = document.getElementById('header-persona-chevron');
    personaListContainer = document.getElementById('persona-list');
    headerPersonaTitle = document.getElementById('header-persona-title');
    createPersonaModal = document.getElementById('create-persona-modal');
    createPersonaContent = document.getElementById('create-persona-content');
    newPersonaName = document.getElementById('new-persona-name');
    newPersonaPrompt = document.getElementById('new-persona-prompt');
    personaModalTitle = document.getElementById('persona-modal-title');
    editPersonaIdInput = document.getElementById('edit-persona-id');
    systemPromptInput = document.getElementById('system-prompt-input');
    settingsPersonaNameLabel = document.getElementById('settings-persona-name-label');

    personaToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        personaMenu.classList.toggle('hidden');
        personaChevron.style.transform = personaMenu.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
    });

    document.getElementById('add-persona-btn').addEventListener('click', () => {
        personaMenu.classList.add('hidden');
        personaChevron.style.transform = 'rotate(0deg)';
        personaModalTitle.textContent = "Create New Persona";
        editPersonaIdInput.value = '';
        newPersonaName.value = '';
        newPersonaPrompt.value = '';
        openModal(createPersonaModal, createPersonaContent);
    });

    document.getElementById('close-create-persona-btn').addEventListener('click', () => closeModal(createPersonaModal, createPersonaContent));
    document.getElementById('cancel-create-persona-btn').addEventListener('click', () => closeModal(createPersonaModal, createPersonaContent));

    document.getElementById('save-new-persona-btn').addEventListener('click', () => {
        const name = newPersonaName.value.trim();
        const prompt = newPersonaPrompt.value.trim();
        const editId = editPersonaIdInput.value;
        if (!name) return alert("Please enter a character name.");

        if (editId) {
            const p = state.appPersonas.find(x => x.id === editId);
            if (p) { p.name = name; p.prompt = prompt; }
        } else {
            const newId = 'custom_' + Date.now();
            state.appPersonas.push({ id: newId, name: name, prompt: prompt });
            state.activePersonaId = newId;
        }

        savePersonasToCloud(state.appPersonas, state.activePersonaId);
        updatePersonaUI();
        closeModal(createPersonaModal, createPersonaContent);
    });
}
