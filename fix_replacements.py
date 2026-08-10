import sys
sys.stdout.reconfigure(encoding='utf-8')

R = chr(0xFFFD)
path = 'src/pages/Custos.jsx'

with open(path, encoding='utf-8') as f:
    c = f.read()

count_before = c.count(R)
print(f'Antes: {count_before} replacement chars')

def sub(old, new):
    global c
    if old in c:
        n = c.count(old)
        c = c.replace(old, new)
        print(f'  OK ({n}x): {repr(old[:50])} -> {repr(new[:30])}')
    else:
        print(f'  NAO encontrado: {repr(old[:50])}')

# Portugues
sub(f'Descri{R}{R}o', 'Descrição')
sub(f'sele{R}{R}o', 'seleção')
sub(f'ser{R} removido', 'será removido')
sub(f'voltar{R} para', 'voltará para')

# Em-dash em string literals JS (??'—')
sub(f"??'{R}'", "??'—'")
sub(f': "{R}"', ': "—"')

# Em-dash em JSX/texto
sub(f'(s) {R} {{fmt', '(s) — {fmt')
sub(f'{R} Geral {R}', '— Geral —')
sub(f'{R} Selecione {R}', '— Selecione —')

count_after = c.count(R)
print(f'\nDepois: {count_after} replacement chars')

# Mostrar restantes
idx = 0
while True:
    pos = c.find(R, idx)
    if pos < 0: break
    print(f'  pos={pos}: {repr(c[max(0,pos-30):pos+40])}')
    idx = pos + 1

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(c)
print('Salvo.')
