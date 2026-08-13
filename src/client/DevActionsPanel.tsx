import { useCallback, useEffect, useState } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar'
import { api, type Device, type Run } from './api.js'
import css from './DevActionsPanel.module.css'

export function DevActionsPanel({ scope, visible }: TabComponentProps) {
  const [project, setProject] = useState<'flutter' | 'unknown'>('unknown')
  const [devices, setDevices] = useState<Device[]>([])
  const [device, setDevice] = useState('')
  const [run, setRun] = useState<Run | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    try {
      const state = await api.state(scope); setProject(state.project); setRun(state.run); setMessage(state.offer?.message ?? 'Ready when you need a quick local run.')
      if (state.project === 'flutter') {
        const next = await api.devices(scope); setDevices(next)
        setDevice(current => next.some(item => item.id === current) ? current : next[0]?.id ?? '')
      }
      setError(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }, [scope])
  useEffect(() => { if (visible) void refresh() }, [visible, refresh])
  useEffect(() => {
    if (!visible || run === null || run.exited) return
    const timer = window.setInterval(() => { void refresh() }, 1500)
    return () => window.clearInterval(timer)
  }, [visible, run, refresh])
  const invoke = async (fn: () => Promise<unknown>) => { try { await fn(); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } }
  if (project !== 'flutter') return <div className={css.root}><div className={css.head}><div className={css.title}>Dev Actions</div></div><div className={css.body}><p className={css.empty}>No supported project was detected in this session workspace. Flutter support requires a pubspec.yaml at the workspace root.</p>{error !== null && <div className={css.error}>{error}</div>}</div></div>
  const running = run !== null && !run.exited
  return <div className={css.root}>
    <div className={css.head}><div className={css.title}>Flutter Dev Actions</div><div className={css.message}>{message}</div></div>
    <div className={css.body}>
      {error !== null && <div className={css.error}>{error}</div>}
      <label className={css.status}>Run target</label>
      <div className={css.row}><select className={css.select} value={device} onChange={event => setDevice(event.target.value)} disabled={running}>{devices.length === 0 ? <option value="">No Flutter devices found</option> : devices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className={`${css.button} ${css.primary}`} type="button" disabled={running || device === ''} onClick={() => void invoke(() => api.run(scope, device))}>Run</button></div>
      {running && <><div className={css.row}><span className={css.status}>Running: {run.command}</span></div><div className={css.row}><button className={css.button} type="button" onClick={() => void invoke(() => api.input(scope, 'r'))}>Hot Reload</button><button className={css.button} type="button" onClick={() => void invoke(() => api.input(scope, 'R'))}>Restart</button><button className={`${css.button} ${css.danger}`} type="button" onClick={() => void invoke(() => api.stop(scope))}>Stop</button></div></>}
      {run !== null && <pre className={css.log}>{run.output || 'Waiting for Flutter output...'}</pre>}
      <div className={css.row}><button className={css.button} type="button" onClick={() => void invoke(() => api.feedback(scope, 'Verified by user.'))}>Verified</button><button className={css.button} type="button" onClick={() => { const feedback = window.prompt('What should DeepSeek check next?'); if (feedback !== null && feedback.trim() !== '') void invoke(() => api.feedback(scope, feedback.trim())) }}>Report issue</button><button className={css.button} type="button" onClick={() => void refresh()}>Refresh</button></div>
    </div>
  </div>
}
