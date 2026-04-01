// js/utils.js — Shared utilities: marked config, markdown parser, clipboard, time, toast

// ── Configure marked.js renderer ──
export function initMarked() {
    const renderer = new marked.Renderer();

    renderer.code = function (token_or_code, lang_arg) {
        const code = typeof token_or_code === 'object' ? token_or_code.text : token_or_code;
        const language = typeof token_or_code === 'object' ? token_or_code.lang : lang_arg;
        const validLanguage = hljs.getLanguage(language) ? language : 'plaintext';

        let highlightedCode = code;
        if (code.length < 15000) {
            highlightedCode = hljs.highlight(code, { language: validLanguage }).value;
        }

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

    marked.use({ renderer: renderer });
}

// ── Toast Notifications ──
export function showToast(message, type = "success") {
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-full shadow-2xl text-[13px] tracking-wide font-medium text-white flex items-center gap-2 transform translate-y-[-100%] opacity-0 transition-all duration-300 ease-out border backdrop-blur-md ${type === 'success' ? 'bg-[#282a2c]/90 border-[#444749]' : 'bg-red-500/90 border-red-400'}`;
    const icon = type === 'success' ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    toast.innerHTML = `${icon}${message}`;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-y-[-100%]', 'opacity-0'); toast.classList.add('translate-y-0', 'opacity-100'); }, 10);
    setTimeout(() => { toast.classList.remove('translate-y-0', 'opacity-100'); toast.classList.add('translate-y-[-100%]', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// ── Time Helper ──
export function getTimeString() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Clipboard ──
export async function copyToClipboard(text, btn, toastMsg = "Copied to clipboard!") {
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

// ── Markdown / AI Content Parser ──
export function parseAIContent(text) {
    let formattedText = text;

    // Extract base64 images BEFORE markdown parsing to prevent DOMPurify from stripping them.
    // FIX: regex now uses [^)] to consume the closing ) properly, no trailing ) left in text.
    let extractedImages = [];
    formattedText = formattedText.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (match, alt, base64Data) => {
        extractedImages.push(base64Data);
        return `[[MASSIVE_IMAGE_${extractedImages.length - 1}]]`;
    });

    let thinkCount = (formattedText.match(/<think>/g) || []).length;
    let endThinkCount = (formattedText.match(/<\/think>/g) || []).length;

    formattedText = formattedText.replace(/<think>/g, '<div class="think-box"><details open><summary><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2 inline"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg> Thought Process</summary><div class="think-content">');
    formattedText = formattedText.replace(/<\/think>/g, '</div></details></div>');
    if (thinkCount > endThinkCount) formattedText += '</div></details></div>';

    let sanitizedHtml = DOMPurify.sanitize(marked.parse(formattedText), {
        ADD_TAGS: ['details', 'summary', 'button', 'svg', 'path', 'rect', 'polyline', 'line', 'circle', 'img'],
        ADD_ATTR: ['class', 'open', 'data-text', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'title', 'style', 'src', 'alt', 'loading', 'decoding'],
        // Allow https: Cloudinary URLs in img src; data: URIs are reinserted after sanitize via extractedImages
        ALLOW_DATA_ATTR: false
    });

    // Reinsert base64 images AFTER DOMPurify — DOMPurify strips data: URIs from src by default.
    // We bypass this by doing string replacement after sanitization is complete.
    extractedImages.forEach((base64Data, index) => {
        const placeholder = `[[MASSIVE_IMAGE_${index}]]`;
        const imgTag = `<img src="${base64Data}" alt="Processed Image" class="max-w-full rounded-xl my-2 border border-gray-300 dark:border-[#333537]" style="max-height:500px;display:block;" loading="lazy" decoding="async">`;
        sanitizedHtml = sanitizedHtml.replace(placeholder, imgTag);
    });

    return sanitizedHtml;
}
