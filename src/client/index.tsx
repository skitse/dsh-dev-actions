import { createElement } from 'react'
import type {} from 'dsh-better-sidebar'
import type { Context } from 'cordis'
import { DevActionsPanel } from './DevActionsPanel.js'

export const inject = ['betterSidebar']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'dsh-dev-actions:panel', title: 'Dev Actions', order: 45, single: true,
    component: props => createElement(DevActionsPanel, props),
  }), 'dsh-dev-actions: register panel')
}
