from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from rembg import remove, new_session
import re
import httpx
import base64
import json
import os
import time
import traceback
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
STABILITY_API_KEY = os.environ.get("STABILITY_API_KEY", "sk-3vqIeLFsnCliF7KtyxEwQtm1TLqxlVvSrkdtpdpnEnoO2pfL")
HF_API_KEY = os.environ.get("HUGGINGFACE_API_KEY", "")

OPENROUTER_KEYS = [k.strip() for k in os.environ.get("OPENROUTER_KEYS", "").split(",") if k.strip()]
current_key_index = 0

def get_active_or_key():
    if not OPENROUTER_KEYS:
        return ""
    return OPENROUTER_KEYS[current_key_index]

def rotate_or_key():
    global current_key_index
    if not OPENROUTER_KEYS: return
    current_key_index = (current_key_index + 1) % len(OPENROUTER_KEYS)
    print(f"🔄 Rotated OpenRouter API Key. Now using key index: {current_key_index}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import Response

@app.get("/api/generate-image")
async def generate_image_route(prompt: str):
    print(f"🎨 Generating image via Hugging Face API for: {prompt}")
    if not HF_API_KEY:
        print("❌ Missing HF_API_KEY in .env!")
        return Response(content=b"", status_code=500)
        
    url = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"
    headers = {"Authorization": f"Bearer {HF_API_KEY}"}
    payload = {"inputs": prompt}
    
    async with httpx.AsyncClient(timeout=45.0) as client:
        try:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return Response(content=response.content, media_type="image/jpeg")
        except Exception as e:
            print(f"❌ HF API Error: {str(e)}")
            if isinstance(e, httpx.HTTPStatusError):
                print(f"API Response: {e.response.text}")
            return Response(content=b"", status_code=500)

# --- THE ADAPTIVE BRAIN (Local Background Remover) ---
print("Loading AI Models into memory... (This takes a few seconds on startup)")
sessions = {
    "normal": new_session("u2net"),         
    "anime": new_session("isnet-anime")     
}
print("Models loaded! Server ready.")


# --- THE MUSCLE: Image Processing Hub ---
async def handle_image_task(prompt: str, image_b64: str):
    print(f"\n--- NEW IMAGE TASK --- | Prompt: {prompt}")
    
    # 1. Clean the Base64 String
    if "," in image_b64:
        base64_data = image_b64.split(",")[1]
    else:
        base64_data = image_b64
        
    image_bytes = base64.b64decode(base64_data)

    # ==========================================
    # TOOL 1: BACKGROUND REMOVAL (Local)
    # ==========================================
    def wants_bg_removal(text: str) -> bool:
        """Detect if the user wants background removal using safe keyword combos."""
        t = text.lower()
        # Normalize abbreviations
        # Use word-boundary-safe replacements so "bg" doesn't match inside other words
        # BUG 10 FIX: import re moved to module top level
        # Replace standalone "bg" with "background"
        t = re.sub(r'\bbg\b', 'background', t)
        
        # --- Direct phrases (very high confidence, no false positives) ---
        direct_phrases = [
            "remove background", "remove the background", "remove its background",
            "delete background", "delete the background",
            "erase background", "erase the background",
            "strip background", "strip the background",
            "cut out", "cutout",
            "no background", "without background", "without the background",
            "transparent background", "make transparent", "make it transparent",
            "isolate subject", "isolate the subject",
            "get rid of the background", "get rid of background",
            "take off the background", "take off background",
            "remove backdrop", "delete backdrop", "erase backdrop",
        ]
        if any(phrase in t for phrase in direct_phrases):
            return True
        
        # --- Action + Target combo (need BOTH to match) ---
        # These action words are specific enough to not trigger on normal chat
        actions = ["remove", "delete", "erase", "strip", "eliminate", "drop"]
        targets = ["background", "backdrop"]
        
        for action in actions:
            for target in targets:
                if action in t and target in t:
                    return True
        
        return False

    if wants_bg_removal(prompt):
        try:
            prompt_lower = prompt.lower()
            if any(word in prompt_lower for word in ["anime", "art", "game", "drawn", "2d", "manga"]):
                print("🧠 ADAPTIVE AI: Using 'isnet-anime'.")
                active_session = sessions["anime"]
            else:
                print("🧠 ADAPTIVE AI: Defaulting to 'u2net'.")
                active_session = sessions["normal"]

            print("Removing background locally...")
            result_bytes = remove(image_bytes, session=active_session, bgcolor=None)
            
            base64_encoded = base64.b64encode(result_bytes).decode('utf-8')
            print("✅ Background removed successfully!")
            return f"data:image/png;base64,{base64_encoded}"
                
        except Exception as e:
            print(f"❌ CRITICAL PYTHON ERROR: {str(e)}")
            traceback.print_exc()
            return "**Internal System Error:** The local backend crashed while processing."
            
    # ==========================================
    # TOOL 2: AI UPSCALER (Cloud API V2)
    # ==========================================
    elif "upscale" in prompt.lower() or "enhance" in prompt.lower():
        try:
            print("Sending image to Stability AI (V2 Fast Upscaler)...")
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.stability.ai/v2beta/stable-image/upscale/fast",
                    headers={
                        "Accept": "application/json",
                        "Authorization": f"Bearer {STABILITY_API_KEY}"
                    },
                    files={
                        "image": ("image.png", image_bytes, "image/png")
                    },
                    data={
                        "output_format": "png"
                    },
                    timeout=60.0 # Upscaling can take 5-10 seconds
                )
                
                if response.status_code == 200:
                    print("✅ Image upscaled successfully!")
                    data = response.json()
                    # The V2 API returns the base64 string directly under the 'image' key
                    result_b64 = data.get("image")
                    return f"data:image/png;base64,{result_b64}"
                else:
                    print(f"❌ Stability API Error: {response.text}")
                    return f"**Upscale Error:** Could not process image. Check API key."
                    
        except Exception as e:
            print(f"❌ CRITICAL PYTHON ERROR: {str(e)}")
            traceback.print_exc()
            return "**Internal System Error:** The upscaler crashed."
            
    # BUG 11 FIX: Return a descriptive message instead of None so the user gets clear feedback
    return "**No image tool matched.** Please specify whether you want to remove the background, upscale, or describe the image."

