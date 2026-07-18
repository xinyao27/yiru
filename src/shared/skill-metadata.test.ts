import { describe, expect, it } from 'vite-plus/test'
import { summarizeSkillMarkdown } from './skill-metadata'

describe('summarizeSkillMarkdown', () => {
  it('reads name and folded description from YAML frontmatter', () => {
    const summary = summarizeSkillMarkdown(`---
name: yiru-cli
description: >-
  Use the yiru CLI to drive a running editor;
  keep worktree comments current.
---

# Yiru CLI
`)

    expect(summary).toEqual({
      name: 'yiru-cli',
      description: 'Use the yiru CLI to drive a running editor; keep worktree comments current.'
    })
  })

  it('falls back to heading and first paragraph when frontmatter is absent', () => {
    const summary = summarizeSkillMarkdown(`# Design Review

Use when reviewing UI implementation quality.
`)

    expect(summary).toEqual({
      name: 'Design Review',
      description: 'Use when reviewing UI implementation quality.'
    })
  })
})
