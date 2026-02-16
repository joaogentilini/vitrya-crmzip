import PropertyNegotiationsTabClient from './PropertyNegotiationsTabClient'

export default function PropertyNegotiationsTab(props: {
  propertyId: string
  initialNegotiationId?: string | null
  initialProposalId?: string | null
}) {
  return (
    <PropertyNegotiationsTabClient
      propertyId={props.propertyId}
      initialNegotiationId={props.initialNegotiationId ?? null}
      initialProposalId={props.initialProposalId ?? null}
    />
  )
}
