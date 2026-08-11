import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js'
import { supabase } from '../lib/supabase'
import { fmt, fmtDate } from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip)

// ─── HELPERS ────────────────────────────────────────────────
const pct = (v, t) => t > 0 ? ((v / t) * 100).toFixed(1) + '%' : '—'
const cor = (v) => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-muted)'

// ─── KPI CARD ───────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color = 'var(--text)', bg, badge }) {
  return (
    <div className="kpi-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</span>
        {badge && <span style={{ fontSize: 10, background: badge.bg, color: badge.color, borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>{badge.text}</span>}
        <span className="kpi-icon">{icon}</span>
      </div>
      <div className="kpi-value" style={{ color, fontFamily: 'var(--font-display)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

// ─── ALERT BANNER ───────────────────────────────────────────
function Alert({ type, text }) {
  const styles = {
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: '⚠️', color: '#92400e' },
    info:    { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ️', color: '#1e40af' },
    success: { bg: '#f0fdf4', border: '#22c55e', icon: '✅', color: '#166534' },
  }
  const s = styles[type] ?? styles.info
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: s.color }}>
      <span>{s.icon}</span><span>{text}</span>
    </div>
  )
}

// ─── SKELETON ────────────────────────────────────────────────
const skStyle = {
  background: 'linear-gradient(90deg, var(--gray-100) 25%, var(--gray-50) 50%, var(--gray-100) 75%)',
  backgroundSize: '200% 100%',
  animation: 'ag-shimmer 1.4s infinite',
  borderRadius: 6,
}
function Sk({ w = '100%', h = 16, style }) {
  return <div style={{ width: w, height: h, ...skStyle, ...style }} />
}
function DashboardSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`@keyframes ag-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
      {/* KPI grid */}
      <div className="kpi-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="kpi-card" style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <Sk w="50%" h={10} />
            <Sk w="70%" h={28} />
            <Sk w="40%" h={10} />
          </div>
        ))}
      </div>
      {/* Lotes table placeholder */}
      <div className="card" style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <Sk w="30%" h={14} />
        {[...Array(3)].map((_, i) => <Sk key={i} h={36} />)}
      </div>
      {/* Chart placeholder */}
      <div className="card" style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
        <Sk w="40%" h={14} />
        <Sk h={140} style={{ borderRadius:8 }} />
      </div>
    </div>
  )
}

// ─── MAIN ────────────────────────────────────────────────────
export default function Dashboard() {
  const { handleAuthError } = useAuth()
  const [kpis, setKpis]       = useState(null)
  const [lotes, setLotes]     = useState([])
  const [culturas, setCulturas] = useState([])
  const [vencer, setVencer]   = useState([])
  const [atraso, setAtraso]   = useState([])
  const [receber, setReceber] = useState([])
  const [loading, setLoading] = useState(true)
  const [mesOffset, setMesOffset] = useState(0)

  const mesRef = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + mesOffset); return d
  }, [mesOffset])

  const mesLabel = useMemo(() =>
    mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())
  , [mesRef])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const hoje = new Date()
      const em7d = new Date(hoje.getTime() + 7 * 86400000).toISOString().split('T')[0]
      const hojeStr = hoje.toISOString().split('T')[0]
      const mesStr = mesRef.toISOString().split('T')[0]

      const withTimeout = (promise, ms, label) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms))
      ])

      // Tudo numa unica ida e volta. O banco esta em us-west-2 (Oregon) e cada
      // round trip custa ~200ms — rodar fn_dashboard_mes sozinho antes das views
      // dobrava a espera sem ganho nenhum. Promise.allSettled mantem o
      // comportamento de falha individual nao bloquear as outras.
      const [dashR, resumoR, cultR, pagar7dR, emAtrasoR, receberR] = await withTimeout(
        Promise.allSettled([
          supabase.rpc('fn_dashboard_mes', { p_mes: mesStr }),
          supabase.from('vw_resumo_por_lote').select('*'),
          supabase.from('vw_resumo_por_cultura').select('*'),
          supabase.from('vw_contas_a_pagar').select('*').gte('data_vencimento', hojeStr).lte('data_vencimento', em7d),
          supabase.from('vw_contas_a_pagar').select('*').lt('data_vencimento', hojeStr).order('data_vencimento', { ascending: true }).limit(10),
          supabase.from('vw_contas_a_receber').select('*').order('data_vencimento', { ascending: true }).limit(5),
        ]),
        25000, 'dashboard'
      )

      const ok = r => r.status === 'fulfilled' ? r.value.data : null
      const err = (r, name) => { if (r.status === 'rejected' || r.value?.error) console.error(`[Dashboard] ${name}:`, r.status === 'rejected' ? r.reason : r.value.error) }
      err(dashR, 'fn_dashboard_mes')
      err(resumoR, 'vw_resumo_por_lote')
      err(cultR, 'vw_resumo_por_cultura')
      err(pagar7dR, 'vw_contas_a_pagar (7d)')
      err(emAtrasoR, 'vw_contas_a_pagar (atraso)')
      err(receberR, 'vw_contas_a_receber')

      // Preserva o handleAuthError: se o JWT morreu, qualquer uma das 6 acusa.
      const firstError = [dashR, resumoR, cultR, pagar7dR, emAtrasoR, receberR]
        .map(r => r.status === 'fulfilled' ? r.value?.error : null)
        .find(Boolean)
      if (firstError && handleAuthError(firstError)) return

      const d = ok(dashR)
      if (d) setKpis(Array.isArray(d) ? d[0] : d)
      setLotes(ok(resumoR) ?? [])
      setCulturas(ok(cultR) ?? [])
      setVencer(ok(pagar7dR) ?? [])
      setAtraso(ok(emAtrasoR) ?? [])
      setReceber(ok(receberR) ?? [])
    } catch (e) {
      console.error('[Dashboard] load error:', e.message)
      handleAuthError(e)
    } finally {
      setLoading(false)
    }
  }, [mesRef])

  useEffect(() => { load() }, [load])

  // Métricas derivadas
  const receita   = Number(kpis?.receita_mes ?? 0)
  const custo     = Number(kpis?.custo_mes ?? 0)
  const lucro     = Number(kpis?.lucro_mes ?? 0)
  const caixas    = Number(kpis?.caixas_mes ?? 0)
  const margem    = receita > 0 ? (lucro / receita * 100).toFixed(1) : 0
  const precoMed  = caixas > 0 ? receita / caixas : 0
  const totalLucro = lotes.reduce((s, l) => s + Number(l.lucro_bruto ?? 0), 0)
  const cultComReceita = culturas.filter(c => Number(c.receita_total) > 0)
  const totalAtrasado = atraso.reduce((s, a) => s + Number(a.valor ?? 0), 0)
  const totalVencer   = vencer.reduce((s, v) => s + Number(v.valor ?? 0), 0)

  // Alertas automáticos
  const alertas = useMemo(() => {
    const list = []
    if (receita > 0 && custo === 0) list.push({ type:'warning', text:'Custos não lançados no mês. O lucro pode estar superestimado.' })
    if (cultComReceita.length === 1) list.push({ type:'info', text:`Apenas a cultura ${cultComReceita[0]?.cultura} possui vendas no período.` })

    if (totalAtrasado > 0) list.push({ type:'warning', text:`${atraso.length} conta(s) em atraso totalizando ${fmt(totalAtrasado)}.` })
    return list
  }, [kpis, lotes, culturas, atraso])

  // Resumo executivo
  const resumoExec = useMemo(() => {
    if (!receita) return 'Nenhuma venda registrada no período.'
    const nLotes = lotes.filter(l => Number(l.receita_bruta) > 0).length
    const cultDesc = cultComReceita.length === 1 ? `A cultura ${cultComReceita[0]?.cultura} representa 100% da receita.` : cultComReceita.length > 1 ? `${cultComReceita.length} culturas geraram receita no período.` : ''
    const custoDesc = custo === 0 ? 'Não há custos lançados.' : `Custos lançados: ${fmt(custo)}.`
    return `No período, foram vendidas ${caixas.toLocaleString('pt-BR')} caixas em ${nLotes} lote(s), gerando ${fmt(receita)}. ${cultDesc} ${custoDesc}`.trim()
  }, [kpis, lotes, culturas])

  if (loading) return <DashboardSkeleton />

  const temAlertasFinanceiros = atraso.length > 0 || vencer.length > 0 || receber.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* CABEÇALHO + NAVEGAÇÃO */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => setMesOffset(o => o - 1)}>←</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--green)' }}>{mesLabel}</span>
          {mesOffset === 0 && <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--green-light)', color: 'var(--green)', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>Mês atual</span>}
        </div>
        <button className="btn btn-sm" onClick={() => setMesOffset(o => o + 1)}>→</button>
        {mesOffset !== 0 && <button className="btn btn-sm" style={{background:'var(--green)',color:'white'}} onClick={() => setMesOffset(0)}>Hoje</button>}
      </div>

      {/* KPI CARDS — largura total */}
      <div className="kpi-grid">
        <KpiCard icon="💰" label="Receita" value={fmt(receita)} sub={`A receber: ${fmt(kpis?.total_a_receber)}`} color="var(--teal)" />
        <KpiCard icon="💸" label="Custos" value={fmt(custo)} sub={`A pagar: ${fmt(kpis?.total_a_pagar)}`} color={custo > 0 ? 'var(--amber)' : 'var(--text-muted)'} />
        <KpiCard icon="📈" label="Lucro" value={fmt(lucro)} sub={`Margem: ${margem}%`} color={cor(lucro)} />
        <KpiCard icon="📦" label="Caixas" value={caixas.toLocaleString('pt-BR')} sub="vendidas no período" color="var(--text)" />
        <KpiCard icon="🏷️" label="Preço médio/cx" value={precoMed > 0 ? fmt(precoMed) : '—'} sub="receita ÷ caixas" color="var(--text)" />
        <KpiCard icon="%" label="Margem" value={margem > 0 ? `${margem}%` : '—'} sub="lucro ÷ receita" color={Number(margem) >= 30 ? 'var(--green)' : Number(margem) > 0 ? 'var(--amber)' : 'var(--text-muted)'} />
      </div>

      {/* ALERTAS DE ANÁLISE */}
      {alertas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {alertas.map((a, i) => <Alert key={i} {...a} />)}
        </div>
      )}

      {/* GRID PRINCIPAL — duas colunas em telas largas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}
           className="dash-grid">

        {/* ── COLUNA ESQUERDA ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* RESUMO EXECUTIVO */}
          {receita > 0 && (
            <div style={{ background: 'var(--green-light)', border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>📋 Resumo executivo</div>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{resumoExec}</div>
            </div>
          )}

          {/* GRÁFICOS */}
          {lotes.some(l => Number(l.receita_bruta) > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <GraficoBarras
                title="Receita por lote"
                labels={lotes.filter(l=>Number(l.receita_bruta)>0).map(l=>l.lote)}
                data={lotes.filter(l=>Number(l.receita_bruta)>0).map(l=>Number(l.receita_bruta))}
                color="rgba(29,158,117,.85)"
              />
              {cultComReceita.length > 1 && (
                <GraficoBarras
                  title="Receita por cultura"
                  labels={cultComReceita.map(c=>c.cultura)}
                  data={cultComReceita.map(c=>Number(c.receita_total))}
                  color="rgba(59,109,17,.75)"
                />
              )}
            </div>
          )}

          {/* RANKING LOTES */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>🏆 Ranking por lucro</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lotes.length} lotes</span>
            </div>
            {lotes.length === 0
              ? <div className="empty">Sem dados ainda</div>
              : <div className="table-wrap">
                  <table>
                    <thead>
                      <tr style={{ background: 'var(--bg)' }}>
                        <th style={{ width: 28, textAlign: 'center' }}>#</th>
                        <th>Lote</th>
                        <th>Cultura</th>
                        <th style={{ textAlign: 'right' }}>Caixas</th>
                        <th style={{ textAlign: 'right' }}>Receita</th>
                        <th style={{ textAlign: 'right' }}>Custo</th>
                        <th style={{ textAlign: 'right' }}>Lucro</th>
                        <th style={{ textAlign: 'right' }}>Preço/cx</th>
                        <th style={{ textAlign: 'right' }}>Margem</th>
                        <th style={{ textAlign: 'right' }}>Part. %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...lotes].sort((a, b) => Number(b.lucro_bruto) - Number(a.lucro_bruto)).map((l, i) => {
                        const rec    = Number(l.receita_bruta)
                        const cst    = Number(l.custo_total)
                        const luc    = Number(l.lucro_bruto)
                        const cx     = Number(l.total_caixas_produzidas)
                        const mg     = rec > 0 ? (luc / rec * 100).toFixed(1) : 0
                        const pm     = cx > 0 ? rec / cx : 0
                        const part   = totalLucro > 0 ? (luc / totalLucro * 100).toFixed(1) : 0
                        const corLuc = luc > 0 ? 'var(--green)' : luc < 0 ? 'var(--red)' : 'var(--text-muted)'
                        const semMov = rec === 0
                        return (
                          <tr key={l.lote_id} style={{ opacity: semMov ? 0.45 : 1 }}>
                            <td style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{i + 1}</td>
                            <td><strong>{l.lote}</strong></td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.variedade ?? '—'}</td>
                            <td style={{ textAlign: 'right', fontSize: 13 }}>{cx.toLocaleString('pt-BR')}</td>
                            <td style={{ textAlign: 'right', color: 'var(--teal)', fontWeight: 600, fontSize: 13 }}>{fmt(rec)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--amber)', fontSize: 13 }}>{fmt(cst)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: corLuc }}>{fmt(luc)}</td>
                            <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{pm > 0 ? fmt(pm) : '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: Number(mg) >= 30 ? 'var(--green)' : 'var(--amber)', fontSize: 13 }}>{mg > 0 ? mg + '%' : '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              {luc > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                  <div style={{ width: 40, height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ width: Math.min(Number(part), 100) + '%', height: '100%', background: 'var(--green)', borderRadius: 3 }} />
                                  </div>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32 }}>{part}%</span>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>}
          </div>
        </div>

        {/* ── COLUNA DIREITA ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ALERTAS FINANCEIROS */}
          {temAlertasFinanceiros && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {atraso.length > 0 && (
                <div style={{ background: '#fff5f5', border: '1px solid var(--red-mid)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>🚨 {atraso.length} em atraso — {fmt(totalAtrasado)}</div>
                  {atraso.slice(0, 4).map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: 'var(--text)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>{a.descricao ?? a.fornecedor}</span>
                      <strong>{fmt(a.valor)}</strong>
                    </div>
                  ))}
                </div>
              )}
              {vencer.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 8 }}>⚠️ {vencer.length} vencem em 7 dias — {fmt(totalVencer)}</div>
                  {vencer.slice(0, 4).map(v => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span>{fmtDate(v.data_vencimento)} · {v.lote}</span>
                      <strong>{fmt(v.valor)}</strong>
                    </div>
                  ))}
                </div>
              )}
              {receber.length > 0 && (
                <div style={{ background: '#f0fdf4', border: '1px solid var(--green-mid)', borderRadius: 'var(--radius)', padding: '12px 16px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--green)', marginBottom: 8 }}>💰 {receber.length} a receber — {fmt(receber.reduce((s,r)=>s+Number(r.valor_total??0),0))}</div>
                  {receber.slice(0, 4).map(r => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span>{r.comprador?.substring(0, 22)}</span>
                      <strong>{fmt(r.valor_total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RESUMO POR CULTURA - removido a pedido */}
          {false && <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>🌿 Resumo por cultura</span>
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {culturas.length === 0
                ? <div className="empty">Nenhuma cultura cadastrada</div>
                : culturas.map(c => {
                    const rec  = Number(c.receita_total)
                    const cst  = Number(c.custo_total)
                    const luc  = rec - cst
                    const ativo = rec > 0
                    const maxR = Math.max(...culturas.map(x => Number(x.receita_total)), 1)
                    return (
                      <div key={c.cultura} style={{
                        background: ativo ? 'var(--surface)' : 'var(--bg)',
                        border: `1px solid ${ativo ? 'var(--border)' : 'transparent'}`,
                        borderRadius: 8,
                        padding: '12px 14px',
                        opacity: ativo ? 1 : 0.5,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: ativo ? 10 : 0 }}>
                          <div>
                            <span style={{ fontWeight: ativo ? 700 : 500, fontSize: 14, color: ativo ? 'var(--text)' : 'var(--text-muted)' }}>{c.cultura}</span>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{c.qtd_lotes} lote(s) · {c.qtd_setores} setor(es){!ativo && ' · sem vendas'}</div>
                          </div>
                          {ativo && (
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Receita</div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>{fmt(rec)}</div>
                            </div>
                          )}
                        </div>
                        {ativo && (
                          <>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Caixas</div>
                                <div style={{ fontWeight: 600, fontSize: 12 }}>{Number(c.total_caixas).toLocaleString('pt-BR')}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Lucro</div>
                                <div style={{ fontWeight: 700, fontSize: 12, color: cor(luc) }}>{fmt(luc)}</div>
                              </div>
                            </div>
                            <div style={{ background: 'var(--bg)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 4 }}>
                              <div style={{ width: Math.min(rec / maxR * 100, 100) + '%', height: '100%', background: 'linear-gradient(90deg, var(--teal), var(--green))', borderRadius: 4 }} />
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {pct(rec, culturas.reduce((s,x)=>s+Number(x.receita_total),0))} da receita total
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
            </div>
          </div>}

        </div>
      </div>

    </div>
  )
}

// ─── GRÁFICO DE BARRAS HORIZONTAL ───────────────────────────
function GraficoBarras({ title, labels, data, color }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px' }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {labels.map((label, i) => {
          const pct = Math.min(data[i] / max * 100, 100)
          const inside = pct > 35
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 70, fontSize: 12, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>{label}</div>
              <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 6, height: 26, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: pct + '%',
                  minWidth: 8,
                  height: '100%',
                  background: color,
                  borderRadius: 6,
                  transition: 'width .4s',
                  flexShrink: 0,
                }}/>
                <span style={{
                  position: 'absolute',
                  left: inside ? '8px' : `calc(${pct}% + 8px)`,
                  fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  color: inside ? 'white' : 'var(--text)',
                }}>
                  {fmt(data[i])}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
