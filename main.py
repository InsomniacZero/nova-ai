from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from rembg import remove, new_session
import httpx
import base64
import json
import os
import time
import traceback

# --- CONFIGURATION ---
STABILITY_API_KEY = "sk-3vqIeLFsnCliF7KtyxEwQtm1TLqxlVvSrkdtpdpnEnoO2pfL"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    if "remove" in prompt.lower() and "background" in prompt.lower():
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
            
    return None

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
        try:
            async with httpx.AsyncClient() as client:
                req = client.build_request("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
                r = await client.send(req, stream=True)
                async for chunk in r.aiter_bytes():
                    yield chunk
        except Exception as e:
            # 🔥 THE FIX: Catch the crash if OpenRouter rejects massive image files
            print(f"❌ OpenRouter Connection Error: {str(e)}")
            error_data = {
                "choices": [{"delta": {"content": "\n\n**Network Error:** OpenRouter rejected the connection. The image you attached is likely too large for their servers to process."}}]
            }
            # Yield the error directly to the chat bubble so it doesn't freeze!
            yield f"data: {json.dumps(error_data)}\n\n".encode('utf-8')
            yield b"data: [DONE]\n\n"

    return StreamingResponse(openrouter_stream(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)