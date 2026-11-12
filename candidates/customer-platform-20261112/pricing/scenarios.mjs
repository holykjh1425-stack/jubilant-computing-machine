import {WEB_PACKAGES,estimateProductionCost,estimateMonthlyCost} from './catalog.mjs';
export const ASSUMPTIONS=Object.freeze({notActualBilling:true,hourlyRateKrw:20000,contingencyRate:0.15,vatMode:'undetermined',fixedInfrastructureKrw:30000,aiBudgetsKrw:{landing:5000,business:10000,'business-plus':20000,'ai-consultant':30000}});
export function buildScenarios(){
 const production=WEB_PACKAGES.filter(p=>p.laborHoursRange).map(p=>({packageId:p.id,proposalPriceKrw:p.priceKrw,revisionCount:p.revisions,measured:false,range:p.laborHoursRange.map(laborHours=>estimateProductionCost({laborHours,hourlyRateKrw:ASSUMPTIONS.hourlyRateKrw,aiBudgetKrw:ASSUMPTIONS.aiBudgetsKrw[p.id],contingencyRate:ASSUMPTIONS.contingencyRate,sellingPriceKrw:p.priceKrw}))}));
 const customers=[...Array.from({length:3},(_,i)=>({id:'SYNTHETIC-assurance-'+i,serviceMinutes:45,aiBudgetKrw:0})),...Array.from({length:4},(_,i)=>({id:'SYNTHETIC-standard-'+i,serviceMinutes:105,aiBudgetKrw:0})),...Array.from({length:2},(_,i)=>({id:'SYNTHETIC-business-'+i,serviceMinutes:180,aiBudgetKrw:0})),{id:'SYNTHETIC-advanced',serviceMinutes:240,aiBudgetKrw:20000}];
 const monthly=estimateMonthlyCost({fixedInfrastructureKrw:ASSUMPTIONS.fixedInfrastructureKrw,customerCount:customers.length,customers,hourlyRateKrw:ASSUMPTIONS.hourlyRateKrw,contingencyRate:ASSUMPTIONS.contingencyRate});
 return {status:'internal_scenarios_not_approved',assumptions:ASSUMPTIONS,production,monthly,monthlyProposalSalesKrw:760000,vatUnconfirmed:true,actualSpendInThisDevelopmentKrw:0,actualCurrentExistingInfrastructureBillKrw:null};
}
