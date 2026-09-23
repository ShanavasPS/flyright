import { getClerkInstance } from '@clerk/expo';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { CONVEX_URL } from '@/constants/config';

/** Recheck paid authoring before uploading a postcard. The
 * publication mutation rechecks again; a device flag never grants access. */
export async function confirmServerPro(): Promise<boolean> {
  if (!CONVEX_URL) return false;
  const token = await getClerkInstance().session?.getToken();
  if (!token) return false;
  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  const entitlement = await client.query(api.entitlements.mine, {});
  if (entitlement?.pro) return true;
  return (await client.action(api.entitlements.refreshMine, {}))?.pro === true;
}
