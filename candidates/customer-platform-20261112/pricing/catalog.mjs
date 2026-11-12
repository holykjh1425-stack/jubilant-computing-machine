// Internal candidate. This module neither approves prices nor initiates billing.
const deepFreeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))deepFreeze(child);Object.freeze(value);}return value;};
export const PRICING_REVIEW = deepFreeze({
 status:'internal_review_only', publicApproved:false, autoBillingEnabled:false,
 vatMode:'undetermined', currency:'KRW', reviewedAt:'2026-11-12',
 separateCosts:['hosting','domain','AI API','paid licenses','payment provider fees'],
});
export const EXISTING_AUTOMATION=deepFreeze({id:'automation-basic',priceKrw:100000,depositKrw:30000,balanceKrw:70000,status:'existing_product_unchanged'});
export const WEB_PACKAGES=deepFreeze([
 {id:'landing',label:'랜딩 스타터',priceKrw:150000,from:false,pages:1,revisions:1,laborHoursRange:[3,5],scope:['반응형 1페이지','기본 템플릿','문의 링크'],excluded:['DB','로그인','결제','예약','AI 대화'],approval:'pending'},
 {id:'business',label:'비즈니스',priceKrw:350000,from:false,pages:5,revisions:2,laborHoursRange:[7,12],scope:['최대 5페이지','문의폼 1개','기본 SEO'],excluded:['외부 API','회원 기능','결제'],approval:'pending'},
 {id:'business-plus',label:'비즈니스 플러스',priceKrw:650000,from:false,pages:10,revisions:3,laborHoursRange:[14,22],scope:['최대 10페이지','신청/관리 화면 1종 범위 확정'],excluded:['고급 인증','실시간 연동','결제'],approval:'pending'},
 {id:'ai-consultant',label:'AI 상담형',priceKrw:900000,from:true,pages:5,revisions:null,laborHoursRange:[22,36],scope:['최대 5페이지','고객 상담 UI'],excluded:['사용료','무제한 대화','외부 연동'],scopeToConfirm:['실제 AI 연결','인증','대화 저장','수정 횟수'],approval:'pending'},
 {id:'custom',label:'맞춤형',priceKrw:null,from:true,pages:null,revisions:null,laborHoursRange:null,scope:['요구사항별 개별 견적'],excluded:[],approval:'pending'},
]);
export const MAINTENANCE_PACKAGES=deepFreeze([
 {id:'self',label:'셀프 관리',priceKrw:0,optional:true,editCount:0,editMinutes:0,reviewMinutesAssumption:0,scope:['고객 직접 관리'],excluded:['호스팅','도메인','장애 대응','백업 대행'],approval:'pending'},
 {id:'assurance',label:'안심 점검',priceKrw:29000,optional:true,editCount:1,editMinutes:15,reviewMinutesAssumption:30,scope:['월 1회 가용성/SSL/기본 오류 점검','요약'],excluded:['호스팅','도메인','AI API'],approval:'pending'},
 {id:'standard',label:'표준 관리',priceKrw:59000,optional:true,editCount:3,editMinutes:60,reviewMinutesAssumption:45,scope:['안심 점검','문구/이미지 변경','월간 요약','기본 백업 상태 확인'],excluded:['신규 기능','신규 페이지','복원 보장'],approval:'pending'},
 {id:'business-care',label:'비즈니스 관리',priceKrw:119000,optional:true,editCount:6,editMinutes:120,reviewMinutesAssumption:60,scope:['표준 관리','보안/성능 점검','장애 1차 분석'],excluded:['24시간 긴급 대응','외부 서비스 실비'],approval:'pending'},
 {id:'advanced',label:'AI·고급 운영',priceKrw:199000,from:true,optional:true,editCount:null,editMinutes:null,reviewMinutesAssumption:null,scope:['AI/연동 운영 점검','비용/오류 리포트'],excluded:['AI 토큰','메시지','서버 비용'],scopeToConfirm:['전체 작업시간','수정 횟수','사용량 한도'],approval:'pending'},
]);
// Client input can never turn the internal proposal into an approved customer price list.
// A future server-owned, versioned published catalog must be supplied separately.
export function getCustomerPricing(){return deepFreeze({status:'individual_quote_required',packages:[],maintenance:[],message:'요구사항을 확인한 뒤 포함 범위와 별도 실비를 구분한 견적을 안내합니다.'});}
export function getInternalPricing(){return {review:PRICING_REVIEW,website:structuredClone(WEB_PACKAGES),maintenance:structuredClone(MAINTENANCE_PACKAGES),automation:EXISTING_AUTOMATION};}
function numeric(value,name,{max=Number.MAX_SAFE_INTEGER}={}){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw new TypeError(name+' must be a finite nonnegative number');return value;}
function money(value,name){numeric(value,name);if(!Number.isSafeInteger(value))throw new TypeError(name+' must be integer KRW');return value;}
export function estimateProductionCost({laborHours,hourlyRateKrw,aiBudgetKrw=0,hostingKrw=0,domainKrw=0,licenseKrw=0,paymentFeeKrw=0,contingencyRate=0.15,sellingPriceKrw=null,vatMode='undetermined',vatRate=0.1}){
 numeric(laborHours,'laborHours');money(hourlyRateKrw,'hourlyRateKrw');for(const [k,v] of Object.entries({aiBudgetKrw,hostingKrw,domainKrw,licenseKrw,paymentFeeKrw}))money(v,k);
 numeric(contingencyRate,'contingencyRate',{max:1});numeric(vatRate,'vatRate',{max:1});if(!['undetermined','included','excluded'].includes(vatMode))throw new TypeError('vatMode');if(sellingPriceKrw!==null)money(sellingPriceKrw,'sellingPriceKrw');
 const laborKrw=Math.ceil(laborHours*hourlyRateKrw);const directCostKrw=laborKrw+aiBudgetKrw+hostingKrw+domainKrw+licenseKrw+paymentFeeKrw;const contingencyKrw=Math.ceil(directCostKrw*contingencyRate);const plannedCostKrw=directCostKrw+contingencyKrw;
 if(!Number.isSafeInteger(plannedCostKrw))throw new RangeError('cost overflow');
 const netRevenueKrw=sellingPriceKrw===null||vatMode==='undetermined'?null:vatMode==='included'?Math.round(sellingPriceKrw/(1+vatRate)):sellingPriceKrw;
 return {status:'assumption_only_not_actual_cost',laborKrw,directCostKrw,contingencyKrw,plannedCostKrw,netRevenueKrw,contributionBeforeOtherCostsKrw:netRevenueKrw===null?null:netRevenueKrw-plannedCostKrw,vatMode,paidCalls:0};
}
export function estimateMonthlyCost({fixedInfrastructureKrw,customerCount,customers=[],hourlyRateKrw,contingencyRate=0.15}){
 money(fixedInfrastructureKrw,'fixedInfrastructureKrw');money(customerCount,'customerCount');money(hourlyRateKrw,'hourlyRateKrw');numeric(contingencyRate,'contingencyRate',{max:1});if(customerCount!==customers.length)throw new TypeError('customerCount does not match customers');
 const each=customers.map((c,i)=>{numeric(c.serviceMinutes,'serviceMinutes');money(c.aiBudgetKrw??0,'aiBudgetKrw');const laborKrw=Math.ceil(c.serviceMinutes/60*hourlyRateKrw),directKrw=laborKrw+(c.aiBudgetKrw??0),reserveKrw=Math.ceil(directKrw*contingencyRate);return {id:c.id??'scenario-'+i,laborKrw,aiBudgetKrw:c.aiBudgetKrw??0,reserveKrw,variableCostKrw:directKrw+reserveKrw};});
 const variableCostKrw=each.reduce((n,c)=>n+c.variableCostKrw,0),totalPlannedCostKrw=fixedInfrastructureKrw+variableCostKrw;if(!Number.isSafeInteger(totalPlannedCostKrw))throw new RangeError('cost overflow');
 return {status:'assumption_only_not_actual_bill',fixedInfrastructureKrw,customerCount,variableCostKrw,totalPlannedCostKrw,averagePlannedCostKrw:customerCount?Math.ceil(totalPlannedCostKrw/customerCount):null,customers:each,paidCalls:0};
}
