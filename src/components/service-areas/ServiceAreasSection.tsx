import { toast } from '#/components/crm/ui'
import { useCrews } from '#/integrations/crews/crews'
import { useOrganization } from '#/integrations/organization/context'
import { can } from '#/integrations/organization/permissions'
import {
  useServiceAreaCoverage,
  useServiceAreaMutations,
  useServiceAreas,
  useServiceRegions,
} from '#/integrations/service-areas/serviceAreas'
import { ServiceAreasEditor } from './ServiceAreasEditor'
import type { ServiceAreaActions } from './ServiceAreasEditor'

/** The service area editor on live data, for Settings. */
export function ServiceAreasSection() {
  const { organization } = useOrganization()
  const areas = useServiceAreas()
  const regions = useServiceRegions()
  const crews = useCrews()
  const coverage = useServiceAreaCoverage()
  const m = useServiceAreaMutations()
  const organizationId = organization?.id

  const actions: ServiceAreaActions = {
    preview: (input) =>
      m.preview.mutateAsync({ organizationId: organizationId!, ...input }),
    save: async (input, rotations) => {
      const { id } = await m.upsert.mutateAsync({
        organizationId: organizationId!,
        ...input,
      })
      toast(`Saved ${input.name}`)
      if (rotations === null) return
      try {
        await m.setRotations.mutateAsync({
          organizationId: organizationId!,
          serviceAreaId: id,
          rotations,
        })
      } catch (e) {
        // The area is saved; only the weekday crews are not.
        toast(
          `${input.name} was saved, but its rotation was not: ${e instanceof Error ? e.message : 'try again'}`,
          'warning',
        )
      }
    },
    archive: async (id) => {
      await m.archive.mutateAsync({
        organizationId: organizationId!,
        id,
        archived: true,
      })
      toast('Service area archived')
    },
    addRegion: async (input) => {
      const { id } = await m.upsertRegion.mutateAsync({
        organizationId: organizationId!,
        name: input.name,
        center: input.center,
        bbox: input.bbox,
      })
      toast(`Added ${input.name}`)
      return { id }
    },
  }

  const failed = areas.isError || regions.isError || crews.isError
  const loading =
    organization === null ||
    areas.isPending ||
    regions.isPending ||
    crews.isPending
  const failure = areas.error ?? regions.error ?? crews.error

  return (
    <ServiceAreasEditor
      status={failed ? 'error' : loading ? 'loading' : 'ready'}
      errorMessage={failure?.message}
      areas={areas.data?.features ?? []}
      regions={regions.data?.features ?? []}
      crews={crews.data ?? []}
      coverage={coverage.data ?? null}
      canEdit={
        organization !== null && can.manageServiceAreas(organization.role)
      }
      actions={actions}
    />
  )
}
