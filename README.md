# NEXUS LABS — 배포 및 검증 안내

## 현재 구성
- `index.html` 고객 신청 페이지 (PC·모바일 반응형)
- `app.js` Supabase INSERT 신청 접수. 공개 사용자 SELECT 권한을 요구하지 않음
- `admin.html`, `admin.js` 관리자 로그인·목록 조회·상태 변경
- `config.js` Supabase 프로젝트 URL과 공개 publishable key
- `supabase-schema.sql` 초기 데이터베이스 정의 (기존 운영 DB에 통째로 재실행하지 마세요)

## 현재 제한 사항
- 고객 화면에 접수번호가 표시되지 않습니다. 번호는 DB 기본값으로 생성되며 관리자 화면에서 조회합니다.
- Supabase 실서버 INSERT/RLS 테스트, 관리자 조회·수정 테스트, 공개 배포는 미완료입니다.
- 고객 정보가 포함되므로 보안·개인정보 처리방침 검토 전 실제 고객에게 공개하지 마세요.

## Supabase 접수 확인 (SQL Editor에서 읽기 전용)
```sql
select receipt_number, created_at, status
from public.applications
order by created_at desc
limit 10;
```

## RLS 정책 및 권한 확인 (읽기 전용)
```sql
select policyname, cmd, roles, with_check
from pg_policies
where schemaname='public' and tablename='applications';
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='applications'
  and grantee in ('anon','authenticated');
```
공개 고객 INSERT가 실패하면 `anon` 역할의 INSERT 권한, INSERT RLS 정책, 필수 필드와 CHECK 제약조건을 함께 확인하세요. **RLS를 끄거나 공개 SELECT 정책을 추가하지 마세요.**

## 배포 순서
1. GitHub 저장소 `holykjh1425-stack/jubilant-computing-machine`의 최신 파일을 기준으로 사용합니다.
2. 호스팅 서비스에 저장소를 연결하고 정적 사이트로 배포합니다. 별도 빌드 명령은 필요 없습니다.
3. 배포 URL에서 테스트 신청서를 제출한 후 위 SQL로 저장 여부를 확인합니다.
4. 관리자 계정으로 `/admin.html`에 로그인하여 접수번호·상태 변경을 확인합니다.
5. PC와 모바일에서 재검증하고, 개인정보 처리방침·스팸 방지·운영 모니터링을 준비합니다.

## 보안
`service_role`/secret key를 브라우저 파일 또는 GitHub에 절대 넣지 마세요. `config.js`에는 공개 publishable key만 사용합니다.
계약 및 결제는 사람 승인 없이 자동 처리하지 않습니다.
