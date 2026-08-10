import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmt } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

// ─── ENUMS ───────────────────────────────────────────────────
const TIPOS = [
  { value:'agricultura', label:'🌱 Agricultura', desc:'Culturas vegetais, grãos, frutas' },
  { value:'pecuaria',    label:'🐄 Pecuária',    desc:'Gado, suínos, aves, etc.' },
  { value:'servico',     label:'🔧 Serviço',     desc:'Aluguel de máquinas, mão de obra' },
  { value:'outro',       label:'⚡ Outro',        desc:'Outros tipos de atividade' },
]

const UNIDADES = {
  agricultura: ['caixa','saca','kg','tonelada','litro','outro'],
  pecuaria:    ['arroba','cabeca','kg','litro','outro'],
  servico:     ['hora','diaria','outro'],
  outro:       ['unidade','outro'],
}

const ICONES = ['🌱','🍌','🐄','☕','🌽','🌿','🎋','🍅','🥑','🍊','🍋','🍇','🌾','🫘','🥦','🐷','🐔','🐟','🔧','⚡']

const EMPTY = {
  nome:'', tipo:'agricultura', unidade_producao:'caixa',
  icone:'🌱', descricao:'', ativo:true,
  settings: { funrural_pct: 0, ptv_padrao: 0, preco_meta: 0 }
}

