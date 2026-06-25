// PlexiSign: send a document for signature, collect approvals in order, and keep
// a tamper-evident trail. Self-contained and local-first: a request carries the
// agreement text it is about and an ordered list of signers; each signer signs
// with a typed or drawn signature; once everyone in order has signed, the
// request completes and a certificate (a sha256 over the body + every signature)
// is recorded. Nothing is fabricated — a new request is a draft with no
// signatures until a real person signs.
//
// Cross-account "send to an external email" is the later half that needs the
// signal/email layer; this half collects approvals from the people you name.

export type SignStatus = 'draft' | 'out_for_signature' | 'completed' | 'declined' | 'voided'
export type SignerStatus = 'pending' | 'signed' | 'declined'
export type SignatureKind = 'typed' | 'drawn'

export interface Signer {
  id: string
  name: string
  order: number // signing order, 0-based
  status: SignerStatus
  signatureKind: SignatureKind | null
  signatureData: string | null // typed full name, or a drawn PNG data URL
  signedAt: number | null
  declineReason: string | null
}

export interface SignAuditEvent {
  at: number
  event: string // created | sent | signed | declined | completed | voided
  detail: string | null
}

export interface PlexiSignRequest {
  id: string
  title: string
  body: string // the agreement text being signed
  status: SignStatus
  signers: Signer[]
  audit: SignAuditEvent[]
  certificate: string | null // sha256 hex over body + signatures, set on completion
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export interface PlexiSignDraft {
  title?: string
  body?: string
  signerNames?: string[]
}

export interface PlexiSignPatch {
  title?: string
  body?: string
  signers?: Signer[] // replace the signer set (only allowed while draft)
}

export interface SignAction {
  signerId: string
  kind: SignatureKind
  data: string
}
