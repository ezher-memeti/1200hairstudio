export type HomepageContentType = "text" | "textarea";

export const homepageContentDefinitions = [
  { section: "Hero", contentKey: "hero_eyebrow", label: "Hero label", defaultValue: "1200 Barbershop", contentType: "text", sortOrder: 10, recommendedMax: 30 },
  { section: "Hero", contentKey: "hero_title", label: "Hero title", defaultValue: "Precision, pace, and presence.", contentType: "textarea", sortOrder: 20, recommendedMax: 45 },
  { section: "Hero", contentKey: "hero_description", label: "Hero description", defaultValue: "A modern barbershop experience shaped by sharp technique, calm atmosphere, and uncompromising detail.", contentType: "textarea", sortOrder: 30, recommendedMax: 140 },
  { section: "Hero", contentKey: "hero_cta", label: "Hero CTA", defaultValue: "Book Your Session", contentType: "text", sortOrder: 40, recommendedMax: 28 },
  { section: "Hero", contentKey: "hero_scroll_label", label: "Scroll label", defaultValue: "Scroll", contentType: "text", sortOrder: 50, recommendedMax: 16 },

  { section: "Availability", contentKey: "availability_eyebrow", label: "Availability label", defaultValue: "Next Available", contentType: "text", sortOrder: 10, recommendedMax: 30 },
  { section: "Availability", contentKey: "availability_cta", label: "Availability CTA", defaultValue: "View All Availability →", contentType: "text", sortOrder: 20, recommendedMax: 36 },

  { section: "Signature Services", contentKey: "services_eyebrow", label: "Services label", defaultValue: "Signature Services", contentType: "text", sortOrder: 10, recommendedMax: 30 },
  { section: "Signature Services", contentKey: "services_title", label: "Services title", defaultValue: "Crafted cuts, clean rhythm, considered detail.", contentType: "textarea", sortOrder: 20, recommendedMax: 58 },

  { section: "Meet the Barber", contentKey: "barber_eyebrow", label: "Barber label", defaultValue: "03 / The Barber", contentType: "text", sortOrder: 10, recommendedMax: 30 },
  { section: "Meet the Barber", contentKey: "barber_title", label: "Section title", defaultValue: "Meet the Barber", contentType: "text", sortOrder: 20, recommendedMax: 34 },
  { section: "Meet the Barber", contentKey: "barber_name", label: "Barber name", defaultValue: "Arban Shaqiri", contentType: "text", sortOrder: 30, recommendedMax: 40 },
  { section: "Meet the Barber", contentKey: "barber_experience_value", label: "Experience value", defaultValue: "4", contentType: "text", sortOrder: 40, recommendedMax: 8 },
  { section: "Meet the Barber", contentKey: "barber_experience_label", label: "Experience label", defaultValue: "Years Experience", contentType: "text", sortOrder: 50, recommendedMax: 28 },
  { section: "Meet the Barber", contentKey: "barber_specialties", label: "Specialties", defaultValue: "Fade · Classic · Beard", contentType: "text", sortOrder: 60, recommendedMax: 45 },
  { section: "Meet the Barber", contentKey: "barber_cta", label: "Barber CTA", defaultValue: "Book a Session →", contentType: "text", sortOrder: 70, recommendedMax: 28 },

  { section: "Selected Work", contentKey: "work_eyebrow", label: "Selected work label", defaultValue: "04 / Selected Work", contentType: "text", sortOrder: 10, recommendedMax: 30 },
  { section: "Selected Work", contentKey: "work_title", label: "Selected work title", defaultValue: "Selected\nWork.", contentType: "textarea", sortOrder: 20, recommendedMax: 30 },
  { section: "Selected Work", contentKey: "work_description", label: "Selected work description", defaultValue: "A selection of cuts from the chair.", contentType: "textarea", sortOrder: 30, recommendedMax: 90 },

  { section: "Booking", contentKey: "booking_eyebrow", label: "Booking label", defaultValue: "05 / Book Your Session", contentType: "text", sortOrder: 10, recommendedMax: 34 },
  { section: "Booking", contentKey: "booking_title", label: "Booking title", defaultValue: "Your Time.\nYour Chair.", contentType: "textarea", sortOrder: 20, recommendedMax: 36 },
  { section: "Booking", contentKey: "booking_description", label: "Booking description", defaultValue: "Choose your service and reserve a time that works for you.", contentType: "textarea", sortOrder: 30, recommendedMax: 110 },

  { section: "Visit the Studio", contentKey: "visit_eyebrow", label: "Visit label", defaultValue: "Visit the Studio", contentType: "text", sortOrder: 10, recommendedMax: 28 },
  { section: "Visit the Studio", contentKey: "visit_title", label: "Location title", defaultValue: "Salmsach\nSwitzerland", contentType: "textarea", sortOrder: 20, recommendedMax: 36 },
  { section: "Visit the Studio", contentKey: "visit_address_line_1", label: "Address line 1", defaultValue: "Schulstrasse 2", contentType: "text", sortOrder: 30, recommendedMax: 50 },
  { section: "Visit the Studio", contentKey: "visit_address_line_2", label: "Address line 2", defaultValue: "8599 Salmsach", contentType: "text", sortOrder: 40, recommendedMax: 50 },
  { section: "Visit the Studio", contentKey: "visit_cta", label: "Directions CTA", defaultValue: "Get Directions →", contentType: "text", sortOrder: 50, recommendedMax: 28 },
] as const satisfies readonly {
  section: string;
  contentKey: string;
  label: string;
  defaultValue: string;
  contentType: HomepageContentType;
  sortOrder: number;
  recommendedMax: number;
}[];

export type HomepageContentKey = (typeof homepageContentDefinitions)[number]["contentKey"];
export type HomepageContentSection = (typeof homepageContentDefinitions)[number]["section"];
export type HomepageContent = Record<HomepageContentKey, string>;

export const homepageContentDefaults = Object.fromEntries(
  homepageContentDefinitions.map((field) => [field.contentKey, field.defaultValue]),
) as HomepageContent;

const homepageContentKeys = new Set<string>(Object.keys(homepageContentDefaults));

export function isHomepageContentKey(value: string): value is HomepageContentKey {
  return homepageContentKeys.has(value);
}

