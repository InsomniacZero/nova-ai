import os

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    replacements = {
        'text-gray-100': 'text-gray-900 dark:text-gray-100',
        'from-[#000000]': 'from-white dark:from-[#000000]',
        'via-[#000000]': 'via-white dark:via-[#000000]',
        # Fix double rep
        'dark:text-gray-900 dark:text-gray-100': 'text-gray-900 dark:text-gray-100',
        'text-gray-900 dark:text-gray-900 dark:text-gray-100': 'text-gray-900 dark:text-gray-100',
    }

    for old, new in replacements.items():
        if new in content:
            content = content.replace(new, old) # remove first if already applied
        content = content.replace(old, new)

    with open(filepath, 'w') as f:
        f.write(content)
    print(f"Fixed {filepath}")

process_file('index.html')
process_file('js/ui.js')
process_file('js/profile.js')
process_file('js/app.js')
process_file('js/chat.js')
