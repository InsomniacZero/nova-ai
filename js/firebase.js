// js/firebase.js — Firebase initialization, Firestore CRUD, Cloudinary uploads

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
    getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    onAuthStateChanged, signOut, setPersistence,
    browserLocalPersistence, browserSessionPersistence,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { state } from './state.js';

// ── Firebase Config ──
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
export const db = getFirestore(app);
export const auth = getAuth(app);

// Re-export auth methods for use by auth.js and profile.js
export {
    signInWithEmailAndPassword, createUserWithEmailAndPassword,
    onAuthStateChanged, signOut, setPersistence,
    browserLocalPersistence, browserSessionPersistence,
    updatePassword, reauthenticateWithCredential, EmailAuthProvider
};

// =========================================
// ☁️ CLOUDINARY IMAGE HOSTING CONFIG
// =========================================
const CLOUDINARY_CLOUD_NAME = 'dpb7c46v0';
const CLOUDINARY_UPLOAD_PRESET = 'Nova_uploads';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

export async function uploadToCloudinary(base64Data) {
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

export async function uploadBase64ImagesInContent(content) {
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

export async function uploadBase64ImagesArray(images) {
    const results = [];
    for (const img of images) {
        if (img.startsWith('data:image/')) {
            const url = await uploadToCloudinary(img);
            results.push(url || img);
        } else {
            results.push(img);
        }
    }
    return results;
}

// =========================================
// 🔥 CLOUD FIRESTORE FUNCTIONS
// =========================================

export async function saveHistoryToCloud(specificChatId = null) {
    if (!state.currentUser) return;
    try {
        const chatToSaveId = specificChatId || state.currentChatId;
        const chatToSave = state.chats.find(c => c.id === chatToSaveId);
        if (!chatToSave) return;

        const chatDataString = JSON.stringify(chatToSave);
        const sizeInMB = chatDataString.length / (1024 * 1024);
        let messagesToSave = chatToSave.messages;

        if (sizeInMB > 0.9) {
            console.log(`Chat ${chatToSave.id} is large (${sizeInMB.toFixed(2)} MB). Uploading images to Cloudinary...`);
            messagesToSave = await Promise.all(chatToSave.messages.map(async (msg) => {
                let newMsg = { ...msg };
                if (newMsg.content) {
                    try { newMsg.content = await uploadBase64ImagesInContent(newMsg.content); }
                    catch (e) { console.warn('Cloudinary content upload failed, stripping base64:', e); }
                    newMsg.content = newMsg.content.replace(/!\[.*?\]\((data:image\/[^;]+;base64,[^\)]+)\)/g, "\n*[Image uploaded to cloud]*\n");
                }
                if (newMsg.images && newMsg.images.length > 0) {
                    try { newMsg.images = await uploadBase64ImagesArray(newMsg.images); }
                    catch (e) { console.warn('Cloudinary image array upload failed, filtering base64:', e); }
                    newMsg.images = newMsg.images.filter(img => !img.startsWith('data:image/'));
                }
                return newMsg;
            }));

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

        await setDoc(doc(db, "users", state.currentUser.uid, "chats", chatToSave.id), {
            title: chatToSave.title,
            messages: messagesToSave,
            updatedAt: chatToSave.updatedAt || parseInt(chatToSave.id.split('-')[1]) || Date.now()
        });
    } catch (err) {
        console.error("Firebase chat save error:", err);
    }
}

export async function deleteChatFromCloud(chatId) {
    if (!state.currentUser) return;
    try { await deleteDoc(doc(db, "users", state.currentUser.uid, "chats", chatId)); }
    catch (err) { console.error("Firebase chat delete error:", err); }
}

export async function loadHistoryFromCloud() {
    if (!state.currentUser) return [];
    try {
        const snapshot = await getDocs(collection(db, "users", state.currentUser.uid, "chats"));
        const loadedChats = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            loadedChats.push({
                id: docSnap.id,
                title: data.title,
                messages: data.messages || [],
                updatedAt: data.updatedAt || parseInt(docSnap.id.split('-')[1]) || 0
            });
        });
        loadedChats.sort((a, b) => b.updatedAt - a.updatedAt);
        return loadedChats;
    } catch (err) {
        console.error("Load chats error:", err);
        return [];
    }
}

export async function saveProfileToCloud(profile) {
    if (!state.currentUser) return;
    try {
        await setDoc(doc(db, "users", state.currentUser.uid, "profile", "data"), {
            name: profile.name,
            avatar: profile.avatar || null
        });
    } catch (err) { console.error("Profile save error:", err); }
}

export async function loadProfileFromCloud() {
    if (!state.currentUser) return null;
    try {
        const docSnap = await getDoc(doc(db, "users", state.currentUser.uid, "profile", "data"));
        return docSnap.exists() ? docSnap.data() : null;
    } catch (err) { return null; }
}

export async function savePersonasToCloud(personasArray, activeId) {
    if (!state.currentUser) return;
    try {
        await setDoc(doc(db, "users", state.currentUser.uid, "personas", "data"), {
            list: personasArray,
            activeId: activeId
        });
        console.log("Personas securely saved to cloud.");
    } catch (err) { console.error("Persona save error:", err); }
}

export async function loadPersonasFromCloud() {
    if (!state.currentUser) return null;
    try {
        const docSnap = await getDoc(doc(db, "users", state.currentUser.uid, "personas", "data"));
        return docSnap.exists() ? docSnap.data() : null;
    } catch (err) { return null; }
}
