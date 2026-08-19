import { File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import { printToFileAsync } from 'expo-print';
import * as Sharing from 'expo-sharing';

/**
 * Getting the generated letter out of the app. Two paths:
 *  - Mail composer with the PDF attached (needs a configured mail account —
 *    never available on the iOS simulator).
 *  - The system share sheet as fallback, so Gmail-app users and reviewers on
 *    bare devices aren't dead-ended.
 */

/** Render the letter HTML to a PDF in the cache directory under a filename
 * the carrier will actually see on the attachment. */
export async function generateClaimPdf(html: string, filename: string): Promise<string> {
  const { uri } = await printToFileAsync({ html });
  const pdf = new File(uri);
  await pdf.move(new File(Paths.cache, filename), { overwrite: true });
  return pdf.uri;
}

export const canEmail = () => MailComposer.isAvailableAsync();

export type EmailOutcome = 'sent' | 'dismissed';

/** iOS reports SENT/SAVED/CANCELLED faithfully; Android always says SENT, so
 * callers should still confirm with the user before trusting 'sent' there. */
export async function emailClaim(opts: {
  subject: string;
  body: string;
  attachmentUri: string;
}): Promise<EmailOutcome> {
  const result = await MailComposer.composeAsync({
    subject: opts.subject,
    body: opts.body,
    attachments: [opts.attachmentUri],
  });
  return result.status === MailComposer.MailComposerStatus.SENT ? 'sent' : 'dismissed';
}

/** Present the share sheet for the PDF. Resolves after dismissal — the sheet
 * gives no signal about whether anything was actually sent. */
export async function shareClaim(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: 'Send your claim letter',
  });
  return true;
}
