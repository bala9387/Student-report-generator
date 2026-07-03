import re

with open('app_original_utf8.js', 'r', encoding='utf-8') as f:
    orig = f.read()

# Extract from '  function sectionBar' up to '  function groupPDF'
match = re.search(r'  function sectionBar\(doc, y, text\).*?  function groupPDF', orig, re.DOTALL)
if match:
    functions_to_insert = match.group(0).replace('  function groupPDF', '')
else:
    print("Could not find the functions in app_original_utf8.js")
    exit(1)

with open('app.js', 'r', encoding='utf-8') as f:
    app_code = f.read()

# Insert before '  function analysisPDF'
app_code = app_code.replace('  function analysisPDF', functions_to_insert + '  function analysisPDF')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_code)

print("Successfully injected missing functions into app.js")
