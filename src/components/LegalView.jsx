import { ArrowLeft } from 'react-feather'

// Privacy Policy + Terms of Use, rendered in-app at #/privacy and #/terms.
// One component, two documents (`doc` = 'privacy' | 'terms'). Plain prose in
// the app's voice; the operative legal facts (Joinue LLC, Arizona, the
// marc@joinue.com contact, the processor list) live here so there's a single
// place to keep them current. Update EFFECTIVE_DATE whenever the text changes.
const EFFECTIVE_DATE = 'June 12, 2026'
const OPERATOR = 'Joinue LLC'
const CONTACT = 'marc@joinue.com'

export default function LegalView({ doc, onBack }) {
  const Body = doc === 'terms' ? Terms : Privacy
  return (
    <div className="legal">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>
      <Body />
      <p className="legal-meta">
        Salernidex is operated by {OPERATOR}. Questions? Email{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </div>
  )
}

function Privacy() {
  return (
    <article className="legal-doc">
      <h1>Privacy Policy</h1>
      <p className="legal-date">Last updated {EFFECTIVE_DATE}</p>

      <p>
        Salernidex (the “Service”) is a private household organizer operated by {OPERATOR}, an
        Arizona limited liability company (“Joinue,” “we,” “us”). This policy explains what we
        collect, why, and what choices you have. By using the Service you agree to this policy.
      </p>

      <h2>1. Who controls your data</h2>
      <p>
        Salernidex is a tool you use to record your own household, contacts, and to-dos. For the
        information you enter — including details about other people — <strong>you</strong> decide
        what to put in and how it is used. With respect to that content you act as the data
        controller; we act as a processor that stores it on your behalf. You are responsible for
        having a lawful basis to record information about other people and for honoring any request
        they make to see, correct, or delete it.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> Your email address and an encrypted (hashed)
          password, handled by our authentication provider. We never see your plaintext password.
        </li>
        <li>
          <strong>Content you create.</strong> Everything you enter into the Service: people and
          organizations (names, phone numbers, emails, addresses, birthdays and other key dates,
          notes, relationships, tiers, and tags), tasks, chores, projects, lists, household and
          member names, interaction logs, and your notification preferences.
        </li>
        <li>
          <strong>Device &amp; technical data.</strong> Basic information your browser sends (such
          as IP address and user-agent) and, if you turn on reminders, a push-notification token for
          the device you enabled. We use local storage on your device for things like your theme
          choice, session, and snoozed reminders.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> intentionally collect special-category data, and we ask that you
        not store government IDs, financial account numbers, health records, or similarly sensitive
        information in the Service.
      </p>

      <h2>3. How we use it</h2>
      <p>
        We use your information solely to provide the Service: to authenticate you, store and sync
        your data across your devices and household members, send the reminders you ask for, and
        keep the Service secure and working. We do <strong>not</strong> sell your data, rent it, or
        use it for advertising, and we do not use your content to train machine-learning models.
      </p>

      <h2>4. Who we share it with</h2>
      <p>We share data only with vendors that help us run the Service, and only as needed:</p>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication, and hosting of your data.
        </li>
        <li>
          <strong>Our hosting/CDN provider</strong> — delivery of the application to your browser.
        </li>
        <li>
          <strong>Web-push services</strong> (such as those operated by Apple, Google, or Mozilla) —
          only if you enable reminders, and only to deliver them.
        </li>
        <li>
          <strong>Household members.</strong> Data you create is visible to the other members of
          your household, except items you mark “Private — only me.”
        </li>
      </ul>
      <p>
        We may also disclose information if required by law, to enforce our Terms, or to protect the
        rights, safety, or property of anyone, and we may transfer data in connection with a merger,
        acquisition, or sale of assets.
      </p>

      <h2>5. Where it lives &amp; how long</h2>
      <p>
        Your data is stored on servers operated by our providers, which may be located in the United
        States. We keep your data for as long as your account is active. You can export a complete
        copy at any time (JSON, CSV, or vCard) from Import / Export, and you can delete items
        yourself. To delete your account and associated data, email us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will delete it within a reasonable time,
        except where we must retain it to comply with law.
      </p>

      <h2>6. Your choices &amp; rights</h2>
      <p>
        You can view, edit, export, and delete your content directly in the Service. Depending on
        where you live, you may have additional rights — to access, correct, delete, or port your
        data, or to object to certain processing. To exercise them, contact us at{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. We will respond as required by applicable law.
      </p>

      <h2>7. Security</h2>
      <p>
        We use reasonable technical and organizational measures, including encryption in transit and
        access controls, to protect your data, and we rely on established providers that maintain
        their own safeguards. No method of storage or transmission is perfectly secure, however, and
        we cannot guarantee absolute security or that a breach will never occur. Our responsibility
        for any security incident is subject to the disclaimers and limitation of liability in our{' '}
        <a href="#/terms">Terms of Use</a>. You are responsible for keeping your password
        confidential and for activity under your account.
      </p>

      <h2>8. Children</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect personal
        information from them. If you believe a child has provided us information, contact us and we
        will delete it.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy from time to time. When we do, we will revise the “Last updated”
        date above, and material changes may be highlighted in the Service. Continued use after a
        change means you accept the updated policy.
      </p>
    </article>
  )
}

function Terms() {
  return (
    <article className="legal-doc">
      <h1>Terms of Use</h1>
      <p className="legal-date">Last updated {EFFECTIVE_DATE}</p>

      <p>
        These Terms of Use (“Terms”) govern your access to and use of Salernidex (the “Service”),
        operated by {OPERATOR}, an Arizona limited liability company (“Joinue,” “we,” “us”). By
        creating an account or using the Service, you agree to these Terms. If you do not agree, do
        not use the Service.
      </p>

      <h2>1. Who may use the Service</h2>
      <p>
        You must be at least 18 years old (or the age of majority where you live) and able to form a
        binding contract. If you use the Service on behalf of a household, you represent that you
        are authorized to do so and to accept these Terms for it.
      </p>

      <h2>2. The Service is provided free of charge</h2>
      <p>
        We currently offer the Service free of charge and with no service-level commitment. We may
        introduce paid features or plans in the future; if we do, additional terms may apply to
        them, but these Terms (including the disclaimers, limitation of liability, and dispute
        provisions below) continue to apply to your use of the Service.
      </p>

      <h2>3. Your account</h2>
      <p>
        You are responsible for your login credentials and for all activity under your account. Keep
        your password secure and notify us promptly of any unauthorized use. You may invite other
        members to your household; you are responsible for who you invite and what they can see.
      </p>

      <h2>4. Your content</h2>
      <p>
        You own the information you put into the Service (“Your Content”), and you keep all rights
        to it. You grant us a limited license to host, store, copy, and display Your Content only as
        needed to operate the Service for you and your household. You are solely responsible for
        Your Content, including information about other people, and you represent that you have the
        right to record and use it and that doing so does not violate any law or the rights of
        others.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful purpose or to store unlawful content;</li>
        <li>upload information about others in violation of their privacy or other rights;</li>
        <li>attempt to access accounts, data, or systems that are not yours;</li>
        <li>interfere with, disrupt, probe, or attempt to bypass the security of the Service;</li>
        <li>reverse engineer, scrape, or resell the Service except as permitted by law; or</li>
        <li>use the Service to harass, harm, or impersonate anyone.</li>
      </ul>

      <h2>6. Reminders are not guaranteed — don’t rely on them</h2>
      <p>
        The Service may surface reminders, due dates, check-in nudges, and notifications. These are
        a convenience only. We do not guarantee that any reminder or notification will be generated,
        delivered, accurate, or timely, and delivery depends on third parties and your device
        settings.{' '}
        <strong>
          Do not rely on the Service for anything important, time-sensitive, or consequential
        </strong>{' '}
        (including medical, legal, financial, or safety matters). You are responsible for your own
        commitments.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        The Service runs on infrastructure and services operated by third parties (for example, our
        database/authentication, hosting, and push-notification providers). We are not responsible
        for the acts, omissions, outages, or security incidents of those third parties, and your use
        of the Service is also subject to their terms. We are not liable for any loss arising from a
        third-party provider’s failure or breach beyond our own reasonable control.
      </p>

      <h2>8. Backups are your responsibility</h2>
      <p>
        We provide export tools (JSON, CSV, and vCard) so you can keep your own copy of your data.
        While we take reasonable steps to protect it, we are not a backup service and do not
        guarantee that data will never be lost or corrupted. You are responsible for maintaining
        your own backups of anything important.
      </p>

      <h2>9. Service availability &amp; changes</h2>
      <p>
        The Service is under active development, may contain bugs or errors, and is provided on an
        evolving basis. We may add, change, suspend, or discontinue features — or the entire Service
        — at any time, with or without notice. We are not liable to you for any modification,
        suspension, or discontinuation, or for any delay or failure caused by events beyond our
        reasonable control.
      </p>

      <h2>10. Disclaimer of warranties</h2>
      <p className="legal-caps">
        The Service is provided “as is” and “as available,” without warranties of any kind, whether
        express, implied, or statutory, including any implied warranties of merchantability, fitness
        for a particular purpose, title, and non-infringement. We do not warrant that the Service
        will be uninterrupted, error-free, secure, or that data will not be lost. Some jurisdictions
        do not allow the exclusion of certain warranties, so some of the above may not apply to you.
      </p>

      <h2>11. Limitation of liability</h2>
      <p className="legal-caps">
        To the fullest extent permitted by law, {OPERATOR} and its members, managers, and
        contractors will not be liable for any indirect, incidental, special, consequential,
        exemplary, or punitive damages, or for any loss of data, profits, goodwill, or business,
        arising out of or relating to the Service, even if advised of the possibility. Because the
        Service is provided free of charge, our total aggregate liability for all claims relating to
        the Service will not exceed one hundred U.S. dollars ($100). Some jurisdictions do not allow
        the limitation of liability for certain damages, so some of the above may not apply to you.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        You agree to defend, indemnify, and hold harmless {OPERATOR} and its members, managers, and
        contractors from any claims, damages, liabilities, and expenses (including reasonable
        attorneys’ fees) arising out of your use of the Service, Your Content, or your violation of
        these Terms or of any law or the rights of another. We may assume the exclusive defense and
        control of any matter subject to indemnification, and you agree to cooperate with us.
      </p>

      <h2>13. Dispute resolution; arbitration &amp; class-action waiver</h2>
      <p className="legal-caps">
        Please read this section carefully. It affects your legal rights, including your right to
        sue in court and to participate in a class action.
      </p>
      <p>
        <strong>Informal resolution first.</strong> Before starting any formal proceeding, you agree
        to contact us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and give us 60 days to resolve
        the dispute informally.
      </p>
      <p>
        <strong>Binding arbitration.</strong> If we can’t resolve it, you and {OPERATOR} agree that
        any dispute arising out of or relating to the Service or these Terms will be resolved by
        final and binding individual arbitration administered by a reputable arbitration provider
        under its consumer rules, rather than in court, except as stated below. The arbitration may
        be conducted by telephone, video, or written submissions where allowed.
      </p>
      <p>
        <strong>Class-action waiver.</strong> You and {OPERATOR} agree to bring claims only in an
        individual capacity, and not as a plaintiff or class member in any class, consolidated, or
        representative action. The arbitrator may not consolidate more than one person’s claims. If
        this class-action waiver is found unenforceable as to a particular claim, that claim (and
        only that claim) will proceed in court.
      </p>
      <p>
        <strong>Jury-trial waiver.</strong> To the extent any dispute proceeds in court, you and{' '}
        {OPERATOR} each waive any right to a jury trial.
      </p>
      <p>
        <strong>Carve-outs.</strong> Either party may bring an individual claim in small-claims
        court, and either party may seek injunctive or other equitable relief in court for
        infringement or misuse of intellectual property or unauthorized access to the Service.
      </p>
      <p>
        <strong>30-day opt-out.</strong> You may opt out of this arbitration and class-waiver
        section by emailing <a href={`mailto:${CONTACT}`}>{CONTACT}</a> within 30 days of first
        accepting these Terms, stating your name and that you opt out of arbitration. Opting out
        does not affect any other part of these Terms.
      </p>

      <h2>14. Time limit on claims</h2>
      <p>
        Any claim arising out of or relating to the Service or these Terms must be filed within one
        (1) year after the claim arose; otherwise it is permanently barred, to the extent permitted
        by law.
      </p>

      <h2>15. Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate your access at any
        time, with or without cause or notice, including if you violate these Terms or if we
        discontinue the Service. On termination, your right to use the Service ends; sections that
        by their nature should survive (including content ownership, disclaimers, limitation of
        liability, indemnification, dispute resolution, and governing law) will survive.
      </p>

      <h2>16. Governing law &amp; venue</h2>
      <p>
        These Terms are governed by the laws of the State of Arizona, without regard to its
        conflict-of-laws rules. For any dispute not subject to arbitration, the exclusive venue is
        the state or federal courts located in Maricopa County, Arizona, and you consent to their
        jurisdiction.
      </p>

      <h2>17. General</h2>
      <p>
        These Terms, together with the Privacy Policy, are the entire agreement between you and{' '}
        {OPERATOR} regarding the Service and supersede any prior agreements. If any provision is
        held unenforceable, it will be limited or removed to the minimum extent necessary and the
        rest of these Terms will remain in full effect. Our failure to enforce any provision is not
        a waiver of it. You may not assign these Terms without our consent; we may assign them to an
        affiliate or in connection with a merger, acquisition, or sale of assets. Nothing in these
        Terms creates any third-party beneficiary rights.
      </p>

      <h2>18. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. When we do, we will revise the “Last updated”
        date above. Continued use of the Service after a change means you accept the updated Terms.
      </p>
    </article>
  )
}
