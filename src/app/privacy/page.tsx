import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const sections = [
  {
    title: "Responsible Party",
    body: "The responsible party for data processing on this website is 1200 Hairstudio, Schulstrasse 2, 8599 Salmsach, Switzerland. Additional business contact details will be added here once confirmed.",
  },
  {
    title: "Personal Data Collected Through Bookings",
    body: "When the booking flow is used, the website may collect personal data such as first name, last name, phone number, email address, selected service, appointment date and time, and any note entered by the customer.",
  },
  {
    title: "Purpose of Data Processing",
    body: "Personal data is processed to manage booking requests, confirm appointments, communicate with customers about their session, and operate the 1200 Hairstudio website and related customer service workflows.",
  },
  {
    title: "Booking System",
    body: "The current booking interface is a frontend prototype. Once a production booking system is connected, this section should be updated with the technical provider, legal basis, and any relevant operational details.",
  },
  {
    title: "Data Storage and Retention",
    body: "Booking and contact data should only be stored for as long as necessary to fulfill appointment-related purposes, meet legal obligations, resolve disputes, and maintain essential business records. Exact retention periods will be defined once the production data systems are finalized.",
  },
  {
    title: "Third-Party Services",
    body: "This website may later integrate third-party services for maps, booking infrastructure, analytics, email delivery, or hosting. When those services are implemented, this policy should be updated to list the providers, their roles, and the relevant privacy information.",
  },
  {
    title: "International Data Transfers",
    body: "If service providers process data outside Switzerland or the European Economic Area, appropriate safeguards should be used where required. The exact transfer mechanisms will be documented once the final service providers are confirmed.",
  },
  {
    title: "Cookies / Analytics",
    body: "Analytics, tracking, or non-essential cookies are not documented here yet. If analytics, advertising, or consent tools are introduced in the future, this section should be updated with the technologies used, their purpose, and any consent requirements.",
  },
  {
    title: "User Data Rights",
    body: "Depending on the applicable law, users may have rights to request access to their personal data, rectification, deletion, restriction of processing, objection to processing, and data portability. Contact details for handling such requests will be added once finalized.",
  },
  {
    title: "Data Security",
    body: "Reasonable technical and organizational measures should be used to protect personal data against unauthorized access, loss, misuse, or disclosure. This section can be expanded once the production booking, hosting, and communication stack is finalized.",
  },
  {
    title: "Changes to the Privacy Policy",
    body: "This privacy policy may be updated to reflect legal, technical, or operational changes. The current version published on this page is the version that applies at the time of use.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="bg-background">
        <section className="page-container py-12 sm:py-16 lg:py-20">
          <div className="max-w-4xl space-y-8">
            <div className="space-y-4">
              <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
                Legal
              </p>
              <h1 className="font-display text-[clamp(2.4rem,6vw,4.75rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
                Privacy Policy
              </h1>
              <p className="font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
                This page is structured to be updated as booking, data storage,
                email, analytics, and other services are introduced into the
                1200 Hairstudio website.
              </p>
            </div>

            <div className="space-y-8 border-t border-border pt-8">
              {sections.map((section) => (
                <section
                  key={section.title}
                  className="space-y-3 border-t border-border pt-6 first:border-t-0 first:pt-0"
                >
                  <h2 className="font-display text-2xl uppercase tracking-[-0.04em] text-foreground sm:text-3xl">
                    {section.title}
                  </h2>
                  <p className="font-primary text-sm leading-7 text-foreground-secondary sm:text-base">
                    {section.body}
                  </p>
                </section>
              ))}

              <div className="space-y-2 border-t border-border pt-6">
                <p className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-muted">
                  Last Updated
                </p>
                <p className="font-primary text-base leading-7 text-foreground-secondary">
                  August 20, 2026
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
