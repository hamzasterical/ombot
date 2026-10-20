/**
 * Single source of truth for every timing decision on the page.
 * Nothing else in the landing code should hard-code a duration or an ease.
 */

export const EASE = {
  /** default reveal */
  out: 'power3.out',
  /** hero cascade, counters */
  expo: 'expo.out',
  /** state changes (lane lights, pill switches) */
  inOut: 'power2.inOut',
  /** UI feedback */
  soft: 'power2.out',
  /** scrubbed timelines only */
  none: 'none',
} as const

export const DUR = {
  ui: 0.25,
  state: 0.4,
  reveal: 0.9,
  hero: 1.15,
  count: 2,
} as const

export const STAGGER = {
  word: 0.055,
  card: 0.08,
  chip: 0.06,
  row: 0.07,
} as const

/** The five stages of the triage pipeline, in order. */
export const STAGES = [
  {
    id: 'intake',
    label: 'Intake',
    caption: 'Complaint received on the mobile app channel.',
  },
  {
    id: 'classify',
    label: 'Classify',
    caption: 'Category, confidence and supporting quote.',
  },
  {
    id: 'route',
    label: 'Route',
    caption: 'Assigned to a risk lane with a deadline.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    caption: 'Transactions and security events attached.',
  },
  {
    id: 'decision',
    label: 'Decision',
    caption: 'Human approval required before money moves.',
  },
] as const

export type StageId = (typeof STAGES)[number]['id']
