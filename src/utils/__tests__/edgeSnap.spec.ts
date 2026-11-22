import { describe, expect, it } from 'vitest'
import { snapEdge } from '../edgeSnap'

describe('snapEdge', () => {
  it('should follow the pointer between the snaps, rounded to whole pixels', () => {
    expect(snapEdge(412.4, 280, 800)).toEqual({ kind: 'width', width: 412 })
  })

  it('should snap onto the minimum close to it and a little below it', () => {
    expect([snapEdge(303, 280, 800), snapEdge(241, 280, 800)]).toEqual([
      { kind: 'width', width: 280 },
      { kind: 'width', width: 280 }
    ])
  })

  it('should fold away more than 40 px below the minimum', () => {
    expect([snapEdge(240, 280, 800), snapEdge(239, 280, 800)]).toEqual([
      { kind: 'width', width: 280 },
      { kind: 'collapse' }
    ])
  })

  it('should snap onto the widest width close to it, from both sides', () => {
    expect([snapEdge(777, 280, 800), snapEdge(824, 280, 800)]).toEqual([
      { kind: 'width', width: 800 },
      { kind: 'width', width: 800 }
    ])
  })

  it('should report a drag more than 24 px past the widest width', () => {
    expect(snapEdge(825, 280, 800)).toEqual({ kind: 'beyond' })
  })

  it('should split the snap zones halfway in a tight window', () => {
    expect([snapEdge(289, 280, 300), snapEdge(290, 280, 300), snapEdge(310, 280, 300)]).toEqual([
      { kind: 'width', width: 280 },
      { kind: 'width', width: 300 },
      { kind: 'width', width: 300 }
    ])
  })
})
