import { describe, expect, it } from 'vitest'
import {
  historyStepOf,
  isInfoPanelShortcut,
  isNewSessionShortcut,
  isNewTerminalShortcut,
  isSidebarShortcut,
  isTerminalDrawerShortcut,
  moveStepOf,
  uiZoomActionOf
} from '../shortcuts'

const key = (fields: Partial<KeyboardEvent> & { key: string }) => ({
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...fields
})

describe('isNewSessionShortcut', () => {
  it('should accept Ctrl+T and Cmd+T in either case', () => {
    expect([
      isNewSessionShortcut(key({ key: 't', ctrlKey: true })),
      isNewSessionShortcut(key({ key: 'T', metaKey: true }))
    ]).toEqual([true, true])
  })

  it('should leave a plain t, Ctrl+Shift+T, AltGr and held keys alone', () => {
    expect([
      isNewSessionShortcut(key({ key: 't' })),
      isNewSessionShortcut(key({ key: 'T', ctrlKey: true, shiftKey: true })),
      isNewSessionShortcut(key({ key: 't', ctrlKey: true, altKey: true })),
      isNewSessionShortcut(key({ key: 't', ctrlKey: true, repeat: true }))
    ]).toEqual([false, false, false, false])
  })
})

describe('isSidebarShortcut', () => {
  it('should accept Ctrl+B only', () => {
    expect([
      isSidebarShortcut(key({ key: 'b', ctrlKey: true })),
      isSidebarShortcut(key({ key: 'b' }))
    ]).toEqual([true, false])
  })
})

describe('isInfoPanelShortcut', () => {
  it('should accept Ctrl+. and Cmd+. but not with Shift or Alt', () => {
    expect([
      isInfoPanelShortcut(key({ key: '.', ctrlKey: true })),
      isInfoPanelShortcut(key({ key: '.', metaKey: true })),
      isInfoPanelShortcut(key({ key: ':', ctrlKey: true, shiftKey: true })),
      isInfoPanelShortcut(key({ key: '.', ctrlKey: true, altKey: true })),
      isInfoPanelShortcut(key({ key: '.' }))
    ]).toEqual([true, true, false, false, false])
  })
})

describe('moveStepOf', () => {
  it('should map Ctrl+Shift+arrows to a step and everything else to null', () => {
    expect([
      moveStepOf(key({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true })),
      moveStepOf(key({ key: 'ArrowRight', ctrlKey: true, shiftKey: true })),
      moveStepOf(key({ key: 'ArrowRight', ctrlKey: true })),
      moveStepOf(key({ key: 'ArrowUp', ctrlKey: true, shiftKey: true }))
    ]).toEqual([-1, 1, null, null])
  })
})

describe('historyStepOf', () => {
  it('should undo with Ctrl+Z and redo with Ctrl+Shift+Z or Ctrl+Y', () => {
    expect([
      historyStepOf(key({ key: 'z', ctrlKey: true })),
      historyStepOf(key({ key: 'Z', ctrlKey: true, shiftKey: true })),
      historyStepOf(key({ key: 'y', ctrlKey: true })),
      historyStepOf(key({ key: 'z', metaKey: true }))
    ]).toEqual(['undo', 'redo', 'redo', 'undo'])
  })

  it('should ignore the keys without Ctrl, with AltGr, and other letters', () => {
    expect([
      historyStepOf(key({ key: 'z' })),
      historyStepOf(key({ key: 'z', ctrlKey: true, altKey: true })),
      historyStepOf(key({ key: 'x', ctrlKey: true })),
      historyStepOf(key({ key: 'y', ctrlKey: true, shiftKey: true }))
    ]).toEqual([null, null, null, null])
  })
})

describe('terminal shortcuts', () => {
  const backquote = (fields: Partial<KeyboardEvent>) => ({
    code: 'Backquote',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    ...fields
  })

  it('should toggle the drawer with Ctrl and the key left of 1', () => {
    expect([
      isTerminalDrawerShortcut(backquote({ ctrlKey: true })),
      isNewTerminalShortcut(backquote({ ctrlKey: true }))
    ]).toEqual([true, false])
  })

  it('should open a new terminal with Ctrl+Shift and the same key', () => {
    expect([
      isTerminalDrawerShortcut(backquote({ ctrlKey: true, shiftKey: true })),
      isNewTerminalShortcut(backquote({ ctrlKey: true, shiftKey: true }))
    ]).toEqual([false, true])
  })

  it('should leave the plain key, AltGr, held keys and other keys alone', () => {
    expect([
      isTerminalDrawerShortcut(backquote({})),
      isTerminalDrawerShortcut(backquote({ ctrlKey: true, altKey: true })),
      isTerminalDrawerShortcut(backquote({ ctrlKey: true, repeat: true })),
      isTerminalDrawerShortcut(backquote({ ctrlKey: true, code: 'Digit1' }))
    ]).toEqual([false, false, false, false])
  })
})

describe('uiZoomActionOf', () => {
  it('should read Ctrl/Cmd with +, =, −, _ and 0', () => {
    expect([
      uiZoomActionOf(key({ key: '+', ctrlKey: true })),
      uiZoomActionOf(key({ key: '=', metaKey: true })),
      uiZoomActionOf(key({ key: '-', ctrlKey: true })),
      uiZoomActionOf(key({ key: '_', metaKey: true, shiftKey: true })),
      uiZoomActionOf(key({ key: '0', metaKey: true }))
    ]).toEqual(['in', 'in', 'out', 'out', 'reset'])
  })

  it('should leave plain keys, AltGr and other chords alone', () => {
    expect([
      uiZoomActionOf(key({ key: '+' })),
      uiZoomActionOf(key({ key: '0', ctrlKey: true, altKey: true })),
      uiZoomActionOf(key({ key: '9', ctrlKey: true })),
      uiZoomActionOf(key({ key: '=', ctrlKey: true, shiftKey: true }))
    ]).toEqual([null, null, null, null])
  })
})
