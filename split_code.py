import os

html_file = "/home/insomniac/Desktop/Projects/Test/index.html"
with open(html_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Extract CSS
style_start = content.find("<style>")
style_end = content.find("</style>") + len("</style>")

if style_start != -1 and style_end != -1:
    css_content = content[style_start+7:style_end-8].strip()
    with open("/home/insomniac/Desktop/Projects/Test/style.css", "w", encoding="utf-8") as f:
        f.write(css_content)
    
    # Replace in HTML
    content = content[:style_start] + '<link rel="stylesheet" href="style.css">\n' + content[style_end:]

# 2. Extract JS
script_start = content.rfind('<script type="module">')
script_end = content.rfind("</script>")

if script_start != -1 and script_end != -1:
    js_content = content[script_start+22:script_end].strip()
    
    # Create js folder
    os.makedirs("/home/insomniac/Desktop/Projects/Test/js", exist_ok=True)
    
    with open("/home/insomniac/Desktop/Projects/Test/js/app.js", "w", encoding="utf-8") as f:
        f.write(js_content)
        
    # Replace in HTML
    content = content[:script_start] + '<script type="module" src="js/app.js"></script>\n' + content[script_end+9:]

with open(html_file, "w", encoding="utf-8") as f:
    f.write(content)

print("Extraction complete! Created style.css and js/app.js")