# --- THE ROUTER ---
@app.post("/api/chat")
async def chat_endpoint(request: Request):
    data = await request.json()
    
    headers = {
        "Authorization": request.headers.get("Authorization"),
        "HTTP-Referer": request.headers.get("HTTP-Referer", "http://localhost:8000"),
        "X-Title": request.headers.get("X-Title", "Nova AI"),
        "Content-Type": "application/json"
    }

    last_msg = data.get("messages", [])[-1]
    prompt_text = ""
    images = []
    
    if isinstance(last_msg.get("content"), list):
        for item in last_msg["content"]:
            if item["type"] == "text":
                prompt_text += item["text"]
            elif item["type"] == "image_url":
                images.append(item["image_url"]["url"])
    else:
        prompt_text = last_msg.get("content", "")

    # 🔥 BUG FIX: Changed prompt.lower() to prompt_text.lower()
    needs_bg_removal = "remove" in prompt_text.lower() and "background" in prompt_text.lower()
    needs_upscale = "upscale" in prompt_text.lower() or "enhance" in prompt_text.lower()

    if images and (needs_bg_removal or needs_upscale):
        async def tool_stream():
            if needs_upscale:
                loading_msg = "<think>Upscaling image and enhancing details...</think>\n\n"
            else:
                loading_msg = "<think>Extracting subject and removing background...</think>\n\n"
                
            yield f"data: {json.dumps({'choices': [{'delta': {'content': loading_msg}}]})}\n\n"
            
            result_url = await handle_image_task(prompt_text, images[0])
            
            if result_url and result_url.startswith("data:image"):
                msg_content = f"![Processed Image]({result_url})"
            else:
                msg_content = str(result_url) if result_url else "Sorry, I couldn't process that image."
                
            final_data = {
                "choices": [{"delta": {"content": msg_content}}]
            }
            yield f"data: {json.dumps(final_data)}\n\n"
            yield "data: [DONE]\n\n"
            
        return StreamingResponse(tool_stream(), media_type="text/event-stream")

    async def openrouter_stream():
        max_attempts = max(1, len(OPENROUTER_KEYS))
        
        for attempt in range(max_attempts):
            try:
                # Override the generic frontend auth with the actual rotated secure backend key
                headers["Authorization"] = f"Bearer {get_active_or_key()}"
                
                async with httpx.AsyncClient() as client:
                    req = client.build_request("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
                    r = await client.send(req, stream=True)
                    
                    if r.status_code in [401, 402, 429]:
                        error_text = await r.aread()
                        print(f"⚠️ Key {current_key_index} rejected or out of credits (HTTP {r.status_code}). Rotating...")
                        rotate_or_key()
                        continue # Retry silently!
                        
                    elif r.status_code != 200:
                        error_text = await r.aread()
                        error_msg = f"**OpenRouter API Error (HTTP {r.status_code}):**\n```json\n{error_text.decode('utf-8')}\n```"
                        yield f"data: {json.dumps({'choices': [{'delta': {'content': error_msg}}]})}\n\n".encode('utf-8')
                        yield b"data: [DONE]\n\n"
                        return

                    async for chunk in r.aiter_bytes():
                        yield chunk
                    return # Successfully streamed!
                    
            except Exception as e:
                # 🔥 THE FIX: Catch the crash if OpenRouter rejects massive image files
                print(f"❌ OpenRouter Connection Error: {str(e)}")
                error_data = {
                    "choices": [{"delta": {"content": f"\n\n**Network Error:** {str(e)}"}}]
                }
                # Yield the error directly to the chat bubble so it doesn't freeze!
                yield f"data: {json.dumps(error_data)}\n\n".encode('utf-8')
                yield b"data: [DONE]\n\n"
                return
                
        # If we exhausted the entire array of keys and they all returned 401/402
        yield f"data: {json.dumps({'choices': [{'delta': {'content': '**API Error:** All configured OpenRouter keys have failed or are out of credits! Please check your keys.'}}]})}\n\n".encode('utf-8')
        yield b"data: [DONE]\n\n"

    return StreamingResponse(openrouter_stream(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)