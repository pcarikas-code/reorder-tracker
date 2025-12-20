import { ExternalLink } from "lucide-react";

interface OrderLinkProps {
  orderNumber: string;
  unleashOrderGuid?: string | null;
  className?: string;
  showIcon?: boolean;
}

/**
 * Clickable order number that links to Unleashed portal
 * URL format: https://au.unleashedsoftware.com/v2/SalesOrder/Update/{OrderNumber}
 */
export function OrderLink({ orderNumber, unleashOrderGuid, className = "", showIcon = true }: OrderLinkProps) {
  // Use order number for the URL (Unleashed web app uses OrderNumber, not GUID)
  const unleashUrl = `https://au.unleashedsoftware.com/v2/SalesOrder/Update/${orderNumber}`;

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
