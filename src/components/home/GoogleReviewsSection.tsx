import { getGoogleReviews } from "@/lib/google-reviews/server";
import styles from "./google-reviews/google-reviews.module.css";
import GoogleReviewsClient from "./google-reviews/GoogleReviewsClient";

export function GoogleReviewsPlaceholder() {
  return <div aria-hidden="true" className={`${styles.section} bg-background`}>
    <div className={`page-container ${styles.container}`}><div className={styles.loading} /><div className={styles.loadingFooter} /></div>
  </div>;
}
export default async function GoogleReviewsSection() {
  const data = await getGoogleReviews();
  if (!data?.reviews.length) return null;
  return <GoogleReviewsClient data={data} />;
}
