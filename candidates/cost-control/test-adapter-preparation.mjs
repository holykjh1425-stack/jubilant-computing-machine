// Test-only preparation boundary. NO fetch/SDK/env/key-store read, no provider transport.
import {cost,usd} from './engine.mjs';
const LEGACY_NAMES=['nexus_labs_claude_api_key','ANTHROPIC_API_KEY'];
export function prepareConnection(profile){
 const reasons=[];
 if(profile.mode!=='preparation_only'||profile.liveEnabled!==false)reasons.push('live_mode_forbidden');
 if(typeof profile.organizationId!=='string'||!profile.organizationId)reasons.push('organization_id_unverified');
 if(typeof profile.workspaceId!=='string'||!profile.workspaceId||profile.workspaceName!=='SOLQ-TEST'||profile.workspaceBindingVerified!==true)reasons.push('dedicated_workspace_unverified');
 if(profile.providerControlsVerified!==true||profile.autoReloadConfirmedOff!==true)reasons.push('provider_controls_unverified');
 if(!Number.isFinite(profile.organizationLimitUsd)||profile.organizationLimitUsd<=0||profile.organizationLimitUsd>5||!Number.isFinite(profile.workspaceLimitUsd)||profile.workspaceLimitUsd<=0||profile.workspaceLimitUsd>=profile.organizationLimitUsd)reasons.push('provider_budget_invalid');
 if(![profile.providerRpm,profile.providerInputTokensPerMinute,profile.providerOutputTokensPerMinute].every(x=>Number.isFinite(x)&&x>0))reasons.push('provider_rate_limits_unverified');
 if(profile.internalMaxConcurrent!==1||profile.internalMaxCallsPerMinute!==1||profile.maxCalls!==1||profile.automaticRetries!==0)reasons.push('single_attempt_controls_required');
 if(profile.testSecretReference!=='solq-test/anthropic-api-key'||LEGACY_NAMES.includes(profile.testSecretReference)||profile.legacySecretsFallbackAllowed!==false)reasons.push('secret_isolation_required');
 if(profile.testSecretStoreProvisioned!==true||profile.testKeyMetadataVerified!==true||profile.secretExpiryVerified!==true)reasons.push('protected_test_secret_metadata_unverified');
 if(profile.paidTestApproved!==true)reasons.push('paid_test_approval_missing');
 if(profile.batch!==false||profile.promptCaching!==false||profile.tools!==false||profile.customerDataAllowed!==false)reasons.push('synthetic_text_only_required');
 if(profile.allowedInitialModel!=='claude-haiku-5-5'||profile.inputTokensPlanningAssumption!==1000||profile.maxOutputTokens!==32)reasons.push('initial_profile_changed');
 const estimatedNano=cost('claude-haiku-5-5',1000,32);
 if(!Number.isFinite(profile.testCostCapUsd)||profile.testCostCapUsd<usd(estimatedNano)||profile.testCostCapUsd>0.001)reasons.push('initial_budget_invalid');
 // Still disabled after all metadata passes. Preparation flags cannot unlock real execution.
 return Object.freeze({status:'blocked_preparation_only',readyToExecute:false,transportImplemented:false,
   missingPrerequisites:Object.freeze(reasons),plannedModel:'claude-haiku-5-5',inputTokensAssumed:1000,maxOutputTokens:32,
   estimatedUsd:usd(estimatedNano),costGuaranteed:false,tokenizerVerified:false,
   plannedSecretReference:'solq-test/anthropic-api-key',legacyFallback:false,actualCalls:0});
}
export async function executeTest(){throw Error('test_transport_absent_separate_approval_and_implementation_required');}
