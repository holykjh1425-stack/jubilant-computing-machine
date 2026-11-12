// Reuses existing consultation questions; no model, private data or server traffic.
const sectionToSector={A:'other',B:'company',C:'company',D:'company',E:'company',F:'estate',G:'store',H:'company',I:'store',J:'company',K:'company',L:'estate',M:'company',N:'company',O:'other',P:'education',Q:'other',R:'store',S:'other',T:'other',U:'other'};
export function classifyIndustry(text,catalog){
 const value=String(text).toLowerCase();const match=Object.entries(catalog.aliases).filter(([alias])=>(/^[A-Za-z]+$/.test(alias)?new RegExp('(?:^|[^a-z])'+alias.toLowerCase()+'(?:$|[^a-z])').test(value):value.includes(alias.toLowerCase()))).sort((a,b)=>b[0].length-a[0].length)[0];
 if(!match)return {sector:'other',section:null,provisional:true};
 return {sector:value.includes('교회')?'church':sectionToSector[match[1]]||'other',section:match[1],label:match[0],provisional:true};
}
export function detectIntent(text){if(/제작.*현황|진행.*상태|접수.*조회|내.*작업/.test(text))return 'status';if(/가격|제작비|관리비|얼마|요금/.test(text))return 'pricing';if(/자동화|반복.*업무/.test(text))return 'automation';return 'website';}
export const REQUIRED_QUESTIONS=[['industry','어떤 업종이나 사업을 운영하시나요?'],['purpose','제작하려는 목적과 가장 해결하고 싶은 문제는 무엇인가요?'],['pages','생각하신 페이지나 화면 수가 있나요? 아직 정하지 않으셨다면 미정이라고 해 주세요.'],['features','꼭 필요한 기능을 알려주세요. 문의 접수, 예약, 로그인 등이 있나요?'],['reference','참고하실 사이트 주소가 있나요? 없으면 없다고 말씀해 주세요.'],['budget','예산 범위와 희망 일정이 있나요? 확정 전이라면 미정으로 남길 수 있어요.']];
export class Consultation{
 constructor(catalog){this.catalog=catalog;this.fields={};this.extra=[];this.step=0;this.route={sector:'other',provisional:true};this.intent='website';this.done=false;this.started=false;}
 question(){return this.step<REQUIRED_QUESTIONS.length?REQUIRED_QUESTIONS[this.step][1]:this.catalog.sectors[this.route.sector]?.questions[this.step-REQUIRED_QUESTIONS.length]||null;}
 receive(input){const text=String(input).trim().slice(0,2000);if(!text)return {reply:'입력하신 내용이 비어 있어요. 편하게 질문해 주세요.',kind:'empty'};
 if(/비밀번호\s*[:=]|주민등록번호|sk-[A-Za-z0-9_-]{8,}|sb_secret_|-----BEGIN/.test(text))return {reply:'비밀번호나 비밀키 같은 민감정보는 입력하지 마세요. 개인정보 없이 필요한 기능만 알려주세요.',kind:'sensitive'};
 if(this.started&&!this.done&&detectIntent(text)==='pricing')return {reply:'제작비와 선택형 월 관리는 범위를 확인한 뒤 개별 견적으로 안내합니다. 아직 확정되지 않은 가격은 안내하지 않습니다. '+this.question(),kind:'pricing'};
 if(detectIntent(text)==='status')return {reply:'인증한 고객의 제작 공간에서 본인 작업만 확인할 수 있어요. 이름과 접수번호만으로는 조회하지 않습니다.',kind:'status'};
 if(!this.started){const intent=detectIntent(text);if(intent==='status')return {reply:'제작 현황은 인증한 고객 본인의 작업만 확인할 수 있어요. 접수번호와 이름만으로는 조회할 수 없습니다. 아래 고객 작업 공간에서 연결 상태를 확인해 주세요.',kind:'status'};
 if(intent==='pricing')return {reply:'홈페이지 제작비와 선택형 월 관리비는 페이지·기능·수정 범위를 확인한 뒤 개별 견적으로 안내합니다. 검토 중인 가격을 확정가로 안내하지 않으며, 호스팅·도메인·AI 사용료는 구분합니다. 어떤 업종의 홈페이지를 생각하고 계신가요?',kind:'pricing'};
 this.started=true;this.intent=intent;this.route=classifyIndustry(text,this.catalog);if(intent==='automation')this.route={sector:'automation',provisional:true};
 if(this.route.label){this.fields.industry=text;this.step=1;}
 return {reply:(this.route.label?`말씀하신 ${this.route.label} 관련 상담으로 이해했어요. 업종 분류는 확인 전 참고입니다. `:'함께 필요한 범위부터 정리해 볼게요. ')+this.question(),kind:'question'};}
 if(this.done)return {reply:'상담 요약이 준비돼 있어요. 내용을 검토한 뒤 동의하시면 신청서에 반영할 수 있습니다. 다시 정리하려면 새 상담을 시작해 주세요.',kind:'summary'};
 if(this.step<REQUIRED_QUESTIONS.length){const key=REQUIRED_QUESTIONS[this.step][0];if(key==='reference'&&text!=='없음'&&text!=='없어요'&&text!=='미정'){const urls=text.match(/https?:\/\/\S+/g)||[];for(const raw of urls){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return {reply:'참고 주소는 계정 정보가 없는 https 주소로 알려주세요. 사이트에는 자동 접속하지 않습니다.',kind:'invalid'};}catch{return {reply:'참고 사이트 주소를 다시 확인해 주세요.',kind:'invalid'}}}}
 this.fields[key]=text;if(key==='industry')this.route=classifyIndustry(text,this.catalog);
 }else this.extra.push({question:this.question(),answer:text});
 this.step++;const question=this.question();if(question)return {reply:question,kind:'question'};this.done=true;return {reply:'말씀해 주신 내용을 정리했어요. 확인된 답변만 요약에 담았으며, 정하지 않은 내용은 그대로 남겼습니다. 신청서에 반영하기 전에 확인해 주세요.',kind:'summary'};
 }
 summary(){return {service:this.intent==='automation'?'ai_automation':'website',fields:{...this.fields},sector:this.route.sector,classification:'고객 확인 전 잠정',extra:this.extra.map(x=>({...x})),complete:this.done};}
 handoff(consent){if(consent!==true)throw Error('CONSENT_REQUIRED');if(!this.done)throw Error('CONSULTATION_INCOMPLETE');const labels={industry:'업종·사업 내용',purpose:'목적·문제',pages:'화면 수',features:'필수 기능',reference:'참고 사이트',budget:'예산·일정'};const description=['[고객이 검토한 상담 요약]',...Object.entries(this.fields).map(([k,v])=>`${labels[k]}: ${v}`),...this.extra.map(x=>`${x.question}: ${x.answer}`),'[참고] 업종 분류는 고객 확인 전 잠정이며 상담만으로 계약·제작이 시작되지 않습니다.'].join('\n');return {service_type:this.summary().service,description:description.slice(0,4600)};}
}
