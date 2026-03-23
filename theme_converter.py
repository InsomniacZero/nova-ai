import os

print("Running pure string replacement theme conversion...")

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Define the mapping of dark utilities to their new light/dark responsive pair
    
    replacements = {
        'bg-black': 'bg-white dark:bg-black',
        'bg-[#000000]': 'bg-white dark:bg-[#000000]',
        'bg-[#131415]': 'bg-gray-50 dark:bg-[#131415]',
        'bg-[#17181a]': 'bg-gray-50 dark:bg-[#17181a]',
        'bg-[#1e1f20]': 'bg-white dark:bg-[#1e1f20]',
        'bg-[#1e1f21]': 'bg-white dark:bg-[#1e1f21]',
        'bg-[#282a2c]': 'bg-gray-100 dark:bg-[#282a2c]',
        'bg-[#2a2b2c]': 'bg-gray-100 dark:bg-[#2a2b2c]',
        'bg-[#2a2b2d]': 'bg-gray-100 dark:bg-[#2a2b2d]',
        'bg-[#2d2f31]': 'bg-white dark:bg-[#2d2f31]',
        'bg-[#333537]': 'bg-gray-200 dark:bg-[#333537]',
        'border-[#333537]': 'border-gray-300 dark:border-[#333537]',
        'border-[#282a2c]': 'border-gray-300 dark:border-[#282a2c]',
        'border-[#444749]': 'border-gray-400 dark:border-[#444749]',
        'border-[#2d2e30]': 'border-gray-300 dark:border-[#2d2e30]',
        'hover:bg-[#1e1f20]': 'hover:bg-gray-100 dark:hover:bg-[#1e1f20]',
        'hover:bg-[#2d2f31]': 'hover:bg-gray-200 dark:hover:bg-[#2d2f31]',
        'hover:bg-[#333537]': 'hover:bg-gray-200 dark:hover:bg-[#333537]',
        'focus:bg-[#1e1f20]': 'focus:bg-white dark:focus:bg-[#1e1f20]',
        'focus:bg-[#282a2c]': 'focus:bg-gray-50 dark:focus:bg-[#282a2c]',
        'text-[#8e9092]': 'text-gray-500 dark:text-[#8e9092]',
    }

    # Text colors were probably already replaced by the previous script (since \b works on letters)
    # But just in case:
    # First, undo double dark classes if they exist to prevent recursion
    
    for old, new in replacements.items():
        # Prevent replacing already replaced ones
        content = content.replace(new, old)
        # Apply replacement
        content = content.replace(old, new)
        
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"✅ Processed {filepath}")

process_file('index.html')
process_file('js/ui.js')
process_file('js/chat.js')
process_file('js/app.js')
process_file('js/profile.js')

print("Done!")
