import { ExternalLink } from "lucide-react";

interface OrderLinkProps {
  orderNumber: string;
  unleashOrderGuid?: string | null;
  className?: string;
  showIcon?: boolean;
}

/**
 * Clickable order number that links to Unleashed portal
 * URL format: https://go.unleashedsoftware.com/v2/SalesOrders/View/{GUID}
 */
export function OrderLink({ orderNumber, unleashOrderGuid, className = "", showIcon = true }: OrderLinkProps) {
  if (!unleashOrderGuid) {
    return <span className={className}>{orderNumber}</span>;
  }

  const unleashUrl = `https://go.unleashedsoftware.com/v2/SalesOrders/View/${unleashOrderGuid}`;

  return (
    <a
      href={unleashUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-primary hover:underline ${className}`}
      title="Open in Unleashed"
    >
      {orderNumber}
      {showIcon && <ExternalLink className="h-3 w-3" />}
    </a>
  );
}
