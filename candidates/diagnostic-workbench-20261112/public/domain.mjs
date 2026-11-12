export const sections=['기업 특성','업무 흐름','반복 문제','사용 도구','업무량·시간','자동화 영역','보안·연동','추가 확인'];
export function diagnosis(a={}){
 const known=sections.filter((_,i)=>typeof a[i]==='string'&&a[i].trim());
 const questions=[];
 if(a[2]?.includes('반복'))questions.push({field:4,question:'반복 업무는 주 몇 회, 한 번에 몇 분이 필요한가요?',reason:'반복 문제 답변에 “반복”이 포함되어 업무량을 우선 확인합니다.'});
 if(a[3]?.match(/엑셀|Excel|시트/i))questions.push({field:3,question:'파일 형식과 입력·결과 열은 무엇인가요? 샘플은 익명화할 수 있나요?',reason:'스프레드시트 사용이 확인되어 파일 구조와 안전한 샘플을 확인합니다.'});
 if(a[6]?.match(/개인정보|민감|외부/))questions.push({field:6,question:'처리하는 정보의 종류, 접근 담당자, 외부 전송 허용 범위는 무엇인가요?',reason:'보안·연동 답변에 제약이 있어 외부 연동 전에 권한을 확인합니다.'});
 if(!a[2]?.trim())questions.push({field:2,question:'현재 가장 자주 발생하는 문제는 무엇인가요?',reason:'반복 문제 정보가 없어 해결 방향을 추정하지 않습니다.'});
 if(!a[4]?.trim())questions.push({field:4,question:'월 처리 건수·반복 빈도·건당 시간을 확인해 주세요.',reason:'업무량 근거가 없어 절감 효과와 비용을 산정할 수 없습니다.'});
 return {progress:Math.round(known.length/8*100),known:known.length,unknown:sections.filter((_,i)=>!a[i]?.trim()),questions,
 summary:a[2]?.trim()||'문제 정보 미확인 — 진단 요약을 생성하지 않았습니다.',priority:a[6]?.match(/개인정보|민감|외부/)?'보안 범위 확인 우선':a[2]?.trim()?'반복 문제·업무량 비교 필요':'우선순위 미확인'};
}
export function safeEvidence(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
export function matchRecords(records,query,filter){return records.filter(r=>(!query||r.receipt.toLowerCase().includes(query.trim().toLowerCase()))&&(filter==='전체'||r.integrity===filter))}
