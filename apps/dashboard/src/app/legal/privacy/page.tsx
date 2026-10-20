import type { Metadata } from "next";
import LegalDocument from "../LegalDocument";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy | Clipp",
  description: "Privacy Policy for Clipp / ShortFactory"
};

export default function PrivacyPage(): React.JSX.Element {
  return (
    <LegalDocument title="Privacy Policy">
      <p className={styles.notice}>
        This policy explains what Clipp / ShortFactory processes when you use the content creation
        and publishing tool.
      </p>

      <h2>1. Information we process</h2>
      <p>
        Depending on the features you use, Clipp may process your scripts, prompts, uploaded or
        locally selected media, generated audio, captions, rendered videos, publishing details,
        and basic connection information for the platforms you choose. We may also process logs
        and error details needed to keep the service working.
      </p>

      <h2>2. How we use information</h2>
      <p>
        We use this information to create and render requested videos, generate voice-over and
        captions, connect to selected publishing platforms, show the status of operations, prevent
        abuse, troubleshoot failures, and improve reliability. We do not sell personal information.
      </p>

      <h2>3. Third-party services</h2>
      <p>
        When you enable a provider, relevant content is sent to that provider only as needed for
        the requested feature. This can include Google services for language generation, ElevenLabs
        for voice generation, and YouTube or TikTok for publishing. Each provider processes data
        under its own terms and privacy policy. You should review those policies before enabling a
        connection.
      </p>

      <h2>4. Credentials and platform access</h2>
      <p>
        Connection credentials and tokens are intended to be stored in the application environment
        and used to perform the actions you request. Never share your keys in a public issue,
        repository, video, or chat. You can revoke access from Google, TikTok, or another connected
        platform at any time.
      </p>

      <h2>5. Storage and retention</h2>
      <p>
        Generated files, temporary files, logs, and metadata may remain for as long as needed to
        complete a job, investigate an error, or keep an operational history. In the local version,
        you control the files stored on your computer and can delete generated videos and logs. We
        do not promise a particular retention period for third-party platforms.
      </p>

      <h2>6. Your choices</h2>
      <p>
        You may choose whether to connect a publishing platform, remove local files, stop using a
        provider, and revoke platform permissions. You may contact us to ask questions about the
        information associated with your use of Clipp.
      </p>

      <h2>7. Children and sensitive information</h2>
      <p>
        Clipp is not intended for children. Do not provide sensitive personal information unless it
        is necessary, lawful, and appropriate for the content you are creating. Review generated
        stories carefully before publishing them.
      </p>

      <h2>8. Changes and contact</h2>
      <p>
        We may update this policy when the service or its providers change. The date above indicates
        the latest revision. For privacy questions, contact us using the address at the bottom of
        this page.
      </p>
    </LegalDocument>
  );
}
