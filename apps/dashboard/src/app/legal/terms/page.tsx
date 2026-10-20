import type { Metadata } from "next";
import LegalDocument from "../LegalDocument";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Service | Clipp",
  description: "Terms of Service for Clipp / ShortFactory"
};

export default function TermsPage(): React.JSX.Element {
  return (
    <LegalDocument title="Terms of Service">
      <p className={styles.notice}>
        These terms apply to the Clipp / ShortFactory content creation and publishing tool.
      </p>

      <h2>1. What Clipp does</h2>
      <p>
        Clipp helps creators turn stories and other user-provided material into short vertical
        videos. It can assist with script editing, voice-over generation, captions, video
        rendering, and publishing to connected social platforms.
      </p>

      <h2>2. Your account and responsibility</h2>
      <p>
        You are responsible for the information and files you provide, for keeping your account
        credentials secure, and for checking every video before publishing it. You must use the
        service lawfully and comply with the rules of every platform you connect.
      </p>

      <h2>3. Rights and permitted content</h2>
      <p>
        You must have the rights, permissions, or other lawful basis needed for the stories,
        footage, music, images, voices, and other material you use. Clipp does not grant you
        ownership of third-party material and does not make a video lawful simply by transforming
        it. You must not use the service to infringe copyright, impersonate people, mislead
        viewers, or publish unlawful, abusive, or harmful content.
      </p>

      <h2>4. Connected services</h2>
      <p>
        If you connect services such as YouTube or TikTok, you authorize Clipp to perform the
        actions you request, including uploading videos and reading the minimum information needed
        to complete that action. Those services have their own terms, policies, review processes,
        and limits. You can revoke access from the relevant platform at any time.
      </p>

      <h2>5. Third-party providers</h2>
      <p>
        Depending on your configuration, Clipp may use providers for language generation,
        transcription, voice generation, storage, or platform publishing. Their availability and
        terms may change. You remain responsible for reviewing generated content and provider usage
        charges connected to your accounts.
      </p>

      <h2>6. Availability and generated material</h2>
      <p>
        Clipp is provided on an as-is and as-available basis. Generated scripts, voices, captions,
        titles, and other outputs may contain mistakes and are not guaranteed to be unique,
        accurate, suitable, or accepted by a platform. You must review outputs before publishing.
      </p>

      <h2>7. Suspension and termination</h2>
      <p>
        We may limit or suspend access when necessary to protect the service, comply with the law,
        address abuse, or respond to a platform restriction. You may stop using Clipp and revoke
        connected platform access at any time.
      </p>

      <h2>8. Changes and contact</h2>
      <p>
        We may update these terms as the service changes. The date above indicates the latest
        revision. If you have a question about these terms, contact us using the address at the
        bottom of this page.
      </p>
    </LegalDocument>
  );
}
