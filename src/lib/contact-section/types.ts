export type ContactSectionSettings = {
  id: string | null;
  isEnabled: boolean;
  eyebrow: string;
  title: string;
  description: string;
  address: string;
  mapUrl: string;
  phoneNumber: string;
  phoneDisplay: string;
  instagramEnabled: boolean;
  instagramUsername: string;
  instagramUrl: string;
  googleReviewsEnabled: boolean;
  googleReviewsUrl: string;
  googleLeaveReviewUrl: string;
  callCtaLabel: string;
  instagramCtaLabel: string;
  reviewsCtaLabel: string;
  leaveReviewCtaLabel: string;
};

export type ContactSectionSettingsRow = {
  id: string;
  is_enabled: boolean | null;
  eyebrow: string | null;
  title: string | null;
  description: string | null;
  address: string | null;
  map_url: string | null;
  phone_number: string | null;
  phone_display: string | null;
  instagram_enabled: boolean | null;
  instagram_username: string | null;
  instagram_url: string | null;
  google_reviews_enabled: boolean | null;
  google_reviews_url: string | null;
  google_leave_review_url: string | null;
  call_cta_label: string | null;
  instagram_cta_label: string | null;
  reviews_cta_label: string | null;
  leave_review_cta_label: string | null;
};

export const DEFAULT_CONTACT_SECTION_SETTINGS: ContactSectionSettings = {
  id: null,
  isEnabled: true,
  eyebrow: "Contact",
  title: "Come by.\nStay connected.",
  description: "Visit the studio, call us directly, or stay connected online.",
  address: "Schulstrasse 2, 8599 Salmsach, Switzerland",
  mapUrl: "",
  phoneNumber: "",
  phoneDisplay: "",
  instagramEnabled: true,
  instagramUsername: "",
  instagramUrl: "",
  googleReviewsEnabled: true,
  googleReviewsUrl: "",
  googleLeaveReviewUrl: "",
  callCtaLabel: "Call Now →",
  instagramCtaLabel: "Open Instagram →",
  reviewsCtaLabel: "Read Reviews →",
  leaveReviewCtaLabel: "Leave A Review →",
};
