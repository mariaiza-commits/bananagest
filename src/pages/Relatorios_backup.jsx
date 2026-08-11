import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmt, fmtDate } from '../lib/utils'
import { BtnExportar, exportarPDF } from '../lib/utils'

const RELATORIOS = [
  { id:'clientes',    icon:'👥', label:'Por Cliente',     desc:'Compras, valores e pendências por cliente' },
  { id:'fornecedor',  icon:'🏭', label:'Por Fornecedor',  desc:'Contas a pagar por fornecedor' },
  { id:'variedade',   icon:'🌱', label:'Por Variedade',   desc:'Produção e receita por variedade' },
  { id:'lote',        icon:'🗺️', label:'Por Lote',        desc:'Produção, vendas e custos por lote' },
  { id:'carga',       icon:'📦', label:'Por Carga/Mês',   desc:'Cargas por período com detalhes' },
  { id:'financeiro',  icon:'💰', label:'A Receber/Pagar', desc:'Contas pendentes e vencidas' },
]

export default function Relatorios() {
  const { handleAuthError } = useAuth()
  const [relAtivo, setRelAtivo]   = useState(null)
  const [dados, setDados]         = useState([])
  const [loading, setLoading]     = useState(false)
  const [clientes, setClientes]   = useState([])
  const [fornecedores, setFornec] = useState([])
  const [lotes, setLotes]         = useState([])

  // Filtros
  const [filtroCliente,    setFiltroCliente]    = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroLote,       setFiltroLote]       = useState('')
  const [filtroStatus,     setFiltroStatus]     = useState('')
  const [filtroVariedade,  setFiltroVariedade]  = useState('')
  const [filtroTipo,       setFiltroTipo]        = useState('')
  const [filtroNome,       setFiltroNome]        = useState('')
  const [variedades,       setVariedades]        = useState([])
  const [dataInicio,       setDataInicio]       = useState('')
  const [dataFim,          setDataFim]          = useState('')

  useEffect(() => { loadFiltros() }, [])

  async function loadFiltros() {
    const [{ data: cls }, { data: forn }, { data: ls }, { data: vars }] = await Promise.all([
      supabase.from('clients').select('id,nome').is('deleted_at', null).order('nome'),
      supabase.from('suppliers').select('id,nome').is('deleted_at', null).order('nome'),
      supabase.from('lotes').select('id,nome').order('nome'),
      supabase.from('variedades_cadastradas').select('nome').order('nome'),
    ])
    setClientes(cls ?? [])
    setFornec(forn ?? [])
    setLotes(ls ?? [])
    setVariedades(vars ?? [])
  }

  async function gerarRelatorio(tipo) {
    setRelAtivo(tipo)
    setLoading(true)
    setDados([])
    try {

    let rows = []

    if (tipo === 'clientes') {
      let q = supabase.from('vendas')
        .select('comprador, client_id, data_venda, data_vencimento, data_recebimento, valor_total, valor_liquido, status_pagamento, quantidade_primeira, quantidade_segunda, clients(nome)')
        .is('deleted_at', null)
        .order('comprador')
      if (filtroCliente) q = q.eq('client_id', filtroCliente)
      if (dataInicio)    q = q.gte('data_venda', dataInicio)
      if (dataFim)       q = q.lte('data_venda', dataFim)
      if (filtroStatus)  q = q.eq('status_pagamento', filtroStatus)
      const { data } = await q
      rows = (data ?? []).map(v => {
        const diasAtraso = v.data_recebimento && v.data_vencimento
          ? Math.round((new Date(v.data_recebimento) - new Date(v.data_vencimento)) / 86400000)
          : null
        return {
          'Cliente':          v.clients?.nome || v.comprador || '—',
          'Data Venda':       fmtDate(v.data_venda),
          'Vencimento':       v.data_vencimento ? fmtDate(v.data_vencimento) : '—',
          'Data Recebimento': v.data_recebimento ? fmtDate(v.data_recebimento) : '—',
          'Dias até pagar':   diasAtraso === null ? '—' : diasAtraso > 0 ? `+${diasAtraso}d atraso` : diasAtraso === 0 ? 'No prazo' : `${Math.abs(diasAtraso)}d antes`,
          'Qtd 1ª (cx)':      v.quantidade_primeira ?? 0,
          'Qtd 2ª (cx)':      v.quantidade_segunda ?? 0,
          'Valor Bruto':      Number(v.valor_total ?? 0),
          'Valor Líquido':    Number(v.valor_liquido ?? 0),
          'Status':           v.status_pagamento,
        }
      })
    }

    else if (tipo === 'fornecedor') {
      let q = supabase.from('custos')
        .select('descricao, supplier_id, data_custo, data_vencimento, valor, status_pagamento, suppliers(nome)')
        .is('deleted_at', null)
        .order('data_vencimento')
      if (filtroFornecedor) q = q.eq('supplier_id', filtroFornecedor)
      if (dataInicio)       q = q.gte('data_custo', dataInicio)
      if (dataFim)          q = q.lte('data_custo', dataFim)
      if (filtroStatus)     q = q.eq('status_pagamento', filtroStatus)
      const { data } = await q
      rows = (data ?? []).map(c => ({
        'Fornecedor':    c.suppliers?.nome || '—',
        'Descrição':     c.descricao || '—',
        'Data':          fmtDate(c.data_custo),
        'Vencimento':    c.data_vencimento ? fmtDate(c.data_vencimento) : '—',
        'Valor':         Number(c.valor ?? 0),
        'Status':        c.status_pagamento || '—',
      }))
    }

    else if (tipo === 'variedade') {
      const { data } = await supabase.rpc('fn_relatorio_variedade', {
        p_inicio: dataInicio || null,
        p_fim: dataFim || null,
        p_client_id: filtroCliente || null,
      })
      rows = (data ?? []).map(r => ({
        'Variedade':      r.variedade || '—',
        'Lotes':          r.lotes || '—',
        'Total Cx 1ª':    Number(r.total_cx_primeira ?? 0),
        'Total Cx 2ª':    Number(r.total_cx_segunda ?? 0),
        'Total Cx':       Number(r.total_cx ?? 0),
        'Receita Bruta':  Number(r.receita_bruta ?? 0),
      }))
    }

    else if (tipo === 'lote') {
      let q = supabase.from('vw_resumo_por_lote').select('*')
      if (filtroLote) q = q.eq('lote_id', filtroLote)
      const { data: allData } = await q
      // Filtra por variedade cruzando com setores
      let data = allData
      if (filtroVariedade && allData) {
        const { data: setsFilt } = await supabase
          .from('setores').select('lote_id').eq('variedade', filtroVariedade)
        const loteIds = (setsFilt ?? []).map(s => s.lote_id)
        data = allData.filter(r => loteIds.includes(r.lote_id))
      }
      rows = (data ?? []).map(r => ({
        'Lote':            r.lote,
        'Status':          r.status,
        'Total Cx':        Number(r.total_caixas_produzidas ?? 0),
        'Colheitas':       Number(r.qtd_colheitas ?? 0),
        'Receita Bruta':   Number(r.receita_bruta ?? 0),
        'Custo Total':     Number(r.custo_total ?? 0),
        'Lucro Bruto':     Number(r.lucro_bruto ?? 0),
        'Margem %':        Number(r.margem_pct ?? 0),
      }))
    }

    else if (tipo === 'carga') {
      let q = supabase.from('vw_resumo_cargas').select('*').order('data', { ascending: false })
      if (dataInicio) q = q.gte('data', dataInicio)
      if (dataFim)    q = q.lte('data', dataFim)
      const { data } = await q
      rows = (data ?? []).map(c => ({
        'Data':          fmtDate(c.data),
        'Qtd 1ª (cx)':  Number(c.total_primeira ?? 0),
        'Qtd 2ª (cx)':  Number(c.total_segunda ?? 0),
        'Total (cx)':   Number((c.total_primeira??0)+(c.total_segunda??0)),
        'Peso Total kg': Number(c.peso_total_kg ?? 0).toFixed(0),
        'Observações':  c.observacoes || '—',
      }))
    }

    else if (tipo === 'financeiro') {
      const [{ data: receber }, { data: pagar }] = await Promise.all([
        supabase.from('vendas').select('comprador, client_id, data_venda, data_vencimento, valor_liquido, status_pagamento, clients(nome)')
          .in('status_pagamento', ['pendente','atrasado']).is('deleted_at', null).order('data_vencimento'),
        supabase.from('custos').select('descricao, supplier_id, data_vencimento, valor, status_pagamento, suppliers(nome)')
          .in('status_pagamento', ['pendente','atrasado']).is('deleted_at', null).order('data_vencimento'),
      ])
      const recRows = (receber ?? []).map(v => ({
        'Tipo':          '💰 A Receber',
        'Descrição':     v.clients?.nome || v.comprador || '—',
        'Vencimento':    v.data_vencimento ? fmtDate(v.data_vencimento) : '—',
        'Valor':         Number(v.valor_liquido ?? 0),
        'Status':        v.status_pagamento,
        'Vencida?':      v.data_vencimento && new Date(v.data_vencimento) < new Date() ? 'Sim' : 'Não',
      }))
      const pagRows = (pagar ?? []).map(c => ({
        'Tipo':          '💸 A Pagar',
        'Descrição':     c.suppliers?.nome || c.descricao || '—',
        'Vencimento':    c.data_vencimento ? fmtDate(c.data_vencimento) : '—',
        'Valor':         Number(c.valor ?? 0),
        'Status':        c.status_pagamento,
        'Vencida?':      c.data_vencimento && new Date(c.data_vencimento) < new Date() ? 'Sim' : 'Não',
      }))
      let combined = [...recRows, ...pagRows].sort((a,b) => (a.Vencimento||'').localeCompare(b.Vencimento||''))
      if (filtroTipo === 'receber') combined = recRows
      if (filtroTipo === 'pagar')   combined = pagRows
      if (filtroNome) combined = combined.filter(r => r['Descrição'].toLowerCase().includes(filtroNome.toLowerCase()))
      rows = combined
    }

    setDados(rows)
    } catch (e) { handleAuthError(e) } finally {
      setLoading(false)
    }
  }

  const totalValor = dados.reduce((s, r) => {
    const v = r['Valor Líquido'] ?? r['Valor Bruto'] ?? r['Valor'] ?? r['Receita Bruta'] ?? r['Lucro Bruto'] ?? 0
    return s + Number(v)
  }, 0)

  return (
    <div>
      {/* Cards de seleção */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:10, marginBottom:20 }}>
        {RELATORIOS.map(r => (
          <div key={r.id} onClick={() => gerarRelatorio(r.id)}
            style={{ background: relAtivo===r.id ? '#EAF3DE' : 'var(--surface)', border: `1px solid ${relAtivo===r.id ? '#C0DD97' : 'var(--border)'}`, borderRadius:'var(--radius)', padding:'14px 16px', cursor:'pointer', transition:'all .15s' }}>
            <div style={{ fontSize:24, marginBottom:6 }}>{r.icon}</div>
            <div style={{ fontWeight:700, fontSize:13, color: relAtivo===r.id ? '#2d6a2d' : 'var(--text)', marginBottom:4 }}>{r.label}</div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{r.desc}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      {relAtivo && (
        <div className="card" style={{ marginBottom:14, padding:'12px 16px' }}>
          <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>🔍 Filtros</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Data início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom:0 }}>
              <label>Data fim</label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            {relAtivo === 'clientes' && (
              <>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Cliente</label>
                  <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
                    <option value="">Todos</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Status</label>
                  <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="pendente">Pendente</option>
                    <option value="recebido">Recebido</option>
                    <option value="atrasado">Atrasado</option>
                  </select>
                </div>
              </>
            )}
            {relAtivo === 'fornecedor' && (
              <>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Fornecedor</label>
                  <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}>
                    <option value="">Todos</option>
                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Status</label>
                  <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="atrasado">Atrasado</option>
                  </select>
                </div>
              </>
            )}
            {relAtivo === 'financeiro' && (
              <>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Tipo</label>
                  <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setFiltroNome('') }}>
                    <option value="">Todos</option>
                    <option value="receber">💰 A Receber</option>
                    <option value="pagar">💸 A Pagar</option>
                  </select>
                </div>
                {filtroTipo === 'receber' && (
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label>Cliente</label>
                    <select value={filtroNome} onChange={e => setFiltroNome(e.target.value)}>
                      <option value="">Todos os clientes</option>
                      {clientes.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                    </select>
                  </div>
                )}
                {filtroTipo === 'pagar' && (
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label>Fornecedor</label>
                    <select value={filtroNome} onChange={e => setFiltroNome(e.target.value)}>
                      <option value="">Todos os fornecedores</option>
                      {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
            {relAtivo === 'variedade' && (
              <div className="form-group" style={{ marginBottom:0 }}>
                <label>Cliente</label>
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}>
                  <option value="">Todos</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            )}
            {relAtivo === 'lote' && (
              <>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Lote</label>
                  <select value={filtroLote} onChange={e => setFiltroLote(e.target.value)}>
                    <option value="">Todos</option>
                    {lotes.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label>Variedade</label>
                  <select value={filtroVariedade} onChange={e => setFiltroVariedade(e.target.value)}>
                    <option value="">Todas</option>
                    {variedades.map(v => <option key={v.nome} value={v.nome}>{v.nome}</option>)}
                  </select>
                </div>
              </>
            )}
            <button className="btn btn-primary" onClick={() => gerarRelatorio(relAtivo)}>
              🔍 Gerar
            </button>
            {dados.length > 0 && (
              <BtnExportar
                dados={dados}
                nome={RELATORIOS.find(r => r.id === relAtivo)?.label ?? 'Relatorio'}
                titulo={RELATORIOS.find(r => r.id === relAtivo)?.label ?? 'Relatório'}
              />
            )}
          </div>
        </div>
      )}

      {/* Resultado */}
      {loading && <div className="loading">Gerando relatório...</div>}

      {!loading && dados.length > 0 && (
        <>
          {/* Totalizador */}
          <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 14px' }}>
              <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>Registros</div>
              <div style={{ fontSize:16, fontWeight:700, marginTop:2 }}>{dados.length}</div>
            </div>
            {totalValor > 0 && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 14px' }}>
                <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>Total</div>
                <div style={{ fontSize:16, fontWeight:700, color:'var(--teal)', marginTop:2 }}>{fmt(totalValor)}</div>
              </div>
            )}
          </div>

          {/* Tabela */}
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {Object.keys(dados[0]).map(col => (
                      <th key={col}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => {
                        const col = Object.keys(row)[j]
                        const isValor = col.includes('Valor') || col.includes('Receita') || col.includes('Custo') || col.includes('Lucro')
                        const isStatus = col === 'Status'
                        const statusColor = { pendente:'var(--amber)', recebido:'var(--green)', pago:'var(--green)', atrasado:'var(--red)' }
                        return (
                          <td key={j} style={{ textAlign: isValor ? 'right' : 'left' }}>
                            {isValor
                              ? <span style={{ color:'var(--teal)', fontWeight:600 }}>{fmt(val)}</span>
                              : isStatus
                              ? <span style={{ fontSize:11, fontWeight:600, color:statusColor[val]??'var(--text-muted)' }}>{val}</span>
                              : val}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && relAtivo && dados.length === 0 && (
        <div className="empty">Nenhum dado encontrado. Ajuste os filtros e clique em Gerar.</div>
      )}
    </div>
  )
}
