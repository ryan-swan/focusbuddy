// Whether a document's owning scope makes it a shared, co-editable object rather
// than a private one. Pure and dependency-light so it can be unit-tested and
// imported by the open-router without pulling in the editor components.

import { PERSONAL_ORG_ID } from '../stores/org'

export function isOrgSharedScope(orgId: string | null | undefined): boolean {
  return !!orgId && orgId !== PERSONAL_ORG_ID
}
