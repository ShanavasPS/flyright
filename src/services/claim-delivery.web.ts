// Web build — claim generation is a native-app feature; the wizard route is
// unreachable on web (no entitlements there), this stub just keeps the
// bundle free of native-module imports.

export async function generateClaimPdf(_html: string, _filename: string): Promise<string> {
  throw new Error('Claim letters are not supported on web yet.');
}

export const canEmail = async () => false;

export type EmailOutcome = 'sent' | 'dismissed';

export async function emailClaim(_opts: {
  subject: string;
  body: string;
  attachmentUri: string;
}): Promise<EmailOutcome> {
  return 'dismissed';
}

export async function shareClaim(_uri: string): Promise<boolean> {
  return false;
}
