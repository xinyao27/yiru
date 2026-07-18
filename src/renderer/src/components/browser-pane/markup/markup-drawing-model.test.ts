import { describe, expect, it } from 'vite-plus/test'
import {
  canRedo,
  canUndo,
  clearShapes,
  commitShape,
  createMarkupDocument,
  isEmptyDocument,
  redoShape,
  setShapes,
  undoShape,
  type PenShape
} from './markup-drawing-model'

function pen(id: string): PenShape {
  return { id, kind: 'pen', color: '#ef4444', width: 4, points: [{ x: 0, y: 0 }] }
}

describe('markup document undo/redo', () => {
  it('starts empty', () => {
    const doc = createMarkupDocument()
    expect(doc.shapes).toHaveLength(0)
    expect(isEmptyDocument(doc)).toBe(true)
    expect(canUndo(doc)).toBe(false)
    expect(canRedo(doc)).toBe(false)
  })

  it('commits shapes and clears the redo stack', () => {
    let doc = createMarkupDocument()
    doc = commitShape(doc, pen('a'))
    doc = commitShape(doc, pen('b'))
    expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'b'])
    expect(canUndo(doc)).toBe(true)
    expect(canRedo(doc)).toBe(false)
  })

  it('undoes and redoes in order', () => {
    let doc = createMarkupDocument()
    doc = commitShape(doc, pen('a'))
    doc = commitShape(doc, pen('b'))
    doc = undoShape(doc)
    expect(doc.shapes.map((s) => s.id)).toEqual(['a'])
    expect(canRedo(doc)).toBe(true)
    doc = redoShape(doc)
    expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'b'])
    expect(canRedo(doc)).toBe(false)
  })

  it('forks history: committing after undo discards the redo stack', () => {
    let doc = createMarkupDocument()
    doc = commitShape(doc, pen('a'))
    doc = commitShape(doc, pen('b'))
    doc = undoShape(doc)
    doc = commitShape(doc, pen('c'))
    expect(doc.shapes.map((s) => s.id)).toEqual(['a', 'c'])
    expect(canRedo(doc)).toBe(false)
  })

  it('undo/redo on empty document are no-ops returning the same reference', () => {
    const doc = createMarkupDocument()
    expect(undoShape(doc)).toBe(doc)
    expect(redoShape(doc)).toBe(doc)
  })

  it('clears shapes, and is a no-op (same reference) when already empty', () => {
    const empty = createMarkupDocument()
    expect(clearShapes(empty)).toBe(empty)
    let doc = commitShape(empty, pen('a'))
    doc = clearShapes(doc)
    expect(doc.shapes).toHaveLength(0)
    expect(canRedo(doc)).toBe(false)
  })

  it('undoes an edit (not just an add) via whole-list snapshots', () => {
    let doc = commitShape(createMarkupDocument(), pen('a'))
    doc = setShapes(doc, []) // delete everything
    expect(doc.shapes).toHaveLength(0)
    doc = undoShape(doc)
    expect(doc.shapes.map((s) => s.id)).toEqual(['a'])
  })
})
