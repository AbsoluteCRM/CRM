import type { Plan } from '#/mocks/crm-types'

export interface PlanInfo {
  id: Plan
  name: string
  monthly: number | null // dollars per month, billed monthly
  annual: number | null // dollars per month, billed annually
  blurb: string
  users: string
  features: Array<string>
  highlight?: boolean
}

/** Shared by the landing page and Settings → Subscription. */
export const PLANS: Array<PlanInfo> = [
  {
    id: 'starter',
    name: 'Starter',
    monthly: 49,
    annual: 39,
    blurb: 'For owner-operators and small crews getting organized.',
    users: 'Up to 5 users',
    features: [
      'Clients, requests & quotes',
      'Calendar & job tracking',
      'Service catalog',
      'Mobile app for crews',
      'Email support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    monthly: 129,
    annual: 103,
    blurb: 'For growing companies running multiple crews.',
    users: 'Up to 25 users',
    features: [
      'Everything in Starter',
      'Drag-and-drop dispatch',
      'Route optimization',
      'Recurring services',
      'Weather planner',
      'Client portal',
    ],
    highlight: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthly: null,
    annual: null,
    blurb: 'For multi-branch operations with custom needs.',
    users: 'Unlimited users',
    features: [
      'Everything in Professional',
      'Multiple branches',
      'Custom roles & SSO',
      'API access',
      'Dedicated success manager',
    ],
  },
]
