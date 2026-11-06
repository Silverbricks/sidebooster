export const ROLES = ["BUYER", "SELLER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const AU_STATES = [
  { code: "NSW", name: "New South Wales" },
  { code: "VIC", name: "Victoria" },
  { code: "QLD", name: "Queensland" },
  { code: "WA", name: "Western Australia" },
  { code: "SA", name: "South Australia" },
  { code: "TAS", name: "Tasmania" },
  { code: "ACT", name: "Australian Capital Territory" },
  { code: "NT", name: "Northern Territory" },
] as const;

export const TIMEZONES = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Perth",
  "Australia/Hobart",
] as const;

type Labels = Record<string, string>;

export const ACCOUNT_STATUS: Labels = {
  REGISTERED: "Registered",
  EMAIL_PENDING: "Email pending",
  MOBILE_PENDING: "Mobile pending",
  ACTIVE: "Active",
  VERIFICATION_REQUIRED: "Verification required",
  RESTRICTED: "Restricted",
  SUSPENDED: "Suspended",
  CLOSED: "Closed",
};

export const SELLER_STATUS: Labels = {
  REGISTERED: "Registered",
  VERIFICATION_PENDING: "Verification pending",
  DOCUMENTS_REQUIRED: "Documents required",
  UNDER_REVIEW: "Under admin review",
  APPROVED: "Approved (payout setup pending)",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export const LISTING_STATUS: Labels = {
  DRAFT: "Draft",
  PENDING: "Pending approval",
  ACTIVE: "Published",
  PAUSED: "Paused",
  SOLD: "Sold",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  SUSPENDED: "Suspended",
};

export const ORDER_STATUS: Labels = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  FULFILLED: "Shipped / handed over",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export const PAYMENT_STATUS: Labels = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  SUCCEEDED: "Payment successful",
  FAILED: "Payment failed",
  UNDER_REVIEW: "Under review",
  REFUND_REQUESTED: "Refund requested",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
};

export const SALE_STATUS: Labels = {
  REPORTED: "Awaiting buyer confirmation",
  BUYER_CONFIRMED: "Buyer confirmed",
  UNDER_REVIEW: "Under admin review",
  MORE_INFO: "More information required",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
};

export const COMMISSION_STATUS: Labels = {
  PENDING_APPROVAL: "Pending approval",
  GENERATED: "Commission generated",
  INVOICED: "Invoice issued",
  PAID: "Paid",
  OVERDUE: "Overdue",
  REVERSED: "Reversed",
  WAIVED: "Waived",
  REJECTED: "Rejected",
};

export const CAMPAIGN_STATUS: Labels = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SALES_CLOSED: "Sales closed",
  DRAW_COMPLETED: "Draw completed",
  WINNER_ANNOUNCED: "Winner announced",
  COMPLETED: "Prize delivered",
  CANCELLED: "Cancelled",
  SUSPENDED: "Suspended",
};

export const DOCUMENT_TYPES: Labels = {
  ID_DRIVER_LICENCE: "Driver licence",
  ID_PASSPORT: "Passport",
  PROOF_OF_ADDRESS: "Proof of address",
  ABN_CERTIFICATE: "ABN / ASIC registration",
  AUTHORITY_LETTER: "Authorised representative letter",
  OTHER: "Other",
};

/** Public-facing draw statuses (SRS §6). */
export type PublicDrawStatus =
  | "Upcoming"
  | "Ticket Sales Open"
  | "Sales Closed"
  | "Draw Scheduled"
  | "Draw Completed"
  | "Winner Announced"
  | "Cancelled";

export const LISTING_DAYS_ACTIVE = 60;
export const DRAW_METHOD =
  "SHA-256 commit-reveal: winningIndex = int(SHA256(seed + ':' + eligibleHash)) mod eligibleCount, over eligible tickets sorted by number";

export function tone(status: string): "green" | "amber" | "red" | "blue" | "gray" {
  if (["ACTIVE", "APPROVED", "PAID", "SUCCEEDED", "COMPLETED", "PUBLISHED", "VALID", "FREE_CLAIMED", "WINNER_ANNOUNCED", "PROCESSED", "GENERATED", "ACCEPTED", "SCHEDULED", "REPLIED"].includes(status)) return "green";
  if (["PENDING", "PENDING_APPROVAL", "PENDING_PAYMENT", "UNDER_REVIEW", "REPORTED", "BUYER_CONFIRMED", "EMAIL_PENDING", "MOBILE_PENDING", "VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "MORE_INFO", "REFUND_REQUESTED", "PROPOSED", "INVOICED", "ISSUED", "OPEN", "SUBMITTED", "HELD", "PROCESSING", "DRAWN", "REQUESTED"].includes(status)) return "amber";
  if (["REJECTED", "SUSPENDED", "FAILED", "CANCELLED", "REFUNDED", "DISPUTED", "OVERDUE", "REVERSED", "VOID", "CLOSED", "RESTRICTED", "VERIFICATION_REQUIRED", "EXPIRED"].includes(status)) return "red";
  if (["SALES_CLOSED", "DRAW_COMPLETED", "FULFILLED", "SOLD", "PAUSED", "WAIVED"].includes(status)) return "blue";
  return "gray";
}
