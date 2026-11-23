import { useEffect, useRef } from 'react'
import { uploadCompanyLogo } from './logo'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { toast } from '#/lib/toast'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'
import { createSupabaseBrowserClient } from '#/lib/supabase/client'
import type { TRPCRouter } from '#/integrations/trpc/router'

export { LOGO_TYPES, LOGO_MAX_BYTES } from './logo'

export type CompanyProfile = inferRouterOutputs<TRPCRouter>['settings']['get']
type Inputs = inferRouterInputs<TRPCRouter>['settings']
export type ProfilePatch = Omit<Inputs['updateProfile'], 'organizationId'>
export type SettingsPatch = Omit<Inputs['updateSettings'], 'organizationId'>

export function useCompanySettings() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  return useQuery({
    ...trpc.settings.get.queryOptions({ organizationId: organizationId! }),
    enabled: organizationId !== undefined,
  })
}

export function useSettingsOverview() {
  const trpc = useTRPC()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  return useQuery({
    ...trpc.settings.overview.queryOptions({
      organizationId: organizationId!,
    }),
    enabled: organizationId !== undefined,
  })
}

export function useSettingsMutations() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()
  const organizationId = organization?.id
  const getKey = trpc.settings.get.queryKey({
    organizationId: organizationId!,
  })

  const settle = {
    scope: { id: 'settings' },
    onSettled: () => queryClient.invalidateQueries({ queryKey: getKey }),
  }

  const profile = useMutation(
    trpc.settings.updateProfile.mutationOptions({
      ...settle,
      onError: (e) => toast(`Couldn't save the company profile: ${e.message}`),
    }),
  )
  const settings = useMutation(
    trpc.settings.updateSettings.mutationOptions({
      ...settle,
      onError: (e) => toast(`Couldn't save your settings: ${e.message}`),
    }),
  )
  const activeOrganization = useRef({ id: organizationId })
  if (activeOrganization.current.id !== organizationId) {
    activeOrganization.current = { id: organizationId }
  }
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const operation = useRef(false)
  const logo = useMutation(
    trpc.settings.setLogo.mutationOptions({
      onSettled: (_data, _error, variables) =>
        queryClient.invalidateQueries({
          queryKey: trpc.settings.get.queryKey({
            organizationId: variables.organizationId,
          }),
        }),
    }),
  )
  const base = { organizationId: organizationId! }
  const runLogo = async (file?: File) => {
    if (!organizationId) throw new Error('No active organization.')
    if (operation.current) return false
    const captured = organizationId
    const workspace = activeOrganization.current
    const isCurrent = () =>
      mounted.current && activeOrganization.current === workspace
    operation.current = true
    try {
      if (file)
        return await uploadCompanyLogo(file, captured, {
          invoke: (body) =>
            createSupabaseBrowserClient().functions.invoke('upload-image', {
              body,
            }),
          save: (path) => logo.mutateAsync({ organizationId: captured, path }),
          isCurrent,
        })
      await logo.mutateAsync({ organizationId: captured, path: null })
      return isCurrent()
    } catch (error) {
      if (!isCurrent()) return false
      throw error
    } finally {
      operation.current = false
    }
  }

  return {
    saveProfile: (patch: ProfilePatch) =>
      profile.mutateAsync({ ...base, ...patch }),
    saveSettings: (patch: SettingsPatch) =>
      settings.mutateAsync({ ...base, ...patch }),
    uploadLogo: (file: File) => runLogo(file),
    removeLogo: () => runLogo(),
    saving: profile.isPending || settings.isPending || logo.isPending,
  }
}

/** Public request page URL for a slug, on whatever host the app is served from. */
export function portalUrl(slug: string, opts: { embed?: boolean } = {}) {
  const origin =
    typeof window === 'undefined' ? '' : window.location.origin.toString()
  return `${origin}/portal/${slug}${opts.embed ? '?embed=true' : ''}`
}
