import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from '@tanstack/react-query'
import { createTRPCClient } from '@trpc/client'
import { observable } from '@trpc/server/observable'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import QuoteConversation from './QuoteConversation'
import { Btn } from '#/components/crm/ui'
import { useQuoteBuilder } from '#/integrations/quotes/quotes'
import { TRPCProvider } from '#/integrations/trpc/react'
import type { TRPCRouter } from '#/integrations/trpc/router'
import type { QuoteMessage } from '#/integrations/quotes/public.schemas'

const org = '0198f0a0-0000-7000-8000-000000000001'
const quoteId = '0198f0a0-0000-7000-8000-000000000002'
const messageId = '0198f0a0-0000-7000-8000-000000000003'
const created = '2026-10-20T12:00:00Z'
const operations = fn()

function HookView({ decide }: { decide: () => void }) {
  const view = useQuoteBuilder(org, quoteId)
  return (
    <>
      <p role="status">{view.queries.quote.data?.quote.status ?? 'loading'}</p>
      <Btn
        onClick={() => {
          decide()
          focusManager.setFocused(false)
          focusManager.setFocused(true)
        }}
      >
        Customer accepted elsewhere
      </Btn>
      <QuoteConversation
        messages={view.history}
        loading={view.messages.isPending}
        hasOlder={view.messages.hasNextPage}
        loadingOlder={view.messages.isFetchingNextPage}
        onLoadOlder={async () => {
          await view.messages.fetchNextPage()
        }}
        onSend={view.postMessage}
      />
    </>
  )
}
function HookFixture() {
  const [queryClient] = useState(() => new QueryClient())
  const [server] = useState(() => ({
    status: 'sent',
    messages: [] as Array<QuoteMessage>,
  }))
  const [client] = useState(() =>
    createTRPCClient<TRPCRouter>({
      links: [
        () =>
          ({ op }) =>
            observable((observer) => {
              operations(op.path, op.input)
              const input = op.input as {
                cursor?: { beforeId: string }
                body?: string
                clientMessageId?: string
              }
              let data: unknown = []
              if (op.path === 'quotes.get')
                data = {
                  quote: {
                    id: quoteId,
                    organization_id: org,
                    number: 'Q-0012',
                    client_id: messageId,
                    property_id: null,
                    request_id: null,
                    revision: 1,
                    status: server.status,
                    title: 'Lawn care',
                    message: null,
                    conditions: null,
                    valid_until: '2099-12-01',
                    subtotal_cents: 10000,
                    tax_cents: 500,
                    total_cents: 10500,
                    sent_at: created,
                    approved_at: null,
                    declined_reason: null,
                    created_at: created,
                    updated_at: created,
                  },
                  lines: [],
                  delivery: null,
                }
              if (op.path === 'quotes.listMessages')
                data = input.cursor
                  ? {
                      messages: [
                        {
                          id: messageId,
                          body: 'Earlier question',
                          sender_kind: 'customer',
                          created_at: created,
                        },
                      ],
                      olderCursor: null,
                    }
                  : {
                      messages: server.messages,
                      olderCursor: {
                        beforeId: messageId,
                        beforeCreatedAt: created,
                      },
                    }
              if (op.path === 'quotes.postMessage') {
                const message: QuoteMessage = {
                  id: input.clientMessageId!,
                  body: input.body!,
                  sender_kind: 'staff',
                  created_at: '2026-10-21T12:00:00Z',
                }
                server.messages = [...server.messages, message]
                data = message
              }
              observer.next({ result: { type: 'data', data } })
              observer.complete()
            }),
      ],
    }),
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={client} queryClient={queryClient}>
        <HookView
          decide={() => {
            server.status = 'approved'
          }}
        />
      </TRPCProvider>
    </QueryClientProvider>
  )
}
const meta = { title: 'Quotes/Hooks', component: HookFixture } satisfies Meta<
  typeof HookFixture
>
export default meta
type Story = StoryObj<typeof meta>
export const StaffConversationAndAuthoritativeStatus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('sent')).toBeVisible()
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Load older messages' }),
    )
    await expect(await canvas.findByText('Earlier question')).toBeVisible()
    await expect(operations).toHaveBeenCalledWith('quotes.listMessages', {
      direction: 'forward',
      organizationId: org,
      quoteId,
      cursor: { beforeId: messageId, beforeCreatedAt: created },
    })
    await userEvent.type(
      canvas.getByLabelText('Message'),
      'We can start in May.',
    )
    await userEvent.click(canvas.getByRole('button', { name: 'Send message' }))
    await expect(await canvas.findByText('We can start in May.')).toBeVisible()
    await expect(operations).toHaveBeenCalledWith('quotes.postMessage', {
      organizationId: org,
      quoteId,
      body: 'We can start in May.',
      clientMessageId: expect.any(String),
    })
    await userEvent.click(
      canvas.getByRole('button', { name: 'Customer accepted elsewhere' }),
    )
    await expect(await canvas.findByText('approved')).toBeVisible()
    focusManager.setFocused(undefined)
  },
}
