import httpx, asyncio

async def test():
    headers = {"Authorization": "Bearer sk-or-v1-fake"}
    data = {"model": "deepseek/deepseek-r1", "messages": [{"role":"user","content":"Hi"}]}
    async with httpx.AsyncClient() as client:
        req = client.build_request("POST", "https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
        r = await client.send(req)
        print("Status:", r.status_code)
        print("Body:", r.text)

asyncio.run(test())
