import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import type { LicenseStatus, CatalogSyncState, PremiumStatus } from '../../../shared/types'
export type { LicenseStatus, CatalogSyncState, PremiumStatus }




export function usePremium() {
  const query = useQuery<PremiumStatus>({
    queryKey: ['premium'],
    queryFn: () => apiFetch('/api/premium'),
  })

  return {
    ...query,
    licensed: Boolean(query.data?.hasKey && query.data.license?.valid),
  }
}
