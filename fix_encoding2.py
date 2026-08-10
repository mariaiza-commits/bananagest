import os

temp_path = os.environ['TEMP'] + r'\custos_orig.jsx'
dest_path = 'src/pages/Custos.jsx'

with open(temp_path, 'rb') as f:
    raw = f.read()

if raw.startswith(b'\xef\xbb\xbf'):
    raw = raw[3:]

text = raw.decode('utf-8')
print(f'Tamanho: {len(text)} chars')

# Corrupcao: bytes originais foram decodificados como cp1252 (com fallback Latin-1
# para bytes indefinidos no cp1252: 0x81, 0x8D, 0x8F, 0x90, 0x9D).
# Reverter: tentar cp1252, se falhar usar Latin-1 (ord direto), se > 0xFF usar UTF-8.

orig_bytes = bytearray()
for ch in text:
    o = ord(ch)
    if o <= 0x7F:
        orig_bytes.append(o)
    else:
        try:
            b = ch.encode('cp1252')
            orig_bytes.extend(b)
        except UnicodeEncodeError:
            if o <= 0xFF:
                orig_bytes.append(o)
            else:
                orig_bytes.extend(ch.encode('utf-8'))

fixed = orig_bytes.decode('utf-8', errors='replace')

repl = fixed.count('�')
print(f'Replacement chars restantes: {repl}')

with open(dest_path, 'w', encoding='utf-8') as f:
    f.write(fixed)

print('Verificacoes:')
for word in ['Descri', 'Observa', 'Fornecedor', 'Vista', 'Cancelar', 'Salvar']:
    ok = word in fixed
    print(f'  {word}: {"OK" if ok else "NAO"}')
print(f'  em-dash(—): {"OK" if chr(0x2014) in fixed else "NAO"}')
print(f'  checkmark(✓): {"OK" if chr(0x2713) in fixed else "NAO"}')
print(f'  emoji 💵: {"OK" if chr(0x1F4B5) in fixed else "NAO"}')
print(f'  emoji 🏦: {"OK" if chr(0x1F3E6) in fixed else "NAO"}')
