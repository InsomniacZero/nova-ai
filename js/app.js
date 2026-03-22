import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCSREyC2tFjLLXBvhbI_LkxEIhezO9vErs",
    authDomain: "nova-ai-e0b6d.firebaseapp.com",
    projectId: "nova-ai-e0b6d",
    storageBucket: "nova-ai-e0b6d.firebasestorage.app",
    messagingSenderId: "614230509497",
    appId: "1:614230509497:web:c9c2ce0b43dbb5c4ad1868",
    measurementId: "G-N1FR4N53PC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// =========================================
// ☁️ CLOUDINARY IMAGE HOSTING CONFIG
// =========================================
const CLOUDINARY_CLOUD_NAME = 'dpb7c46v0';
const CLOUDINARY_UPLOAD_PRESET = 'Nova_uploads';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

async function uploadToCloudinary(base64Data) {
    try {
        const formData = new FormData();
        formData.append('file', base64Data);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
        if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);
        const data = await res.json();
        return data.secure_url;
    } catch (err) {
        console.error('Cloudinary upload error:', err);
        return null;
    }
}

// Replaces all base64 image data in message content/images with Cloudinary URLs
async function uploadBase64ImagesInContent(content) {
    const base64Regex = /!\[([^\]]*)\]\((data:image\/[^;]+;base64,[^\)]+)\)/g;
    let match;
    let newContent = content;
    const uploads = [];
    while ((match = base64Regex.exec(content)) !== null) {
        uploads.push({ fullMatch: match[0], alt: match[1], base64: match[2] });
    }
    for (const item of uploads) {
        const url = await uploadToCloudinary(item.base64);
        if (url) {
            newContent = newContent.replace(item.fullMatch, `![${item.alt}](${url})`);
        }
    }
    return newContent;
}

async function uploadBase64ImagesArray(images) {
    const results = [];
    for (const img of images) {
        if (img.startsWith('data:image/')) {
            const url = await uploadToCloudinary(img);
            results.push(url || img); // Fallback to base64 if upload fails
        } else {
            results.push(img); // Already a URL
        }
    }
    return results;
}


