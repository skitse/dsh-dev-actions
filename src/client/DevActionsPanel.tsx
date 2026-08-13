import { useCallback, useEffect, useState } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar'
import { api, type Offer } from './api.js'
import css from './DevActionsPanel.module.css'

export function DevActionsPanel({ scope, visible }: TabComponentProps) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => { try { setOffers((await api.state(scope)).offers); setError(null) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }, [scope])
  useEffect(() => { if (visible) void refresh() }, [visible, refresh])
  useEffect(() => { if (!visible || !offers.some(offer => offer.run !== null && !offer.run.exited)) return; const timer = window.setInterval(() => { void refresh() }, 1500); return () => window.clearInterval(timer) }, [visible, offers, refresh])
  const invoke = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  return <div className={css.root}><div className={css.head}><div className={css.title}>Dev Actions</div><div className={css.message}>Agent-proposed commands for this workspace. Every command is visible and only runs after you click it.</div></div><div className={css.body}>
    {error !== null && <div className={css.error}>{error}</div>}
    {offers.length === 0 ? <p className={css.empty}>No reusable action has been proposed for this session yet.</p> : offers.map(offer => <section key={offer.id} className={css.card}>
      <strong>{offer.label}</strong><div className={css.message}>{offer.reason}</div><pre className={css.command}>{offer.command}</pre>
      <div className={css.row}>{offer.run === null || offer.run.exited ? <button className={`${css.button} ${css.primary}`} type="button" onClick={() => void invoke(() => api.run(scope, offer.id))}>Run</button> : <button className={`${css.button} ${css.danger}`} type="button" onClick={() => void invoke(() => api.stop(scope, offer.id))}>Stop</button>}<button className={css.button} type="button" onClick={() => void invoke(() => api.feedback(scope, offer.id, 'Verified by user.'))}>Verified</button><button className={css.button} type="button" onClick={() => { const feedback = window.prompt('What should the agent check next?'); if (feedback?.trim()) void invoke(() => api.feedback(scope, offer.id, feedback.trim())) }}>Report issue</button></div>
      {offer.run !== null && <pre className={css.log}>{offer.run.output || 'Waiting for command output...'}</pre>}
    </section>)}
    <div className={css.row}><button className={css.button} type="button" onClick={() => void refresh()}>Refresh</button></div>
  </div></div>
}
