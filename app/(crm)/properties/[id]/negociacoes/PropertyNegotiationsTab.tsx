import PropertyNegotiationsTabClient from "./PropertyNegotiationsTabClient";
import { createCommission } from "./actions/createCommission";

export default function PropertyNegotiationsTab(props: { propertyId: string }) {
  return (
    <PropertyNegotiationsTabClient
      propertyId={props.propertyId}
      createCommissionAction={createCommission}
    />
  );
}
