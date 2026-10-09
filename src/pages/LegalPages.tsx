import { ReactNode } from 'react';
import { APP_CONFIG } from '@/config/app';

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="max-w-2xl mx-auto px-4 py-8 text-gray-300 text-sm leading-relaxed space-y-4">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      {children}
      <p className="text-xs text-gray-500 pt-4">Last updated: October 2026. Questions: {APP_CONFIG.contactEmail}</p>
    </article>
  );
}
const H = ({ children }: { children: ReactNode }) => <h2 className="text-white font-semibold pt-2">{children}</h2>;
const name = APP_CONFIG.name;

export function TermsPage() {
  return (
    <Page title="Terms of Service">
      <p>{name} lets organizers run gaming tournaments, collect registrations and show live brackets. By using it you agree to these terms.</p>
      <H>Accounts</H>
      <p>Organizers are responsible for their account, the tournaments they create and the players they register. We may disable accounts that misuse the service, send spam or break the law.</p>
      <H>Your tournaments and players</H>
      <p>You must have a valid reason and permission to collect players' details, and you must use them only to run your event. Do not publish players' phone numbers or other private details.</p>
      <H>Fees</H>
      <p>A tournament may need a one-time fee before it can go live (shown in your dashboard). Payment is currently made by UPI and confirmed manually. Tournaments may be free during the beta period.</p>
      <H>Prizes and entry fees</H>
      <p>Prizes, entry fees and payments between organizers and players happen outside {name}. We are not a party to them and are not responsible for them.</p>
      <H>Availability</H>
      <p>We work to keep {name} running but cannot promise it will never be interrupted. Keep a backup plan for important events and export your player list (CSV) before the event.</p>
      <H>Changes</H>
      <p>We may update these terms. Continued use means you accept the update.</p>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Policy">
      <H>What we collect</H>
      <p>Organizers: name, email and tournament details. Players: name, mobile number, and optional gamer tag and character or loadout, as entered at registration. Basic technical data (such as IP address) is used for security and rate limiting.</p>
      <H>Why</H>
      <p>Only to run tournaments: registration, brackets, results, check-in and organizer communication.</p>
      <H>Who can see it</H>
      <p>Phone numbers are visible only to the organizer of that tournament and to the platform administrator for support. They are never shown on public pages or in the public data feed. Public pages show player names, gamer tags and results.</p>
      <p>If an organizer connects their own website or webhook, registrations are also sent to that organizer's systems. The organizer is responsible for how they handle that data.</p>
      <H>Storage and retention</H>
      <p>Data is stored with our database provider. Organizers can export and delete their tournaments and players. We keep data only as long as needed for the service.</p>
      <H>Your rights</H>
      <p>You can ask us to correct or delete your personal data under applicable Indian law, including the Digital Personal Data Protection Act, 2023. Write to {APP_CONFIG.contactEmail} and we will respond within a reasonable time.</p>
    </Page>
  );
}

export function RefundPage() {
  return (
    <Page title="Refund Policy">
      <p>The tournament fee covers running one tournament on {name}.</p>
      <H>When you can get a refund</H>
      <p>If we could not deliver the service for your tournament because of a fault on our side, we will refund the fee in full or move it to another tournament, as you prefer. Please contact us within 7 days of the event date.</p>
      <H>When we cannot refund</H>
      <p>Fees are not refundable once a tournament has been run, or if the event is cancelled or postponed by the organizer.</p>
      <H>Entry fees and prizes</H>
      <p>Entry fees and prizes collected by an organizer from players are between the organizer and the players. {name} does not collect or refund them.</p>
      <H>How</H>
      <p>Email {APP_CONFIG.contactEmail} with your tournament link and payment reference. Refunds go back by UPI.</p>
    </Page>
  );
}

export function ContactPage() {
  return (
    <Page title="Contact">
      <p>For help, billing, data requests or feedback, email <a className="text-electric-400" href={`mailto:${APP_CONFIG.contactEmail}`}>{APP_CONFIG.contactEmail}</a>.</p>
      <p>If something breaks during a live event, include the tournament link and a short description so we can help quickly.</p>
    </Page>
  );
}
