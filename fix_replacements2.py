import sys
sys.stdout.reconfigure(encoding='utf-8')

R = chr(0xFFFD)
path = 'src/pages/Custos.jsx'

with open(path, encoding='utf-8') as f:
    c = f.read()

def sub(old, new):
    global c
    if old in c:
        n = c.count(old)
        c = c.replace(old, new)
        print('  OK ('+str(n)+'x): '+repr(old[:60]))
    else:
        print('  NAO: '+repr(old[:60]))

print('Antes: '+str(c.count(R))+' replacements')

sub(":'"+R+"'", ":'—'")
sub('J'+R+' pago', 'Já pago')
sub(R+' vista', 'à vista')
sub('N'+R+' parcelas', 'Nº parcelas')
sub('Observa'+R+R+'es', 'Observações')
sub('agr'+R+'cola', 'agrícola')
sub('} '+R+' ${modalPagar', '} — ${modalPagar')
sub('nome} '+R+' {fmt', 'nome} — {fmt')
sub(R+' N'+R+'o alterar '+R, '— Não alterar —')
sub('altera'+R+R+'es', 'alterações')

count_after = c.count(R)
print('Depois: '+str(count_after)+' replacements')

idx = 0
while True:
    pos = c.find(R, idx)
    if pos < 0: break
    print('  pos='+str(pos)+': '+repr(c[max(0,pos-30):pos+40]))
    idx = pos + 1

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(c)
print('Salvo.')
