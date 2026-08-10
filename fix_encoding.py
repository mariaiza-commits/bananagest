path = 'src/pages/Custos.jsx'

with open(path, 'rb') as f:
    raw = f.read()

if raw.startswith(b'\xef\xbb\xbf'):
    raw = raw[3:]

# A corrupcao aconteceu assim:
# bytes UTF-8 originais -> interpretados como Windows-1252 -> re-salvos como UTF-8
# Para reverter: ler como UTF-8 -> encodar como cp1252 -> decodar como UTF-8

text = raw.decode('utf-8')

# Encodar como cp1252 para recuperar os bytes UTF-8 originais
try:
    orig_bytes = text.encode('cp1252')
    fixed = orig_bytes.decode('utf-8')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed)
    print('SUCESSO com cp1252')
except Exception as e:
    print('ERRO cp1252:', type(e).__name__, str(e)[:100])
    # Fallback: substituicoes caracter a caracter
    import re
    result = []
    i = 0
    while i < len(text):
        c = text[i]
        o = ord(c)
        if o > 127 and o <= 0xFFFF:
            # Tenta encodar como cp1252
            try:
                b = c.encode('cp1252')
                result.append(b)
            except:
                # Nao encodavel em cp1252 - tenta Latin-1
                try:
                    b = c.encode('latin-1')
                    result.append(b)
                except:
                    result.append(c.encode('utf-8'))
        elif o <= 127:
            result.append(bytes([o]))
        else:
            result.append(c.encode('utf-8'))
        i += 1
    combined = b''.join(result)
    fixed2 = combined.decode('utf-8', errors='replace')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(fixed2)
    print('SUCESSO com fallback')

checks = ['Descri', 'Observa', 'Fornecedor', 'Vista', 'Cancelar', 'Salvar']
for ch in checks:
    print(f'  {ch}: {"OK" if ch in fixed else "?"}')
