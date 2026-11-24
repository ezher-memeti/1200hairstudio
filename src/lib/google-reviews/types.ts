export type GoogleReview = {
  id: string;
  author: string;
  authorUri: string | null;
  avatarUri: string | null;
  rating: number;
  text: string;
  language: string | null;
  relativeDate: string;
  publishedAt: string | null;
  uri: string;
};
export type GoogleReviews = {
  name: string;
  rating: number | null;
  count: number;
  mapsUri: string;
  reviewsUri: string;
  writeUri: string | null;
  reviews: GoogleReview[];
  attributions: { name: string; uri: string | null }[];
};