document.addEventListener('DOMContentLoaded', () => {

    // --- CUSTOM MARKDOWN CONFIGURATION ---
    const renderer = new marked.Renderer();

    // 🔥 THE FIX: Support modern marked.js versions which pass a 'token' object instead of plain text
    renderer.code = function (token_or_code, lang_arg) {
        const code = typeof token_or_code === 'object' ? token_or_code.text : token_or_code;
        const language = typeof token_or_code === 'object' ? token_or_code.lang : lang_arg;

        const validLanguage = hljs.getLanguage(language) ? language : 'plaintext';

        let highlightedCode = code;
        if (code.length < 15000) {
            highlightedCode = hljs.highlight(code, { language: validLanguage }).value;
        }

        // Escape raw code for click injection
        const escapedRawCode = encodeURIComponent(code);

        return `
                <div class="code-block-wrapper my-4 rounded-xl overflow-hidden bg-[#1e1f20] border border-[#333537] shadow-lg">
                    <div class="code-block-header flex justify-between items-center px-4 py-2 bg-[#282a2c] border-b border-[#333537]">
                        <span class="text-xs font-semibold text-gray-400 capitalize tracking-wider">${validLanguage}</span>
                        <button class="copy-code-btn text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors" data-code="${escapedRawCode}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            Copy code
                        </button>
                    </div>
                    <div class="overflow-x-auto p-4 max-h-[500px]">
                        <pre><code class="hljs ${validLanguage}" style="background: transparent !important; padding: 0 !important;">${highlightedCode}</code></pre>
                    </div>
                </div>`;
    };

    // Use marked.use() instead of the deprecated setOptions()
    marked.use({ renderer: renderer });

    // --- STRICT CLOUD MEMORY ---
    let currentUser = null;
    let chats = [];
    let currentChatId = null;
    let userProfile = { name: 'User', avatar: null };
    let currentSelectedFiles = []; // 🔥 NEW: Stores text file contents
    const uploadFileBtn = document.getElementById('upload-file-btn');
    const chatFileInput = document.getElementById('chat-file-input');
    let appPersonas = [];
    let activePersonaId = 'nova_default';

    const DEFAULT_PERSONAS = [
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

    // 🚨 PASTE YOUR NGROK URL HERE WHEN YOU START YOUR LAPTOP 🚨
    const PYTHON_SERVER_URL = "https://baylee-endocentric-tamiko.ngrok-free.dev";

    // --- AUTH LOGIC ---
    const authOverlay = document.getElementById('auth-overlay');
    const emailSigninBtn = document.getElementById('email-signin-btn');
    const emailSignupBtn = document.getElementById('email-signup-btn');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authErrorMsg = document.getElementById('auth-error-msg');
    const logoutBtn = document.getElementById('logout-btn');

    function showAuthError(message) {
        authErrorMsg.textContent = message;
        authErrorMsg.classList.remove('hidden');
    }

    // Sign In Logic
    const rememberMeCheckbox = document.getElementById('remember-me-checkbox');

    if (emailSigninBtn) {
        emailSigninBtn.addEventListener('click', async () => {
            const email = authEmail.value.trim();
            const password = authPassword.value.trim();
            if (!email || !password) return showAuthError("Please enter email and password.");

            try {
                emailSigninBtn.textContent = "Signing in...";

                // 1. Check if the user wants to be remembered
                const persistenceType = rememberMeCheckbox.checked
                    ? browserLocalPersistence
                    : browserSessionPersistence;

                // 2. Set the persistence mode FIRST
                await setPersistence(auth, persistenceType);

                // 3. Then sign them in
                await signInWithEmailAndPassword(auth, email, password);

            } catch (error) {
                console.error("Login failed:", error);
                emailSigninBtn.textContent = "Sign In";
                showAuthError("Invalid email or password.");
            }
        });
    }

    // Sign Up Logic
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
                if (error.code === 'auth/email-already-in-use') {
                    showAuthError("Email already in use. Try signing in.");
                } else {
                    showAuthError("Failed to create account.");
                }
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Use your custom UI modal instead of the buggy native confirm()
            uiConfirm("Sign Out", "Are you sure you want to sign out?", "Sign Out", "bg-red-600 hover:bg-red-500", async () => {
                await signOut(auth);

                // Wipe memory entirely
                chats = [];
                currentChatId = null;
                userProfile = { name: 'User', avatar: null };
                appPersonas = DEFAULT_PERSONAS;
                activePersonaId = 'nova_default';

                // Reset Auth inputs so they are blank on the next login
                if (authEmail) authEmail.value = '';
                if (authPassword) authPassword.value = '';
                if (authErrorMsg) authErrorMsg.classList.add('hidden');
                if (emailSigninBtn) emailSigninBtn.textContent = "Sign In";
                if (emailSignupBtn) emailSignupBtn.textContent = "Create Account";

                updatePersonaUI();
                renderHistorySidebar();
                renderChatHistory();
                updateProfileUI();
                closeModal(profileModal, profileModalContent);
            });
        });
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            if (authOverlay) {
                authOverlay.classList.add('opacity-0');
                setTimeout(() => {
                    authOverlay.classList.add('hidden');
                    authOverlay.classList.remove('flex');
                }, 500);
            }
            initCloudData();
        } else {
            currentUser = null;
            if (authOverlay) {
                authOverlay.classList.remove('hidden');
                authOverlay.classList.add('flex');
                setTimeout(() => authOverlay.classList.remove('opacity-0'), 10);
            }
        }
    });

    // --- PURE CLOUD INITIALIZATION ---
    async function initCloudData() {
        try {
            // 1. Force Load Profile from Cloud (NO LocalStorage fallback)
            const cloudProfile = await loadProfileFromCloud();
            if (cloudProfile) {
                userProfile = cloudProfile;
            } else {
                // First time login: Create profile from Google Account, save instantly
                userProfile = {
                    name: currentUser.displayName || 'User',
                    avatar: currentUser.photoURL || null
                };
                await saveProfileToCloud(userProfile);
            }
            updateProfileUI();

            // 2. Force Load Personas from Cloud
            const cloudPersonas = await loadPersonasFromCloud();
            if (cloudPersonas && cloudPersonas.list) {
                appPersonas = cloudPersonas.list;
                activePersonaId = cloudPersonas.activeId || 'nova_default';
            } else {
                // First time login: Set default personas, save instantly
                appPersonas = DEFAULT_PERSONAS;
                activePersonaId = 'nova_default';
                await savePersonasToCloud(appPersonas, activePersonaId);
            }
            updatePersonaUI();

            // 3. Force Load Chats from Cloud
            const cloudChats = await loadHistoryFromCloud();
            if (cloudChats && cloudChats.length > 0) {
                chats = cloudChats;
            } else {
                chats = [];
            }
            currentChatId = null;

        } catch (e) {
            console.error("Cloud Init Failed:", e);
            chats = [];
            currentChatId = null;
        }

        renderHistorySidebar();
        renderChatHistory();
    }

    // --- CLOUD FIRESTORE FUNCTIONS ---
    async function saveHistoryToCloud(specificChatId = null) {
        if (!currentUser) return;
        try {
            // 🔥 FIX 1: Only save the specific chat that changed, NOT all of them!
            const chatToSaveId = specificChatId || currentChatId;
            const chatToSave = chats.find(c => c.id === chatToSaveId);

            if (!chatToSave) return; // Nothing to save

            // 🔥 FIX 2: Firestore 1MB Limit Protection
            const chatDataString = JSON.stringify(chatToSave);
            const sizeInMB = chatDataString.length / (1024 * 1024);

            let messagesToSave = chatToSave.messages;

            // ☁️ CLOUDINARY: Upload base64 images to Cloudinary, with fallback stripping
            if (sizeInMB > 0.9) {
                console.log(`Chat ${chatToSave.id} is large (${sizeInMB.toFixed(2)} MB). Uploading images to Cloudinary...`);
                messagesToSave = await Promise.all(chatToSave.messages.map(async (msg) => {
                    let newMsg = { ...msg };
                    // Upload base64 images embedded in AI content
                    if (newMsg.content) {
                        try {
                            newMsg.content = await uploadBase64ImagesInContent(newMsg.content);
                        } catch (e) {
                            console.warn('Cloudinary content upload failed, stripping base64:', e);
                        }
                        // FALLBACK: If any base64 still remains (upload failed), strip it so Firestore doesn't reject
                        newMsg.content = newMsg.content.replace(/!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/g, "\n*[Image uploaded to cloud]*\n");
                    }
                    // Upload base64 user-attached images
                    if (newMsg.images && newMsg.images.length > 0) {
                        try {
                            newMsg.images = await uploadBase64ImagesArray(newMsg.images);
                        } catch (e) {
                            console.warn('Cloudinary image array upload failed, filtering base64:', e);
                        }
                        // FALLBACK: Strip any remaining base64 images that failed to upload
                        newMsg.images = newMsg.images.filter(img => !img.startsWith('data:image/'));
                    }
                    return newMsg;
                }));

                // Final size safety check
                const finalSize = JSON.stringify(messagesToSave).length / (1024 * 1024);
                if (finalSize > 0.95) {
                    console.warn(`Chat still too large after Cloudinary (${finalSize.toFixed(2)} MB). Force-stripping remaining base64.`);
                    messagesToSave = messagesToSave.map(msg => {
                        let m = { ...msg };
                        if (m.content) m.content = m.content.replace(/!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/g, "\n*[Image too large to sync]*\n");
                        if (m.images) m.images = m.images.filter(img => !img.startsWith('data:image/'));
                        return m;
                    });
                }
            }

            // Save just the ONE chat
            await setDoc(doc(db, "users", currentUser.uid, "chats", chatToSave.id), {
                title: chatToSave.title,
                messages: messagesToSave,
                updatedAt: chatToSave.updatedAt || parseInt(chatToSave.id.split('-')[1]) || Date.now()
            });

        } catch (err) {
            console.error("Firebase chat save error:", err);
        }
    }

    async function deleteChatFromCloud(chatId) {
        if (!currentUser) return;
        try { await deleteDoc(doc(db, "users", currentUser.uid, "chats", chatId)); }
        catch (err) { console.error("Firebase chat delete error:", err); }
    }

    async function loadHistoryFromCloud() {
        if (!currentUser) return [];
        try {
            const snapshot = await getDocs(collection(db, "users", currentUser.uid, "chats"));
            const loadedChats = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                loadedChats.push({
                    id: docSnap.id,
                    title: data.title,
                    messages: data.messages || [],
                    // 🔥 Grab the timestamp
                    updatedAt: data.updatedAt || parseInt(docSnap.id.split('-')[1]) || 0
                });
            });

            // 🔥 THE FIX: Sort the array from newest to oldest before returning it
            loadedChats.sort((a, b) => b.updatedAt - a.updatedAt);

            return loadedChats;
        } catch (err) {
            console.error("Load chats error:", err);
            return [];
        }
    }

    async function saveProfileToCloud(profile) {
        if (!currentUser) return;
        try {
            await setDoc(doc(db, "users", currentUser.uid, "profile", "data"), {
                name: profile.name,
                avatar: profile.avatar || null
            });
        } catch (err) { console.error("Profile save error:", err); }
    }

    async function loadProfileFromCloud() {
        if (!currentUser) return null;
        try {
            const docSnap = await getDoc(doc(db, "users", currentUser.uid, "profile", "data"));
            return docSnap.exists() ? docSnap.data() : null;
        } catch (err) { return null; }
    }

    async function savePersonasToCloud(personasArray, activeId) {
        if (!currentUser) return;
        try {
            await setDoc(doc(db, "users", currentUser.uid, "personas", "data"), {
                list: personasArray,
                activeId: activeId
            });
            console.log("Personas securely saved to cloud.");
        } catch (err) { console.error("Persona save error:", err); }
    }

    async function loadPersonasFromCloud() {
        if (!currentUser) return null;
        try {
            const docSnap = await getDoc(doc(db, "users", currentUser.uid, "personas", "data"));
            return docSnap.exists() ? docSnap.data() : null;
        } catch (err) { return null; }
    }


    // --- DOM Elements ---
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const iconSend = document.getElementById('icon-send');
    const iconStop = document.getElementById('icon-stop');
    const chatContainer = document.getElementById('chat-container');
    const chatInner = document.getElementById('chat-inner');
    const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
    const emptyState = document.getElementById('empty-state');

    function showToast(message, type = "success") {
        const toast = document.createElement('div');
        toast.className = `px-4 py-3 rounded-full shadow-2xl text-[13px] tracking-wide font-medium text-white flex items-center gap-2 transform translate-y-[-100%] opacity-0 transition-all duration-300 ease-out border backdrop-blur-md ${type === 'success' ? 'bg-[#282a2c]/90 border-[#444749]' : 'bg-red-500/90 border-red-400'}`;
        const icon = type === 'success' ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
        toast.innerHTML = `${icon}${message}`;
        document.getElementById('toast-container').appendChild(toast);
        setTimeout(() => { toast.classList.remove('translate-y-[-100%]', 'opacity-0'); toast.classList.add('translate-y-0', 'opacity-100'); }, 10);
        setTimeout(() => { toast.classList.remove('translate-y-0', 'opacity-100'); toast.classList.add('translate-y-[-100%]', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000);
    }
    const historyList = document.getElementById('history-list');
    const headerModelDisplay = document.getElementById('header-model-display');

    const currentChatMenuBtn = document.getElementById('current-chat-menu-btn');
    const currentChatDropdown = document.getElementById('current-chat-dropdown');
    const headerRenameChatBtn = document.getElementById('header-rename-chat-btn');
    const headerDeleteChatBtn = document.getElementById('header-delete-chat-btn');

    const uploadImageBtn = document.getElementById('upload-image-btn');
    const chatImageInput = document.getElementById('chat-image-input');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreviewList = document.getElementById('image-preview-list');

    const settingsModal = document.getElementById('settings-modal');
    const settingsModalContent = document.getElementById('settings-modal-content');
    const settingsBtn = document.getElementById('settings-btn');



    const apiKeyInput = document.getElementById('api-key-input');
    const apiTextModelInput = document.getElementById('api-text-model-input');
    const apiVisionModelInput = document.getElementById('api-vision-model-input');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const settingsPersonaNameLabel = document.getElementById('settings-persona-name-label');

    const profileModal = document.getElementById('profile-modal');
    const profileModalContent = document.getElementById('profile-modal-content');
    const userProfileBtn = document.getElementById('user-profile-btn');
    const userProfileHeaderDisplay = document.getElementById('user-profile-header-display');
    const profileNameInput = document.getElementById('profile-name-input');
    const profileImageInput = document.getElementById('profile-image-input');
    const profileAvatarPreview = document.getElementById('profile-avatar-preview');
    const profileAvatarPreviewText = document.getElementById('profile-avatar-preview-text');
    const greetingName = document.getElementById('greeting-name');
    const userProfileInitial = document.getElementById('user-profile-initial');

    const personaToggle = document.getElementById('header-persona-toggle');
    const personaMenu = document.getElementById('persona-dropdown-menu');
    const personaChevron = document.getElementById('header-persona-chevron');
    const personaListContainer = document.getElementById('persona-list');
    const headerPersonaTitle = document.getElementById('header-persona-title');

    const createPersonaModal = document.getElementById('create-persona-modal');
    const createPersonaContent = document.getElementById('create-persona-content');
    const newPersonaName = document.getElementById('new-persona-name');
    const newPersonaPrompt = document.getElementById('new-persona-prompt');
    const personaModalTitle = document.getElementById('persona-modal-title');
    const editPersonaIdInput = document.getElementById('edit-persona-id');

    // --- Custom UI Modals Logic ---
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalContent = document.getElementById('confirm-modal-content');
    const renameModal = document.getElementById('rename-modal');
    const renameModalContent = document.getElementById('rename-modal-content');
    const renameChatInput = document.getElementById('rename-chat-input');

    let activeConfirmAction = null;
    let activeRenameAction = null;

    function uiConfirm(title, message, btnText, btnClass, actionCallback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        const actionBtn = document.getElementById('action-confirm-btn');
        actionBtn.textContent = btnText;
        actionBtn.className = `px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${btnClass}`;

        activeConfirmAction = actionCallback;
        openModal(confirmModal, confirmModalContent);
    }

    document.getElementById('cancel-confirm-btn').addEventListener('click', () => closeModal(confirmModal, confirmModalContent));
    document.getElementById('action-confirm-btn').addEventListener('click', () => {
        if (activeConfirmAction) activeConfirmAction();
        closeModal(confirmModal, confirmModalContent);
    });

    function uiPrompt(currentName, actionCallback) {
        renameChatInput.value = currentName;
        activeRenameAction = actionCallback;
        openModal(renameModal, renameModalContent);
        setTimeout(() => renameChatInput.focus(), 100);
    }

    document.getElementById('cancel-rename-btn').addEventListener('click', () => closeModal(renameModal, renameModalContent));

    function handleRenameSave() {
        const newTitle = renameChatInput.value.trim();
        if (newTitle && activeRenameAction) activeRenameAction(newTitle);
        closeModal(renameModal, renameModalContent);
    }

    document.getElementById('save-rename-btn').addEventListener('click', handleRenameSave);
    renameChatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleRenameSave();
    });


    // --- Persona Data & Logic ---
    function getActivePersona() {
        return appPersonas.find(p => p.id === activePersonaId) || appPersonas[0] || DEFAULT_PERSONAS[0];
    }

    // 🔥 THE UPDATED HEADER LOGIC
    function updateHeaderTitle() {
        const activePersona = getActivePersona();
        const activeChat = getActiveChat();

        // 1. The left button ONLY gets the Persona name
        headerPersonaTitle.textContent = activePersona.name;

        // 2. The center of the header gets the Chat title (if one exists)
        const centerTitleEl = document.getElementById('header-chat-title');
        if (centerTitleEl) {
            centerTitleEl.textContent = (activeChat && activeChat.title) ? activeChat.title : '';
        }
    }

    // Update this existing function to use the new updater
    function updatePersonaUI() {
        const active = getActivePersona();
        updateHeaderTitle(); // 🔥 Replaced the static text assignment
        systemPromptInput.value = active.prompt;
        settingsPersonaNameLabel.textContent = active.name;
        renderPersonaList();
    }

    function renderPersonaList() {
        personaListContainer.innerHTML = appPersonas.map(p => `
                    <div class="relative group persona-item-wrapper">
                        <button class="persona-item w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between pr-14 ${p.id === activePersonaId ? 'bg-[#333537] text-white' : 'text-gray-300 hover:bg-[#333537]'}" data-id="${p.id}">
                            <span class="truncate pointer-events-none">${p.name}</span>
                            ${p.id === activePersonaId ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400 shrink-0 pointer-events-none"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
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
                const id = e.currentTarget.dataset.id;
                activePersonaId = id;
                savePersonasToCloud(appPersonas, activePersonaId);
                updatePersonaUI();
                personaMenu.classList.add('hidden');
                personaChevron.style.transform = 'rotate(0deg)';
            });
        });
    }

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
            const p = appPersonas.find(x => x.id === editId);
            if (p) {
                p.name = name;
                p.prompt = prompt;
            }
        } else {
            const newId = 'custom_' + Date.now();
            appPersonas.push({ id: newId, name: name, prompt: prompt });
            activePersonaId = newId;
        }

        // Pure Cloud Save!
        savePersonasToCloud(appPersonas, activePersonaId);
        updatePersonaUI();
        closeModal(createPersonaModal, createPersonaContent);
    });

    // Settings Variables
    let OR_TEXT_MODEL = localStorage.getItem('or_text_model') || 'x-ai/grok-4-fast';
    let OR_VISION_MODEL = localStorage.getItem('or_vision_model') || 'x-ai/grok-4-fast';

    let isGenerating = false;
    let isEditingMode = false;
    let chatSnapshotBeforeEdit = null;
    let currentTypingId = null;
    let currentStreamingMsgId = null;
    let currentAbortController = null;
    let currentSelectedImages = []; // 🔥 RESTORED: This prevents the app from freezing!

    apiTextModelInput.value = OR_TEXT_MODEL;
    apiVisionModelInput.value = OR_VISION_MODEL;

    function updateModelBadge() {
        if (headerModelDisplay && !isGenerating) {
            headerModelDisplay.textContent = currentSelectedImages.length > 0 ? "Vision" : "Writing";
        }
    }
    updateModelBadge();

    function parseAIContent(text) {
        let formattedText = text;

        // We extract massive Base64 data URIs temporarily
        let extractedImages = [];
        formattedText = formattedText.replace(/!\[.*?\]\((data:image\/.*?)(?:\)|$)/g, (match, base64Data) => {
            extractedImages.push(base64Data);
            return `[[MASSIVE_IMAGE_${extractedImages.length - 1}]]`;
        });

        // 1. Temporarily protect your <think> tags
        formattedText = formattedText.replace(/<think>/g, "[[THINK_START]]").replace(/<\/think>/g, "[[THINK_END]]");

        // 🔥 THE FIX: Removed the broken HTML escaper here so Code Blocks can format properly!

        // 2. Restore the <think> tags
        formattedText = formattedText.replace(/\[\[THINK_START\]\]/g, '<think>').replace(/\[\[THINK_END\]\]/g, '</think>');

        let thinkCount = (formattedText.match(/<think>/g) || []).length;
        let endThinkCount = (formattedText.match(/<\/think>/g) || []).length;

        formattedText = formattedText.replace(/<think>/g, '<div class="think-box"><details open><summary><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2 inline"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg> Thought Process</summary><div class="think-content">');
        formattedText = formattedText.replace(/<\/think>/g, '</div></details></div>');
        if (thinkCount > endThinkCount) formattedText += '</div></details></div>';

        // 🔥 THE FIX: Upgraded DOMPurify to allow our new Custom Code Block UI
        let sanitizedHtml = DOMPurify.sanitize(marked.parse(formattedText), {
            ADD_TAGS: ['details', 'summary', 'button', 'svg', 'path', 'rect', 'polyline', 'line', 'circle'],
            ADD_ATTR: ['class', 'open', 'data-text', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'title', 'style']
        });

        // Put the massive images back securely as standard HTML tags
        extractedImages.forEach((base64Data, index) => {
            sanitizedHtml = sanitizedHtml.replace(`[[MASSIVE_IMAGE_${index}]]`, `<img src="${base64Data}" alt="Processed Image" loading="lazy" decoding="async" />`);
        });

        return sanitizedHtml;
    }

    function renderImagePreviews() {
        if (currentSelectedImages.length === 0 && currentSelectedFiles.length === 0) {
            imagePreviewContainer.classList.add('hidden');
            imagePreviewList.innerHTML = '';
            return;
        }

        imagePreviewContainer.classList.remove('hidden');
        let html = '';

        // Draw Images
        html += currentSelectedImages.map((img, idx) => `
                    <div class="relative inline-block shrink-0">
                        <img src="${img}" class="h-16 w-16 object-cover rounded-lg border border-[#333537] shadow-sm">
                        <button class="remove-image-btn absolute -top-2 -right-2 bg-[#444749] text-gray-200 hover:text-white rounded-full p-1 shadow-md transition-colors" data-index="${idx}" title="Remove image">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                `).join('');

        // 🔥 NEW: Draw File Chips
        html += currentSelectedFiles.map((file, idx) => `
                    <div class="relative inline-flex items-center gap-2 bg-[#282a2c] border border-[#333537] rounded-lg px-3 py-2 shrink-0 h-16 max-w-[180px]">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-blue-400 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <span class="text-xs text-gray-300 truncate font-mono">${file.name}</span>
                        <button class="remove-file-btn absolute -top-2 -right-2 bg-[#444749] text-gray-200 hover:text-white rounded-full p-1 shadow-md transition-colors" data-index="${idx}" title="Remove file">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                `).join('');

        imagePreviewList.innerHTML = html;
        updateModelBadge();
        setSendButtonState('ready');

        // Cleanup old counter labels
        const oldCounters = imagePreviewContainer.querySelectorAll('.image-counter-label');
        oldCounters.forEach(c => c.remove());
    }

    // ==========================================
    // 🔥 UNIFIED UPLOAD LOGIC (Images & Files)
    // ==========================================

    function processChatImageFile(file) {
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
                currentSelectedImages.push(canvas.toDataURL('image/jpeg', 0.8));
                renderImagePreviews();
                handleInput();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        imagePreviewList.scrollTo({ left: 10000, behavior: 'smooth' });
    }

    function processChatTextFile(file) {
        if (!file) return;
        // Prevent crashing browser with massive log files (Limit: 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert(`File ${file.name} is too large. Limit is 5MB.`);
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            currentSelectedFiles.push({
                name: file.name,
                content: e.target.result
            });
            renderImagePreviews();
            handleInput();
        };
        reader.readAsText(file);
        imagePreviewList.scrollTo({ left: 10000, behavior: 'smooth' });
    }

    // --- Button Listeners ---
    chatFileInput.addEventListener('click', function (e) { e.stopPropagation(); this.value = null; });
    uploadFileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        chatFileInput.click();
    });

    chatFileInput.addEventListener('change', (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        Array.from(e.target.files).forEach(file => processChatTextFile(file));
    });

    chatImageInput.addEventListener('click', function (e) { e.stopPropagation(); this.value = null; });
    uploadImageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        chatImageInput.click();
    });

    chatImageInput.addEventListener('change', (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const availableSlots = 9 - currentSelectedImages.length;
        const filesToProcess = Array.from(e.target.files).slice(0, availableSlots);
        if (e.target.files.length > availableSlots) {
            alert(`Limit reached! Only added ${availableSlots} image(s).`);
        }
        filesToProcess.forEach(file => processChatImageFile(file));
    });

    // --- Removal Listeners ---
    imagePreviewContainer.addEventListener('click', (e) => {
        const removeImgBtn = e.target.closest('.remove-image-btn');
        const removeFileBtn = e.target.closest('.remove-file-btn');
        if (removeImgBtn) {
            const idx = parseInt(removeImgBtn.dataset.index);
            currentSelectedImages.splice(idx, 1);
            renderImagePreviews();
            handleInput();
            updateModelBadge();
        }
        if (removeFileBtn) {
            const idx = parseInt(removeFileBtn.dataset.index);
            currentSelectedFiles.splice(idx, 1);
            renderImagePreviews();
            handleInput();
        }
    });
    // ==========================================

    chatInput.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        let imageFound = false;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    processChatImageFile(file);
                    imageFound = true;
                }
            }
        }
        if (imageFound) e.preventDefault();
    });


    // --- MOBILE LONG-PRESS LOGIC (Like ChatGPT/Gemini) ---
    let longPressTimer;
    let isLongPress = false;
    let lpTouchStartX = 0;  // 🔥 Renamed to avoid collision
    let lpTouchStartY = 0;  // 🔥 Renamed to avoid collision

    chatInner.addEventListener('touchstart', (e) => {
        const msgContainer = e.target.closest('.msg-container');
        // Only trigger if we are tapping a message that actually has options (like a user message)
        if (!msgContainer || !msgContainer.querySelector('.msg-options')) return;

        isLongPress = false;
        lpTouchStartX = e.touches[0].clientX;
        lpTouchStartY = e.touches[0].clientY;

        longPressTimer = setTimeout(() => {
            isLongPress = true;
            // Give a tiny physical vibration feedback if the phone supports it
            if (navigator.vibrate) navigator.vibrate(40);

            // Close any other open menus
            document.querySelectorAll('.msg-container.active-options').forEach(el => el.classList.remove('active-options'));

            // Pop open the options for this specific message
            msgContainer.classList.add('active-options');
        }, 500); // 500ms hold time
    }, { passive: true });

    chatInner.addEventListener('touchmove', (e) => {
        if (!longPressTimer) return;
        const dx = Math.abs(e.touches[0].clientX - lpTouchStartX);
        const dy = Math.abs(e.touches[0].clientY - lpTouchStartY);
        // If they move their finger (scrolling), cancel the long-press
        if (dx > 10 || dy > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }, { passive: true });

    chatInner.addEventListener('touchend', () => {
        if (longPressTimer) clearTimeout(longPressTimer);
    });
    chatInner.addEventListener('touchcancel', () => {
        if (longPressTimer) clearTimeout(longPressTimer);
    });

    // If you tap anywhere else on the screen, close the open edit menus
    document.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.msg-options') && !isLongPress) {
            document.querySelectorAll('.msg-container.active-options').forEach(el => el.classList.remove('active-options'));
        }
    }, { passive: true });
    // --------------------------------------------------


    // --- Event Listeners ---
    chatInput.addEventListener('input', handleInput);
    chatInput.addEventListener('keydown', handleKeydown);
    sendBtn.addEventListener('click', () => handleBtnClick());

    document.getElementById('new-chat-btn').addEventListener('click', () => {
        cancelEditMode(true);
        if (isGenerating) cancelGeneration();
        currentChatId = null;
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
            if (isGenerating) cancelGeneration();
            chats.forEach(chat => deleteChatFromCloud(chat.id));
            chats = [];
            currentChatId = null;
            saveHistory();
            renderChatHistory();
        });
    });

    currentChatMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentChatDropdown.classList.toggle('hidden');
    });

    headerRenameChatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentChatDropdown.classList.add('hidden');
        if (currentChatId) renameChat(currentChatId);
    });

    headerDeleteChatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentChatDropdown.classList.add('hidden');
        if (currentChatId) deleteChat(currentChatId);
    });

    document.addEventListener('click', async (e) => {
        if (!e || !e.target) return;

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

        if (copyCodeBtn) {
            const rawCode = decodeURIComponent(copyCodeBtn.getAttribute('data-code') || '');
            copyToClipboard(rawCode, copyCodeBtn, "Code copied!");
            return;
        }
        const chatOptionsBtn = e.target.closest('.chat-options-btn');
        const renameChatBtn = e.target.closest('.rename-chat-btn');
        const deleteChatBtn = e.target.closest('.delete-chat-btn');
        const chatHistoryItem = e.target.closest('.chat-history-item');
        const editPersonaBtn = e.target.closest('.edit-persona-btn');
        const deletePersonaBtn = e.target.closest('.delete-persona-btn');

        if (!e.target.closest('#persona-dropdown-container') && personaMenu && !personaMenu.classList.contains('hidden')) {
            personaMenu.classList.add('hidden');
            personaChevron.style.transform = 'rotate(0deg)';
        }

        if (!chatOptionsBtn) {
            document.querySelectorAll('.chat-dropdown').forEach(d => d.classList.add('hidden'));
        }

        if (copyBtn) {
            // 🔥 THE IMAGE COPY FIX (Using safe DOM method instead of Regex)
            const msgContainer = copyBtn.closest('.msg-container');
            const imgElement = msgContainer ? msgContainer.querySelector('img[src^="data:image"]') : null;

            if (imgElement) {
                try {
                    const originalHTML = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<span class="text-xs font-bold text-blue-400">Copying...</span>`;

                    // Convert Base64 string to a real Image Blob
                    const res = await fetch(imgElement.src);
                    const blob = await res.blob();

                    // Write the Image Blob to the system clipboard
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);

                    copyBtn.innerHTML = `<span class="text-xs font-bold text-green-400">Image Copied!</span>`;
                    setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
                } catch (err) {
                    console.error("Clipboard API failed to copy image", err);
                    const text = decodeURIComponent(copyBtn.getAttribute('data-text') || '');
                    await copyToClipboard(text, copyBtn); // Fallback to raw text if it fails
                }
            } else {
                // Standard text copy for normal AI responses
                const text = decodeURIComponent(copyBtn.getAttribute('data-text') || '');
                await copyToClipboard(text, copyBtn);
            }

        } else if (downloadBtn) {
            // 📥 Download: works for both base64 blobs and Cloudinary URLs
            const msgContainer = downloadBtn.closest('.msg-container');
            // Find any image in the message (base64 OR external URL)
            const imgElement = msgContainer ? msgContainer.querySelector('img:not(.avatar-glow-wrapper img)') : null;

            if (imgElement) {
                const originalHTML = downloadBtn.innerHTML;
                downloadBtn.innerHTML = `<span class="text-xs font-bold text-green-400">Downloading...</span>`;

                try {
                    // Fetch as blob to handle both base64 data URIs and CORS external URLs
                    const res = await fetch(imgElement.src);
                    const blob = await res.blob();
                    const blobUrl = URL.createObjectURL(blob);

                    const ext = blob.type.split('/')[1] || 'png';
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = `Nova_Image_${Date.now()}.${ext}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

                    downloadBtn.innerHTML = `<span class="text-xs font-bold text-green-400">Done!</span>`;
                } catch (err) {
                    console.error('Download failed:', err);
                    // Last resort: open image in new tab
                    window.open(imgElement.src, '_blank');
                    downloadBtn.innerHTML = `<span class="text-xs font-bold text-yellow-400">Opened!</span>`;
                }
                setTimeout(() => downloadBtn.innerHTML = originalHTML, 2000);
            }

        } else if (regenBtn) {
            const idx = parseInt(regenBtn.dataset.index);
            regenerateMessage(idx);
        } else if (editMsgBtn) {
            if (isGenerating) return;
            const idx = parseInt(editMsgBtn.dataset.index);
            const activeChat = getActiveChat();
            if (!activeChat) return;

            const msgToEdit = activeChat.messages[idx];
            if (msgToEdit && msgToEdit.role === 'user') {

                // 🔥 EDIT MODE FIX
                // If we are already editing something else, restore it first silently
                if (isEditingMode) activeChat.messages = chatSnapshotBeforeEdit;

                isEditingMode = true;
                // Take a deep copy snapshot of the current history
                chatSnapshotBeforeEdit = JSON.parse(JSON.stringify(activeChat.messages));

                chatInput.value = msgToEdit.content || '';
                currentSelectedImages = [...(msgToEdit.images || [])];
                renderImagePreviews();

                // Slice the array locally, but DO NOT save to Firebase yet
                activeChat.messages = activeChat.messages.slice(0, idx);

                // Show the banner
                const banner = document.getElementById('edit-mode-banner');
                if (banner) {
                    banner.classList.remove('hidden');
                    banner.classList.add('flex');
                }

                renderChatHistory();
                handleInput();
                chatInput.focus();
            }
        } else if (editPersonaBtn) {
            e.stopPropagation();
            const id = editPersonaBtn.dataset.id;
            const p = appPersonas.find(x => x.id === id);
            if (p) {
                personaMenu.classList.add('hidden');
                personaChevron.style.transform = 'rotate(0deg)';
                personaModalTitle.textContent = "Edit Persona";
                editPersonaIdInput.value = p.id;
                newPersonaName.value = p.name;
                newPersonaPrompt.value = p.prompt;
                openModal(createPersonaModal, createPersonaContent);
            }
        } else if (deletePersonaBtn) {
            e.stopPropagation();
            const id = deletePersonaBtn.dataset.id;
            if (id !== 'nova_default') {
                uiConfirm("Delete Persona", "Are you sure you want to delete this custom persona?", "Delete", "bg-red-600 hover:bg-red-500", () => {
                    appPersonas = appPersonas.filter(x => x.id !== id);
                    if (activePersonaId === id) {
                        activePersonaId = 'nova_default';
                    }
                    savePersonasToCloud(appPersonas, activePersonaId);
                    updatePersonaUI();
                });
            }
        } else if (chatOptionsBtn) {
            e.stopPropagation();
            const id = chatOptionsBtn.dataset.id;
            const dropdown = document.getElementById(`dropdown-${id}`);
            if (dropdown) {
                document.querySelectorAll('.chat-dropdown').forEach(d => {
                    if (d.id !== `dropdown-${id}`) d.classList.add('hidden');
                });
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
            if (targetId === currentChatId) return;
            if (isGenerating) cancelGeneration();
            currentChatId = targetId;
            renderChatHistory();
            renderHistorySidebar();
            if (window.innerWidth < 768) {
                const sb = document.getElementById('sidebar');
                if (sb) sb.classList.remove('show');
                const backdrop = document.getElementById('sidebar-backdrop');
                if (backdrop) backdrop.classList.remove('show');
            }
        }
    });

    function renameChat(id) {
        const chat = chats.find(c => c.id === id);
        if (!chat) return;
        uiPrompt(chat.title, (newTitle) => {
            chat.title = newTitle;
            saveHistory(id); // 🔥 Pass the specific ID here so Firebase only updates this one
            updateHeaderTitle();
        });
    }

    function deleteChat(id) {
        uiConfirm("Delete Chat", "Are you sure you want to delete this conversation?", "Delete", "bg-red-600 hover:bg-red-500", () => {
            deleteChatFromCloud(id);
            chats = chats.filter(c => c.id !== id);
            if (currentChatId === id) {
                if (isGenerating) cancelGeneration();
                currentChatId = null;
                renderChatHistory();
            }
            saveHistory();
        });
    }

    function openModal(modal, content) {
        if (!modal || !content) return;
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
        }, 10);
    }
    function closeModal(modal, content) {
        if (!modal || !content) return;
        modal.classList.add('opacity-0');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }

    settingsBtn.addEventListener('click', () => {
        openModal(settingsModal, settingsModalContent);
    });
    document.getElementById('close-settings-btn').addEventListener('click', () => closeModal(settingsModal, settingsModalContent));
    document.getElementById('cancel-settings-btn').addEventListener('click', () => closeModal(settingsModal, settingsModalContent));
    document.getElementById('save-settings-btn').addEventListener('click', () => {
        OR_TEXT_MODEL = apiTextModelInput.value.trim() || 'x-ai/grok-4-fast';
        OR_VISION_MODEL = apiVisionModelInput.value.trim() || 'x-ai/grok-4-fast';

        const active = getActivePersona();
        active.prompt = systemPromptInput.value.trim() || '';

        localStorage.setItem('or_text_model', OR_TEXT_MODEL);
        localStorage.setItem('or_vision_model', OR_VISION_MODEL);

        updateModelBadge();
        savePersonasToCloud(appPersonas, activePersonaId);
        closeModal(settingsModal, settingsModalContent);
    });



    let tempProfileImage = null;
    // ── Paste your 5 anime image URLs here ──
    // They must be direct image links (ending in .jpg, .png, .webp etc. OR a CDN URL)
    const ANIME_BACKGROUNDS = [
        'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219540/wall_-_2_siefa6.jpg',
        'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219538/wall_-_1_b4jgab.jpg',
        'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219537/wall_-_5_fy8da6.jpg',
        'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219536/wall_-_4_qflqyz.jpg',
        'https://res.cloudinary.com/dpb7c46v0/image/upload/v1774219535/wall_-_3_gdt9ub.jpg',
    ];

    // Preload the images so they appear instantly when the modal opens
    ANIME_BACKGROUNDS.forEach(url => {
        if (url && !url.includes('PASTE_IMAGE')) {
            const img = new Image();
            img.src = url;
        }
    });

    let lastBannerIdx = -1;

    function setRandomProfileBanner() {
        const banner = document.querySelector('.profile-banner-anim');
        if (!banner) return;
        // Pick a different one each time
        let idx;
        do { idx = Math.floor(Math.random() * ANIME_BACKGROUNDS.length); } while (idx === lastBannerIdx && ANIME_BACKGROUNDS.length > 1);
        lastBannerIdx = idx;
        const url = ANIME_BACKGROUNDS[idx];
        if (url && !url.includes('PASTE_IMAGE')) {
            banner.style.backgroundImage = `url('${url}')`;
            banner.style.backgroundSize = 'cover';
            banner.style.backgroundPosition = 'center';
            banner.style.animation = 'none'; // disable the CSS keyframe
        }
    }

    userProfileBtn.addEventListener('click', () => {
        profileNameInput.value = userProfile.name;
        tempProfileImage = userProfile.avatar;
        // Populate the new Discord-style fields
        const emailEl = document.getElementById('profile-email-display');
        if (emailEl && currentUser) emailEl.textContent = currentUser.email || '';
        const namePreview = document.getElementById('profile-display-name-preview');
        if (namePreview) namePreview.textContent = userProfile.name || 'User';
        setRandomProfileBanner();
        updateProfilePreview();
        openModal(profileModal, profileModalContent);
    });
    document.getElementById('close-profile-btn').addEventListener('click', () => closeModal(profileModal, profileModalContent));
    document.getElementById('cancel-profile-btn').addEventListener('click', () => closeModal(profileModal, profileModalContent));

    // ── Click outside to close ──
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) closeModal(profileModal, profileModalContent);
    });

    // ── Escape key to close ──
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !profileModal.classList.contains('hidden')) {
            closeModal(profileModal, profileModalContent);
        }
    });

    // ── Password accordion toggle ──
    document.getElementById('toggle-password-section')?.addEventListener('click', () => {
        const section = document.getElementById('password-section');
        const chevron = document.getElementById('pw-chevron');
        const isHidden = section.classList.contains('hidden');
        section.classList.toggle('hidden', !isHidden);
        chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        if (isHidden) {
            // Clear fields when opening
            ['current-password-input', 'new-password-input', 'confirm-password-input'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const statusEl = document.getElementById('password-status');
            if (statusEl) { statusEl.classList.add('hidden'); statusEl.textContent = ''; }
        }
    });

    // ── Change password with Firebase reauthentication ──
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
            const credential = EmailAuthProvider.credential(currentUser.email, currentPw);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPw);
            showStatus('✓ Password updated successfully!', false);
            // Clear fields after success
            ['current-password-input', 'new-password-input', 'confirm-password-input'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
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

    profileImageInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                tempProfileImage = event.target.result;
                updateProfilePreview();
            };
            reader.readAsDataURL(file);
        }
    });



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

    profileNameInput.addEventListener('input', updateProfilePreview);

    document.getElementById('save-profile-btn').addEventListener('click', () => {
        userProfile.name = profileNameInput.value.trim() || 'User';
        userProfile.avatar = tempProfileImage;
        saveProfileToCloud(userProfile);
        updateProfileUI();
        renderChatHistory();
        closeModal(profileModal, profileModalContent);
    });

    function updateProfileUI() {
        const firstName = userProfile.name.split(' ')[0] || 'User';
        greetingName.textContent = firstName;
        if (userProfile.avatar) {
            userProfileHeaderDisplay.style.backgroundImage = `url('${userProfile.avatar}')`;
            userProfileInitial.style.display = 'none';
        } else {
            userProfileHeaderDisplay.style.backgroundImage = 'none';
            userProfileInitial.style.display = 'block';
            userProfileInitial.textContent = userProfile.name.charAt(0).toUpperCase();
        }
    }

    // --- Responsive Sidebar Menu ---
    const sidebar = document.getElementById('sidebar');
    const headerMenuBtn = document.getElementById('header-menu-btn');

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
            sidebar.classList.toggle('hidden');
            sidebar.classList.remove('absolute', 'z-50', 'shadow-2xl');
        }
    }
    headerMenuBtn.addEventListener('click', toggleSidebar);

    let touchStartX = 0;
    let touchEndX = 0;
    let touchStartY = 0; // NEW: Track vertical touch
    let touchEndY = 0;   // NEW: Track vertical release
    let isEdgeSwipe = false;
    const swipeBackdrop = document.getElementById('sidebar-backdrop');

    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
        isEdgeSwipe = touchStartX < 40;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;

        // Smarter check: Only ignore if it's a true vertical scroll
        if (Math.abs(diffY) > 15 && Math.abs(diffY) > Math.abs(diffX)) {
            return;
        }

        if (window.innerWidth < 768) {
            if (diffX > 40 && isEdgeSwipe) {
                if (isKeyboardOpen) chatInput.blur();
                // Just toggle the show class, let CSS handle the styling
                sidebar.classList.add('show');
                if (swipeBackdrop) swipeBackdrop.classList.add('show');
            }
            if (diffX < -40) {
                sidebar.classList.remove('show');
                if (swipeBackdrop) swipeBackdrop.classList.remove('show');
            }
        }
    }

    document.addEventListener('click', (e) => {
        if (window.innerWidth < 768 && !sidebar.contains(e.target) && !headerMenuBtn.contains(e.target)) {
            sidebar.classList.remove('show');
            const backdrop = document.getElementById('sidebar-backdrop');
            if (backdrop) backdrop.classList.remove('show');
        }
    });

    // --- Chat/UI Logic ---
    // Tell Firebase exactly which chat to save
    function saveHistory(chatId = null) {
        saveHistoryToCloud(chatId || currentChatId);
        renderHistorySidebar();
    }

    function getActiveChat() {
        return chats.find(c => c.id === currentChatId);
    }

    function addMessageToHistory(msgObj) {
        if (!currentChatId) {
            currentChatId = 'chat-' + Date.now();
            let titleText = msgObj.content || (msgObj.images && msgObj.images.length > 0 ? "Image Upload" : "New Chat");
            let words = titleText.split(' ');
            let title = words.slice(0, 5).join(' ');
            if (words.length > 5) title += '...';

            // 🔥 Added updatedAt timestamp
            chats.unshift({ id: currentChatId, title: title, messages: [], updatedAt: Date.now() });
            updateHeaderTitle();
        }
        const chatIndex = chats.findIndex(c => c.id === currentChatId);
        if (chatIndex > -1) {
            const chat = chats[chatIndex];
            chat.messages.push(msgObj);
            chat.updatedAt = Date.now(); // 🔥 Refresh the timestamp so it becomes "New" again

            chats.splice(chatIndex, 1);
            chats.unshift(chat);
        }
        saveHistory();
    }

    function getTimeString() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    async function copyToClipboard(text, btn, toastMsg = "Copied to clipboard!") {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
        }
        showToast(toastMsg);
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="text-xs font-bold text-green-400">Copied!</span>`;
        setTimeout(() => btn.innerHTML = originalHTML, 2000);
    }

    function handleInput() {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';

        const hasText = chatInput.value.trim().length > 0;
        const hasImages = currentSelectedImages.length > 0;
        const hasFiles = currentSelectedFiles.length > 0; // 🔥 NEW
        const tooManyImages = currentSelectedImages.length > 9;

        if (!isGenerating) {
            if ((hasText || hasImages || hasFiles) && !tooManyImages) setSendButtonState('ready');
            else setSendButtonState('disabled');
        }
    }

    function handleKeydown(e) {
        if (window.innerWidth < 768 && e.key === 'Enter') return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if ((chatInput.value.trim().length > 0 || currentSelectedImages.length > 0) && !isGenerating) {
                startMessageFlow();
            }
        }
    }

    function handleBtnClick() {
        if (isGenerating) cancelGeneration();
        else if (!sendBtn.hasAttribute('disabled')) startMessageFlow();
    }

    function setSendButtonState(state) {
        if (state === 'disabled') {
            sendBtn.className = 'p-2 bg-[#333537] text-gray-500 rounded-full transition-all duration-200 cursor-not-allowed flex items-center justify-center w-10 h-10';
            sendBtn.setAttribute('disabled', 'true');
            iconSend.classList.remove('hidden'); iconStop.classList.add('hidden');
        } else if (state === 'ready') {
            sendBtn.className = 'p-2 bg-white text-black hover:bg-gray-200 rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center w-10 h-10';
            sendBtn.removeAttribute('disabled');
            iconSend.classList.remove('hidden'); iconStop.classList.add('hidden');
        } else if (state === 'generating') {
            sendBtn.className = 'p-2 bg-[#333537] text-white hover:bg-[#444749] rounded-full transition-all duration-200 cursor-pointer flex items-center justify-center w-10 h-10';
            sendBtn.removeAttribute('disabled');
            iconSend.classList.add('hidden'); iconStop.classList.remove('hidden');
        }
    }

    function renderHistorySidebar() {
        if (chats.length === 0) {
            historyList.innerHTML = '<p class="text-sm text-gray-500 px-2 italic mt-2">No recent chats</p>';
            return;
        }
        historyList.innerHTML = chats.map(chat => {
            const isActive = chat.id === currentChatId;

            // 🔥 Escape the title so code doesn't break the sidebar HTML
            const safeTitle = (chat.title || "New Chat").replace(/</g, "&lt;").replace(/>/g, "&gt;");

            return `
                    <div class="relative flex items-center group w-full mb-1">
                        <button class="chat-history-item flex-1 text-left flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-sm truncate pr-10 ${isActive ? 'bg-[#3f4145] text-white font-medium shadow-sm border border-[#505357]' : 'text-gray-300 hover:bg-[#2d2f31] hover:text-white border border-transparent'}" data-id="${chat.id}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-400 group-hover:text-gray-300'}"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span class="truncate pointer-events-none">${safeTitle}</span>
                        </button>
                        <button class="chat-options-btn absolute right-2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#505357] opacity-0 group-hover:opacity-100 transition-all" data-id="${chat.id}" title="Options">
                        </button>
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

    function renderChatHistory() {
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

    function appendMessageUI(msgObj, msgIndex, animate = true) {
        emptyState.classList.add('hidden');
        const timeStr = msgObj.timestamp || getTimeString();
        const safeContent = msgObj.content || '';
        const escapedContent = encodeURIComponent(safeContent);
        let html = '';

        if (msgObj.role === 'user') {
            const userFirstName = userProfile.name.split(' ')[0] || 'User';

            // Escape HTML so code blocks look like text, not real buttons!
            const textContent = safeContent
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            // Increased to w-8 h-8 to match the AI avatar size
            let avatarHtml = userProfile.avatar
                ? `<div class="w-6 h-6 shrink-0 user-glow-wrapper translate-y-1"><div class="user-glow-inner bg-cover bg-center" style="background-image: url('${userProfile.avatar}')"></div></div>`
                : `<div class="w-6 h-6 shrink-0 user-glow-wrapper translate-y-1"><div class="user-glow-inner bg-[#131314] text-white flex items-center justify-center text-[10px] font-bold">${userFirstName.charAt(0).toUpperCase()}</div></div>`;

            let imageHtml = '';
            if (msgObj.images && msgObj.images.length > 0) {
                const count = msgObj.images.length;
                let layoutClass = count === 1 ? "flex max-w-[280px]" : count === 2 ? "grid grid-cols-2 max-w-[380px]" : "grid grid-cols-2 sm:grid-cols-3 max-w-[450px]";
                let imgClass = count === 1 ? "max-h-[350px] w-auto object-cover rounded-2xl" : "aspect-square w-full object-cover rounded-xl hover:scale-[1.02] transition-transform";

                imageHtml = `<div class="${layoutClass} gap-2 mb-1.5 ml-auto">` +
                    msgObj.images.map(img => `<img src="${img}" class="${imgClass} border border-[#333537]/80 shadow-sm" loading="lazy" decoding="async">`).join('') +
                    `</div>`;
            }

            // 🔥 NEW: Build File Chips for the Chat Bubble
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

            // NEW LAYOUT: Avatar on the right, matching the AI's structure
            html = `
                    <div class="msg-container flex items-start gap-4 justify-end ${animate ? 'opacity-0 transition-opacity duration-300' : ''}">
                        <div class="flex-1 min-w-0 flex flex-col items-end pl-12 relative z-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs text-gray-600">${timeStr}</span>
                                <span class="text-sm text-gray-300 font-medium">${userFirstName}</span>
                            </div>
                            <!-- Media floating above bubble -->
                            ${imageHtml || filesHtml ? `<div class="w-full flex flex-col items-end mb-1">${imageHtml}${filesHtml}</div>` : ''}

                            <!-- Buttons-left + Bubble-right row (Gemini style) -->
                            <div class="flex items-center gap-1.5">
                                <!-- Action Buttons to the LEFT of the bubble -->
                                <div class="flex items-center gap-0.5">
                                    <button class="copy-user-msg-btn w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-[#333537] transition-all" data-text="${escapedContent}" title="Copy message">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                    </button>
                                    <button class="edit-msg-btn w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-blue-400 hover:bg-[#333537] transition-all" data-index="${msgIndex}" title="Edit message">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                    </button>
                                </div>

                                <!-- Core Text Bubble -->
                                ${textContent.trim() ? `
                                <div class="bg-[#1451b5] px-5 py-3.5 rounded-3xl rounded-tr-sm text-[15px] leading-relaxed text-white shadow-sm">
                                    ${textContent.replace(/\n/g, '<br>')}
                                </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="mt-1 shrink-0">
                            ${avatarHtml}
                        </div>
                    </div>`;
        } else if (msgObj.role === 'ai') {
            const aiNameDisplay = msgObj.personaName || 'Nova';
            const aiAvatarHtml = `<div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper"><div class="avatar-glow-inner"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div>`;

            // 🔥 THE NEW FEATURE: Check if the message contains a processed image
            // Detect ANY inline image (base64 OR Cloudinary/external URL) to show the download button
            const hasInlineImage = /!\[.*?\]\((https?:\/\/[^\)]+|data:image\/[^;]+;base64,[^\)]+)\)/.test(safeContent);
            const dlBtnHtml = hasInlineImage ? `<button class="download-msg-btn w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-[#333537] transition-all" title="Download Image"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>` : '';

            const footerHtml = `
                        <div class="flex items-center gap-0.5 mt-3 pt-1">
                            <button class="copy-msg-btn w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-[#333537] transition-all" data-text="${escapedContent}" title="Copy response">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                            </button>
                            <button class="regen-btn w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-200 hover:bg-[#333537] transition-all" data-index="${msgIndex}" title="Regenerate response">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg>
                            </button>
                            ${dlBtnHtml}
                        </div>`;

            if (msgObj.status === 'cancelled') {
                html = `<div class="msg-container flex items-start gap-4 ${animate ? 'opacity-0 transition-opacity duration-300' : ''}">${aiAvatarHtml}<div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${aiNameDisplay}</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="text-[15px] leading-relaxed text-gray-200 mt-2"><div class="inline-flex items-center gap-2 bg-[#282a2c] border border-[#333537] px-3 py-2 rounded-lg text-gray-400"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>Response was cancelled</span></div>${footerHtml}</div></div></div>`;
            } else if (msgObj.status === 'error') {
                html = `<div class="msg-container flex items-start gap-4 ${animate ? 'opacity-0 transition-opacity duration-300' : ''}"><div class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-tr from-red-600 to-orange-500 mt-1"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-red-400 font-medium">System Error</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="text-[15px] leading-relaxed text-gray-200 mt-2 bg-red-900/20 border border-red-500/30 px-4 py-3 rounded-xl text-red-200">${safeContent}</div>${footerHtml}</div></div>`;
            } else {
                html = `<div class="msg-container flex items-start gap-4 group" id="${currentStreamingMsgId}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper"><div class="avatar-glow-inner"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div class="flex-1 min-w-0 pr-12 relative z-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${aiNameDisplay}</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="markdown-body text-[15px] leading-relaxed text-gray-200">${parseAIContent(safeContent, false)}</div>${footerHtml}</div></div>`;
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

    function showTyping() {
        currentTypingId = `typing-${Date.now()}`;
        const aiNameDisplay = getActivePersona().name;
        const typingHtml = `<div class="msg-container flex items-start gap-4" id="${currentTypingId}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper"><div class="avatar-glow-inner"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${aiNameDisplay}</span></div><div class="flex items-center gap-1.5 h-6"><div class="w-1.5 h-1.5 bg-[#444749] rounded-full typing-dot"></div><div class="w-1.5 h-1.5 bg-[#444749] rounded-full typing-dot"></div><div class="w-1.5 h-1.5 bg-[#444749] rounded-full typing-dot"></div></div></div></div>`;
        chatInner.insertAdjacentHTML('beforeend', typingHtml);
        scrollToBottom();
    }

    function removeTyping() {
        if (currentTypingId) {
            const el = document.getElementById(currentTypingId);
            if (el) el.remove();
            currentTypingId = null;
        }
    }

    function scrollToBottom() {
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
    }

    function regenerateMessage(aiMsgIndex) {
        if (isGenerating) return;
        const activeChat = getActiveChat();
        if (!activeChat) return;

        const userMsgIndex = aiMsgIndex - 1;
        if (userMsgIndex < 0 || activeChat.messages[userMsgIndex].role !== 'user') return;

        const userMsgToResend = activeChat.messages[userMsgIndex];
        const imagesToResend = userMsgToResend.images || [];
        const filesToResend = userMsgToResend.files || []; // 🔥 FIX

        activeChat.messages = activeChat.messages.slice(0, aiMsgIndex);
        saveHistory();
        renderChatHistory();

        startMessageFlow(userMsgToResend.content, imagesToResend, filesToResend);
    }

    // --- OPENROUTER API INTEGRATION ---
    async function startMessageFlow(regenText = null, regenImages = null, regenFiles = null) { // 🔥 FIX
        const isRegen = regenText !== null;
        const text = isRegen ? regenText : chatInput.value.trim();
        const imagesToUse = isRegen ? regenImages : [...currentSelectedImages];

        // Allow sending if there is text, OR an image, OR a file
        if (!text && imagesToUse.length === 0 && currentSelectedFiles.length === 0) return;

        const hasImageInCurrentInput = imagesToUse.length > 0;

        if (!isRegen) {

            if (isEditingMode) {
                isEditingMode = false;
                chatSnapshotBeforeEdit = null;
                const banner = document.getElementById('edit-mode-banner');
                if (banner) { banner.classList.add('hidden'); banner.classList.remove('flex'); }
                saveHistory();
                currentSelectedFiles = [];
            }

            const filesToUse = isRegen ? regenFiles : [...currentSelectedFiles]; // Add regenFiles to function args if desired, or just use current
            const userMsg = { role: 'user', content: text, images: imagesToUse, files: filesToUse, timestamp: getTimeString() };
            addMessageToHistory(userMsg);
            appendMessageUI(userMsg, getActiveChat().messages.length - 1);

            chatInput.value = '';
            chatInput.style.height = 'auto';
            currentSelectedImages = [];
            imagePreviewContainer.classList.add('hidden');
            chatImageInput.value = '';
        }

        isGenerating = true;
        setSendButtonState('generating');
        scrollToBottom();

        // Setup the exact UI bubble immediately to prevent layout jumps/flashing
        currentStreamingMsgId = `stream-${Date.now()}`;
        const timeStr = getTimeString();
        const msgIndex = getActiveChat() ? getActiveChat().messages.length : 0;

        const footerHtml = `<div class="flex items-center gap-2 mt-3 pt-2 text-gray-500"><button class="copy-msg-btn flex items-center gap-1.5 p-1.5 hover:bg-[#333537] rounded-md text-gray-400 hover:text-gray-200 transition-colors" data-text="" title="Copy response" id="live-copy-${currentStreamingMsgId}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button><button class="regen-btn flex items-center gap-1.5 p-1.5 hover:bg-[#333537] rounded-md text-gray-400 hover:text-gray-200 transition-colors" data-index="${msgIndex}" title="Regenerate response"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><polyline points="21 3 21 8 16 8"></polyline></svg></button></div>`;
        const streamHtml = `<div class="msg-container flex items-start gap-4 group transition-opacity duration-300" id="${currentStreamingMsgId}"><div class="w-8 h-8 shrink-0 mt-1 avatar-glow-wrapper" id="avatar-${currentStreamingMsgId}"><div class="avatar-glow-inner flex justify-center items-center h-full w-full rounded-full animate-pulse-ring shadow-[0_0_15px_rgba(59,130,246,0.3)]"><svg class="text-white w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" fill="currentColor"/></svg></div></div><div class="flex-1 min-w-0 pr-12 relative z-0"><div class="flex items-center gap-2 mb-1"><span class="text-sm text-gray-300 font-medium">${getActivePersona().name}</span><span class="text-xs text-gray-600">${timeStr}</span></div><div class="markdown-body text-[15px] leading-relaxed text-gray-200" id="content-${currentStreamingMsgId}"><span class="text-blue-400/80 animate-pulse tracking-wide font-medium">Thinking...</span></div><div id="footer-${currentStreamingMsgId}" class="hidden opacity-0 transition-opacity duration-300">${footerHtml}</div></div></div>`;
        chatInner.insertAdjacentHTML('beforeend', streamHtml);
        scrollToBottom();

        const MODEL_TO_USE = hasImageInCurrentInput ? OR_VISION_MODEL : OR_TEXT_MODEL;
        if (headerModelDisplay) headerModelDisplay.textContent = hasImageInCurrentInput ? "Vision" : "Writing";

        const activeChat = getActiveChat();
        let apiMessages = [];

        if (activeChat) {
            apiMessages = activeChat.messages
                .filter(msg => msg.status !== 'error' && msg.status !== 'cancelled')
                .map((msg, index, array) => {
                    const isLastMessage = index === array.length - 1;

                    // Clean massive generated images from text history...
                    let cleanContent = msg.content || "";
                    cleanContent = cleanContent.replace(/!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/g, "[High-Res Image generated by Nova]");

                    // 🔥 NEW: Secretly attach file contents to the text payload sent to the AI
                    if (msg.role === 'user' && msg.files && msg.files.length > 0) {
                        const fileContext = msg.files.map(f => `\n\n--- Attached File: ${f.name} ---\n\`\`\`\n${f.content}\n\`\`\`\n`).join('');
                        cleanContent += fileContext;
                    }
                    // 🔥 THE VISION FIX: Only format the CURRENT message for Vision (don't attach images to past history)
                    if (isLastMessage && msg.role === 'user' && msg.images && msg.images.length > 0) {
                        // Default to a basic prompt if they upload an image but don't type anything
                        const textToSend = cleanContent.trim() !== "" ? cleanContent : "Describe this image.";
                        const contentArray = [{ type: 'text', text: textToSend }];
                        msg.images.forEach(img => contentArray.push({ type: 'image_url', image_url: { url: img } }));
                        return { role: 'user', content: contentArray };
                    }
                    // Standard text history
                    else {
                        return { role: msg.role === 'ai' ? 'assistant' : 'user', content: cleanContent };
                    }
                });
        }

        const activePersona = getActivePersona();

        // 🔥 THE FIX: Inject App Knowledge into the AI's brain
        const appCapabilities = `
[APP CAPABILITIES & RULES]
You are operating inside 'Nova AI', a custom app with built-in image processing tools. 
1. BACKGROUND REMOVAL: If the user asks if you can remove a background, say YES. Tell them to upload the image and include the words "remove background".
2. IMAGE UPSCALING: If the user asks if you can upscale, enhance, or fix low quality images, say YES. Tell them to upload the image and include the word "upscale".
3. VISION: You can see images. If they upload an image and ask a question about it, you can view and analyze it.
CRITICAL RULE: NEVER say you cannot process or edit images. Your app backend automatically intercepts those commands and processes them for you. Always assure the user you can do these tasks.
`;

        apiMessages.unshift({
            role: "system",
            content: `${activePersona.prompt}\n\n${appCapabilities}\n\nThe user's name is ${userProfile.name}.`
        });

        currentAbortController = new AbortController();

        try {
            const response = await fetch(`${PYTHON_SERVER_URL}/api/chat`, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer local-proxy-managed",
                    "HTTP-Referer": window.location.href,
                    "X-Title": "Nova UI",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": MODEL_TO_USE,
                    "messages": apiMessages,
                    "stream": true,
                    "reasoning": { "enabled": true }
                }),
                signal: currentAbortController.signal
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${response.status}: Failed to fetch response`);
            }

            // Safely grab the already initialized UI references
            const streamContentBox = document.getElementById(`content-${currentStreamingMsgId}`);
            const liveCopyBtn = document.getElementById(`live-copy-${currentStreamingMsgId}`);

            // Extinguish the avatar pulse animation now that the chunk stream is starting
            const avatarGlowInner = document.querySelector(`#avatar-${currentStreamingMsgId} .avatar-glow-inner`);
            if (avatarGlowInner) {
                avatarGlowInner.classList.remove('animate-pulse-ring', 'shadow-[0_0_15px_rgba(59,130,246,0.3)]');
            }

            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let streamBuffer = "";
            let isRawJsonError = false;
            let rawJsonBuffer = "";

            let lastRenderTime = 0; // 🔥 THE CRASH FIX 2: Track rendering speed

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    if (isRawJsonError && rawJsonBuffer) {
                        try {
                            const data = JSON.parse(rawJsonBuffer);
                            if (data.error) {
                                if (!document.getElementById(currentStreamingMsgId)) {
                                    appendMessageUI({ role: 'ai', content: '', timestamp: getTimeString(), personaName: getActivePersona().name }, getActiveChat().messages.length, currentStreamingMsgId);
                                }
                                fullText += `\n\n**API Error:** ${data.error.message || "Unknown error"}`;
                                contentUpdated = true;
                                const mdContainer = document.querySelector(`#${currentStreamingMsgId} .markdown-body`);
                                if (mdContainer) mdContainer.innerHTML = DOMPurify.sanitize(marked.parse(fullText));
                            }
                        } catch (e) { }
                    }
                    break;
                }

                const chunkString = decoder.decode(value, { stream: true });

                if (streamBuffer === "" && rawJsonBuffer === "" && chunkString.trimStart().startsWith("{")) {
                    isRawJsonError = true;
                }

                if (isRawJsonError) {
                    rawJsonBuffer += chunkString;
                    continue;
                }

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
                                if (fullText.includes("<think>") && !fullText.includes("</think>")) {
                                    fullText += "\n</think>\n\n";
                                }
                                fullText += content;
                                contentUpdated = true;
                            }
                        }
                    } catch (err) { continue; }
                }

                // 🔥 THE CRASH FIX 2: Throttle the UI rendering so it doesn't run 100x a second and freeze the browser
                if (contentUpdated) {
                    const now = Date.now();
                    if (now - lastRenderTime > 50) { // Max ~20 frames per second
                        const isAtBottom = Math.abs((chatContainer.scrollHeight - chatContainer.scrollTop) - chatContainer.clientHeight) < 100;

                        if (streamContentBox) streamContentBox.innerHTML = parseAIContent(fullText);
                        if (liveCopyBtn) liveCopyBtn.setAttribute('data-text', encodeURIComponent(fullText));

                        if (isAtBottom) chatContainer.scrollTop = chatContainer.scrollHeight;

                        lastRenderTime = now;
                    }
                }
            }

            const footerEl = document.getElementById(`footer-${currentStreamingMsgId}`);
            if (footerEl) {
                footerEl.classList.remove("hidden");
                void footerEl.offsetWidth; // Trigger reflow
                footerEl.classList.remove("opacity-0");
            }

            completeGeneration(fullText);

        } catch (error) {
            if (error.name === 'AbortError') console.log('Generation aborted by user switch/stop');
            else {
                console.error('Fetch error:', error);
                removeTyping();
                isGenerating = false;
                setSendButtonState((chatInput.value.trim() || currentSelectedImages.length > 0) ? 'ready' : 'disabled');
                appendMessageUI({ role: 'ai', status: 'error', content: error.message, timestamp: getTimeString(), personaName: getActivePersona().name }, 0);
                if (headerModelDisplay) headerModelDisplay.textContent = "Writing";
            }
        }
    }

    function completeGeneration(content) {
        isGenerating = false;

        // 🔥 THE RUTHLESS ERASER: Destroys ANY think block and its contents completely
        let cleanContent = content.replace(/<think>[\s\S]*?<\/think>[\n\s]*/g, '');

        if (currentStreamingMsgId) {
            document.getElementById(currentStreamingMsgId)?.remove();
            currentStreamingMsgId = null;
        }

        // Save the cleaned content to history
        const aiMsg = { role: 'ai', content: cleanContent, timestamp: getTimeString(), personaName: getActivePersona().name };
        addMessageToHistory(aiMsg);
        appendMessageUI(aiMsg, getActiveChat().messages.length - 1);

        setSendButtonState((chatInput.value.trim() || currentSelectedImages.length > 0) ? 'ready' : 'disabled');
        scrollToBottom();
        if (headerModelDisplay) headerModelDisplay.textContent = "Writing";

        // ☁️ CLOUDINARY: Async upload any base64 images in the AI response
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
                } catch (e) {
                    console.error('Cloudinary background upload failed:', e);
                }
            })();
        }
    }

    // 🔥 THE FIX: Restores the chat history if you cancel an edit
    function cancelEditMode(restoreHistory = true) {
        if (!isEditingMode) return;

        if (restoreHistory) {
            const activeChat = getActiveChat();
            if (activeChat && chatSnapshotBeforeEdit) {
                activeChat.messages = chatSnapshotBeforeEdit;
            }
        }

        isEditingMode = false;
        chatSnapshotBeforeEdit = null;
        chatInput.value = '';
        currentSelectedImages = [];
        currentSelectedFiles = [];
        renderImagePreviews();
        handleInput();

        const banner = document.getElementById('edit-mode-banner');
        if (banner) {
            banner.classList.add('hidden');
            banner.classList.remove('flex');
        }

        if (restoreHistory) {
            renderChatHistory();
            scrollToBottom();
        }
    }

    // Wire up the new Cancel button
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => cancelEditMode(true));

    function cancelGeneration() {
        if (!isGenerating) return;
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }

        document.getElementById('ai-thinking-indicator')?.remove();

        const activeChat = getActiveChat();
        if (activeChat && activeChat.messages.length > 0) {
            const lastMsg = activeChat.messages[activeChat.messages.length - 1];
            if (lastMsg.role === 'ai') {
                lastMsg.status = 'cancelled';
                saveHistory();
            }
        }

        removeTyping();
        isGenerating = false;

        if (currentStreamingMsgId) {
            document.getElementById(currentStreamingMsgId)?.remove();
            currentStreamingMsgId = null;
        }
        const cancelMsg = { role: 'ai', status: 'cancelled', timestamp: getTimeString(), personaName: getActivePersona().name };
        addMessageToHistory(cancelMsg);
        appendMessageUI(cancelMsg, getActiveChat().messages.length - 1);
        setSendButtonState((chatInput.value.trim() || currentSelectedImages.length > 0) ? 'ready' : 'disabled');
        scrollToBottom();
        if (headerModelDisplay) headerModelDisplay.textContent = "Writing";
    }

    // --- Suggestion Chips Logic ---
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.querySelector('span.text-sm').textContent;
            chatInput.value = text;
            handleInput();
            handleBtnClick();
        });
    });

    // --- Scroll To Bottom Button Logic ---
    let scrollBtnTimeout;
    chatContainer.addEventListener('scroll', () => {
        const btn = document.getElementById('scroll-to-bottom-btn');
        if (!btn) return;

        const maxScroll = chatContainer.scrollHeight - chatContainer.clientHeight;
        const isNearBottom = (maxScroll - chatContainer.scrollTop) <= 300;

        if (!isNearBottom) {
            clearTimeout(scrollBtnTimeout);
            btn.classList.remove('hidden');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    btn.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
                });
            });
        } else {
            if (!btn.classList.contains('translate-y-20')) {
                btn.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
                clearTimeout(scrollBtnTimeout);
                scrollBtnTimeout = setTimeout(() => {
                    btn.classList.add('hidden');
                }, 300);
            }
        }
    }, { passive: true });

    document.getElementById('scroll-to-bottom-btn')?.addEventListener('click', () => {
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
    });

    // =========================================
    // 🖼️ IMAGE LIGHTBOX
    // =========================================
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxFilename = document.getElementById('lightbox-filename');
    const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
    const lightboxBackdrop = document.getElementById('lightbox-backdrop');

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

    // Delegated click on any image inside the chat
    chatInner.addEventListener('click', (e) => {
        const img = e.target.closest('img');
        if (!img) return;
        // Don't open the avatar images (they are inside avatar wrappers)
        if (img.closest('.avatar-glow-wrapper') || img.closest('.user-glow-wrapper')) return;

        const src = img.src;
        // Try to derive a sensible filename
        let filename = 'image.jpg';
        if (img.alt && img.alt.trim()) {
            filename = img.alt.trim();
        } else if (src.startsWith('data:image/')) {
            const ext = src.split(';')[0].split('/')[1] || 'jpg';
            filename = `image.${ext}`;
        } else {
            filename = src.split('/').pop().split('?')[0] || 'image.jpg';
        }
        openLightbox(src, filename);
    });

    // Close on back button
    lightboxCloseBtn?.addEventListener('click', closeLightbox);

    // Close when clicking outside the image (on the dark backdrop)
    lightboxBackdrop?.addEventListener('click', (e) => {
        if (e.target === lightboxBackdrop) closeLightbox();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) {
            closeLightbox();
        }
    });

});