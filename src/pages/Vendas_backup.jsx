import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate, BtnExportar } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

export default function Vendas({ onAddBtn }) {
  const { tenantId, handleAuthError } = useAuth()
  const [vendas, setVendas]     = useState([])
  const [cargas, setCargas]     = useState([])
  const [clientes, setClientes] = useState([])
  const [contas, setContas]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [detalhe, setDetalhe]   = useState(null)
  const [modalReceber, setModalReceber] = useState(null)
  const [contaReceber, setContaReceber] = useState('')
  const [recebData, setRecebData]       = useState('')
  const [salvandoRec, setSalvandoRec]   = useState(false)
  const [modalAnexos, setModalAnexos]   = useState(null)  // venda obj
  const [anexos, setAnexos]             = useState([])
  const [uploadando, setUploadando]     = useState(false)
  const [uploadTipo, setUploadTipo]     = useState('xml')
  const [erroAnexo, setErroAnexo]       = useState('')

  const [form, setForm] = useState({
    carga_id: '', client_id: '',
    data_venda: new Date().toISOString().split('T')[0],
    condicao: 'avista', prazo_dias: 30,
    conta_financeira_id: '', marcar_recebido: false,
    funrural_pct: 0, ptv_valor: 0,
    observacoes: '',
    desconto_avista_pct: 0,
  })
  const [itensVenda, setItensVenda] = useState([])

  useEffect(() => { load() }, [])
  useEffect(() => { if (onAddBtn) onAddBtn(() => openModal()) }, [vendas])

  async function load() {
    setLoading(true)
    try {
      const [{ data: vs }, { data: cs }, { data: cls }, { data: cfs }] = await Promise.all([
        supabase.from('vendas').select('*').is('deleted_at', null).order('data_venda', { ascending: false }).limit(100),
        supabase.from('vw_resumo_cargas').select('*').order('data', { ascending: false }).limit(50),
        supabase.from('clients').select('id,nome').is('deleted_at', null).order('nome'),
        supabase.from('contas_financeiras').select('id,nome').eq('ativo', true).order('nome'),
      ])
      setVendas(vs ?? [])
      setCargas(cs ?? [])
      setClientes(cls ?? [])
      setContas(cfs ?? [])
    } catch (e) { handleAuthError(e) } finally {
      setLoading(false)
    }
  }

  async function carregarItens(carga_id) {
    if (!carga_id) { setItensVenda([]); return }
    const { data } = await supabase
      .from('carga_itens')
      .select('*, lotes(nome), setores(nome,variedade,cultura)')
      .eq('carga_id', carga_id)
    setItensVenda((data ?? []).map(it => ({
      carga_item_id: it.id,
      lote_nome:  it.lotes?.nome ?? '—',
      setor_nome: it.setores?.nome ?? '',
      variedade:  it.setores?.variedade || it.setores?.cultura || '',
      qtd1:  Number(it.quantidade_primeira) || 0,
      qtd2:  Number(it.quantidade_segunda)  || 0,
      peso1: Number(it.peso_medio_primeira) || 0,
      peso2: Number(it.peso_medio_segunda)  || 0,
      preco_kg1: Number(it.preco_kg_primeira) || 0,
      preco_kg2: Number(it.preco_kg_segunda)  || 0,
    })))
  }

  function updItem(idx, field, value) {
    setItensVenda(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const dataVencimento = useMemo(() => {
    if (form.condicao === 'avista') return form.data_venda
    if (!form.data_venda || !form.prazo_dias) return ''
    const d = new Date(form.data_venda)
    d.setDate(d.getDate() + Number(form.prazo_dias))
    return d.toISOString().split('T')[0]
  }, [form.condicao, form.data_venda, form.prazo_dias])

  const totais = useMemo(() => {
    let bruto = 0
    itensVenda.forEach(it => {
      bruto += (it.qtd1 * it.peso1 * it.preco_kg1) + (it.qtd2 * it.peso2 * it.preco_kg2)
    })
    const funrural = bruto * (Number(form.funrural_pct) / 100)
    const apos_funrural = bruto - funrural
    const desconto = apos_funrural * (Number(form.desconto_avista_pct) / 100)
    const ptv = Number(form.ptv_valor) || 0
    return {
      bruto, funrural, ptv, desconto,
      liquido: apos_funrural - desconto - ptv,
      qtd1: itensVenda.reduce((s, it) => s + it.qtd1, 0),
      qtd2: itensVenda.reduce((s, it) => s + it.qtd2, 0),
    }
  }, [itensVenda, form.funrural_pct, form.ptv_valor, form.desconto_avista_pct])

  async function openModal(venda = null) {
    setEditId(null)
    setItensVenda([])
    if (venda) {
      setEditId(venda.id)
      setForm({
        carga_id: venda.carga_id ?? '',
        client_id: venda.client_id ?? '',
        data_venda: venda.data_venda ?? '',
        condicao: venda.forma_pagamento === 'prazo' ? 'prazo' : 'avista',
        prazo_dias: 30,
        conta_financeira_id: venda.conta_financeira_id ?? '',
        marcar_recebido: !!venda.conta_financeira_id,
        funrural_pct: venda.funrural_pct ?? 0,
        ptv_valor: venda.ptv_valor ?? 0,
        observacoes: venda.observacoes ?? '',
      })
      if (venda.carga_id) await carregarItens(venda.carga_id)
    } else {
      setForm({
        carga_id: '', client_id: '',
        data_venda: new Date().toISOString().split('T')[0],
        condicao: 'avista', prazo_dias: 30,
        conta_financeira_id: '', marcar_recebido: false,
        funrural_pct: 0, ptv_valor: 0, desconto_avista_pct: 0, observacoes: '',
      })
    }
    setModal(true)
  }

  async function save() {
    if (!form.carga_id)   return alert('Selecione a carga.')
    if (!form.client_id)  return alert('Selecione o cliente.')
    if (itensVenda.length === 0) return alert('Nenhum item encontrado.')
    setSaving(true)
    try {
      const status = form.condicao === 'avista' ? 'recebido' : 'pendente'
      const rpcCall = supabase.rpc('fn_salvar_venda', {
        p_venda_id:        editId || null,
        p_carga_id:        form.carga_id,
        p_client_id:       form.client_id || null,
        p_comprador:       clientes.find(c => c.id === form.client_id)?.nome || null,
        p_data_venda:      form.data_venda,
        p_data_vencimento: dataVencimento || null,
        p_condicao:        form.condicao,
        p_funrural_pct:    Number(form.funrural_pct) || 0,
        p_ptv_valor:       Number(form.ptv_valor) || 0,
        p_desconto_avista_pct: Number(form.desconto_avista_pct) || 0,
        p_observacoes:     form.observacoes || null,
        p_status:          form.marcar_recebido ? 'recebido' : status,
        p_conta_id:        form.marcar_recebido ? form.conta_financeira_id || null : null,
        p_tenant_id:       tenantId,
        p_itens:           itensVenda.map(it => ({
          carga_item_id: it.carga_item_id,
          qtd1: it.qtd1, qtd2: it.qtd2,
          peso1: it.peso1, peso2: it.peso2,
          preco_kg1: it.preco_kg1, preco_kg2: it.preco_kg2,
        })),
      })
      const timeout = new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo esgotado. Verifique a conexão e tente novamente.')),30000))
      const { error } = await Promise.race([rpcCall, timeout])
      if (error) throw new Error(error.message)
      setModal(false)
      await load()
    } catch(err) {
      console.error('[Vendas.save]', err)
      alert('Erro ao salvar: ' + err.message)
    }
    finally { setSaving(false) }
  }

  async function receberVenda() {
    if (!contaReceber) return alert('Selecione a conta.')
    if (!recebData) return alert('Informe a data do recebimento.')
    setSalvandoRec(true)
    try {
      const timeout = new Promise((_,reject) => setTimeout(() => reject(new Error('Tempo esgotado.')), 30000))
      const { error } = await Promise.race([
        supabase.rpc('fn_receber_venda', {
          p_venda_id: modalReceber.id,
          p_conta_id: contaReceber,
          p_data_recebimento: recebData,
        }),
        timeout,
      ])
      if (error) throw new Error(error.message)
      setModalReceber(null); setContaReceber(''); setRecebData(''); load()
    } catch(err) {
      console.error('[Vendas.receberVenda]', err)
      if (!handleAuthError(err)) alert('Erro ao confirmar recebimento: ' + err.message)
    } finally { setSalvandoRec(false) }
  }

  async function desfazerRecebimento(id) {
    if (!window.confirm('Desfazer recebimento? A venda voltará para pendente.')) return
    await supabase.from('vendas').update({
      status_pagamento: 'pendente',
      conta_financeira_id: null,
    }).eq('id', id)
    load()
  }

  async function excluir(id) {
    if (!window.confirm('Excluir esta venda?')) return
    await supabase.from('vendas').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function abrirModalAnexos(venda) {
    setModalAnexos(venda)
    setErroAnexo('')
    setAnexos([])
    const { data, error } = await supabase
      .from('venda_anexos')
      .select('id,tipo,nome_arquivo,path,tamanho_bytes,created_at')
      .eq('venda_id', venda.id)
      .order('created_at')
    if (error) setErroAnexo('Erro ao carregar anexos.')
    else setAnexos(data ?? [])
  }

  async function uploadAnexo(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !modalAnexos) return
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${tenantId}/${modalAnexos.id}/${uploadTipo}-${Date.now()}.${ext}`
    setUploadando(true); setErroAnexo('')
    try {
      const { error: upErr } = await supabase.storage.from('notas-fiscais').upload(path, file)
      if (upErr) throw new Error(upErr.message)
      const { error: insErr } = await supabase.from('venda_anexos').insert({
        venda_id: modalAnexos.id,
        tenant_id: tenantId,
        tipo: uploadTipo,
        path,
        nome_arquivo: file.name,
        tamanho_bytes: file.size,
      })
      if (insErr) {
        await supabase.storage.from('notas-fiscais').remove([path])
        throw new Error(insErr.message)
      }
      const { data } = await supabase.from('venda_anexos')
        .select('id,tipo,nome_arquivo,path,tamanho_bytes,created_at')
        .eq('venda_id', modalAnexos.id).order('created_at')
      setAnexos(data ?? [])
    } catch (err) {
      setErroAnexo('Erro ao enviar: ' + err.message)
    } finally { setUploadando(false) }
  }

  async function abrirAnexo(path) {
    const { data, error } = await supabase.storage.from('notas-fiscais').createSignedUrl(path, 60)
    if (error) return alert('Erro ao abrir arquivo: ' + error.message)
    window.open(data.signedUrl, '_blank')
  }

  async function excluirAnexo(id, path) {
    if (!window.confirm('Excluir este anexo?')) return
    await supabase.storage.from('notas-fiscais').remove([path])
    await supabase.from('venda_anexos').delete().eq('id', id)
    setAnexos(prev => prev.filter(a => a.id !== id))
  }

  const totalReceita  = vendas.reduce((s, v) => s + Number(v.valor_liquido ?? 0), 0)
  const totalPendente = vendas.filter(v => v.status_pagamento === 'pendente').reduce((s, v) => s + Number(v.valor_liquido ?? 0), 0)
  const statusColor   = { pendente:'var(--amber)', recebido:'var(--green)', pago:'var(--green)', atrasado:'var(--red)' }

  if (loading) return <div className="loading">Carregando vendas...</div>

  return (
    <>
      {/* KPIs */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { label:'Receita total', val:fmt(totalReceita),  color:'var(--teal)' },
          { label:'Pendente',      val:fmt(totalPendente), color:'var(--amber)' },
          { label:'Vendas',        val:vendas.length },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:16, fontWeight:700, color:k.color??'var(--text)', marginTop:2 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* LISTA */}
      {vendas.length === 0
        ? <div className="empty">Nenhuma venda registrada.</div>
        : <div className="card">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
              <BtnExportar
                dados={vendas.map(v => ({
                  'Data': fmtDate(v.data_venda),
                  'Cliente': v.comprador || '—',
                  'Condição': v.condicao || '—',
                  'Qtd 1ª': v.quantidade_primeira ?? 0,
                  'Qtd 2ª': v.quantidade_segunda ?? 0,
                  'Valor Bruto': Number(v.valor_total ?? 0),
                  'Valor Líquido': Number(v.valor_liquido ?? 0),
                  'Vencimento': fmtDate(v.data_vencimento),
                  'Status': v.status_pagamento,
                }))}
                nome="Vendas"
                titulo="Relatório de Vendas"
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Data</th><th>Cliente</th><th>Condição</th>
                  <th style={{textAlign:'right'}}>Qtd</th>
                  <th style={{textAlign:'right'}}>Bruto</th>
                  <th style={{textAlign:'right'}}>Líquido</th>
                  <th>Vencimento</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {vendas.map(v => (
                    <tr key={v.id} style={{cursor:'pointer'}} onClick={() => setDetalhe(v)}>
                      <td><strong>{fmtDate(v.data_venda)}</strong></td>
                      <td>{v.comprador || '—'}</td>
                      <td>
                        <span style={{ fontSize:11, fontWeight:600, background:v.forma_pagamento==='avista'?'var(--green-light)':'var(--amber-light)', color:v.forma_pagamento==='avista'?'var(--green)':'var(--amber)', borderRadius:4, padding:'1px 7px' }}>
                          {v.forma_pagamento === 'avista' ? 'À vista' : 'A prazo'}
                        </span>
                      </td>
                      <td style={{textAlign:'right'}}>{Number((v.quantidade_primeira||0)+(v.quantidade_segunda||0)).toLocaleString('pt-BR')}</td>
                      <td style={{textAlign:'right', color:'var(--teal)', fontWeight:600}}>{fmt(v.valor_total)}</td>
                      <td style={{textAlign:'right', fontWeight:700, color:'var(--green)'}}>{fmt(v.valor_liquido)}</td>
                      <td style={{fontSize:12, color: v.data_vencimento && new Date(v.data_vencimento) < new Date() && v.status_pagamento === 'pendente' ? 'var(--red)' : 'var(--text-muted)'}}>
                        {v.data_vencimento ? fmtDate(v.data_vencimento) : '—'}
                      </td>
                      <td style={{fontSize:12, color: v.data_vencimento && new Date(v.data_vencimento) < new Date() && v.status_pagamento==='pendente' ? 'var(--red)' : 'var(--text-muted)'}}>
                        {v.data_vencimento ? fmtDate(v.data_vencimento) : '—'}
                      </td>
                      <td>
                        <span style={{ fontSize:11, fontWeight:600, color:statusColor[v.status_pagamento]??'var(--text-muted)' }}>
                          {v.status_pagamento==='recebido'?'✅ Recebido':v.status_pagamento==='pendente'?'⏳ Pendente':v.status_pagamento}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{display:'flex', gap:4}}>
                          {(v.status_pagamento==='pendente'||v.status_pagamento==='atrasado') && (
                            <button className="btn btn-sm" style={{background:'var(--green-light)',color:'var(--green)',whiteSpace:'nowrap'}}
                              onClick={()=>{setModalReceber(v);setContaReceber('');setRecebData(new Date().toISOString().split('T')[0])}}>

                              💰 Receber
                            </button>
                          )}
                          {(v.status_pagamento==='recebido'||v.status_pagamento==='pago') && (
                            <button className="btn btn-sm" style={{background:'var(--amber-light)',color:'var(--amber)',whiteSpace:'nowrap'}}
                              onClick={()=>desfazerRecebimento(v.id)}>
                              ↩ Desfazer
                            </button>
                          )}
                          <button className="btn btn-sm" onClick={()=>abrirModalAnexos(v)} title="Notas fiscais">📎</button>
                          <button className="btn btn-sm" onClick={()=>openModal(v)}>✎</button>
                          <button className="btn btn-sm btn-danger" onClick={()=>excluir(v.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>}

      <button className="fab" onClick={()=>openModal()}>+</button>

      {/* MODAL DETALHE */}
      {detalhe && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setDetalhe(null)}>
          <div className="modal" style={{maxWidth:480}}>
            <div className="modal-header">
              <h3>Venda — {fmtDate(detalhe.data_venda)}</h3>
              <button className="modal-close" onClick={()=>setDetalhe(null)}>✕</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16}}>
              {[
                {label:'Cliente',      val:detalhe.comprador||'—'},
                {label:'Condição',     val:detalhe.forma_pagamento==='avista'?'À vista':'A prazo'},
                {label:'Vencimento',   val:detalhe.data_vencimento?fmtDate(detalhe.data_vencimento):'—'},
                {label:'Status',       val:detalhe.status_pagamento},
                {label:'1ª (cx)',      val:detalhe.quantidade_primeira},
                {label:'2ª (cx)',      val:detalhe.quantidade_segunda},
                {label:'Valor bruto',  val:fmt(detalhe.valor_total),   color:'var(--teal)'},
                {label:'Funrural',     val:fmt(detalhe.funrural_valor), color:'var(--amber)'},
                {label:'PTV',          val:fmt(detalhe.ptv_valor),      color:'var(--amber)'},
                {label:'Desconto à vista', val:`${detalhe.desconto_avista_pct ?? 0}%`, color:'var(--amber)'},
                {label:'Valor líquido',val:fmt(detalhe.valor_liquido),  color:'var(--green)'},
              ].map(k=>(
                <div key={k.label} style={{background:'var(--bg)',borderRadius:8,padding:'8px 10px'}}>
                  <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:600}}>{k.label}</div>
                  <div style={{fontSize:14,fontWeight:700,color:k.color??'var(--text)',marginTop:2}}>{k.val}</div>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setDetalhe(null)}>Fechar</button>
              <button className="btn btn-primary" onClick={()=>{setDetalhe(null);openModal(detalhe)}}>✎ Editar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RECEBER */}
      {modalReceber && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModalReceber(null)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header">
              <h3>💰 Confirmar recebimento</h3>
              <button className="modal-close" onClick={()=>setModalReceber(null)}>✕</button>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{background:'var(--bg)',borderRadius:8,padding:'10px 14px',marginBottom:14}}>
                <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:4}}>Venda de {fmtDate(modalReceber.data_venda)}</div>
                <div style={{fontSize:18,fontWeight:700,color:'var(--green)'}}>{fmt(modalReceber.valor_liquido)}</div>
                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{modalReceber.comprador}</div>
              </div>
              <div className="form-group">
                <label>Data do recebimento *</label>
                <input type="date" value={recebData} onChange={e=>setRecebData(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Conta que receberá o valor *</label>
                <select value={contaReceber} onChange={e=>setContaReceber(e.target.value)}>
                  <option value="">— Selecione a conta —</option>
                  {contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setModalReceber(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={receberVenda} disabled={salvandoRec} style={{flex:1}}>
                {salvandoRec?'Salvando...':'✅ Confirmar recebimento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ANEXOS */}
      {modalAnexos && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModalAnexos(null)}>
          <div className="modal" style={{maxWidth:500}}>
            <div className="modal-header">
              <h3>📎 Notas fiscais — {fmtDate(modalAnexos.data_venda)}</h3>
              <button className="modal-close" onClick={()=>setModalAnexos(null)}>✕</button>
            </div>
            <div style={{marginBottom:16}}>
              {/* Upload */}
              <div style={{background:'var(--bg)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:10}}>Enviar arquivo</div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <select value={uploadTipo} onChange={e=>setUploadTipo(e.target.value)}
                    style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',fontSize:13,background:'var(--surface)'}}>
                    <option value="xml">XML</option>
                    <option value="danfe">DANFE (PDF)</option>
                    <option value="comprovante">Comprovante</option>
                    <option value="outro">Outro</option>
                  </select>
                  <label style={{
                    display:'inline-flex',alignItems:'center',gap:6,
                    padding:'6px 14px',borderRadius:6,border:'1px solid var(--border)',
                    background:uploadando?'var(--bg)':'var(--surface)',
                    cursor:uploadando?'not-allowed':'pointer',fontSize:13,fontWeight:600,
                  }}>
                    {uploadando ? 'Enviando...' : '⬆ Selecionar arquivo'}
                    <input type="file" accept=".xml,.pdf,.jpg,.jpeg,.png" style={{display:'none'}}
                      disabled={uploadando} onChange={uploadAnexo}/>
                  </label>
                </div>
                {erroAnexo && <div style={{color:'var(--red)',fontSize:12,marginTop:8}}>{erroAnexo}</div>}
              </div>

              {/* Lista */}
              {anexos.length === 0
                ? <div className="empty" style={{padding:'16px 0'}}>Nenhum arquivo anexado.</div>
                : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {anexos.map(a => (
                      <div key={a.id} style={{display:'flex',alignItems:'center',gap:10,background:'var(--bg)',borderRadius:8,padding:'10px 12px'}}>
                        <span style={{fontSize:18}}>{a.tipo==='xml'?'📄':a.tipo==='danfe'?'🧾':a.tipo==='comprovante'?'✅':'📎'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.nome_arquivo}</div>
                          <div style={{fontSize:11,color:'var(--text-muted)'}}>
                            {a.tipo.toUpperCase()} · {a.tamanho_bytes ? (a.tamanho_bytes/1024).toFixed(0)+'KB' : '—'} · {fmtDate(a.created_at?.split('T')[0])}
                          </div>
                        </div>
                        <button className="btn btn-sm" onClick={()=>abrirAnexo(a.path)} title="Abrir">↗</button>
                        <button className="btn btn-sm btn-danger" onClick={()=>excluirAnexo(a.id,a.path)} title="Excluir">✕</button>
                      </div>
                    ))}
                  </div>}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={()=>setModalAnexos(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CRIAR/EDITAR */}
      {modal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal" style={{maxWidth:640}}>
            <div className="modal-header">
              <h3>{editId?'Editar venda':'Nova venda'}</h3>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>

            <div className="form-grid">
              <div className="form-group form-full">
                <label>Carga *</label>
                <select value={form.carga_id} onChange={e=>{setForm(f=>({...f,carga_id:e.target.value}));carregarItens(e.target.value)}}>
                  <option value="">— Selecione a carga —</option>
                  {cargas.map(c=>(
                    <option key={c.carga_id} value={c.carga_id}>
                      {fmtDate(c.data)} — {Number((c.total_primeira||0)+(c.total_segunda||0)).toLocaleString('pt-BR')} cx{c.observacoes ? ` — ${c.observacoes}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group form-full">
                <label>Cliente *</label>
                <select value={form.client_id} onChange={e=>setForm(f=>({...f,client_id:e.target.value}))}>
                  <option value="">— Selecione o cliente —</option>
                  {clientes.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Data da venda *</label>
                <input type="date" value={form.data_venda} onChange={e=>setForm(f=>({...f,data_venda:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label>Condição de pagamento</label>
                <select value={form.condicao} onChange={e=>setForm(f=>({...f,condicao:e.target.value}))}>
                  <option value="avista">À vista</option>
                  <option value="prazo">A prazo</option>
                </select>
              </div>
              {form.condicao==='prazo' && (
                <>
                  <div className="form-group">
                    <label>Prazo (dias)</label>
                    <input type="number" min="1" value={form.prazo_dias} onChange={e=>setForm(f=>({...f,prazo_dias:e.target.value}))} placeholder="30"/>
                  </div>
                  <div className="form-group">
                    <label>Vencimento calculado</label>
                    <input value={dataVencimento?fmtDate(dataVencimento):'—'} readOnly style={{background:'var(--bg)',color:'var(--amber)',fontWeight:600}}/>
                  </div>
                </>
              )}
              <div className="form-group">
                <label>Funrural (%)</label>
                <input type="number" step="0.01" value={form.funrural_pct} onChange={e=>setForm(f=>({...f,funrural_pct:e.target.value}))} placeholder="1.5"/>
              </div>
              <div className="form-group">
                <label>PTV (R$)</label>
                <input type="number" step="0.01" value={form.ptv_valor} onChange={e=>setForm(f=>({...f,ptv_valor:e.target.value}))} placeholder="0.00"/>
              </div>
              <div className="form-group">
                <label>Desconto à vista (%)</label>
                <input type="number" step="0.01" value={form.desconto_avista_pct} onChange={e=>setForm(f=>({...f,desconto_avista_pct:e.target.value}))} placeholder="ex: 2.5"/>
              </div>
              <div className="form-group form-full">
                <label>Observações</label>
                <input value={form.observacoes} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))}/>
              </div>
            </div>

            {/* Conta — só aparece com check */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:form.marcar_recebido?10:0}}>
                <input type="checkbox" id="chk-rec" checked={form.marcar_recebido}
                  onChange={e=>setForm(f=>({...f,marcar_recebido:e.target.checked}))}
                  style={{width:18,height:18,cursor:'pointer'}}/>
                <label htmlFor="chk-rec" style={{fontWeight:600,fontSize:13,cursor:'pointer'}}>💰 Já recebi — informar conta</label>
              </div>
              {form.marcar_recebido && (
                <select value={form.conta_financeira_id} onChange={e=>setForm(f=>({...f,conta_financeira_id:e.target.value}))}>
                  <option value="">— Selecione a conta —</option>
                  {contas.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )}
            </div>

            {/* Itens com preço */}
            {itensVenda.length > 0 && (
              <div style={{marginBottom:14}}>
                <div style={{fontWeight:600,fontSize:13,marginBottom:10,borderTop:'1px solid var(--border)',paddingTop:14}}>
                  💰 Preço por lote/setor
                </div>
                {itensVenda.map((it, idx) => {
                  const val1 = it.qtd1*it.peso1*it.preco_kg1
                  const val2 = it.qtd2*it.peso2*it.preco_kg2
                  const setorLabel = it.setor_nome ? (it.variedade?`${it.setor_nome} — ${it.variedade}`:it.setor_nome) : ''
                  return (
                    <div key={idx} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',marginBottom:8}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                        <div>
                          <span style={{fontWeight:700,fontSize:13}}>{it.lote_nome}</span>
                          {setorLabel&&<span style={{fontSize:11,color:'var(--text-muted)',marginLeft:8}}>{setorLabel}</span>}
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:'var(--teal)'}}>{fmt(val1+val2)}</span>
                      </div>
                      {it.qtd1 > 0 && (
                        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6,flexWrap:'wrap'}}>
                          <span style={{fontSize:11,background:'#EAF3DE',color:'var(--green)',borderRadius:4,padding:'1px 6px',fontWeight:600}}>1ª</span>
                          <span style={{fontSize:12,color:'var(--text-muted)'}}>{it.qtd1} cx × {it.peso1} kg/cx = {(it.qtd1*it.peso1).toFixed(0)} kg</span>
                          <div className="form-group" style={{marginBottom:0,flex:1,minWidth:100}}>
                            <label style={{fontSize:10}}>Preço/kg (R$)</label>
                            <input type="number" step="0.001" value={it.preco_kg1}
                              onChange={e=>updItem(idx,'preco_kg1',parseFloat(e.target.value)||0)} placeholder="0.000"/>
                          </div>
                          {val1>0&&<span style={{fontSize:13,fontWeight:700,color:'var(--green)'}}>{fmt(val1)}</span>}
                        </div>
                      )}
                      {it.qtd2 > 0 && (
                        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                          <span style={{fontSize:11,background:'#FAEEDA',color:'var(--amber)',borderRadius:4,padding:'1px 6px',fontWeight:600}}>2ª</span>
                          <span style={{fontSize:12,color:'var(--text-muted)'}}>{it.qtd2} cx × {it.peso2} kg/cx = {(it.qtd2*it.peso2).toFixed(0)} kg</span>
                          <div className="form-group" style={{marginBottom:0,flex:1,minWidth:100}}>
                            <label style={{fontSize:10}}>Preço/kg (R$)</label>
                            <input type="number" step="0.001" value={it.preco_kg2}
                              onChange={e=>updItem(idx,'preco_kg2',parseFloat(e.target.value)||0)} placeholder="0.000"/>
                          </div>
                          {val2>0&&<span style={{fontSize:13,fontWeight:700,color:'var(--amber)'}}>{fmt(val2)}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Resumo */}
            {totais.bruto > 0 && (
              <div style={{background:'var(--bg)',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
                <div style={{fontWeight:600,fontSize:12,color:'var(--text-muted)',textTransform:'uppercase',marginBottom:10}}>Resumo</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span>Valor bruto</span>
                    <span style={{color:'var(--teal)',fontWeight:600}}>{fmt(totais.bruto)}</span>
                  </div>
                  {totais.funrural>0&&(
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'var(--amber)'}}>
                      <span>Funrural ({form.funrural_pct}%)</span>
                      <span>− {fmt(totais.funrural)}</span>
                    </div>
                  )}
                  {totais.ptv>0&&(
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'var(--amber)'}}>
                      <span>PTV</span><span>− {fmt(totais.ptv)}</span>
                    </div>
                  )}
                  {totais.desconto>0&&(
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'var(--amber)'}}>
                      <span>Desconto à vista ({form.desconto_avista_pct}%)</span><span>− {fmt(totais.desconto)}</span>
                    </div>
                  )}
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:15,fontWeight:700,color:'var(--green)',borderTop:'1px solid var(--border)',paddingTop:8}}>
                    <span>Valor líquido</span>
                    <span>{fmt(totais.liquido)}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                    {form.condicao==='avista'?'✅ À vista — lançado como recebido':`⏳ A prazo — vence em ${dataVencimento?fmtDate(dataVencimento):'...'}`}
                  </div>
                </div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn" onClick={()=>setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{flex:1}}>
                {saving?'Salvando...':editId?'✓ Salvar alterações':'✓ Registrar venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
