import type { ReactNode } from "react";
import styles from "./legal.module.css";

type LegalDocumentProps = {
  title: string;
  children: ReactNode;
};

export default function LegalDocument({ title, children }: LegalDocumentProps): React.JSX.Element {
  return (
    <main className={styles.page}>
      <article className={styles.document}>
        <p className={styles.brand}>Clipp / ShortFactory</p>
        <h1>{title}</h1>
        <p className={styles.updated}>Last updated: October 18, 2026</p>
        {children}
        <p className={styles.footer}>
          Questions about these documents? Contact us at{" "}
          <a href="mailto:facconi.leonardo1@gmail.com">facconi.leonardo1@gmail.com</a>.
        </p>
      </article>
    </main>
  );
}
