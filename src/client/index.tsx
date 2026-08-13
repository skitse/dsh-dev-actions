import { createElement } from 'react'
import type {} from 'dsh-better-sidebar'
import type { Context } from 'cordis'
import { DevActionsPanel } from './DevActionsPanel.js'
import { installStyles } from './DevActionsPanel.module.css'

export const inject = ['betterSidebar', 'sessions', 'conversation']

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeStyles = installStyles()
    const disposeTab = ctx.betterSidebar.registerTab({
      id: 'dsh-dev-actions:panel', title: '快捷动作', order: 45, single: true,
      component: props => createElement(DevActionsPanel, props),
    })
    return () => {
      disposeTab()
      disposeStyles()
    }
  }, 'dsh-dev-actions: register panel')
}
