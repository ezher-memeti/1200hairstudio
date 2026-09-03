export const ANNOUNCEMENT_DISPLAY_TYPES = ["top_bar", "booking_notice", "modal"] as const;

export type AnnouncementDisplayType = (typeof ANNOUNCEMENT_DISPLAY_TYPES)[number];

export type Announcement = {
  id: string;
  title: string | null;
  message: string;
  display_type: AnnouncementDisplayType;
  cta_text: string | null;
  cta_url: string | null;
  starts_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_dismissible: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type AnnouncementInput = {
  title: string;
  message: string;
  displayType: AnnouncementDisplayType;
  ctaText: string;
  ctaUrl: string;
  startsAt: string;
  expiresAt: string;
  isDismissible: boolean;
  priority: number;
  isActive: boolean;
};
