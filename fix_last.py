import sys
sys.stdout.reconfigure(encoding='utf-8')
R = chr(0xFFFD)
with open('src/pages/Custos.jsx', encoding='utf-8') as f: c = f.read()

idx = c.find('modalPagar.fornecedor&&')
print('contexto:', repr(c[idx:idx+80]))

# The pattern is: &&` ? ${modalPagar.fornecedor}`
old = '&&` ' + R + ' ${modalPagar.fornecedor}`'
new = '&&` — ${modalPagar.fornecedor}`'
if old in c:
    c = c.replace(old, new)
    print('OK')
else:
    # Try backtick variants
    for variant in ['&&` '+R+' ${', '` '+R+' ${modal']:
        pos = c.find(variant)
        if pos >= 0:
            print('Found variant:', repr(c[pos:pos+50]))

with open('src/pages/Custos.jsx', 'w', encoding='utf-8', newline='\n') as f: f.write(c)
print('replacements restantes:', c.count(R))
