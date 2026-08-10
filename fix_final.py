path = 'src/pages/Custos.jsx'

with open(path, 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8')

# Reverter mojibake (cp1252 + fallback Latin-1)
orig_bytes = bytearray()
for ch in text:
    o = ord(ch)
    if o <= 0x7F:
        orig_bytes.append(o)
    else:
        try:
            orig_bytes.extend(ch.encode('cp1252'))
        except UnicodeEncodeError:
            if o <= 0xFF:
                orig_bytes.append(o)
            else:
                orig_bytes.extend(ch.encode('utf-8'))

fixed = orig_bytes.decode('utf-8')  # sem errors='replace' - vai falhar se tiver problema real
print(f'Encoding OK. Chars: {len(fixed)}')

# Verificar strings chave
for w in ['Descri', 'Fornecedor', 'Cancelar', chr(0x2014), chr(0x1F4B5), chr(0x1F3E6)]:
    print(f'  {repr(w)}: {"OK" if w in fixed else "NAO"}')

# Verificar e corrigir confirmarPagar (com duplo \n entre linhas como esta no arquivo)
idx = fixed.find('async function confirmarPagar')
end = fixed.find('\n\n  async function', idx)
current_fn = fixed[idx:end]
print(f'\nconfirmarPagar atual:\n{current_fn[:400]}')

# Construir versao corrigida (mantendo o estilo de duplo \n do arquivo)
new_pagar = '''async function confirmarPagar() {

    if (!pagContaId) return alert('Selecione a conta.')

    setSaving(true)

    try {

      const timeout = new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo esgotado.')),30000))

      const { error } = await Promise.race([

        supabase.rpc('fn_pagar_custo',{p_custo_id:modalPagar.id,p_data_pagamento:pagData,p_conta_id:pagContaId}),

        timeout

      ])

      if (error) throw error

      setModalPagar(null);load()

    } catch(e) {

      console.error('[Custos.confirmarPagar]',e)

      if (!handleAuthError(e)) alert('Erro ao confirmar: '+(e.message||JSON.stringify(e)))

    } finally { setSaving(false) }

  }'''

fixed = fixed[:idx] + new_pagar + fixed[end:]

# Verificar confirmarPagarMassa (adicionar try/catch também)
idx2 = fixed.find('async function confirmarPagarMassa')
end2 = fixed.find('\n\n  async function', idx2)
if end2 < 0:
    end2 = fixed.find('\n\n  return (', idx2)
current_massa = fixed[idx2:end2]
print(f'\nconfirmarPagarMassa atual:\n{current_massa[:400]}')

new_massa = '''async function confirmarPagarMassa() {

    if (!pagContaId) return alert('Selecione a conta.')

    if (!selecionados.length) return alert('Selecione pelo menos um custo.')

    setSaving(true)

    try {

      for (const id of selecionados) {

        const { error } = await supabase.rpc('fn_pagar_custo',{p_custo_id:id,p_data_pagamento:pagData,p_conta_id:pagContaId})

        if (error) throw error

      }

      setModalPagarMassa(false);setSelecionados([]);load()

    } catch(e) {

      console.error('[Custos.confirmarPagarMassa]',e)

      if (!handleAuthError(e)) alert('Erro: '+(e.message||JSON.stringify(e)))

    } finally { setSaving(false) }

  }'''

fixed = fixed[:idx2] + new_massa + fixed[end2:]

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(fixed)

print('\nArquivo salvo com sucesso.')
