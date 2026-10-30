import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { toast } from '#/components/crm/ui'
import { useOrganization } from '#/integrations/organization/context'
import { useTRPC } from '#/integrations/trpc/react'
import { createSupabaseBrowserClient } from '#/lib/supabase/client'
import type { TRPCRouter } from '#/integrations/trpc/router'

export type CompanyProfile = inferRouterOutputs<TRPCRouter>['settings']['get']
type Inputs = inferRouterInputs<TRPCRouter>['settings']
export type ProfilePatch = Omit<Inputs['updateProfile'], 'organizationId'>
export type SettingsPatch = Omit<Inputs['updateSettings'], 'organizationId'>

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

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
  // One scope so saves from different tabs apply in order.
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
  const logo = useMutation(
    trpc.settings.setLogo.mutationOptions({
      ...settle,
      onError: (e) => toast(`Couldn't update the logo: ${e.message}`),
    }),
  )

  const base = { organizationId: organizationId! }

  /** Uploads to org-files/<org>/branding/ (RLS checks the folder), then saves the path. */
  const uploadLogo = async (file: File) => {
    if (!organizationId) throw new Error('No active organization.')
    if (!LOGO_TYPES.includes(file.type)) {
      throw new Error('Use a PNG, JPG, or WebP image.')
    }
    if (file.size > LOGO_MAX_BYTES) {
      throw new Error('Logos can be up to 2 MB.')
    }
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
    const path = `${organizationId}/branding/logo-${crypto.randomUUID()}.${ext}`
    const { error } = await createSupabaseBrowserClient()
      .storage.from('org-files')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error(error.message)
    await logo.mutateAsync({ ...base, path })
  }

  return {
    saveProfile: (patch: ProfilePatch) =>
      profile.mutateAsync({ ...base, ...patch }),
    saveSettings: (patch: SettingsPatch) =>
      settings.mutateAsync({ ...base, ...patch }),
    uploadLogo,
    removeLogo: () => logo.mutateAsync({ ...base, path: null }),
    saving: profile.isPending || settings.isPending || logo.isPending,
  }
}

/** Public request page URL for a slug, on whatever host the app is served from. */
export function portalUrl(slug: string, opts: { embed?: boolean } = {}) {
  const origin =
    typeof window === 'undefined' ? '' : window.location.origin.toString()
  return `${origin}/portal/${slug}${opts.embed ? '?embed=true' : ''}`
}
