path = 'src/lib/supabase.js'

with open(path, encoding='utf-8') as f:
    lines = f.readlines()

new_lines = [l for l in lines if 'lock:' not in l]

assert len(new_lines) == len(lines) - 1, f"Esperava remover exatamente 1 linha, removeu {len(lines)-len(new_lines)}"

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.writelines(new_lines)

print("OK — linha removida:")
for l in lines:
    if 'lock:' in l:
        print(" -", repr(l))

print("\nArquivo final:")
with open(path, encoding='utf-8') as f:
    print(f.read())
