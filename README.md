# NEXUS LABS MVP starter

## Included
- `index.html`: 고객용 랜딩 페이지와 신청 폼
- `admin.html`: 관리자 로그인 및 신청 조회/상태 변경
- `styles.css`: 미래적인 AI 자동화 디자인 및 모바일 반응형
- `config.js`: Supabase URL과 공개 anon/publishable key 설정
- `app.js`, `admin.js`: 고객 신청 및 관리자 기능
- `supabase-schema.sql`: 데이터베이스 및 RLS 정책

## 아직 완료되지 않은 것
이 파일 묶음은 시작용 코드이며, 실제 서버 연결·배포·보안 테스트는 아직 완료되지 않았습니다. 설정 전 신청은 전송되지 않습니다.

## A. GitHub에 업로드
1. 저장소 `nexus-labs-app`을 엽니다.
2. `Add file` → `Upload files`를 누릅니다.
3. ZIP을 먼저 압축 해제하고, 안의 파일들을 저장소 루트에 업로드합니다. ZIP만 업로드하면 사이트로 실행되지 않습니다.
4. `Commit changes`를 누릅니다.

## B. Supabase 연결
1. https://supabase.com/ 에서 새 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase-schema.sql` 내용을 실행합니다.
3. 프로젝트 URL과 anon/publishable key를 `config.js`에 입력합니다.
4. Auth에서 관리자 사용자를 생성하고 UUID를 복사합니다.
5. SQL Editor에서 `insert into public.admin_users(user_id) values ('실제-UUID');`를 실행합니다.
6. `service_role` 또는 secret key는 절대 브라우저 파일에 넣지 않습니다.

## C. Cloudflare Pages 배포
1. https://dash.cloudflare.com/ 에 로그인합니다.
2. Workers & Pages → Create → Pages → Connect to Git.
3. GitHub의 `nexus-labs-app` 저장소를 선택합니다.
4. 정적 HTML이므로 빌드 명령은 비우고, 출력 디렉터리는 저장소 루트로 설정합니다(화면의 지침이 다르면 해당 UI를 따릅니다).
5. 배포된 `pages.dev` 주소에서 `/`와 `/admin.html`을 확인합니다.
6. Supabase Auth URL Configuration에 배포 주소를 설정합니다.

## D. 테스트 전 체크
- 개인정보 처리방침과 실제 동의 문구를 마련
- 공개 신청 스팸 방지/속도 제한 검토
- 관리자만 신청 내용을 읽고 상태를 변경할 수 있는지 검증
- 휴대전화에서 폼 테스트
- 실제 고객 정보는 보안 테스트가 끝나기 전 입력하지 않기
