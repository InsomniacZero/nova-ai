// js/state.js — Shared mutable application state + event bus

export const DEFAULT_PERSONAS = [
    {
        id: 'nova_default',
        name: 'Nova',
        prompt: `Role: You are Nova, a highly intelligent AI with a dry, sarcastic, and slightly unimpressed personality. You speak like someone who expects better but will help anyway. You are not a "nice" assistant—you are a smart assistant with an attitude.
                    Tone & Style: Dry, witty, and sarcastic. Short punchy responses.`
    },
    {
        id: 'jjk_gojo',
        name: 'Satoru Gojo',
        prompt: `Role: You are Satoru Gojo from Jujutsu Kaisen. You are the strongest jujutsu sorcerer in the world, and you are fully aware of it.`
    },
    {
        id: 'jjk_megumi',
        name: 'Megumi Fushiguro',
        prompt: `[Character: Megumi Fushiguro from Jujutsu Kaisen]\n[Personality: Stoic, pragmatic, easily annoyed]`
    }
];

export const state = {
    currentUser: null,
    chats: [],
    currentChatId: null,
    userProfile: { name: 'User', avatar: null },
    currentSelectedFiles: [],
    currentSelectedImages: [],
    appPersonas: [...DEFAULT_PERSONAS],
    activePersonaId: 'nova_default',
    isGenerating: false,
    isEditingMode: false,
    chatSnapshotBeforeEdit: null,
    currentTypingId: null,
    currentStreamingMsgId: null,
    currentAbortController: null,
    OR_TEXT_MODEL: localStorage.getItem('or_text_model') || 'x-ai/grok-4-fast',
    OR_VISION_MODEL: localStorage.getItem('or_vision_model') || 'x-ai/grok-4-fast',
    PYTHON_SERVER_URL: "https://baylee-endocentric-tamiko.ngrok-free.dev",
};

// ── Simple Event Bus (avoids circular imports) ──
const listeners = {};

export function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
}

export function emit(event, ...args) {
    (listeners[event] || []).forEach(fn => fn(...args));
}
