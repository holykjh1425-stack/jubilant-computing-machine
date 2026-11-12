import test from 'node:test';import assert from 'node:assert/strict';
import {WEB_PACKAGES,MAINTENANCE_PACKAGES,EXISTING_AUTOMATION,getCustomerPricing,getInternalPricing,estimateProductionCost,estimateMonthlyCost} from './catalog.mjs';
test('unapproved catalog cannot leak via caller approval flags and existing automation stays 100k',()=>{
 const publicResult=getCustomerPricing({administratorApproved:true});assert.deepEqual(publicResult.packages,[]);assert.deepEqual(publicResult.maintenance,[]);assert.equal(JSON.stringify(publicResult).includes('150000'),false);
 assert.equal(EXISTING_AUTOMATION.priceKrw,100000);assert.equal(EXISTING_AUTOMATION.depositKrw+EXISTING_AUTOMATION.balanceKrw,100000);assert.deepEqual(WEB_PACKAGES.map(x=>x.priceKrw),[150000,350000,650000,900000,null]);assert.deepEqual(MAINTENANCE_PACKAGES.map(x=>x.priceKrw),[0,29000,59000,119000,199000]);
});
test('VAT-undetermined proposal cannot manufacture revenue or margin; cost includes reserve',()=>{
 const r=estimateProductionCost({laborHours:4,hourlyRateKrw:20000,aiBudgetKrw:5000,sellingPriceKrw:150000});assert.equal(r.laborKrw,80000);assert.equal(r.directCostKrw,85000);assert.equal(r.contingencyKrw,12750);assert.equal(r.plannedCostKrw,97750);assert.equal(r.netRevenueKrw,null);assert.equal(r.contributionBeforeOtherCostsKrw,null);assert.equal(r.paidCalls,0);
});
test('explicit hypothetical VAT assumptions change contribution without changing cost',()=>{
 const input={laborHours:4,hourlyRateKrw:20000,aiBudgetKrw:5000,sellingPriceKrw:150000};const excluded=estimateProductionCost({...input,vatMode:'excluded'}),included=estimateProductionCost({...input,vatMode:'included'});assert.equal(excluded.contributionBeforeOtherCostsKrw,52250);assert.equal(included.netRevenueKrw,136364);assert.equal(included.contributionBeforeOtherCostsKrw,38614);assert.equal(excluded.plannedCostKrw,included.plannedCostKrw);
});
test('monthly fixed infrastructure is counted once; clients allocate variable labor and API ceilings',()=>{
 const r=estimateMonthlyCost({fixedInfrastructureKrw:30000,customerCount:2,hourlyRateKrw:20000,customers:[{id:'A',serviceMinutes:45,aiBudgetKrw:0},{id:'B',serviceMinutes:105,aiBudgetKrw:5000}]});assert.equal(r.customers[0].variableCostKrw,17250);assert.equal(r.customers[1].variableCostKrw,46000);assert.equal(r.totalPlannedCostKrw,93250);assert.equal(r.averagePlannedCostKrw,46625);const empty=estimateMonthlyCost({fixedInfrastructureKrw:30000,customerCount:0,hourlyRateKrw:20000});assert.equal(empty.totalPlannedCostKrw,30000);assert.equal(empty.averagePlannedCostKrw,null);
});
test('negative, nonfinite, fractional KRW, excess reserve and mismatched client input fail closed',()=>{
 for(const value of [-1,NaN,Infinity])assert.throws(()=>estimateProductionCost({laborHours:value,hourlyRateKrw:20000}));assert.throws(()=>estimateProductionCost({laborHours:1,hourlyRateKrw:20000.5}));assert.throws(()=>estimateProductionCost({laborHours:1,hourlyRateKrw:20000,contingencyRate:1.1}));assert.throws(()=>estimateMonthlyCost({fixedInfrastructureKrw:0,customerCount:1,customers:[],hourlyRateKrw:20000}));
});
test('UI receives copies so internal proposal mutations cannot silently change catalog',()=>{const copy=getInternalPricing();copy.website[0].priceKrw=1;assert.equal(WEB_PACKAGES[0].priceKrw,150000);assert.throws(()=>{WEB_PACKAGES[0].priceKrw=1});assert.throws(()=>{WEB_PACKAGES[0].scope.push('unsafe')});});
