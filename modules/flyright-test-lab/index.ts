/** Whether this install is a Firebase Test Lab device — Google Play's
 * pre-launch report robots run there on every upload. Android binaries only;
 * everywhere else (iOS, web, a binary built before the module) the native
 * module is absent and the answer is false. */

import { requireOptionalNativeModule } from 'expo';

const native = requireOptionalNativeModule<{ isTestLab?: boolean }>('FlyRightTestLab');

export const isTestLab = native?.isTestLab === true;
