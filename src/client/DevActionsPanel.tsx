import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar'
import { api, insertDraft, sendPrompt, type Action } from './api.js'
import css from './DevActionsPanel.module.css'

type View = 'active' | 'hidden'

const KIND_COPY: Record<Action['kind'], string> = {
  command: '命令',
  prompt: 'Prompt',
  instruction: 'AI 指令',
}

function primaryLabel(action: Action): string {
  if (action.kind === 'command') return action.run !== null && !action.run.exited ? '停止' : '运行'
  if (action.kind === 'prompt') return '发送'
  return '填入输入框'
}

export function DevActionsPanel({ ctx, scope, visible }: TabComponentProps) {
  const [actionState, setActionState] = useState<{ sessionId: string; actions: Action[] }>(() => ({ sessionId: scope.sessionId, actions: [] }))
  const actions = actionState.sessionId === scope.sessionId ? actionState.actions : []
  const [view, setView] = useState<View>('active')
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set())
  const pending = useRef(new Set<string>())
  const refreshSequence = useRef(0)
  const currentSession = useRef(scope.sessionId)
  currentSession.current = scope.sessionId
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    try {
      const result = await api.state({ sessionId: scope.sessionId, cwd: scope.cwd })
      if (sequence === refreshSequence.current) {
        setActionState({ sessionId: scope.sessionId, actions: result.actions })
        setError(null)
      }
    } catch (cause) {
      if (sequence === refreshSequence.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
  }, [scope.sessionId, scope.cwd])

  useEffect(() => {
    refreshSequence.current += 1
    setBusy(new Set())
    setActionState({ sessionId: scope.sessionId, actions: [] })
    setError(null)
  }, [scope.sessionId])
  useEffect(() => { if (visible) void refresh() }, [visible, refresh])
  useEffect(() => {
    if (!visible || !actions.some(action => action.run !== null && !action.run.exited)) return
    const timer = window.setInterval(() => { void refresh() }, 1200)
    return () => window.clearInterval(timer)
  }, [visible, actions, refresh])

  const shown = useMemo(() => actions.filter(action => view === 'active' ? action.status === 'active' : action.status === 'hidden'), [actions, view])
  const perform = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    const sessionId = scope.sessionId
    const token = `${sessionId}\0${id}`
    if (pending.current.has(token)) return
    pending.current.add(token)
    setBusy(new Set([...pending.current]
      .filter(entry => entry.startsWith(`${sessionId}\0`))
      .map(entry => entry.slice(sessionId.length + 1))))
    try {
      await fn()
      if (currentSession.current === sessionId) await refresh()
    } catch (cause) {
      if (currentSession.current === sessionId) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      pending.current.delete(token)
      if (currentSession.current === sessionId) {
        setBusy(new Set([...pending.current]
          .filter(entry => entry.startsWith(`${sessionId}\0`))
          .map(entry => entry.slice(sessionId.length + 1))))
      }
    }
  }
  const activate = (action: Action): void => {
    void perform(action.id, async () => {
      if (action.kind === 'command') {
        if (action.run !== null && !action.run.exited) await api.stop(scope, action.id)
        else await api.run(scope, action)
        return
      }
      if (action.kind === 'prompt') await sendPrompt(ctx, scope, action.content)
      else insertDraft(ctx, scope, action.content)
      await api.used(scope, action)
    })
  }
  const report = (action: Action): void => {
    const text = window.prompt('告诉 AI 哪里需要继续处理')
    if (!text?.trim()) return
    void perform(action.id, async () => {
      await api.feedback(scope, action, text.trim())
      await sendPrompt(ctx, scope, '我刚刚通过「快捷动作」提交了验收问题。请调用 dev_action_feedback_read 读取反馈并继续处理。')
    })
  }
  const approve = (action: Action): void => {
    void perform(action.id, async () => {
      await api.feedback(scope, action, '用户已验收通过。')
      await sendPrompt(ctx, scope, '我刚刚通过「快捷动作」确认验收通过。请调用 dev_action_feedback_read 读取结果，并据此完成当前工作。')
    })
  }

  return <div className={css.root}>
    <header className={css.head}>
      <div className={css.title}>快捷动作</div>
      <button className={css.iconButton} type="button" title="刷新" aria-label="刷新" onClick={() => void refresh()}>↻</button>
    </header>
    <div className={css.tabs} role="tablist" aria-label="动作状态">
      <button className={view === 'active' ? css.tabActive : css.tab} type="button" role="tab" aria-selected={view === 'active'} onClick={() => setView('active')}>可用 {actions.filter(action => action.status === 'active').length}</button>
      <button className={view === 'hidden' ? css.tabActive : css.tab} type="button" role="tab" aria-selected={view === 'hidden'} onClick={() => setView('hidden')}>已隐藏 {actions.filter(action => action.status === 'hidden').length}</button>
    </div>
    <main className={css.body}>
      {error !== null && <div className={css.error}>{error}</div>}
      {shown.length === 0 ? <div className={css.empty}>{view === 'active' ? 'AI 暂时还没有发现值得复用的动作。' : '没有隐藏的动作。'}</div> : shown.map(action => <article key={action.id} className={css.card}>
        <div className={css.cardHead}>
          <div className={css.label}><span className={css.kind} data-kind={action.kind}>{KIND_COPY[action.kind]}</span><strong>{action.label}</strong></div>
          <button className={css.iconButton} type="button" title={action.pinned ? '取消固定' : '固定到顶部'} aria-label={action.pinned ? '取消固定' : '固定到顶部'} disabled={busy.has(action.id)} onClick={() => void perform(action.id, () => api.setState(scope, action, { pinned: !action.pinned }))}>{action.pinned ? '★' : '☆'}</button>
        </div>
        <div className={css.message}>{action.reason}</div>
        <pre className={css.content}>{action.content}</pre>
        <div className={css.meta}>{action.scope === 'workspace' ? '当前工作区' : '当前会话'}{action.useCount > 0 ? ` · 已用 ${action.useCount} 次` : ''}</div>
        {action.run !== null && <pre className={css.log}>{action.run.output || '等待输出...'}</pre>}
        <div className={css.row}>
          {action.status === 'active' ? <>
            <button className={action.kind === 'command' && action.run !== null && !action.run.exited ? `${css.button} ${css.danger}` : `${css.button} ${css.primary}`} type="button" disabled={busy.has(action.id)} onClick={() => activate(action)}>{primaryLabel(action)}</button>
            {action.kind === 'prompt' && <button className={css.button} type="button" disabled={busy.has(action.id)} onClick={() => void perform(action.id, async () => { insertDraft(ctx, scope, action.content); await api.used(scope, action) })}>填入输入框</button>}
            <button className={css.button} type="button" disabled={busy.has(action.id)} onClick={() => approve(action)}>通过</button>
            <button className={css.button} type="button" disabled={busy.has(action.id)} onClick={() => report(action)}>反馈问题</button>
            <button className={css.iconButton} type="button" title="隐藏" aria-label="隐藏" disabled={busy.has(action.id)} onClick={() => void perform(action.id, () => api.setState(scope, action, { status: 'hidden' }))}>×</button>
          </> : <button className={`${css.button} ${css.primary}`} type="button" disabled={busy.has(action.id)} onClick={() => void perform(action.id, () => api.setState(scope, action, { status: 'active' }))}>恢复</button>}
        </div>
      </article>)}
    </main>
  </div>
}
