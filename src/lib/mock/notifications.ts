export type NotificationType = "rfq" | "quote" | "document";

export type MockNotification = {
  id: string;
  title: string;
  detail: string;
  type: NotificationType;
  time: string;
  unread: boolean;
};

export const mockNotifications: MockNotification[] = [
  {
    id: "n1",
    title: "New high-priority RFQ",
    detail: "RFQ-10482 · 2,000 units awaiting qualification",
    type: "rfq",
    time: "12m ago",
    unread: true,
  },
  {
    id: "n2",
    title: "Quotation awaiting follow-up",
    detail: "QT-2201 has been viewed and needs a response",
    type: "quote",
    time: "1h ago",
    unread: true,
  },
  {
    id: "n3",
    title: "Product document updated",
    detail: "Amoxicillin SPC marked as the current approved version",
    type: "document",
    time: "Yesterday",
    unread: false,
  },
];

export function getNotifications(): MockNotification[] {
  return mockNotifications;
}
