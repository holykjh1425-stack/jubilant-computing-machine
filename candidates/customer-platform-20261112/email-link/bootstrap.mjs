// Candidate composition. The operating index.html/app.js do not import this module.
import {createLinkAuth} from './auth.mjs';
import {createLinkApplication} from './application.mjs';
import {fail} from '../verified-email/service.mjs';
export function createCustomerEmailCandidate({enabled=false,authSdk,intake,reserve,synthetic=false,sendApproved=false,accountCreationApproved=false,onChange=()=>{}}={}){
 if(!enabled)throw fail('NOT_DEPLOYED');
 const auth=createLinkAuth({enabled,auth:authSdk,reserve,synthetic,sendApproved,accountCreationApproved});
 const application=createLinkApplication({auth,intake,onChange});
 // Clear all in-memory form/request/receipt state on ANY auth transition, including cross-tab events.
 // Async Auth operations must not run inside this SDK callback (avoids SDK callback deadlock).
 const listener=authSdk.onAuthStateChange?.(()=>application.clear());
 return Object.freeze({auth,application,dispose(){listener?.data?.subscription?.unsubscribe();application.clear()}});
}