export default function Culturas({ onAddBtn }) {
  const { tenantId, handleAuthError } = useAuth()
  const [culturas, setCulturas]   = useState([])
  const [lucros, setLucros]       = useState({})
  const [varCad, setVarCad]         = useState([])
  const [modalVars, setModalVars]   = useState(null)
  const [variedades, setVariedades] = useState({}) // cultura_id → lista de variedades
  const [loading, setLoading]     = useState(true)
  const [modal, setModal]         = useState(false)
  const [detalhe, setDetalhe]     = useState(null)
  const [form, setForm]           = useState(EMPTY)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [erro, setErro]           = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => { load() }, [])
  useEffect(() => { if (onAddBtn) onAddBtn(() => openModal()) }, [])

  async function load() {
    setLoading(true)
    try {
    const [{ data: cs }, { data: ls }, { data: vs }, { data: vcad }] = await Promise.all([
      supabase.from('culturas').select('*').is('deleted_at', null).order('nome'),
      supabase.from('vw_lucro_por_cultura').select('*'),
      supabase.from('setores').select('variedade, lote_id').not('variedade', 'is', null).neq('variedade', ''),
      supabase.from('variedades_cadastradas').select('*').order('nome'),
    ])
    setCulturas(cs ?? [])
    const m = {}; (ls ?? []).forEach(r => { m[r.cultura_id] = r }); setLucros(m)
    // Agrupa variedades por cultura_id
    const varMap = {}
    ;(vs ?? []).forEach(s => {
      const cid = s.cultura
      if (!cid) return
      if (!cid || !varMap[cid]) { if(cid) varMap[cid] = new Set(); else return; }
      varMap[cid].add(s.variedade)
    })
    // Converte sets para arrays
    const varObj = {}
    Object.entries(varMap).forEach(([k, v]) => { varObj[k] = [...v].sort() })
    setVariedades(varObj)
    setVarCad(vcad ?? [])
    } catch (e) { handleAuthError(e) } finally {
      setLoading(false)
    }
  }

  function openModal(c = null) {
    setErro('')
    if (c) {
      setForm({
        nome: c.nome, tipo: c.tipo ?? 'agricultura',
        unidade_producao: c.unidade_producao ?? 'caixa',
        icone: c.icone ?? '🌱', descricao: c.descricao ?? '',
        ativo: c.ativo ?? true,
        settings: c.settings ?? { funrural_pct: 0, ptv_padrao: 0, preco_meta: 0 }
      })
      setEditId(c.id)
    } else {
      setForm(EMPTY); setEditId(null)
    }
    setModal(true)
  }

  async function save() {
    setErro('')
    if (!form.nome.trim()) return setErro('O nome é obrigatório.')

    // Verifica duplicidade
    const { data: exist } = await supabase.from('culturas')
      .select('id').ilike('nome', form.nome.trim()).is('deleted_at', null).neq('id', editId ?? '00000000-0000-0000-0000-000000000000')
    if (exist?.length) return setErro(`Já existe uma cultura com o nome "${form.nome}".`)

    setSaving(true)
    const payload = {
      nome: form.nome.trim(), tipo: form.tipo,
      unidade_producao: form.unidade_producao,
      icone: form.icone, descricao: form.descricao || null,
      ativo: form.ativo, settings: form.settings
    }
    if (editId) await supabase.from('culturas').update(payload).eq('id', editId)
    else await supabase.from('culturas').insert({ ...payload, tenant_id: tenantId })
    setSaving(false); setModal(false); load()
  }

  async function toggleAtivo(c) {
    await supabase.from('culturas').update({ ativo: !c.ativo }).eq('id', c.id); load()
  }

  async function excluir(id) {
    if (!window.confirm('Excluir esta cultura permanentemente? Esta ação não pode ser desfeita.')) return
    await supabase.from('culturas').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  function setSetting(key, val) {
    setForm(f => ({ ...f, settings: { ...f.settings, [key]: val } }))
  }

  const tipoLabel = Object.fromEntries(TIPOS.map(t => [t.value, t.label]))
  const filtradas = culturas.filter(c => !filtroTipo || c.tipo === filtroTipo)
  const totalReceita = filtradas.reduce((s, c) => s + Number(lucros[c.id]?.receita_liquida ?? 0), 0)
  const totalLucro   = filtradas.reduce((s, c) => s + Number(lucros[c.id]?.lucro_total ?? 0), 0)

  if (loading) return <div className="loading">Carregando culturas...</div>

  return (
    <>
      {/* Totalizadores */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        {[
          { label:'Culturas', val: culturas.length, color:'var(--text)' },
          { label:'Ativas', val: culturas.filter(c=>c.ativo).length, color:'var(--green)' },
          { label:'Receita total', val: fmt(totalReceita), color:'var(--teal)' },
          { label:'Lucro total', val: fmt(totalLucro), color: totalLucro >= 0 ? 'var(--green)' : 'var(--red)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:'8px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase' }}>{k.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:k.color, marginTop:2 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div className="card" style={{ marginBottom:12, padding:'10px 14px' }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {[{ value:'', label:'Todos tipos' }, ...TIPOS].map(t => (
            <button key={t.value} className="btn btn-sm"
              style={{ background: filtroTipo === t.value ? 'var(--green)' : '', color: filtroTipo === t.value ? 'white' : '' }}
              onClick={() => setFiltroTipo(t.value)}>{t.label ?? t}</button>
          ))}
        </div>
      </div>

      {/* Grid de cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:12 }}>
        {filtradas.map(c => {
          const l = lucros[c.id] ?? {}
          const lucro = Number(l.lucro_total ?? 0)
          const rec   = Number(l.receita_liquida ?? 0)
          return (
            <div key={c.id} className="card" style={{ marginBottom:0, cursor:'pointer', opacity: c.ativo ? 1 : 0.55, overflow:'hidden', wordBreak:'break-word' }}
              onClick={() => setDetalhe(c)}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ fontSize:32 }}>{c.icone}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:16 }}>{c.nome}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>{tipoLabel[c.tipo] ?? c.tipo} · {c.unidade_producao}</div>
                </div>
                <span className={`badge ${c.ativo ? 'badge-green' : 'badge-gray'}`} style={{ fontSize:10 }}>
                  {c.ativo ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                <div style={{ flex:1, background:'var(--bg)', borderRadius:6, padding:'6px 10px', minWidth:0 }}>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Receita</div>
                  <div style={{ fontWeight:700, color:'var(--teal)', fontSize:'clamp(11px,2.5vw,14px)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fmt(rec)}</div>
                </div>
                <div style={{ flex:1, background:'var(--bg)', borderRadius:6, padding:'6px 10px', minWidth:0 }}>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>Lucro</div>
                  <div style={{ fontWeight:700, color: lucro >= 0 ? 'var(--green)' : 'var(--red)', fontSize:'clamp(11px,2.5vw,14px)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{fmt(lucro)}</div>
                </div>
              </div>

              {l.custo_por_unidade > 0 && (
                <div style={{ fontSize:12, color:'var(--text-muted)' }}>
                  Custo/{c.unidade_producao}: <strong style={{ color:'var(--amber)' }}>{fmt(l.custo_por_unidade)}</strong>
                  {l.receita_por_ha > 0 && <span> · Receita/ha: <strong>{fmt(l.receita_por_ha)}</strong></span>}
                </div>
              )}

              {/* Variedades */}
              {(lucros[c.id]?.variedades) ? (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Variedades</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, overflow:'hidden' }}>
                    {(lucros[c.id]?.variedades || '').split(', ').filter(Boolean).map(v => (
                      <span key={v} style={{ fontSize:11, background:'var(--green-light)', color:'var(--green)', borderRadius:4, padding:'2px 8px', fontWeight:600 }}>{v}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, fontStyle:'italic' }}>Sem variedades cadastradas</div>
              )}

              {/* Lotes vinculados */}
              {(() => {
                const l = lucros[c.id] ?? {}
                const qtd = Number(l.qtd_lotes ?? 0)
                return qtd > 0 ? (
                  <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:8 }}>
                    🗂️ <strong>{qtd}</strong> lote{qtd !== 1 ? 's' : ''} vinculado{qtd !== 1 ? 's' : ''}
                    {l.area_total_ha > 0 && <span> · {Number(l.area_total_ha).toFixed(1)} ha</span>}
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, fontStyle:'italic' }}>Sem lotes vinculados</div>
                )
              })()}

              <div style={{ display:'flex', gap:6, marginTop:10 }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm" style={{ flex:1 }} onClick={() => openModal(c)}>✎ Editar</button>
                <button className="btn btn-sm" style={{ background:'#EAF3DE', color:'#2d6a2d' }} onClick={() => setModalVars(c)}>🌱 Variedades</button>
                <button className="btn btn-sm" style={{ background: c.ativo ? 'var(--amber-light)' : 'var(--green-light)', color: c.ativo ? 'var(--amber)' : 'var(--green)', borderColor:'transparent' }}
                  onClick={() => toggleAtivo(c)}>{c.ativo ? '⏸' : '▶'}</button>
                <button className="btn btn-sm btn-danger" onClick={() => excluir(c.id)}>✕</button>
              </div>
            </div>
          )
        })}

        {/* Card novo */}
        <div className="card" style={{ marginBottom:0, display:'flex', alignItems:'center', justifyContent:'center', minHeight:160, cursor:'pointer', border:'1px dashed var(--border)' }}
          onClick={() => openModal()}>
          <div style={{ textAlign:'center', color:'var(--text-muted)' }}>
            <div style={{ fontSize:28 }}>+</div>
            <div style={{ fontSize:13, marginTop:4 }}>Nova cultura</div>
          </div>
        </div>
      </div>

      <button className="fab" onClick={() => openModal()}>+</button>

      {/* Modal Detalhe */}
      {detalhe && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setDetalhe(null)}>
          <div className="modal" style={{ maxWidth:500 }}>
            <div className="modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:36 }}>{detalhe.icone}</span>
                <div>
                  <h3 style={{ marginBottom:2 }}>{detalhe.nome}</h3>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>{tipoLabel[detalhe.tipo]} · {detalhe.unidade_producao}</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => setDetalhe(null)}>✕</button>
            </div>

            {(() => {
              const l = lucros[detalhe.id] ?? {}
              return (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
                    {[
                      { label:'Receita', val:fmt(l.receita_liquida??0), color:'var(--teal)' },
                      { label:'Custo', val:fmt(l.custo_total??0), color:'var(--amber)' },
                      { label:'Lucro', val:fmt(l.lucro_total??0), color:Number(l.lucro_total??0)>=0?'var(--green)':'var(--red)' },
                      { label:'Lotes', val:l.qtd_lotes??0, color:'var(--text)' },
                      { label:`Custo/${detalhe.unidade_producao}`, val:fmt(l.custo_por_unidade??0), color:'var(--amber)' },
                      { label:'Receita/ha', val:fmt(l.receita_por_ha??0), color:'var(--teal)' },
                    ].map(k => (
                      <div key={k.label} style={{ background:'var(--bg)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                        <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600 }}>{k.label}</div>
                        <div style={{ fontWeight:700, fontSize:15, color:k.color, marginTop:2 }}>{k.val}</div>
                      </div>
                    ))}
                  </div>

                  {detalhe.settings && (
                    <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>⚙️ Configurações</div>
                      <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:13 }}>
                        {detalhe.settings.funrural_pct > 0 && <span>Funrural: <strong>{detalhe.settings.funrural_pct}%</strong></span>}
                        {detalhe.settings.ptv_padrao > 0 && <span>PTV padrão: <strong>{fmt(detalhe.settings.ptv_padrao)}</strong></span>}
                        {detalhe.settings.preco_meta > 0 && <span>Preço meta: <strong>{fmt(detalhe.settings.preco_meta)}</strong></span>}
                      </div>
                    </div>
                  )}

                  {detalhe.descricao && <p style={{ fontSize:13, color:'var(--text-muted)', marginBottom:14 }}>{detalhe.descricao}</p>}

                  {variedades[detalhe.id]?.length > 0 && (
                    <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', marginBottom:14 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:8 }}>🌿 Variedades cadastradas</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {variedades[detalhe.id].map(v => (
                          <span key={v} style={{ fontSize:13, background:'var(--green-light)', color:'var(--green)', borderRadius:6, padding:'4px 10px', fontWeight:600 }}>{v}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" style={{ flex:1 }} onClick={() => { setDetalhe(null); openModal(detalhe) }}>✎ Editar</button>
              <button className="btn btn-sm" style={{ background:detalhe.ativo?'var(--amber-light)':'var(--green-light)', color:detalhe.ativo?'var(--amber)':'var(--green)', borderColor:'transparent' }}
                onClick={() => { toggleAtivo(detalhe); setDetalhe(null) }}>{detalhe.ativo ? '⏸ Pausar' : '▶ Ativar'}</button>
              <button className="btn btn-danger" onClick={() => { excluir(detalhe.id); setDetalhe(null) }}>✕ Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar/Editar */}
      {modal && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div className="modal" style={{ maxWidth:520 }}>
            <div className="modal-header">
              <h3>{editId ? 'Editar cultura' : 'Nova cultura'}</h3>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>

            {erro && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:13 }}>⚠️ {erro}</div>}

            {/* Ícone seletor */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:6 }}>Ícone</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {ICONES.map(ic => (
                  <button key={ic} onClick={() => setForm(f => ({ ...f, icone: ic }))}
                    style={{ fontSize:22, background: form.icone === ic ? 'var(--green-light)' : 'var(--bg)', border: form.icone === ic ? '2px solid var(--green)' : '1px solid var(--border)', borderRadius:8, padding:'4px 8px', cursor:'pointer' }}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group form-full">
                <label>Nome *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="ex: Banana Prata Anã" autoFocus />
              </div>

              <div className="form-group">
                <label>Tipo *</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value, unidade_producao: UNIDADES[e.target.value]?.[0] ?? 'outro' }))}>
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:3, display:'block' }}>
                  {TIPOS.find(t => t.value === form.tipo)?.desc}
                </span>
              </div>

              <div className="form-group">
                <label>Unidade de produção *</label>
                <select value={form.unidade_producao} onChange={e => setForm(f => ({ ...f, unidade_producao: e.target.value }))}>
                  {(UNIDADES[form.tipo] ?? ['outro']).map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div className="form-group form-full">
                <label>Descrição</label>
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Informações sobre esta cultura..." />
              </div>
            </div>

            {/* Configurações específicas */}
            <div style={{ marginTop:4, marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:10, borderTop:'1px solid var(--border)', paddingTop:12 }}>⚙️ Configurações financeiras</div>
              <div className="form-grid">
                <div className="form-group">
                  <label>Funrural (%)</label>
                  <input type="number" step="0.01" value={form.settings.funrural_pct} onChange={e => setSetting('funrural_pct', parseFloat(e.target.value)||0)} placeholder="ex: 1.5" />
                  <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, display:'block' }}>Deduzido automaticamente nas vendas</span>
                </div>
                <div className="form-group">
                  <label>PTV padrão (R$)</label>
                  <input type="number" step="0.01" value={form.settings.ptv_padrao} onChange={e => setSetting('ptv_padrao', parseFloat(e.target.value)||0)} placeholder="0,00" />
                </div>
                <div className="form-group">
                  <label>Preço meta (R$/{form.unidade_producao})</label>
                  <input type="number" step="0.01" value={form.settings.preco_meta} onChange={e => setSetting('preco_meta', parseFloat(e.target.value)||0)} placeholder="0,00" />
                  <span style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, display:'block' }}>Alerta quando preço de venda estiver abaixo</span>
                </div>
                <div className="form-group" style={{ display:'flex', alignItems:'center', gap:10, paddingTop:20 }}>
                  <input type="checkbox" id="chk-ativo" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} style={{ width:18, height:18 }} />
                  <label htmlFor="chk-ativo" style={{ fontWeight:600, cursor:'pointer' }}>Cultura ativa</label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex:1 }}>
                {saving ? 'Salvando...' : editId ? '✓ Salvar alterações' : '✓ Criar cultura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Variedades */}
      {modalVars && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setModalVars(null)}>
          <div className="modal" style={{ maxWidth:420 }}>
            <div className="modal-header">
              <h3>{modalVars.icone} Variedades — {modalVars.nome}</h3>
              <button className="modal-close" onClick={() => setModalVars(null)}>✕</button>
            </div>
            <div style={{ marginBottom:14 }}>
              {varCad.filter(v => v.cultura === modalVars.nome).length === 0
                ? <div style={{ textAlign:'center', padding:16, color:'var(--text-muted)', fontSize:13 }}>Nenhuma variedade cadastrada.</div>
                : varCad.filter(v => v.cultura === modalVars.nome).map(v => (
                  <div key={v.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--bg)', borderRadius:8, marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:600, background:'#EAF3DE', color:'#2d6a2d', borderRadius:6, padding:'2px 10px' }}>{v.nome}</span>
                    <button className="btn btn-sm btn-danger" onClick={async () => {
                      if (!window.confirm('Apagar "' + v.nome + '"?')) return
                      await supabase.from('variedades_cadastradas').delete().eq('id', v.id)
                      setVarCad(prev => prev.filter(x => x.id !== v.id))
                    }}>✕</button>
                  </div>
                ))
              }
            </div>
            <div style={{ borderTop:'1px solid var(--border)', paddingTop:12 }}>
              <label style={{ fontSize:12, fontWeight:600, color:'var(--text-muted)', display:'block', marginBottom:8 }}>Nova variedade</label>
              <div style={{ display:'flex', gap:6 }}>
                <input id="inputVarModal" placeholder="ex: PRATA ANÃ..." style={{ flex:1, fontSize:13 }}
                  onKeyDown={async e => {
                    if (e.key !== 'Enter') return
                    const nome = e.target.value.trim().toUpperCase()
                    if (!nome) return
                    const { data } = await supabase.from('variedades_cadastradas').insert({ nome, cultura: modalVars.nome, tenant_id: tenantId }).select().single()
                    if (data) { setVarCad(prev => [...prev, data]); e.target.value = '' }
                  }}
                />
                <button className="btn btn-sm" style={{ background:'var(--green)', color:'white' }}
                  onClick={async () => {
                    const input = document.getElementById('inputVarModal')
                    const nome = input?.value?.trim().toUpperCase()
                    if (!nome) return
                    const { data } = await supabase.from('variedades_cadastradas').insert({ nome, cultura: modalVars.nome, tenant_id: tenantId }).select().single()
                    if (data) { setVarCad(prev => [...prev, data]); input.value = '' }
                  }}>+ Add</button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" style={{ flex:1 }} onClick={() => setModalVars(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}